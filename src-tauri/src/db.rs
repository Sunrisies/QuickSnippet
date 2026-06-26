use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub content: String,
    pub language: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
        let db_path = app_dir.join("scripts.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS scripts (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                content     TEXT NOT NULL,
                language    TEXT NOT NULL DEFAULT 'powershell',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings (key, value) VALUES ('autostart', 'false');
            ",
        )
        .map_err(|e| e.to_string())?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    pub fn add_script(&self, name: &str, content: &str, language: &str) -> Result<Script, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO scripts (id, name, content, language, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, name, content, language, now, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(Script {
            id,
            name: name.to_string(),
            content: content.to_string(),
            language: language.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_script(
        &self,
        id: &str,
        name: &str,
        content: &str,
        language: &str,
    ) -> Result<Script, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn
            .execute(
                "UPDATE scripts SET name=?1, content=?2, language=?3, updated_at=?4 WHERE id=?5",
                params![name, content, language, now, id],
            )
            .map_err(|e| e.to_string())?;

        if rows == 0 {
            return Err("脚本不存在".to_string());
        }

        let script = conn
            .query_row(
                "SELECT id, name, content, language, created_at, updated_at FROM scripts WHERE id=?1",
                params![id],
                |row| {
                    Ok(Script {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        content: row.get(2)?,
                        language: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        Ok(script)
    }

    pub fn delete_script(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn
            .execute("DELETE FROM scripts WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;

        if rows == 0 {
            return Err("脚本不存在".to_string());
        }
        Ok(())
    }

    pub fn get_script(&self, id: &str) -> Result<Script, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, name, content, language, created_at, updated_at FROM scripts WHERE id=?1",
            params![id],
            |row| {
                Ok(Script {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    language: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_scripts(&self) -> Result<Vec<Script>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, content, language, created_at, updated_at FROM scripts ORDER BY updated_at DESC")
            .map_err(|e| e.to_string())?;

        let scripts = stmt
            .query_map([], |row| {
                Ok(Script {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    content: row.get(2)?,
                    language: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(scripts)
    }

    /// 设置自动启动
    pub fn set_autostart(&self, enabled: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let value = if enabled { "true" } else { "false" };
        conn.execute(
            "UPDATE settings SET value=?1 WHERE key='autostart'",
            params![value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
