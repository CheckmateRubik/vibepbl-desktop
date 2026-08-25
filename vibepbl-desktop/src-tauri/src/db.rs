use std::path::Path;

use rusqlite::{Connection, Result};

pub fn open(path: &Path) -> Result<Connection> {
    let connection = Connection::open(path)?;
    connection.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS session (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          title TEXT DEFAULT 'PBL Session',
          theme TEXT DEFAULT 'default',
          case_text TEXT DEFAULT '',
          case_images TEXT DEFAULT '[]',
          terms TEXT DEFAULT '[]',
          timeline TEXT DEFAULT '[]',
          problems TEXT DEFAULT '[]',
          objectives TEXT DEFAULT '[]',
          presenter_assignments TEXT DEFAULT '{}',
          is_act1_completed INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO session (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        "#,
    )?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn initializes_single_session_and_member_tables() {
        let directory = std::env::temp_dir().join(format!("vibepbl-db-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("test.db");
        let connection = open(&path).expect("open database");

        let session_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM session", [], |row| row.get(0))
            .expect("count session rows");
        let member_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM members", [], |row| row.get(0))
            .expect("count member rows");

        assert_eq!(session_count, 1);
        assert_eq!(member_count, 0);
        drop(connection);
        std::fs::remove_dir_all(directory).expect("remove test directory");
    }
}
