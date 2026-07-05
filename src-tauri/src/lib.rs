mod autostart;
mod db;
mod executor;

use db::{Database, Folder, Script};
use executor::ExecutionResult;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};
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
        run_key
            .set_value("Scripter", &exe_path.to_string_lossy().to_string())
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
    folder_id: Option<String>,
) -> Result<Script, String> {
    db.add_script(&name, &content, &language, folder_id.as_deref())
}

#[tauri::command]
fn update_script(
    db: tauri::State<'_, Database>,
    id: String,
    name: String,
    content: String,
    language: String,
    folder_id: Option<String>,
) -> Result<Script, String> {
    db.update_script(&id, &name, &content, &language, folder_id.as_deref())
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
fn list_scripts(
    db: tauri::State<'_, Database>,
    folder_id: Option<String>,
) -> Result<Vec<Script>, String> {
    db.list_scripts(folder_id.as_deref())
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

// ============ 文件夹命令 ============

#[tauri::command]
fn create_folder(db: tauri::State<'_, Database>, name: String) -> Result<Folder, String> {
    db.create_folder(&name)
}

#[tauri::command]
fn rename_folder(
    db: tauri::State<'_, Database>,
    id: String,
    name: String,
) -> Result<Folder, String> {
    db.rename_folder(&id, &name)
}

#[tauri::command]
fn delete_folder(db: tauri::State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_folder(&id)
}

#[tauri::command]
fn list_folders(db: tauri::State<'_, Database>) -> Result<Vec<Folder>, String> {
    db.list_folders()
}

#[tauri::command]
fn export_data(db: tauri::State<'_, Database>) -> Result<String, String> {
    db.export_data()
}

#[tauri::command]
fn import_data(db: tauri::State<'_, Database>, json: String) -> Result<(usize, usize), String> {
    db.import_data(&json)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("quicklaunch") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| {
                eprintln!("[Scripter] 无法获取应用数据目录: {e}");
                e
            })?;

            let database = Database::new(app_dir).map_err(|e| {
                eprintln!("[Scripter] 无法初始化数据库: {e}");
                Box::<dyn std::error::Error>::from(e)
            })?;

            app.manage(database);

            // ── 系统托盘 ──
            let show_item = MenuItemBuilder::with_id("show", "打开主界面").build(app)?;
            let quicklaunch_item =
                MenuItemBuilder::with_id("quicklaunch", "快速启动").build(app)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&quicklaunch_item)
                .item(&separator)
                .item(&quit_item)
                .build()?;

            let tray_img = {
                let img = image::load_from_memory(include_bytes!("../icons/QuickSnippet.png"))
                    .map_err(|e| {
                        eprintln!("[Scripter] 解码托盘图标失败: {e}");
                        Box::<dyn std::error::Error>::from(e.to_string())
                    })?;
                let rgba = img.into_rgba8();
                let (w, h) = rgba.dimensions();
                tauri::image::Image::new_owned(rgba.into_raw(), w, h)
            };
            let _tray_icon = TrayIconBuilder::new()
                .icon(tray_img)
                .menu(&menu)
                .tooltip("QuickSnippet")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quicklaunch" => {
                        if let Some(w) = app.get_webview_window("quicklaunch") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 主窗口关闭时最小化到托盘
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle2 = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        // 阻止关闭，改为隐藏
                        if let Some(w) = app_handle2.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }

            #[cfg(desktop)]
            {
                let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyP);
                app.global_shortcut().register(shortcut).map_err(|e| {
                    eprintln!("[Scripter] 注册全局快捷键失败: {e}");
                    Box::<dyn std::error::Error>::from(e.to_string())
                })?;
            }

            let ql_window = WebviewWindowBuilder::new(
                app,
                "quicklaunch",
                WebviewUrl::App("quicklaunch.html".into()),
            )
            .title("")
            .inner_size(580.0, 480.0)
            .center()
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(|e| {
                eprintln!("[Scripter] 创建 QuickLaunch 窗口失败: {e}");
                Box::<dyn std::error::Error>::from(e.to_string())
            })?;

            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::HasWindowHandle;
                if let Ok(handle) = ql_window.window_handle() {
                    if let raw_window_handle::RawWindowHandle::Win32(w) = handle.as_raw() {
                        let round = 2u32;
                        unsafe {
                            windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(
                                w.hwnd.get() as *mut std::ffi::c_void
                                    as windows_sys::Win32::Foundation::HWND,
                                windows_sys::Win32::Graphics::Dwm::DWMWA_WINDOW_CORNER_PREFERENCE
                                    as u32,
                                &round as *const _ as *const std::ffi::c_void,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }
            }

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
            create_folder,
            rename_folder,
            delete_folder,
            list_folders,
            export_data,
            import_data,
            write_text_file,
            read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
