use rusqlite::{params, Connection};
use tauri::State;

use crate::{models::SessionData, AppState};

const JSON_FIELDS: &[&str] = &[
    "case_images",
    "terms",
    "timeline",
    "problems",
    "objectives",
    "presenter_assignments",
];

pub fn read_session(connection: &Connection) -> Result<SessionData, String> {
    connection
        .query_row(
            "SELECT id, title, theme, case_text, case_images, terms, timeline, problems, objectives, presenter_assignments, is_act1_completed, updated_at FROM session WHERE id = 1",
            [],
            |row| {
                let case_images: String = row.get(4)?;
                let terms: String = row.get(5)?;
                let timeline: String = row.get(6)?;
                let problems: String = row.get(7)?;
                let objectives: String = row.get(8)?;
                let assignments: String = row.get(9)?;
                Ok(SessionData {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    theme: row.get(2)?,
                    case_text: row.get(3)?,
                    case_images: serde_json::from_str(&case_images).unwrap_or_default(),
                    terms: serde_json::from_str(&terms).unwrap_or_default(),
                    timeline: serde_json::from_str(&timeline).unwrap_or_default(),
                    problems: serde_json::from_str(&problems).unwrap_or_default(),
                    objectives: serde_json::from_str(&objectives).unwrap_or_default(),
                    presenter_assignments: serde_json::from_str(&assignments).unwrap_or_else(|_| serde_json::json!({})),
                    is_act1_completed: row.get::<_, i64>(10)? != 0,
                    updated_at: row.get(11)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_session(state: State<'_, AppState>) -> Result<SessionData, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    read_session(&connection)
}

#[tauri::command]
pub fn save_session_field(
    field_name: String,
    json_value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let allowed = [
        "title",
        "theme",
        "case_text",
        "case_images",
        "terms",
        "timeline",
        "problems",
        "objectives",
        "presenter_assignments",
        "is_act1_completed",
    ];
    if !allowed.contains(&field_name.as_str()) {
        return Err("Unsupported session field".into());
    }

    let value: serde_json::Value = serde_json::from_str(&json_value)
        .map_err(|_| "Session data is not valid JSON".to_string())?;
    let stored = if JSON_FIELDS.contains(&field_name.as_str()) {
        serde_json::to_string(&value).map_err(|error| error.to_string())?
    } else if field_name == "is_act1_completed" {
        if value.as_bool().unwrap_or(false) {
            "1".into()
        } else {
            "0".into()
        }
    } else {
        value
            .as_str()
            .ok_or_else(|| "Expected a text value".to_string())?
            .to_string()
    };

    let sql = format!(
        "UPDATE session SET {field_name} = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = 1"
    );
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    connection
        .execute(&sql, params![stored])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reset_session(state: State<'_, AppState>) -> Result<(), String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    connection
        .execute(
            "UPDATE session SET title='PBL Session', theme='default', case_text='', case_images='[]', terms='[]', timeline='[]', problems='[]', objectives='[]', presenter_assignments='{}', is_act1_completed=0, updated_at=CURRENT_TIMESTAMP WHERE id=1",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
