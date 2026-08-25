use rusqlite::params;
use tauri::State;

use crate::{models::Member, AppState};

#[tauri::command]
pub fn get_members(state: State<'_, AppState>) -> Result<Vec<Member>, String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    let mut statement = connection
        .prepare("SELECT id, name, created_at FROM members ORDER BY name COLLATE NOCASE")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(Member {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_member(name: String, state: State<'_, AppState>) -> Result<Member, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Member name cannot be empty".into());
    }
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    connection
        .execute("INSERT INTO members (name) VALUES (?1)", params![name])
        .map_err(|_| "That member is already in the roster".to_string())?;
    let id = connection.last_insert_rowid();
    connection
        .query_row(
            "SELECT id, name, created_at FROM members WHERE id=?1",
            params![id],
            |row| {
                Ok(Member {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_member(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    connection
        .execute("DELETE FROM members WHERE id=?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_members_list(names: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let mut connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for name in names {
        let clean = name.trim();
        if !clean.is_empty() {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO members (name) VALUES (?1)",
                    params![clean],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    transaction.commit().map_err(|error| error.to_string())
}
