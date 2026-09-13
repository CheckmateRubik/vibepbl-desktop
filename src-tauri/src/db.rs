use std::{
    io::Cursor,
    path::{Path, PathBuf},
};

use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags, Result};

const MESH_INDEX_GZIP: &[u8] = include_bytes!("../resources/mesh-2026.sqlite.gz");
const MESH_VERSION: &str = "2026";

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

        CREATE TABLE IF NOT EXISTS terminology_cache (
          provider TEXT NOT NULL,
          query TEXT NOT NULL,
          response_json TEXT NOT NULL,
          cached_at INTEGER NOT NULL,
          PRIMARY KEY (provider, query)
        );

        CREATE TABLE IF NOT EXISTS medical_reference_terms (
          provider TEXT NOT NULL,
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          normalized_title TEXT NOT NULL,
          summary TEXT NOT NULL,
          source TEXT NOT NULL,
          plain_text INTEGER NOT NULL,
          matched_term TEXT NOT NULL,
          normalized_matched_term TEXT NOT NULL,
          cached_at INTEGER NOT NULL,
          PRIMARY KEY (provider, url)
        );

        CREATE INDEX IF NOT EXISTS idx_medical_reference_terms_provider
          ON medical_reference_terms (provider, cached_at DESC);
        "#,
    )?;
    Ok(connection)
}

fn current_mesh_index(path: &Path) -> bool {
    let Ok(connection) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
        return false;
    };
    connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'mesh_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .is_ok_and(|version| version == MESH_VERSION)
        && connection
            .query_row("SELECT COUNT(*) FROM mesh_terms_fts", [], |row| {
                row.get::<_, i64>(0)
            })
            .is_ok_and(|count| count > 250_000)
}

pub fn open_medical_index(
    app_data_dir: &Path,
) -> std::result::Result<Connection, Box<dyn std::error::Error>> {
    let reference_dir = app_data_dir.join("reference");
    let destination = reference_dir.join("mesh-2026.sqlite");
    if !current_mesh_index(&destination) {
        std::fs::create_dir_all(&reference_dir)?;
        let temporary: PathBuf =
            reference_dir.join(format!("mesh-2026-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| -> std::result::Result<(), Box<dyn std::error::Error>> {
            let mut compressed = GzDecoder::new(Cursor::new(MESH_INDEX_GZIP));
            let mut output = std::fs::File::create(&temporary)?;
            std::io::copy(&mut compressed, &mut output)?;
            output.sync_all()?;
            if !current_mesh_index(&temporary) {
                return Err("The bundled medical index failed validation".into());
            }
            if destination.exists() {
                std::fs::remove_file(&destination)?;
            }
            std::fs::rename(&temporary, &destination)?;
            Ok(())
        })();
        if result.is_err() && temporary.exists() {
            let _ = std::fs::remove_file(&temporary);
        }
        result?;
    }
    Ok(Connection::open_with_flags(
        destination,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?)
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
        let cache_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM terminology_cache", [], |row| {
                row.get(0)
            })
            .expect("count terminology cache rows");
        let reference_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM medical_reference_terms", [], |row| {
                row.get(0)
            })
            .expect("count medical reference rows");

        assert_eq!(session_count, 1);
        assert_eq!(member_count, 0);
        assert_eq!(cache_count, 0);
        assert_eq!(reference_count, 0);
        drop(connection);
        std::fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn extracts_and_reuses_the_bundled_medical_index() {
        let directory = std::env::temp_dir().join(format!("vibepbl-mesh-test-{}", Uuid::new_v4()));
        let connection = open_medical_index(&directory).expect("open bundled medical index");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM mesh_terms_fts", [], |row| row.get(0))
            .expect("count indexed terms");
        assert!(count > 250_000);
        drop(connection);
        open_medical_index(&directory).expect("reuse extracted medical index");
        std::fs::remove_dir_all(directory).expect("remove medical index test directory");
    }
}
