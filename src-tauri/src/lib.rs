mod commands;
mod db;
mod models;

use std::{path::PathBuf, sync::Mutex};

use rusqlite::Connection;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub medical_db: Option<Mutex<Connection>>,
    pub app_data_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(commands::lookup::LookupState::new()?);
            app.manage(commands::browser::BrowserState::default());
            let app_data_dir = std::env::var_os("VIBEPBL_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?.join("vibepbl"));
            std::fs::create_dir_all(app_data_dir.join("images"))?;
            let connection = db::open(&app_data_dir.join("vibepbl.db"))?;
            // Failure to unpack the optional reference index must not prevent
            // the core workspace from opening; online lookup remains available.
            let medical_db = db::open_medical_index(&app_data_dir).ok().map(Mutex::new);
            app.manage(AppState {
                db: Mutex::new(connection),
                medical_db,
                app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(|invoke| {
            // No remote reference page may invoke workspace commands, even if it
            // discovers Tauri's bridge. The local toolbar gets only its browser action.
            let label = invoke.message.webview().label().to_owned();
            let toolbar_action = label == commands::browser::TOOLBAR_LABEL
                && invoke.message.command() == "reference_browser_action";
            if label != "main" && !toolbar_action {
                invoke
                    .resolver
                    .reject("Reference pages cannot access the workspace.");
                return true;
            }
            let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
                commands::session::get_session,
                commands::session::save_session_field,
                commands::session::reset_session,
                commands::members::get_members,
                commands::members::add_member,
                commands::members::remove_member,
                commands::members::import_members_list,
                commands::images::pick_and_import_image,
                commands::images::delete_image,
                commands::print::get_print_act1_data,
                commands::print::print_current_window,
                commands::lookup::search_terminology,
                commands::browser::open_web_search,
                commands::browser::reference_browser_action,
            ];
            handler(invoke)
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(browser) = window
                    .app_handle()
                    .get_window(commands::browser::WINDOW_LABEL)
                {
                    let _ = browser.destroy();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running VibePBL Desktop");
    app.run(|app, event| {
        // Route macOS Quit/Cmd+Q through the same save-before-close handshake.
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if let Some(window) = app.get_webview_window("main") {
                api.prevent_exit();
                let _ = window.close();
            }
        }
    });
}
