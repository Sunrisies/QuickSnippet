mod autostart;
mod db;
mod executor;

use db::{Database, Script};
use executor::ExecutionResult;
use tauri::Manager;

// ============ 注册表自启动 (Windows) ============

#[cfg(target_os = "windows")]
fn set_registry_autostart(enabled: bool) -> Result<(), String> {
    use std::path::PathBuf;
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            KEY_SET_VALUE | KEY_QUERY_VALUE,
        )
        .map_err(|e| format!("无法打开注册表 Run 键: {}", e))?;

    if enabled {
        // 获取当前可执行文件路径
        let exe_path = std::env::current_exe()
            .unwrap_or_else(|_| PathBuf::from("Scripter.exe"));
        let path_str = exe_path.to_string_lossy().to_string();
        run_key
            .set_value("Scripter", &path_str)
            .map_err(|e| format!("设置自启动失败: {}", e))?;
    } else {
        run_key
            .delete_value("Scripter")
            .map_err(|e| format!("删除自启动失败: {}", e))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn is_registry_autostart() -> Result<bool, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            KEY_READ,
        )
        .map_err(|e| format!("无法打开注册表 Run 键: {}", e))?;

    match run_key.get_value::<String, _>("Scripter") {
        Ok(val) => Ok(!val.is_empty()),
        Err(_) => Ok(false),
    }
}

#[cfg(not(target_os = "windows"))]
fn set_registry_autostart(_enabled: bool) -> Result<(), String> {
    Err("仅支持 Windows 平台".to_string())
}

#[cfg(not(target_os = "windows"))]
fn is_registry_autostart() -> Result<bool, String> {
    Err("仅支持 Windows 平台".to_string())
}

// ============ Tauri 命令 ============

#[tauri::command]
fn add_script(
    db: tauri::State<'_, Database>,
    name: String,
    content: String,
    language: String,
) -> Result<Script, String> {
    db.add_script(&name, &content, &language)
}

#[tauri::command]
fn update_script(
    db: tauri::State<'_, Database>,
    id: String,
    name: String,
    content: String,
    language: String,
) -> Result<Script, String> {
    db.update_script(&id, &name, &content, &language)
}

#[tauri::command]
fn delete_script(db: tauri::State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_script(&id)
}

#[tauri::command]
fn get_script(db: tauri::State<'_, Database>, id: String) -> Result<Script, String> {
    db.get_script(&id)
}

#[tauri::command]
fn list_scripts(db: tauri::State<'_, Database>) -> Result<Vec<Script>, String> {
    db.list_scripts()
}

#[tauri::command]
fn execute_script(content: String, language: String) -> Result<ExecutionResult, String> {
    executor::execute_script(&content, &language)
}

#[tauri::command]
fn get_autostart(db: tauri::State<'_, Database>) -> Result<bool, String> {
    // 先读取注册表实际状态
    let reg_enabled = is_registry_autostart().unwrap_or(false);
    // 同步到数据库偏好
    let _ = autostart::set_autostart_preference(&db, reg_enabled);
    Ok(reg_enabled)
}

#[tauri::command]
fn set_autostart(
    db: tauri::State<'_, Database>,
    enabled: bool,
) -> Result<(), String> {
    // 通过注册表设置自启动
    set_registry_autostart(enabled)?;
    // 持久化偏好设置
    autostart::set_autostart_preference(&db, enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 获取应用数据目录，用于存放 SQLite 数据库
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取应用数据目录");

            let database = Database::new(app_dir).expect("无法初始化数据库");

            // 将数据库实例注册为 Tauri 状态
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_script,
            update_script,
            delete_script,
            get_script,
            list_scripts,
            execute_script,
            get_autostart,
            set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
