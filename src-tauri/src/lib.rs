mod autostart;
mod db;
mod executor;

use db::{Database, Script};
use executor::ExecutionResult;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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
        let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("Scripter.exe"));
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
        .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_READ)
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
fn copy_to_clipboard(text: String) -> Result<(), String> {
    clipboard_win::set_clipboard_string(&text).map_err(|e| format!("写入剪贴板失败: {}", e))
}

#[tauri::command]
fn get_autostart(db: tauri::State<'_, Database>) -> Result<bool, String> {
    let reg_enabled = is_registry_autostart().unwrap_or(false);
    let _ = autostart::set_autostart_preference(&db, reg_enabled);
    Ok(reg_enabled)
}

#[tauri::command]
fn set_autostart(db: tauri::State<'_, Database>, enabled: bool) -> Result<(), String> {
    set_registry_autostart(enabled)?;
    autostart::set_autostart_preference(&db, enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("quicklaunch") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // 获取应用数据目录，用于存放 SQLite 数据库
            let app_dir = app.path().app_data_dir().map_err(|e| {
                eprintln!("[Scripter] 无法获取应用数据目录: {e}");
                e
            })?;

            let database = Database::new(app_dir).map_err(|e| {
                eprintln!("[Scripter] 无法初始化数据库: {e}");
                Box::<dyn std::error::Error>::from(e)
            })?;

            // 将数据库实例注册为 Tauri 状态
            app.manage(database);

            // 注册全局快捷键 Ctrl+P
            #[cfg(desktop)]
            {
                let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyP);
                app.global_shortcut().register(shortcut).map_err(|e| {
                    eprintln!("[Scripter] 注册全局快捷键失败: {e}");
                    Box::<dyn std::error::Error>::from(e.to_string())
                })?;
            }

            // 创建 QuickLaunch 独立窗口（默认隐藏）
            let ql_window = WebviewWindowBuilder::new(
                app,
                "quicklaunch",
                WebviewUrl::App("quicklaunch.html".into()),
            )
            .title("")
            .inner_size(580.0, 480.0)
            .center()
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false) // 默认隐藏
            .build()
            .map_err(|e| {
                eprintln!("[Scripter] 创建 QuickLaunch 窗口失败: {e}");
                Box::<dyn std::error::Error>::from(e.to_string())
            })?;

            // 失焦时自动隐藏
            let app_handle = app.handle().clone();
            ql_window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    if let Some(w) = app_handle.get_webview_window("quicklaunch") {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_script,
            update_script,
            delete_script,
            get_script,
            list_scripts,
            execute_script,
            copy_to_clipboard,
            get_autostart,
            set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
