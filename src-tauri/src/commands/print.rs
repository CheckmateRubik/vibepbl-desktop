use tauri::State;

use crate::{commands::session::read_session, models::PrintAct1Payload, AppState};

#[tauri::command]
pub fn get_print_act1_data(state: State<'_, AppState>) -> Result<PrintAct1Payload, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    Ok(PrintAct1Payload {
        session: read_session(&connection)?,
        generated_at: chrono::Local::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn print_current_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .print()
        .map_err(|error| format!("Could not open the system print dialog: {error}"))
}
