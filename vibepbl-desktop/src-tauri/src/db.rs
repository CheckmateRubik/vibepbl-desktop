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
