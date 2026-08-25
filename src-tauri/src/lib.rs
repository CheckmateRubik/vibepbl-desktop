mod commands;
mod db;
mod models;

use std::{path::PathBuf, sync::Mutex};

use rusqlite::Connection;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub app_data_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let app_data_dir = std::env::var_os("VIBEPBL_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?.join("vibepbl"));
            std::fs::create_dir_all(app_data_dir.join("images"))?;
            let connection = db::open(&app_data_dir.join("vibepbl.db"))?;
            app.manage(AppState {
                db: Mutex::new(connection),
                app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::session::get_session,
            commands::session::save_session_field,
            commands::session::reset_session,
            commands::members::get_members,
            commands::members::add_member,
            commands::members::remove_member,
            commands::members::import_members_list,
            commands::images::pick_and_import_image,
            commands::images::delete_image,
            commands::savefile::export_savefile_dialog,
            commands::savefile::import_savefile_dialog,
            commands::print::get_print_act1_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VibePBL Desktop");
}
