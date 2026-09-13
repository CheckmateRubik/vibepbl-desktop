use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    cmp::Ordering,
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;

#[derive(Clone, Copy, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Medline,
    Mesh,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupResult {
    title: String,
    summary: String,
    url: String,
    source: String,
    plain_text: bool,
    matched_term: String,
    match_kind: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupResponse {
    results: Vec<LookupResult>,
    retrieved_at: String,
}

#[derive(Default)]
struct Cache {
    entries: HashMap<String, (Instant, LookupResponse)>,
    last_request: HashMap<Provider, Instant>,
}

pub struct LookupState {
    client: reqwest::Client,
    cache: Mutex<Cache>,
}

impl LookupState {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(15))
                .pool_idle_timeout(Duration::from_secs(90))
                .tcp_keepalive(Duration::from_secs(30))
                .user_agent(concat!(
                    "VibePBL-Desktop/",
                    env!("CARGO_PKG_VERSION"),
                    " terminology-lookup"
                ))
                .build()?,
            cache: Mutex::new(Cache::default()),
        })
    }
}

impl Provider {
    fn cache_key(self) -> &'static str {
        match self {
            Self::Medline => "medline",
            Self::Mesh => "mesh",
        }
    }
}

const RESPONSE_CACHE_SECONDS: i64 = 30 * 24 * 60 * 60;
const LEARNED_TERMS_SECONDS: i64 = 180 * 24 * 60 * 60;

fn bundled_mesh_response(
    app_state: &AppState,
    query: &str,
) -> Result<Option<LookupResponse>, String> {
    let Some(database) = &app_state.medical_db else {
        return Ok(None);
    };
    let fragment_groups = search_fragment_groups(query);
    if fragment_groups.is_empty()
        || fragment_groups
            .iter()
            .any(|group| group.iter().any(|fragment| fragment.chars().count() < 3))
    {
        return Ok(None);
    }
    let fts_query = fragment_groups
        .iter()
        .map(|group| {
            format!(
                "({})",
                group
                    .iter()
                    .map(|fragment| format!("\"{fragment}\""))
                    .collect::<Vec<_>>()
                    .join(" OR ")
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    let connection = database
        .lock()
        .map_err(|_| "The offline medical index is busy")?;
    let version: String = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'mesh_version'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "The offline medical index is unreadable")?;
    let updated_at: String = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'dataset_updated_at'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "The offline medical index is unreadable")?;
    let mut statement = connection
        .prepare(
            "SELECT d.mesh_id, d.title, d.definition, t.term
             FROM mesh_terms_fts
             JOIN mesh_terms t ON t.id = mesh_terms_fts.rowid
             JOIN mesh_descriptors d ON d.id = t.descriptor_id
             WHERE mesh_terms_fts MATCH ?1
             ORDER BY bm25(mesh_terms_fts)
             LIMIT 600",
        )
        .map_err(|_| "The offline medical index is unreadable")?;
    let rows = statement
        .query_map(params![fts_query], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|_| "The offline medical index could not be searched")?;
    let normalized_query = normalized(query);
    let mut candidates: HashMap<String, (f64, LookupResult)> = HashMap::new();
    for row in rows.flatten() {
        let (identifier, title, definition, matched_term) = row;
        if definition.is_empty() {
            continue;
        }
        let score = match_score(query, &matched_term).max(match_score(query, &title));
        if score < 0.36 {
            continue;
        }
        let normalized_title = normalized(&title);
        let normalized_match = normalized(&matched_term);
        let match_kind =
            if normalized_query == normalized_title || normalized_query == normalized_match {
                "exact"
            } else if normalized_title.starts_with(&normalized_query)
                || normalized_match.starts_with(&normalized_query)
            {
                "partial"
            } else {
                "suggested"
            };
        let ranked_score = score
            + match match_kind {
                "exact" => 2.0,
                "partial" => 1.0,
                _ => 0.0,
            };
        let result = LookupResult {
            title,
            summary: definition,
            url: format!("https://id.nlm.nih.gov/mesh/{identifier}"),
            source: format!(
                "MeSH {version} offline — Courtesy of the U.S. National Library of Medicine"
            ),
            plain_text: true,
            matched_term,
            match_kind: match_kind.into(),
        };
        match candidates.get(&identifier) {
            Some((existing_score, _)) if *existing_score >= ranked_score => {}
            _ => {
                candidates.insert(identifier, (ranked_score, result));
            }
        }
    }
    let mut candidates = candidates.into_values().collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(Ordering::Equal)
            .then_with(|| left.1.title.cmp(&right.1.title))
    });
    if candidates.is_empty() {
        return Ok(None);
    }
    Ok(Some(LookupResponse {
        results: candidates
            .into_iter()
            .take(10)
            .map(|(_, result)| result)
            .collect(),
        retrieved_at: updated_at,
    }))
}

fn read_persistent_response(
    app_state: &AppState,
    provider: Provider,
    query: &str,
) -> Result<Option<LookupResponse>, String> {
    let cutoff = chrono::Utc::now().timestamp() - RESPONSE_CACHE_SECONDS;
    let connection = app_state.db.lock().map_err(|_| "Lookup is busy")?;
    let response_json: Option<String> = connection
        .query_row(
            "SELECT response_json FROM terminology_cache
             WHERE provider = ?1 AND query = ?2 AND cached_at >= ?3",
            params![provider.cache_key(), normalized(query), cutoff],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Could not read the local medical cache")?;
    response_json
        .map(|json| {
            serde_json::from_str(&json).map_err(|_| "The local medical cache was unreadable".into())
        })
        .transpose()
}

fn learned_response(
    app_state: &AppState,
    provider: Provider,
    query: &str,
) -> Result<Option<LookupResponse>, String> {
    let cutoff = chrono::Utc::now().timestamp() - LEARNED_TERMS_SECONDS;
    let connection = app_state.db.lock().map_err(|_| "Lookup is busy")?;
    let mut statement = connection
        .prepare(
            "SELECT title, summary, url, source, plain_text, matched_term, cached_at
             FROM medical_reference_terms
             WHERE provider = ?1 AND cached_at >= ?2
             ORDER BY cached_at DESC
             LIMIT 2000",
        )
        .map_err(|_| "Could not search the local medical cache")?;
    let rows = statement
        .query_map(params![provider.cache_key(), cutoff], |row| {
            Ok((
                LookupResult {
                    title: row.get(0)?,
                    summary: row.get(1)?,
                    url: row.get(2)?,
                    source: row.get(3)?,
                    plain_text: row.get(4)?,
                    matched_term: row.get(5)?,
                    match_kind: "cached".into(),
                },
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|_| "Could not search the local medical cache")?;
    let mut matches = rows
        .filter_map(Result::ok)
        .map(|(mut result, cached_at)| {
            let score =
                match_score(query, &result.title).max(match_score(query, &result.matched_term));
            let normalized_query = normalized(query);
            let normalized_title = normalized(&result.title);
            let normalized_match = normalized(&result.matched_term);
            result.match_kind =
                if normalized_query == normalized_title || normalized_query == normalized_match {
                    "exact".into()
                } else if normalized_title.starts_with(&normalized_query)
                    || normalized_match.starts_with(&normalized_query)
                {
                    "partial".into()
                } else {
                    "suggested".into()
                };
            (score, cached_at, result)
        })
        .filter(|(score, _, _)| *score >= 0.78)
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(Ordering::Equal)
            .then_with(|| left.2.title.cmp(&right.2.title))
    });
    matches.dedup_by(|left, right| left.2.url == right.2.url);
    if matches.is_empty() {
        return Ok(None);
    }
    let newest = matches.iter().map(|(_, time, _)| *time).max().unwrap_or(0);
    Ok(Some(LookupResponse {
        results: matches
            .into_iter()
            .take(10)
            .map(|(_, _, result)| result)
            .collect(),
        retrieved_at: chrono::DateTime::from_timestamp(newest, 0)
            .unwrap_or_default()
            .to_rfc3339(),
    }))
}

fn write_persistent_response(
    app_state: &AppState,
    provider: Provider,
    query: &str,
    response: &LookupResponse,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    let json = serde_json::to_string(response).map_err(|_| "Could not cache medical results")?;
    let mut connection = app_state.db.lock().map_err(|_| "Lookup is busy")?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Could not update the local medical cache")?;
    transaction
        .execute(
            "INSERT INTO terminology_cache (provider, query, response_json, cached_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(provider, query) DO UPDATE SET
               response_json = excluded.response_json,
               cached_at = excluded.cached_at",
            params![provider.cache_key(), normalized(query), json, now],
        )
        .map_err(|_| "Could not update the local medical cache")?;
    for result in &response.results {
        transaction
            .execute(
                "INSERT INTO medical_reference_terms
                   (provider, url, title, normalized_title, summary, source, plain_text,
                    matched_term, normalized_matched_term, cached_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(provider, url) DO UPDATE SET
                   title = excluded.title,
                   normalized_title = excluded.normalized_title,
                   summary = excluded.summary,
                   source = excluded.source,
                   plain_text = excluded.plain_text,
                   matched_term = excluded.matched_term,
                   normalized_matched_term = excluded.normalized_matched_term,
                   cached_at = excluded.cached_at",
                params![
                    provider.cache_key(),
                    result.url,
                    result.title,
                    normalized(&result.title),
                    result.summary,
                    result.source,
                    result.plain_text,
                    result.matched_term,
                    normalized(&result.matched_term),
                    now,
                ],
            )
            .map_err(|_| "Could not update the local medical cache")?;
    }
    transaction
        .execute(
            "DELETE FROM terminology_cache
             WHERE cached_at < ?1 OR rowid NOT IN (
               SELECT rowid FROM terminology_cache ORDER BY cached_at DESC LIMIT 250
             )",
            params![now - RESPONSE_CACHE_SECONDS],
        )
        .map_err(|_| "Could not maintain the local medical cache")?;
    transaction
        .execute(
            "DELETE FROM medical_reference_terms
             WHERE cached_at < ?1 OR rowid NOT IN (
               SELECT rowid FROM medical_reference_terms ORDER BY cached_at DESC LIMIT 2000
             )",
            params![now - LEARNED_TERMS_SECONDS],
        )
        .map_err(|_| "Could not maintain the local medical cache")?;
    transaction
        .commit()
        .map_err(|_| "Could not save the local medical cache".into())
}

fn search_url(provider: Provider, query: &str) -> Result<reqwest::Url, String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 || query.chars().any(char::is_control) {
        return Err("Enter a medical term of 1–200 characters, without line breaks.".into());
    }
    let mut url = reqwest::Url::parse(match provider {
        Provider::Medline => "https://wsearch.nlm.nih.gov/ws/query",
        Provider::Mesh => "https://id.nlm.nih.gov/mesh/sparql",
    })
    .map_err(|_| "Invalid lookup service configuration")?;
    match provider {
        Provider::Medline => {
            url.query_pairs_mut().extend_pairs([
                ("db", "healthTopics"),
                ("term", query),
                ("retmax", "10"),
                ("rettype", "topic"),
                ("tool", "VibePBL"),
            ]);
        }
        Provider::Mesh => return mesh_search_url(query, false),
    }
    Ok(url)
}

fn mesh_search_url(query: &str, include_synonyms: bool) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse("https://id.nlm.nih.gov/mesh/sparql")
        .map_err(|_| "Invalid lookup service configuration")?;
    // Search a small set of word fragments, then rank the returned terms
    // locally. This supports incomplete words and minor misspellings without
    // sending case notes or using a third-party spell-checking service.
    let fragment_groups = search_fragment_groups(query);
    if fragment_groups.is_empty() {
        return Err("Enter at least one letter or number.".into());
    }
    let literal = serde_json::to_string(&normalized(query)).map_err(|_| "Invalid search term")?;
    let fragment_literals = fragment_groups
        .iter()
        .flatten()
        .map(|fragment| serde_json::to_string(fragment).map_err(|_| "Invalid search term".into()))
        .collect::<Result<Vec<_>, String>>()?;
    let mut literal_index = 0;
    let filters = fragment_groups
        .iter()
        .map(|group| {
            let filter = fragment_literals[literal_index..literal_index + group.len()]
                .iter()
                .map(|value| format!("CONTAINS(LCASE(STR(?searchLabel)), {value})"))
                .collect::<Vec<_>>()
                .join(" || ");
            literal_index += group.len();
            format!("({filter})")
        })
        .collect::<Vec<_>>()
        .join(" && ");
    let score = fragment_literals
        .iter()
        .map(|value| format!("IF(CONTAINS(LCASE(STR(?searchLabel)), {value}), 1, 0)"))
        .collect::<Vec<_>>()
        .join(" + ");
    let term_search = if include_synonyms {
        r#"OPTIONAL {
    ?descriptor meshv:concept ?concept.
    ?concept (meshv:preferredTerm|meshv:term) ?term.
    ?term (meshv:prefLabel|meshv:altLabel) ?termLabel.
  }
  BIND(COALESCE(?termLabel, STR(?label)) AS ?searchLabel)"#
    } else {
        "BIND(STR(?label) AS ?searchLabel)"
    };
    let limit = if include_synonyms { 160 } else { 80 };
    let sparql = format!(
        r#"PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?descriptor ?label ?definition ?searchLabel FROM <http://id.nlm.nih.gov/mesh>
WHERE {{
  ?descriptor a meshv:TopicalDescriptor;
    rdfs:label ?label;
    meshv:preferredConcept ?preferredConcept.
  ?preferredConcept meshv:scopeNote ?definition.
  {term_search}
  FILTER({filters})
  BIND(({score}) AS ?fragmentScore)
}}
ORDER BY DESC(LCASE(STR(?label)) = {literal}) DESC(?fragmentScore) STRLEN(STR(?searchLabel))
LIMIT {limit}"#
    );
    url.query_pairs_mut()
        .extend_pairs([("format", "JSON"), ("query", &sparql)]);
    Ok(url)
}

fn parse_medline(body: &str) -> Result<Vec<LookupResult>, String> {
    let document = roxmltree::Document::parse(body)
        .map_err(|_| "MedlinePlus returned an unreadable response.")?;
    if !document.root_element().has_tag_name("nlmSearchResult") {
        return Err("MedlinePlus returned an unexpected response.".into());
    }
    Ok(document
        .descendants()
        .filter(|node| node.has_tag_name("health-topic"))
        .take(10)
        .filter_map(|node| {
            let title = node.attribute("title")?.to_string();
            let url = node.attribute("url")?.to_string();
            let parsed = reqwest::Url::parse(&url).ok()?;
            if parsed.scheme() != "https" || parsed.host_str() != Some("medlineplus.gov") {
                return None;
            }
            let summary = node
                .children()
                .find(|child| child.has_tag_name("full-summary"))?
                .text()?
                .to_string();
            Some(LookupResult {
                title,
                summary,
                url,
                source: "MedlinePlus.gov — National Library of Medicine".into(),
                plain_text: false,
                matched_term: String::new(),
                match_kind: "related".into(),
            })
        })
        .collect())
}

fn normalized_words(value: &str) -> Vec<String> {
    let mut normalized = String::with_capacity(value.len());
    for character in value.chars().flat_map(char::to_lowercase) {
        normalized.push(if character.is_alphanumeric() {
            character
        } else {
            ' '
        });
    }
    normalized.split_whitespace().map(str::to_owned).collect()
}

fn normalized(value: &str) -> String {
    normalized_words(value).join(" ")
}

fn search_fragment_groups(query: &str) -> Vec<Vec<String>> {
    normalized_words(query)
        .into_iter()
        .take(8)
        .filter_map(|word| {
            let characters: Vec<char> = word.chars().collect();
            if characters.is_empty() {
                return None;
            }
            let width = characters.len().min(3);
            let mut fragments = characters
                .windows(width)
                .map(|fragment| fragment.iter().collect::<String>())
                .collect::<Vec<_>>();
            fragments.dedup();
            if fragments.len() > 12 {
                let last = fragments.pop();
                fragments.truncate(11);
                if let Some(last) = last {
                    fragments.push(last);
                }
            }
            Some(fragments)
        })
        .collect()
}

fn edit_distance(left: &str, right: &str) -> usize {
    let right: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right.len()).collect();
    for (left_index, left_character) in left.chars().enumerate() {
        let mut current = vec![left_index + 1];
        for (right_index, right_character) in right.iter().enumerate() {
            current.push(
                (previous[right_index + 1] + 1).min(
                    (current[right_index] + 1).min(
                        previous[right_index] + usize::from(left_character != *right_character),
                    ),
                ),
            );
        }
        previous = current;
    }
    previous[right.len()]
}

fn bigrams(value: &str) -> Vec<String> {
    let chars: Vec<char> = value.chars().collect();
    chars.windows(2).map(|pair| pair.iter().collect()).collect()
}

fn word_similarity(query: &str, candidate: &str) -> f64 {
    if query == candidate {
        return 1.0;
    }
    if candidate.starts_with(query) {
        return 0.96;
    }
    if query.starts_with(candidate) {
        return 0.9;
    }
    if query.chars().count() >= 3 && candidate.contains(query) {
        return 0.88;
    }
    let query_characters: Vec<char> = query.chars().collect();
    // Short abbreviations such as "defib" can correspond to the beginning of
    // a later word ("fibrillation"). Do not apply this shortcut to long typo
    // queries: their final three letters can coincidentally be a short term.
    if (5..=6).contains(&query_characters.len()) {
        let suffix: String = query_characters[query_characters.len() - 3..]
            .iter()
            .collect();
        if candidate.starts_with(&suffix) {
            return 0.92;
        }
    }
    let max_len = query.chars().count().max(candidate.chars().count());
    let edit_score = if max_len == 0 {
        0.0
    } else {
        1.0 - edit_distance(query, candidate) as f64 / max_len as f64
    };
    let left_pairs = bigrams(query);
    let right_pairs = bigrams(candidate);
    let mut remaining = right_pairs.clone();
    let overlap = left_pairs
        .iter()
        .filter(|pair| {
            remaining
                .iter()
                .position(|other| other == *pair)
                .map(|index| {
                    remaining.remove(index);
                })
                .is_some()
        })
        .count();
    let dice_score = if left_pairs.len() + right_pairs.len() == 0 {
        0.0
    } else {
        2.0 * overlap as f64 / (left_pairs.len() + right_pairs.len()) as f64
    };
    edit_score.max(dice_score)
}

fn match_score(query: &str, candidate: &str) -> f64 {
    let query_words = normalized_words(query);
    let candidate_words = normalized_words(candidate);
    if query_words.is_empty() || candidate_words.is_empty() {
        return 0.0;
    }
    let average = query_words
        .iter()
        .map(|word| {
            candidate_words
                .iter()
                .map(|candidate| word_similarity(word, candidate))
                .fold(0.0, f64::max)
        })
        .sum::<f64>()
        / query_words.len() as f64;
    let extra_words = candidate_words.len().saturating_sub(query_words.len());
    (average - (extra_words.min(5) as f64 * 0.04)).max(0.0)
}

fn parse_mesh(body: &str, query: &str) -> Result<Vec<LookupResult>, String> {
    let data: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "MeSH returned an unreadable response.")?;
    let bindings = data
        .pointer("/results/bindings")
        .and_then(|value| value.as_array())
        .ok_or("MeSH returned an unexpected response.")?;
    let normalized_query = normalized(query);
    let mut candidates: HashMap<String, (f64, LookupResult)> = HashMap::new();
    for row in bindings {
        let Some((identifier, label, definition, search_label)) = (|| {
            let resource = row.pointer("/descriptor/value")?.as_str()?;
            let identifier = resource.strip_prefix("http://id.nlm.nih.gov/mesh/")?;
            if !identifier.starts_with('D')
                || identifier.len() < 2
                || !identifier[1..].bytes().all(|byte| byte.is_ascii_digit())
            {
                return None;
            }
            Some((
                identifier.to_owned(),
                row.pointer("/label/value")?.as_str()?.to_owned(),
                row.pointer("/definition/value")?.as_str()?.to_owned(),
                row.pointer("/searchLabel/value")?.as_str()?.to_owned(),
            ))
        })() else {
            continue;
        };
        let score = match_score(query, &search_label).max(match_score(query, &label));
        if score < 0.36 {
            continue;
        }
        let matched_normalized = normalized(&search_label);
        let label_normalized = normalized(&label);
        let match_kind =
            if normalized_query == matched_normalized || normalized_query == label_normalized {
                "exact"
            } else if matched_normalized.starts_with(&normalized_query)
                || label_normalized.starts_with(&normalized_query)
            {
                "partial"
            } else {
                "suggested"
            };
        let ranked_score = score
            + match match_kind {
                "exact" => 2.0,
                "partial" => 1.0,
                _ => 0.0,
            };
        let result = LookupResult {
            title: label,
            summary: definition,
            url: format!("https://id.nlm.nih.gov/mesh/{identifier}"),
            source: "MeSH — Courtesy of the U.S. National Library of Medicine".into(),
            plain_text: true,
            matched_term: search_label,
            match_kind: match_kind.into(),
        };
        match candidates.get(&identifier) {
            Some((existing_score, _)) if *existing_score >= ranked_score => {}
            _ => {
                candidates.insert(identifier, (ranked_score, result));
            }
        }
    }
    let mut candidates: Vec<_> = candidates.into_values().collect();
    candidates.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(Ordering::Equal)
            .then_with(|| left.1.title.cmp(&right.1.title))
    });
    Ok(candidates
        .into_iter()
        .take(10)
        .map(|(_, result)| result)
        .collect())
}

async fn fetch_text(client: &reqwest::Client, url: reqwest::Url) -> Result<String, String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| {
            "Could not reach the medical reference service. Check your connection and try again."
        })?
        .error_for_status()
        .map_err(|_| {
            "The medical reference service is temporarily unavailable. Try again later."
        })?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The search response was interrupted. Please try again.")?
    {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("The search response was too large. Try a more specific term.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "The search response was not readable text.".into())
}

#[tauri::command]
pub async fn search_terminology(
    provider: Provider,
    query: String,
    state: State<'_, LookupState>,
    app_state: State<'_, AppState>,
) -> Result<LookupResponse, String> {
    // Only these fixed providers are reachable; callers cannot supply arbitrary URLs.
    let url = search_url(provider, &query)?;
    let key = format!("{}:{}", provider.cache_key(), normalized(&query));
    {
        let mut cache = state.cache.lock().map_err(|_| "Lookup is busy")?;
        cache
            .entries
            .retain(|_, (time, _)| time.elapsed() < Duration::from_secs(12 * 3600));
        if let Some((_, response)) = cache.entries.get(&key) {
            return Ok(response.clone());
        }
    }
    if let Some(response) = read_persistent_response(&app_state, provider, &query)? {
        let mut cache = state.cache.lock().map_err(|_| "Lookup is busy")?;
        cache
            .entries
            .insert(key, (Instant::now(), response.clone()));
        return Ok(response);
    }
    if provider == Provider::Mesh {
        if let Some(response) = bundled_mesh_response(&app_state, &query)? {
            let mut cache = state.cache.lock().map_err(|_| "Lookup is busy")?;
            cache
                .entries
                .insert(key, (Instant::now(), response.clone()));
            return Ok(response);
        }
    }
    if let Some(response) = learned_response(&app_state, provider, &query)? {
        let mut cache = state.cache.lock().map_err(|_| "Lookup is busy")?;
        cache
            .entries
            .insert(key, (Instant::now(), response.clone()));
        return Ok(response);
    }
    {
        let mut cache = state.cache.lock().map_err(|_| "Lookup is busy")?;
        if cache
            .last_request
            .get(&provider)
            .is_some_and(|time| time.elapsed() < Duration::from_millis(250))
        {
            return Err("Please wait a moment before searching again.".into());
        }
        cache.last_request.insert(provider, Instant::now());
    }
    let body = fetch_text(&state.client, url).await?;
    let results = match provider {
        Provider::Medline => parse_medline(&body)?,
        Provider::Mesh => {
            let direct = parse_mesh(&body, &query)?;
            if direct.is_empty() {
                let synonym_body =
                    fetch_text(&state.client, mesh_search_url(query.trim(), true)?).await?;
                parse_mesh(&synonym_body, &query)?
            } else {
                direct
            }
        }
    };
    let result = LookupResponse {
        results,
        retrieved_at: chrono::Utc::now().to_rfc3339(),
    };
    write_persistent_response(&app_state, provider, &query, &result)?;
    let mut cache = state.cache.lock().map_err(|_| "Lookup is busy")?;
    if cache.entries.len() >= 80 {
        if let Some(oldest) = cache
            .entries
            .iter()
            .min_by_key(|(_, (time, _))| time)
            .map(|(key, _)| key.clone())
        {
            cache.entries.remove(&oldest);
        }
    }
    cache.entries.insert(key, (Instant::now(), result.clone()));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::PathBuf;
    #[test]
    fn query_is_encoded_and_cannot_change_provider() {
        let url = search_url(Provider::Medline, "a&term=other#ไทย").unwrap();
        assert_eq!(url.host_str(), Some("wsearch.nlm.nih.gov"));
        assert_eq!(
            url.query_pairs().find(|(key, _)| key == "term").unwrap().1,
            "a&term=other#ไทย"
        );
        assert!(search_url(Provider::Medline, "").is_err());
        assert!(search_url(Provider::Medline, "hello\nworld").is_err());
        assert!(search_url(Provider::Medline, &"a".repeat(201)).is_err());
    }
    #[test]
    fn summaries_not_third_party_articles_are_returned() {
        let xml = r#"<nlmSearchResult><health-topic title="Example" url="https://medlineplus.gov/example.html"><full-summary>&lt;p&gt;Test summary&lt;/p&gt;</full-summary><site url="https://elsewhere.example" title="Licensed article"/></health-topic></nlmSearchResult>"#;
        let results = parse_medline(xml).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].summary, "<p>Test summary</p>");
        assert!(parse_medline("<html/>").is_err());
        assert!(parse_medline("not XML").is_err());
    }

    #[test]
    fn mesh_uses_current_graph_and_safe_literals() {
        let url = search_url(Provider::Mesh, "a\" } UNION { ?x ?y ?z #").unwrap();
        assert_eq!(url.host_str(), Some("id.nlm.nih.gov"));
        let query = url
            .query_pairs()
            .find(|(key, _)| key == "query")
            .unwrap()
            .1
            .into_owned();
        assert!(query.contains("FROM <http://id.nlm.nih.gov/mesh>"));
        assert!(!query.contains("?x ?y ?z"));
        assert!(!query.contains("meshv:altLabel"));
        let synonym_query = mesh_search_url("auricular fibrillation", true)
            .unwrap()
            .query_pairs()
            .find(|(key, _)| key == "query")
            .unwrap()
            .1
            .into_owned();
        assert!(synonym_query.contains("meshv:altLabel"));
        let result = parse_mesh(r#"{"results":{"bindings":[{"descriptor":{"value":"http://id.nlm.nih.gov/mesh/D013163"},"label":{"value":"Splenomegaly"},"definition":{"value":"Enlargement of the spleen."},"searchLabel":{"value":"Splenomegaly"}}]}}"#, "splenomegely").unwrap();
        assert_eq!(result[0].title, "Splenomegaly");
        assert!(result[0].plain_text);
        assert_eq!(result[0].match_kind, "suggested");
        assert!(parse_mesh("{}", "example").is_err());
    }

    #[test]
    fn mesh_matching_supports_partial_terms_and_typos() {
        assert!(match_score("spleno", "Splenomegaly") > 0.9);
        assert!(match_score("splenomegely", "Splenomegaly") > 0.9);
        assert!(match_score("atrial defib", "Atrial Fibrillation") > 0.6);
        assert!(match_score("atrial defib", "Atrial Flutter") < 0.6);
        assert!(word_similarity("defib", "fibrillation") > word_similarity("defib", "defect"));
        assert_eq!(
            search_fragment_groups("atrial defib"),
            vec![vec!["atr", "tri", "ria", "ial"], vec!["def", "efi", "fib"]]
        );
        let ranked = parse_mesh(
            r#"{"results":{"bindings":[{"descriptor":{"value":"http://id.nlm.nih.gov/mesh/D005258"},"label":{"value":"Felty Syndrome"},"definition":{"value":"Includes splenomegaly."},"searchLabel":{"value":"Rheumatoid Arthritis, Splenomegaly and Neutropenia"}},{"descriptor":{"value":"http://id.nlm.nih.gov/mesh/D013163"},"label":{"value":"Splenomegaly"},"definition":{"value":"Enlargement of the spleen."},"searchLabel":{"value":"Splenomegaly"}}]}}"#,
            "splenomegaly",
        )
        .unwrap();
        assert_eq!(ranked[0].title, "Splenomegaly");
        assert_eq!(ranked[0].match_kind, "exact");
    }

    #[test]
    fn bundled_mesh_index_finds_incomplete_and_misspelled_terms() {
        let directory =
            std::env::temp_dir().join(format!("vibepbl-lookup-test-{}", uuid::Uuid::new_v4()));
        let database = crate::db::open_medical_index(&directory).expect("open bundled MeSH index");
        let app_state = AppState {
            db: Mutex::new(Connection::open_in_memory().expect("open session database")),
            medical_db: Some(Mutex::new(database)),
            app_data_dir: PathBuf::new(),
        };
        for (query, expected) in [
            ("splenomegely", "Splenomegaly"),
            ("atrial defib", "Atrial Fibrillation"),
        ] {
            let response = bundled_mesh_response(&app_state, query)
                .expect("search bundled index")
                .expect("find bundled result");
            assert!(!response.results.is_empty(), "{query}");
            assert_eq!(response.results[0].title, expected, "{query}");
            assert!(response.results[0].source.contains("MeSH 2026 offline"));
        }
        let response = bundled_mesh_response(&app_state, "atrial defib")
            .unwrap()
            .unwrap();
        assert_eq!(response.results[0].title, "Atrial Fibrillation");
        drop(app_state);
        std::fs::remove_dir_all(directory).expect("remove lookup test directory");
    }

    #[test]
    fn persistent_cache_survives_memory_cache_and_supports_nearby_queries() {
        let directory =
            std::env::temp_dir().join(format!("vibepbl-cache-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).expect("create cache test directory");
        let app_state = AppState {
            db: Mutex::new(
                crate::db::open(&directory.join("vibepbl.db")).expect("open test database"),
            ),
            medical_db: None,
            app_data_dir: directory.clone(),
        };
        let response = LookupResponse {
            results: vec![LookupResult {
                title: "Atrial Fibrillation".into(),
                summary: "An arrhythmia.".into(),
                url: "https://id.nlm.nih.gov/mesh/D001281".into(),
                source: "MeSH test".into(),
                plain_text: true,
                matched_term: "Auricular Fibrillation".into(),
                match_kind: "exact".into(),
            }],
            retrieved_at: chrono::Utc::now().to_rfc3339(),
        };
        write_persistent_response(&app_state, Provider::Mesh, "atrial fibrillation", &response)
            .expect("write persistent response");
        let cached = read_persistent_response(&app_state, Provider::Mesh, "atrial fibrillation")
            .expect("read persistent response")
            .expect("cached response");
        assert_eq!(cached.retrieved_at, response.retrieved_at);
        let nearby = learned_response(&app_state, Provider::Mesh, "atrial fibrill")
            .expect("search learned terms")
            .expect("nearby cached term");
        assert_eq!(nearby.results[0].title, "Atrial Fibrillation");
        drop(app_state);
        std::fs::remove_dir_all(directory).expect("remove cache test directory");
    }
}
