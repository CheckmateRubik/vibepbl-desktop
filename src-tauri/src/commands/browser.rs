use std::sync::{Arc, Mutex};

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State,
    WebviewBuilder, WebviewUrl, WindowBuilder,
};

pub(crate) const WINDOW_LABEL: &str = "reference-browser";
pub(crate) const TOOLBAR_LABEL: &str = "reference-toolbar";
const CONTENT_LABEL: &str = "reference-content";
const TOOLBAR_HEIGHT: f64 = 54.0;

#[derive(Default)]
struct BrowserHistory {
    entries: Vec<reqwest::Url>,
    index: usize,
    programmatic_target: Option<String>,
}

#[derive(Clone, Default)]
pub struct BrowserState {
    history: Arc<Mutex<BrowserHistory>>,
}

fn allowed_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|host| {
            host != "localhost"
                && !host.ends_with(".localhost")
                && !host.ends_with(".local")
                // Google sign-in/OAuth is intentionally unavailable in an
                // embedded user-agent; ordinary, signed-out search still works.
                && host != "accounts.google.com"
                && host.parse::<std::net::IpAddr>().is_err()
        })
}

fn history_key(url: &reqwest::Url) -> String {
    if url.host_str() == Some("duckduckgo.com") {
        if let Some((_, query)) = url.query_pairs().find(|(key, _)| key == "q") {
            return format!("duckduckgo:{}", query.to_lowercase());
        }
    }
    if url
        .host_str()
        .is_some_and(|host| host == "google.com" || host == "www.google.com")
    {
        if let Some((_, query)) = url.query_pairs().find(|(key, _)| key == "q") {
            return format!("google:{}", query.to_lowercase());
        }
    }
    let mut normalized = url.clone();
    normalized.set_fragment(None);
    normalized.to_string()
}

fn update_toolbar(app: &AppHandle, url: &reqwest::Url) {
    let Some(toolbar) = app.get_webview(TOOLBAR_LABEL) else {
        return;
    };
    let Ok(value) = serde_json::to_string(url.as_str()) else {
        return;
    };
    let _ = toolbar.eval(format!(
        "window.__referenceUrl={value};window.updateAddress?.({value});"
    ));
}

impl BrowserState {
    fn reset(&self) {
        if let Ok(mut history) = self.history.lock() {
            *history = BrowserHistory::default();
        }
    }

    fn record(&self, url: &reqwest::Url) {
        let Ok(mut history) = self.history.lock() else {
            return;
        };
        let key = history_key(url);
        if history.entries.is_empty() {
            history.entries.push(url.clone());
            return;
        }
        if history_key(&history.entries[history.index]) == key
            || history.programmatic_target.as_deref() == Some(&key)
        {
            let index = history.index;
            history.entries[index] = url.clone();
            history.programmatic_target = None;
            return;
        }
        let next = history.index + 1;
        history.entries.truncate(next);
        history.entries.push(url.clone());
        history.index = history.entries.len() - 1;
    }

    fn move_by(&self, delta: isize) -> Result<reqwest::Url, String> {
        let mut history = self.history.lock().map_err(|_| "Browser history is busy")?;
        let next = history.index as isize + delta;
        if next < 0 || next >= history.entries.len() as isize {
            return Err(if delta < 0 {
                "No earlier page."
            } else {
                "No later page."
            }
            .into());
        }
        history.index = next as usize;
        let target = history.entries[history.index].clone();
        history.programmatic_target = Some(history_key(&target));
        Ok(target)
    }
}

#[tauri::command]
pub async fn open_web_search(
    query: String,
    engine: Option<SearchEngine>,
    app: AppHandle,
    state: State<'_, BrowserState>,
) -> Result<(), String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 || query.chars().any(char::is_control) {
        return Err("Enter a search term of 1–200 characters.".into());
    }
    let mut url = reqwest::Url::parse(match engine.unwrap_or_default() {
        SearchEngine::Google => "https://www.google.com/search",
        SearchEngine::Duckduckgo => "https://duckduckgo.com/",
    })
    .map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("q", query);
    if let (Some(window), Some(content)) =
        (app.get_window(WINDOW_LABEL), app.get_webview(CONTENT_LABEL))
    {
        content.navigate(url).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }

    state.reset();
    let window = WindowBuilder::new(&app, WINDOW_LABEL)
        .title("Web search — VibePBL")
        .inner_size(1050.0, 800.0)
        .min_inner_size(650.0, 450.0)
        .visible(false)
        .build()
        .map_err(|error| format!("Could not open web search: {error}"))?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let inner: LogicalSize<f64> = window
        .inner_size()
        .map_err(|error| error.to_string())?
        .to_logical(scale);
    let toolbar = window
        .add_child(
            WebviewBuilder::new(
                TOOLBAR_LABEL,
                WebviewUrl::App("reference-browser.html".into()),
            ),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(inner.width, TOOLBAR_HEIGHT),
        )
        .map_err(|error| format!("Could not create search controls: {error}"))?;

    let navigation_app = app.clone();
    let navigation_state = state.inner().clone();
    let popup_app = app.clone();
    let content = window
        .add_child(
            WebviewBuilder::new(CONTENT_LABEL, WebviewUrl::External(url))
                .incognito(true)
                .on_navigation(move |url| {
                    if !allowed_url(url) {
                        return false;
                    }
                    navigation_state.record(url);
                    update_toolbar(&navigation_app, url);
                    if let Some(window) = navigation_app.get_window(WINDOW_LABEL) {
                        let _ = window.set_title(&format!(
                            "Web search — VibePBL — {}",
                            url.host_str().unwrap_or("")
                        ));
                    }
                    true
                })
                .on_new_window(move |url, _| {
                    if allowed_url(&url) {
                        if let Some(content) = popup_app.get_webview(CONTENT_LABEL) {
                            tauri::async_runtime::spawn(async move {
                                let _ = content.navigate(url);
                            });
                        }
                    }
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_download(|_, _| false),
            LogicalPosition::new(0.0, TOOLBAR_HEIGHT),
            LogicalSize::new(inner.width, (inner.height - TOOLBAR_HEIGHT).max(1.0)),
        )
        .map_err(|error| format!("Could not create search page: {error}"))?;

    let resize_window = window.clone();
    let resize_toolbar = toolbar.clone();
    let resize_content = content.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Resized(size) = event {
            let scale = resize_window.scale_factor().unwrap_or(1.0);
            let toolbar_height = (TOOLBAR_HEIGHT * scale).round() as u32;
            let _ = resize_toolbar.set_size(PhysicalSize::new(size.width, toolbar_height));
            let _ = resize_content.set_position(PhysicalPosition::new(0, toolbar_height as i32));
            let _ = resize_content.set_size(PhysicalSize::new(
                size.width,
                size.height.saturating_sub(toolbar_height),
            ));
        }
    });
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchEngine {
    Google,
    #[default]
    Duckduckgo,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserAction {
    Back,
    Forward,
    Close,
}

#[tauri::command]
pub async fn reference_browser_action(
    action: BrowserAction,
    app: AppHandle,
    state: State<'_, BrowserState>,
) -> Result<(), String> {
    let content = app
        .get_webview(CONTENT_LABEL)
        .ok_or("Open a web search first.")?;
    match action {
        BrowserAction::Back => content.navigate(state.move_by(-1)?),
        BrowserAction::Forward => content.navigate(state.move_by(1)?),
        BrowserAction::Close => {
            state.reset();
            return app
                .get_window(WINDOW_LABEL)
                .ok_or("Open a web search first.")?
                .close()
                .map_err(|error| error.to_string());
        }
    }
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browsing_never_navigates_to_app_or_local_schemes() {
        for value in [
            "tauri://localhost",
            "https://tauri.localhost",
            "file:///secret",
            "javascript:alert(1)",
            "http://example.com",
            "https://127.0.0.1",
            "https://user:pass@example.com",
            "https://accounts.google.com/ServiceLogin",
        ] {
            assert!(!allowed_url(&value.parse().unwrap()), "{value}");
        }
        assert!(allowed_url(
            &"https://medlineplus.gov/ency/article/003276.htm"
                .parse()
                .unwrap()
        ));
    }

    #[test]
    fn history_ignores_duckduckgo_view_rewrites() {
        let state = BrowserState::default();
        state.record(&"https://duckduckgo.com/?q=splenomegaly".parse().unwrap());
        state.record(
            &"https://duckduckgo.com/?q=splenomegaly&ia=web"
                .parse()
                .unwrap(),
        );
        state.record(&"https://duckduckgo.com/?q=asthma&ia=web".parse().unwrap());
        assert!(state.move_by(-1).unwrap().as_str().contains("splenomegaly"));
        assert!(state.move_by(1).unwrap().as_str().contains("asthma"));
    }

    #[test]
    fn history_ignores_google_view_rewrites() {
        let state = BrowserState::default();
        state.record(
            &"https://www.google.com/search?q=splenomegaly"
                .parse()
                .unwrap(),
        );
        state.record(
            &"https://www.google.com/search?q=splenomegaly&sourceid=chrome"
                .parse()
                .unwrap(),
        );
        state.record(&"https://www.google.com/search?q=asthma".parse().unwrap());
        assert!(state.move_by(-1).unwrap().as_str().contains("splenomegaly"));
        assert!(state.move_by(1).unwrap().as_str().contains("asthma"));
    }
}
