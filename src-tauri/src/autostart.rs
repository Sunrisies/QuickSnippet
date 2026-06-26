use crate::db::Database;

/// 将自启动偏好持久化到数据库
pub fn set_autostart_preference(db: &Database, enabled: bool) -> Result<(), String> {
    db.set_autostart(enabled)
}
