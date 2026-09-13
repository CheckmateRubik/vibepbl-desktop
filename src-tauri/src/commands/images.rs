use std::{fs, path::Path};

use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::{commands::session::read_session, models::ImageMetadata, AppState};

const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

#[tauri::command]
pub async fn pick_and_import_image(state: State<'_, AppState>) -> Result<ImageMetadata, String> {
    let picked = rfd::AsyncFileDialog::new()
        .add_filter(
            "Clinical images",
            &["png", "jpg", "jpeg", "webp", "bmp", "gif"],
        )
        .pick_file()
        .await
        .ok_or_else(|| "canceled".to_string())?;
    let picked = picked.path();
    let extension = picked
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_lowercase();
    if !["png", "jpg", "jpeg", "webp", "bmp", "gif"].contains(&extension.as_str()) {
        return Err("Choose a PNG, JPEG, WebP, BMP, or GIF image.".into());
    }
    let size = fs::metadata(picked)
        .map_err(|error| format!("Could not inspect image: {error}"))?
        .len();
    if size == 0 || size > MAX_IMAGE_BYTES {
        return Err("Choose an image between 1 byte and 50 MB.".into());
    }
    let id = Uuid::new_v4().to_string();
    let filename = format!("{id}.{extension}");
    let destination = state.app_data_dir.join("images").join(&filename);
    fs::copy(picked, &destination).map_err(|error| format!("Could not import image: {error}"))?;

    let image = ImageMetadata {
        id,
        filename,
        original_name: picked
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Clinical image")
            .to_string(),
        local_path: destination.to_string_lossy().to_string(),
        highlights: Vec::new(),
    };

    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    let mut session = read_session(&connection)?;
    session.case_images.push(image.clone());
    let images = serde_json::to_string(&session.case_images).map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE session SET case_images=?1, updated_at=CURRENT_TIMESTAMP WHERE id=1",
            params![images],
        )
        .map_err(|error| error.to_string())?;
    Ok(image)
}

#[tauri::command]
pub fn delete_image(image_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    let mut session = read_session(&connection)?;
    if let Some(image) = session
        .case_images
        .iter()
        .find(|image| image.id == image_id)
    {
        let path = Path::new(&image.local_path);
        let image_directory = state.app_data_dir.join("images");
        let private_path = path.canonicalize().ok().filter(|candidate| {
            image_directory
                .canonicalize()
                .is_ok_and(|directory| candidate.starts_with(directory))
        });
        if let Some(private_path) = private_path {
            fs::remove_file(private_path)
                .map_err(|error| format!("Could not remove image: {error}"))?;
        }
    }
    session.case_images.retain(|image| image.id != image_id);
    let images = serde_json::to_string(&session.case_images).map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE session SET case_images=?1, updated_at=CURRENT_TIMESTAMP WHERE id=1",
            params![images],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
