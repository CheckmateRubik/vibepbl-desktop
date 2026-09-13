use rusqlite::params;
use tauri::State;

use crate::{models::Member, AppState};

const MAX_MEMBER_NAME_CHARS: usize = 120;
const MAX_IMPORTED_MEMBERS: usize = 500;

fn clean_member_name(name: &str) -> Result<&str, String> {
    let clean = name.trim();
    if clean.is_empty() {
        return Err("Member name cannot be empty".into());
    }
    if clean.chars().count() > MAX_MEMBER_NAME_CHARS || clean.chars().any(char::is_control) {
        return Err("Use a presenter name of 120 characters or fewer, without line breaks.".into());
    }
    Ok(clean)
}

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
    let name = clean_member_name(&name)?;
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
    if names.len() > MAX_IMPORTED_MEMBERS {
        return Err("Import no more than 500 presenter names at once.".into());
    }
    let mut connection = state
        .db
        .lock()
        .map_err(|_| "Database is busy".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for name in names {
        if name.trim().is_empty() {
            continue;
        }
        let clean = clean_member_name(&name)?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO members (name) VALUES (?1)",
                params![clean],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::clean_member_name;

    #[test]
    fn presenter_names_are_bounded_and_single_line() {
        assert_eq!(clean_member_name("  Alice  ").unwrap(), "Alice");
        assert!(clean_member_name("").is_err());
        assert!(clean_member_name("Alice\nBob").is_err());
        assert!(clean_member_name(&"a".repeat(121)).is_err());
    }
}
