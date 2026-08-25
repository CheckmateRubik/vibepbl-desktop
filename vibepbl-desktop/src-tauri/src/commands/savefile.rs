use std::{fs, path::PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::params;
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{commands::session::read_session, models::SessionData, AppState};

#[tauri::command]
pub fn export_savefile_dialog(state: State<'_, AppState>) -> Result<String, String> {
    let connection = state.db.lock().map_err(|_| "Database is busy".to_string())?;
    let session = read_session(&connection)?;
    drop(connection);
    let mut value = serde_json::to_value(&session).map_err(|error| error.to_string())?;
    if let Some(images) = value.get_mut("caseImages").and_then(Value::as_array_mut) {
        for image in images {
            if let Some(path) = image.get("localPath").and_then(Value::as_str) {
                if let Ok(bytes) = fs::read(path) {
                    image["embeddedData"] = Value::String(STANDARD.encode(bytes));
                }
            }
        }
    }
    let payload = json!({ "format": "vibepbl", "version": 1, "exportedAt": chrono::Utc::now(), "session": value });
    let path = rfd::FileDialog::new()
        .set_file_name(format!("{}.pbl.json", safe_filename(&session.title)))
        .add_filter("VibePBL session", &["json"])
        .save_file()
        .ok_or_else(|| "cancelled".to_string())?;
    fs::write(&path, serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?)
        .map_err(|error| format!("Could not save session: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_savefile_dialog(state: State<'_, AppState>) -> Result<SessionData, String> {
    let path = rfd::FileDialog::new().add_filter("VibePBL session", &["json"]).pick_file()
        .ok_or_else(|| "cancelled".to_string())?;
    let bytes = fs::read(&path).map_err(|error| format!("Could not read session: {error}"))?;
    let root: Value = serde_json::from_slice(&bytes).map_err(|error| format!("Invalid VibePBL file: {error}"))?;
    let mut session_value = root.get("session").cloned().unwrap_or(root);
    restore_embedded_images(&mut session_value, &state.app_data_dir)?;
    let session: SessionData = serde_json::from_value(session_value).map_err(|error| format!("Incompatible session file: {error}"))?;
    let connection = state.db.lock().map_err(|_| "Database is busy".to_string())?;
    connection.execute(
        "UPDATE session SET title=?1, theme=?2, case_text=?3, case_images=?4, terms=?5, timeline=?6, problems=?7, objectives=?8, presenter_assignments=?9, is_act1_completed=?10, updated_at=CURRENT_TIMESTAMP WHERE id=1",
        params![
            session.title, session.theme, session.case_text,
            serde_json::to_string(&session.case_images).map_err(|error| error.to_string())?,
            serde_json::to_string(&session.terms).map_err(|error| error.to_string())?,
            serde_json::to_string(&session.timeline).map_err(|error| error.to_string())?,
            serde_json::to_string(&session.problems).map_err(|error| error.to_string())?,
            serde_json::to_string(&session.objectives).map_err(|error| error.to_string())?,
            serde_json::to_string(&session.presenter_assignments).map_err(|error| error.to_string())?,
            if session.is_act1_completed { 1 } else { 0 },
        ],
    ).map_err(|error| error.to_string())?;
    read_session(&connection)
}

fn restore_embedded_images(value: &mut Value, app_data_dir: &PathBuf) -> Result<(), String> {
    if let Some(images) = value.get_mut("caseImages").and_then(Value::as_array_mut) {
        for image in images {
            let Some(encoded) = image.get("embeddedData").and_then(Value::as_str) else { continue };
            let bytes = STANDARD.decode(encoded).map_err(|_| "An embedded image is corrupted".to_string())?;
            let original = image.get("originalName").and_then(Value::as_str).unwrap_or("image.png");
            let extension = PathBuf::from(original).extension().and_then(|value| value.to_str()).unwrap_or("png").to_string();
            let id = Uuid::new_v4().to_string();
            let filename = format!("{id}.{extension}");
            let destination = app_data_dir.join("images").join(&filename);
            fs::write(&destination, bytes).map_err(|error| format!("Could not restore embedded image: {error}"))?;
            image["id"] = Value::String(id);
            image["filename"] = Value::String(filename);
            image["localPath"] = Value::String(destination.to_string_lossy().to_string());
            image.as_object_mut().map(|object| object.remove("embeddedData"));
        }
    }
    Ok(())
}

fn safe_filename(title: &str) -> String {
    let cleaned: String = title.chars().map(|character| if "<>:\"/\\|?*".contains(character) { '-' } else { character }).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() { "PBL-Session".into() } else { trimmed.into() }
}
