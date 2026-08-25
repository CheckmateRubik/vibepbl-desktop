use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

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
pub fn open_print_window(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("print") {
        existing.close().map_err(|error| error.to_string())?;
    }
    WebviewWindowBuilder::new(&app, "print", WebviewUrl::App("print-act1.html".into()))
        .title("Print Act 1 Summary")
        .inner_size(1000.0, 820.0)
        .min_inner_size(760.0, 600.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}
