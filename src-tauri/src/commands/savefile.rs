use std::{
    fs,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::params;
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{commands::session::read_session, models::SessionData, AppState};

const MAX_SAVEFILE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const MAX_IMAGES: usize = 50;
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif"];

#[tauri::command]
pub fn export_savefile_dialog(state: State<'_, AppState>) -> Result<String, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    let session = read_session(&connection)?;
    drop(connection);
    let mut value = serde_json::to_value(&session).map_err(|error| error.to_string())?;
    if let Some(images) = value.get_mut("caseImages").and_then(Value::as_array_mut) {
        for image in images {
            if let Some(path) = image.get("localPath").and_then(Value::as_str) {
                if let Some(path) = private_image_path(Path::new(path), &state.app_data_dir) {
                    let bytes = fs::read(path)
                        .map_err(|error| format!("Could not read a private image: {error}"))?;
                    if bytes.len() > MAX_EMBEDDED_IMAGE_BYTES {
                        return Err(
                            "A clinical image is too large to export (25 MB maximum)".into()
                        );
                    }
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
    fs::write(
        &path,
        serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Could not save session: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_savefile_dialog(state: State<'_, AppState>) -> Result<SessionData, String> {
    let path = rfd::FileDialog::new()
        .add_filter("VibePBL session", &["json"])
        .pick_file()
        .ok_or_else(|| "cancelled".to_string())?;
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Could not read session: {error}"))?;
    if metadata.len() > MAX_SAVEFILE_BYTES {
        return Err("The session file is too large (100 MB maximum)".into());
    }
    let bytes = fs::read(&path).map_err(|error| format!("Could not read session: {error}"))?;
    let root: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("Invalid VibePBL file: {error}"))?;
    let mut session_value = root.get("session").cloned().unwrap_or(root);
    restore_embedded_images(&mut session_value, &state.app_data_dir)?;
    let session: SessionData = serde_json::from_value(session_value)
        .map_err(|error| format!("Incompatible session file: {error}"))?;
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
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

fn restore_embedded_images(value: &mut Value, app_data_dir: &Path) -> Result<(), String> {
    if let Some(images) = value.get_mut("caseImages").and_then(Value::as_array_mut) {
        if images.len() > MAX_IMAGES {
            return Err("The session contains too many clinical images (50 maximum)".into());
        }
        let imported_images = std::mem::take(images);
        for mut image in imported_images {
            let Some(encoded) = image.get("embeddedData").and_then(Value::as_str) else {
                continue;
            };
            if encoded.len() > (MAX_EMBEDDED_IMAGE_BYTES * 4 / 3) + 4 {
                return Err("An embedded image is too large (25 MB maximum)".into());
            }
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|_| "An embedded image is corrupted".to_string())?;
            if bytes.len() > MAX_EMBEDDED_IMAGE_BYTES {
                return Err("An embedded image is too large (25 MB maximum)".into());
            }
            let original = image
                .get("originalName")
                .and_then(Value::as_str)
                .unwrap_or("image.png");
            let extension = PathBuf::from(original)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("png")
                .to_ascii_lowercase();
            if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
                return Err("An embedded file is not a supported clinical image".into());
            }
            let id = Uuid::new_v4().to_string();
            let filename = format!("{id}.{extension}");
            let destination = app_data_dir.join("images").join(&filename);
            fs::write(&destination, bytes)
                .map_err(|error| format!("Could not restore embedded image: {error}"))?;
            image["id"] = Value::String(id);
            image["filename"] = Value::String(filename);
            image["localPath"] = Value::String(destination.to_string_lossy().to_string());
            image
                .as_object_mut()
                .map(|object| object.remove("embeddedData"));
            images.push(image);
        }
    }
    Ok(())
}

fn private_image_path(path: &Path, app_data_dir: &Path) -> Option<PathBuf> {
    let image_directory = app_data_dir.join("images").canonicalize().ok()?;
    let candidate = path.canonicalize().ok()?;
    candidate.starts_with(&image_directory).then_some(candidate)
}

fn safe_filename(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|character| {
            if "<>:\"/\\|?*".contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "PBL-Session".into()
    } else {
        trimmed.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_windows_savefile_names() {
        assert_eq!(
            safe_filename("Week 3: Cardio/Pulm?"),
            "Week 3- Cardio-Pulm-"
        );
        assert_eq!(safe_filename("   "), "PBL-Session");
    }

    #[test]
    fn restores_an_embedded_image_to_private_storage() {
        let directory = std::env::temp_dir().join(format!("vibepbl-image-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(directory.join("images")).expect("create image directory");
        let mut value = json!({
            "caseImages": [{
                "id": "old-id",
                "filename": "old.png",
                "originalName": "clinical.png",
                "localPath": "missing.png",
                "pins": [],
                "embeddedData": STANDARD.encode(b"test-image")
            }]
        });

        restore_embedded_images(&mut value, &directory).expect("restore embedded image");
        let image = &value["caseImages"][0];
        let restored_path = PathBuf::from(image["localPath"].as_str().expect("restored path"));
        assert!(restored_path.starts_with(directory.join("images")));
        assert_eq!(
            std::fs::read(&restored_path).expect("read restored image"),
            b"test-image"
        );
        assert!(image.get("embeddedData").is_none());

        std::fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn drops_untrusted_external_image_paths_from_imports() {
        let directory = std::env::temp_dir().join(format!("vibepbl-path-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(directory.join("images")).expect("create image directory");
        let mut value = json!({
            "caseImages": [{
                "id": "external",
                "filename": "external.png",
                "originalName": "external.png",
                "localPath": "C:\\Windows\\System32\\drivers\\etc\\hosts",
                "pins": []
            }]
        });

        restore_embedded_images(&mut value, &directory).expect("sanitize imported images");
        assert!(value["caseImages"]
            .as_array()
            .expect("image array")
            .is_empty());
        std::fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn private_image_check_rejects_paths_outside_app_storage() {
        let directory =
            std::env::temp_dir().join(format!("vibepbl-private-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(directory.join("images")).expect("create image directory");
        let private = directory.join("images").join("private.png");
        let external = directory.join("external.png");
        std::fs::write(&private, b"private").expect("write private image");
        std::fs::write(&external, b"external").expect("write external image");

        assert_eq!(
            private_image_path(&private, &directory),
            private.canonicalize().ok()
        );
        assert!(private_image_path(&external, &directory).is_none());
        std::fs::remove_dir_all(directory).expect("remove test directory");
    }
}
