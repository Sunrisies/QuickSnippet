mod apps;
mod autostart;
mod db;
mod executor;
mod recorder;
mod uploader;

use db::{CloudConfig, Database, Folder, Script, UploadRecord};
use executor::ExecutionResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState as GsState,
};

// ============ 快捷键管理 ============

/// 运行时快捷键状态：shortcut_str → action 的反向映射
pub struct ShortcutManager {
    pub action_map: Mutex<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShortcutInfo {
    pub action: String,
    pub shortcut: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ScreenRegion {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

pub struct RegionState {
    pub region: Mutex<Option<ScreenRegion>>,
}

/// 将 Shortcut 对象格式化为 "Ctrl+P" 形式
fn shortcut_to_string(sc: &Shortcut) -> String {
    let mut parts: Vec<&str> = Vec::new();
    let mods = sc.mods;
    if mods.contains(Modifiers::CONTROL) {
        parts.push("Ctrl");
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Alt");
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }
    if mods.contains(Modifiers::SUPER) {
        parts.push("Super");
    }
    let key = code_to_str(&sc.key);
    parts.push(key);
    parts.join("+")
}

/// 将 Code 转为字符串（与前端显示格式保持一致）
fn code_to_str(code: &Code) -> &'static str {
    use tauri_plugin_global_shortcut::Code::*;
    match code {
        KeyA => "A",
        KeyB => "B",
        KeyC => "C",
        KeyD => "D",
        KeyE => "E",
        KeyF => "F",
        KeyG => "G",
        KeyH => "H",
        KeyI => "I",
        KeyJ => "J",
        KeyK => "K",
        KeyL => "L",
        KeyM => "M",
        KeyN => "N",
        KeyO => "O",
        KeyP => "P",
        KeyQ => "Q",
        KeyR => "R",
        KeyS => "S",
        KeyT => "T",
        KeyU => "U",
        KeyV => "V",
        KeyW => "W",
        KeyX => "X",
        KeyY => "Y",
        KeyZ => "Z",
        Digit0 => "0",
        Digit1 => "1",
        Digit2 => "2",
        Digit3 => "3",
        Digit4 => "4",
        Digit5 => "5",
        Digit6 => "6",
        Digit7 => "7",
        Digit8 => "8",
        Digit9 => "9",
        Space => "Space",
        Enter => "Enter",
        Escape => "Escape",
        Tab => "Tab",
        ArrowUp => "Up",
        ArrowDown => "Down",
        ArrowLeft => "Left",
        ArrowRight => "Right",
        F1 => "F1",
        F2 => "F2",
        F3 => "F3",
        F4 => "F4",
        F5 => "F5",
        F6 => "F6",
        F7 => "F7",
        F8 => "F8",
        F9 => "F9",
        F10 => "F10",
        F11 => "F11",
        F12 => "F12",
        _ => "Unknown",
    }
}

/// 将 "Ctrl+P" 格式字符串转为 Code
fn str_to_code(s: &str) -> Result<Code, String> {
    use tauri_plugin_global_shortcut::Code::*;
    Ok(match s {
        "A" => KeyA,
        "B" => KeyB,
        "C" => KeyC,
        "D" => KeyD,
        "E" => KeyE,
        "F" => KeyF,
        "G" => KeyG,
        "H" => KeyH,
        "I" => KeyI,
        "J" => KeyJ,
        "K" => KeyK,
        "L" => KeyL,
        "M" => KeyM,
        "N" => KeyN,
        "O" => KeyO,
        "P" => KeyP,
        "Q" => KeyQ,
        "R" => KeyR,
        "S" => KeyS,
        "T" => KeyT,
        "U" => KeyU,
        "V" => KeyV,
        "W" => KeyW,
        "X" => KeyX,
        "Y" => KeyY,
        "Z" => KeyZ,
        "0" => Digit0,
        "1" => Digit1,
        "2" => Digit2,
        "3" => Digit3,
        "4" => Digit4,
        "5" => Digit5,
        "6" => Digit6,
        "7" => Digit7,
        "8" => Digit8,
        "9" => Digit9,
        "Space" => Space,
        "Enter" => Enter,
        "Escape" | "Esc" => Escape,
        "Tab" => Tab,
        "Up" => ArrowUp,
        "Down" => ArrowDown,
        "Left" => ArrowLeft,
        "Right" => ArrowRight,
        "F1" => F1,
        "F2" => F2,
        "F3" => F3,
        "F4" => F4,
        "F5" => F5,
        "F6" => F6,
        "F7" => F7,
        "F8" => F8,
        "F9" => F9,
        "F10" => F10,
        "F11" => F11,
        "F12" => F12,
        _ => return Err(format!("不支持的按键: {}", s)),
    })
}

/// 解析 "Ctrl+P" 格式字符串为 (Option<Modifiers>, Code)
fn parse_shortcut_str(s: &str) -> Result<(Option<Modifiers>, Code), String> {
    let parts: Vec<&str> = s
        .split('+')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return Err("快捷键不能为空".to_string());
    }

    let mut mods = Modifiers::empty();
    let key_part = parts[parts.len() - 1];

    for part in &parts[..parts.len() - 1] {
        match *part {
            "Ctrl" | "Control" => mods |= Modifiers::CONTROL,
            "Alt" | "Option" => mods |= Modifiers::ALT,
            "Shift" => mods |= Modifiers::SHIFT,
            "Super" | "Meta" | "Win" | "Cmd" => mods |= Modifiers::SUPER,
            _ => return Err(format!("不支持的修饰键: {}", part)),
        }
    }

    let code = str_to_code(key_part)?;
    let mods_opt = if mods.is_empty() { None } else { Some(mods) };
    Ok((mods_opt, code))
}

/// 执行快捷键对应的操作
fn execute_shortcut_action(app: &tauri::AppHandle, action: &str) {
    match action {
        "toggle_quicklaunch" => {
            if let Some(window) = app.get_webview_window("quicklaunch") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        "show_main" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            } else {
                if let Ok(w) =
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                        .title("QuickKit - 快捷工具箱")
                        .inner_size(960.0, 680.0)
                        .min_inner_size(720.0, 480.0)
                        .center()
                        .build()
                {
                    let app2 = app.clone();
                    w.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            if let Some(w) = app2.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    });
                }
            }
        }
        "upload_image" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_notification::NotificationExt;

                let db = app_handle.state::<Database>();
                let config = match db.get_cloud_config() {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = app_handle
                            .notification()
                            .builder()
                            .title("QuickKit - 上传失败")
                            .body(format!("读取云配置失败: {e}"))
                            .show();
                        return;
                    }
                };
                match uploader::upload_clipboard_image(&config).await {
                    Ok(result) => {
                        let _ = db.add_upload(&result.url, &result.filename, result.file_size);
                        let _ = app_handle.emit("upload-complete", ());
                        if clipboard_win::set_clipboard_string(&result.url).is_ok() {
                            let _ = app_handle
                                .notification()
                                .builder()
                                .title("QuickKit - 上传成功")
                                .body(format!("{} 已复制到剪贴板", result.url))
                                .show();
                        }
                    }
                    Err(e) => {
                        let _ = app_handle
                            .notification()
                            .builder()
                            .title("QuickKit - 上传失败")
                            .body(format!("{e}"))
                            .show();
                    }
                }
            });
        }
        "select_region" => {
            let w = app.get_webview_window("region_selector");
            if let Some(window) = w {
                let _ = window.set_focus();
            } else {
                let _ = open_region_selector(app.clone());
            }
        }
        "toggle_recording" => {
            use tauri_plugin_notification::NotificationExt;
            let state = app.state::<recorder::RecordingSession>();
            let has_active = state
                .handle
                .lock()
                .ok()
                .map(|h| h.is_some())
                .unwrap_or(false);
            if has_active {
                let mut handle = state.handle.lock().ok().and_then(|mut h| h.take());
                if let Some(ref mut h) = handle {
                    match recorder::stop_recording(h) {
                        Ok(path) => {
                            let _ = app
                                .notification()
                                .builder()
                                .title("QuickKit - 录制完成")
                                .body(format!("视频已保存到:\n{}", path))
                                .show();
                        }
                        Err(e) => {
                            let _ = app
                                .notification()
                                .builder()
                                .title("QuickKit - 停止录制失败")
                                .body(format!("{e}"))
                                .show();
                        }
                    }
                }
            } else {
                let region_state = app.state::<RegionState>();
                let region = region_state.region.lock().ok().and_then(|r| r.clone());
                if let Some(region) = region {
                    match recorder::start_recording(&region) {
                        Ok(handle) => {
                            if let Ok(mut h) = state.handle.lock() {
                                *h = Some(handle);
                            }
                            let _ = app
                                .notification()
                                .builder()
                                .title("QuickKit - 录制中")
                                .body("区域录屏已开始，按 Ctrl+Shift+F9 停止")
                                .show();
                        }
                        Err(e) => {
                            let _ = app
                                .notification()
                                .builder()
                                .title("QuickKit - 录制失败")
                                .body(format!("{e}\n请确认已安装 FFmpeg 并加入 PATH"))
                                .show();
                        }
                    }
                } else {
                    let _ = app
                        .notification()
                        .builder()
                        .title("QuickKit - 无法录制")
                        .body("请先按 Ctrl+Shift+R 框选录制区域")
                        .show();
                }
            }
        }
        _ => {}
    }
}

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
        let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("QuickKit.exe"));
        run_key
            .set_value("QuickKit", &exe_path.to_string_lossy().to_string())
            .map_err(|e| format!("设置自启动失败: {}", e))?;
    } else {
        run_key
            .delete_value("QuickKit")
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
    match run_key.get_value::<String, _>("QuickKit") {
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

// ============ 快捷键命令 ============

#[tauri::command]
fn get_shortcuts(db: tauri::State<'_, Database>) -> Result<Vec<ShortcutInfo>, String> {
    let shortcuts = db.get_shortcuts()?;
    let labels = Database::shortcut_labels();
    let mut result: Vec<ShortcutInfo> = shortcuts
        .iter()
        .map(|(action, shortcut)| ShortcutInfo {
            action: action.clone(),
            shortcut: shortcut.clone(),
            label: labels.get(action).cloned().unwrap_or_default(),
        })
        .collect();
    // 按默认顺序排序
    let default_order: Vec<&str> = vec![
        "toggle_quicklaunch",
        "show_main",
        "upload_image",
        "select_region",
        "toggle_recording",
    ];
    result.sort_by_key(|s| {
        default_order
            .iter()
            .position(|&a| a == s.action)
            .unwrap_or(99)
    });
    Ok(result)
}

#[tauri::command]
fn set_shortcut(
    db: tauri::State<'_, Database>,
    manager: tauri::State<'_, ShortcutManager>,
    app: tauri::AppHandle,
    action: String,
    shortcut: String,
) -> Result<(), String> {
    // 1. 获取旧的快捷键
    let old_shortcuts = db.get_shortcuts()?;
    let old_shortcut = old_shortcuts.get(&action).cloned();

    // 2. 验证并解析新快捷键
    let new_parsed = if !shortcut.is_empty() {
        Some(parse_shortcut_str(&shortcut).map_err(|e| format!("快捷键格式错误: {e}"))?)
    } else {
        None
    };

    // 3. 更新数据库
    db.set_shortcut(&action, &shortcut)?;

    // 4. 注销旧快捷键
    if let Some(ref old) = old_shortcut {
        if !old.is_empty() {
            if let Ok((mods, code)) = parse_shortcut_str(old) {
                let sc = Shortcut::new(mods, code);
                let _ = app.global_shortcut().unregister(sc);
            }
        }
    }

    // 5. 注册新快捷键
    if let Some((mods, code)) = new_parsed {
        let sc = Shortcut::new(mods, code);
        app.global_shortcut()
            .register(sc)
            .map_err(|e| format!("注册快捷键失败: {}", e))?;
    }

    // 6. 更新内存中的反向映射
    let mut map = manager.action_map.lock().map_err(|e| e.to_string())?;
    if let Some(ref old) = old_shortcut {
        if !old.is_empty() {
            map.remove(old);
        }
    }
    if !shortcut.is_empty() {
        map.insert(shortcut, action);
    }

    Ok(())
}

// ============ 云存储命令 ============

#[tauri::command]
fn get_cloud_config(db: tauri::State<'_, Database>) -> Result<CloudConfig, String> {
    db.get_cloud_config()
}

#[tauri::command]
fn set_cloud_config(db: tauri::State<'_, Database>, config: CloudConfig) -> Result<(), String> {
    db.set_cloud_config(&config)
}

#[tauri::command]
async fn upload_clipboard_image(
    db: tauri::State<'_, Database>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let config = db.get_cloud_config()?;
    let result = uploader::upload_clipboard_image(&config).await?;

    // 记录到数据库
    let _ = db.add_upload(&result.url, &result.filename, result.file_size);
    let _ = app.emit("upload-complete", ());

    // 将 URL 复制到剪贴板
    clipboard_win::set_clipboard_string(&result.url)
        .map_err(|e| format!("写入剪贴板失败: {}", e))?;

    Ok(result.url)
}

#[tauri::command]
fn get_upload_history(db: tauri::State<'_, Database>) -> Result<Vec<UploadRecord>, String> {
    db.list_uploads()
}

#[tauri::command]
fn delete_upload(db: tauri::State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_upload(&id)
}

// ============ Splash 命令 ============

#[tauri::command]
async fn close_splash(app: tauri::AppHandle) -> Result<(), String> {
    // 关闭 splash 窗口
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    // 显示主窗口，不存在则创建
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        if let Ok(w) = WebviewWindowBuilder::new(&app, "main", WebviewUrl::App("index.html".into()))
            .title("QuickKit - 快捷工具箱")
            .inner_size(960.0, 680.0)
            .min_inner_size(720.0, 480.0)
            .center()
            .build()
        {
            let app2 = app.clone();
            w.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    if let Some(w) = app2.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn hide_quicklaunch(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("quicklaunch") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============ 应用管理命令 ============

#[tauri::command]
fn list_apps() -> Result<Vec<apps::AppEntry>, String> {
    apps::list_apps()
}

#[tauri::command]
fn launch_app(path: String) -> Result<(), String> {
    apps::activate_or_launch(&path)
}

#[tauri::command]
fn set_selected_region(
    state: tauri::State<'_, RegionState>,
    region: ScreenRegion,
) -> Result<(), String> {
    println!("点击确定");
    *state.region.lock().map_err(|e| e.to_string())? = Some(region);
    Ok(())
}

#[tauri::command]
fn open_region_selector(app: tauri::AppHandle) -> Result<(), String> {
    // 仅主屏幕，不覆盖副屏
    let (w, h) = get_primary_screen_size(&app);

    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "region_selector",
        tauri::WebviewUrl::App("region-select.html".into()),
    )
    .title("")
    .position(0.0, 0.0)
    .inner_size(w as f64, h as f64)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .devtools(true)
    .shadow(false)
    .build()
    .map_err(|e| format!("创建选区窗口失败: {}", e))?;
    Ok(())
}

#[tauri::command]
fn close_region_selector(app: tauri::AppHandle) -> Result<(), String> {
    println!("取消");
    if let Some(w) = app.get_webview_window("region_selector") {
        w.close().map_err(|e| e.to_string())?;
    }
    println!("取消成功");
    Ok(())
}

#[tauri::command]
fn open_recording_frame(app: tauri::AppHandle, region: ScreenRegion) -> Result<(), String> {
    println!("打开录制框{:?}", region);
    tauri::async_runtime::spawn(async move {
        // 关闭选区窗口
        if let Some(w) = app.get_webview_window("region_selector") {
            println!("关闭选区窗口");
            let _ = w.close();
        }

        match tauri::WebviewWindowBuilder::new(
            &app,
            "recording_frame",
            tauri::WebviewUrl::App("recording-frame.html".into()),
        )
        .title("")
        .position(100.0, 100.0)
        .inner_size(800.0, 600.0)
        // .position(region.x as f64, region.y as f64)
        // .inner_size(region.w as f64, region.h as f64)
        .decorations(false)
        // .transparent(true)
        // .always_on_top(true)
        // .skip_taskbar(false)
        // .shadow(false)
        // .devtools(true)
        .build()
        {
            Ok(window) => {
                window.open_devtools();
                println!("录制窗口创建成功");
            }
            Err(e) => {
                eprintln!("创建录制窗口失败: {}", e);
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn start_recording(
    state: tauri::State<'_, recorder::RecordingSession>,
    region_state: tauri::State<'_, RegionState>,
) -> Result<String, String> {
    let region = region_state.region.lock().map_err(|e| e.to_string())?;
    let region = region.as_ref().ok_or("请先框选录制区域 (Ctrl+Shift+R)")?;
    let handle = recorder::start_recording(region)?;
    *state.handle.lock().map_err(|e| e.to_string())? = Some(handle);
    Ok("录制已开始".to_string())
}

#[tauri::command]
fn stop_recording(state: tauri::State<'_, recorder::RecordingSession>) -> Result<String, String> {
    let mut handle = state
        .handle
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("没有正在进行的录制")?;
    let path = recorder::stop_recording(&mut handle)?;
    Ok(path)
}

/// 获取主屏幕尺寸
fn get_primary_screen_size(app: &tauri::AppHandle) -> (i32, i32) {
    #[cfg(windows)]
    {
        // use windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics;
        // unsafe { (GetSystemMetrics(0), GetSystemMetrics(1)) }
        let app_handle = app.app_handle();
        let monitor = app_handle
            .primary_monitor()
            .expect("获取主显示器失败")
            .expect("未找到主显示器");

        let scale = monitor.scale_factor();
        let physical_size = monitor.size();
        let w = physical_size.width as f64 / scale;
        let h = physical_size.height as f64 / scale;
        (w as i32, h as i32)
    }
    #[cfg(not(windows))]
    {
        (1920, 1080)
    }
}

/// 获取虚拟桌面（所有显示器）的坐标和尺寸
fn get_virtual_screen_bounds() -> (i32, i32, i32, i32) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::GetSystemMetrics;
        const SM_XVIRTUALSCREEN: i32 = 76;
        const SM_YVIRTUALSCREEN: i32 = 77;
        const SM_CXVIRTUALSCREEN: i32 = 78;
        const SM_CYVIRTUALSCREEN: i32 = 79;
        unsafe {
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            // 单屏时 GetSystemMetrics 可能返回 0
            if w == 0 || h == 0 {
                // 回退到主屏幕
                (0, 0, GetSystemMetrics(0), GetSystemMetrics(1))
            } else {
                (x, y, w, h)
            }
        }
    }
    #[cfg(not(windows))]
    {
        (0, 0, 1920, 1080)
    }
}

// ============ 应用入口 ============

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state == GsState::Pressed {
                        let sc_str = shortcut_to_string(shortcut);
                        let state = app.state::<ShortcutManager>();
                        let action = state
                            .action_map
                            .lock()
                            .ok()
                            .and_then(|map| map.get(&sc_str).cloned());
                        if let Some(action) = action {
                            execute_shortcut_action(app, &action);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| {
                eprintln!("[QuickKit] 无法获取应用数据目录: {e}");
                e
            })?;

            // 创建启动 splash 窗口
            let _ = WebviewWindowBuilder::new(
                app,
                "splash",
                WebviewUrl::App("splashscreen.html".into()),
            )
            .title("")
            .inner_size(400.0, 300.0)
            .center()
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build();

            let database = Database::new(app_dir).map_err(|e| {
                eprintln!("[QuickKit] 无法初始化数据库: {e}");
                Box::<dyn std::error::Error>::from(e)
            })?;

            // 初始化快捷键管理器
            let manager = ShortcutManager {
                action_map: Mutex::new(HashMap::new()),
            };

            // 从数据库读取并注册快捷键
            if let Ok(shortcuts) = database.get_shortcuts() {
                let mut reverse_map = HashMap::new();
                for (action, shortcut_str) in &shortcuts {
                    if !shortcut_str.is_empty() {
                        if let Ok((mods, code)) = parse_shortcut_str(shortcut_str) {
                            let sc = Shortcut::new(mods, code);
                            match app.global_shortcut().register(sc) {
                                Ok(()) => {
                                    reverse_map.insert(shortcut_str.clone(), action.clone());
                                    eprintln!(
                                        "[QuickKit] 已注册快捷键: {} → {}",
                                        shortcut_str, action
                                    );
                                }
                                Err(e) => {
                                    eprintln!("[QuickKit] 注册快捷键失败 {}: {}", shortcut_str, e);
                                }
                            }
                        } else {
                            eprintln!("[QuickKit] 解析快捷键失败: {}", shortcut_str);
                        }
                    }
                }
                if let Ok(mut map) = manager.action_map.lock() {
                    *map = reverse_map;
                }
            }

            app.manage(database);
            app.manage(manager);
            app.manage(RegionState {
                region: Mutex::new(None),
            });
            app.manage(recorder::RecordingSession {
                handle: Mutex::new(None),
            });

            // ── 系统托盘 ──
            let show_item = MenuItemBuilder::with_id("main", "打开主界面").build(app)?;
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
                        eprintln!("[QuickKit] 解码托盘图标失败: {e}");
                        Box::<dyn std::error::Error>::from(e.to_string())
                    })?;
                let rgba = img.into_rgba8();
                let (w, h) = rgba.dimensions();
                tauri::image::Image::new_owned(rgba.into_raw(), w, h)
            };
            let tray_icon = TrayIconBuilder::new()
                .icon(tray_img)
                .menu(&menu)
                .tooltip("QuickKit")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "main" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        } else {
                            if let Ok(w) = WebviewWindowBuilder::new(
                                app,
                                "main",
                                WebviewUrl::App("index.html".into()),
                            )
                            .title("QuickKit - 快捷工具箱")
                            .inner_size(960.0, 680.0)
                            .min_inner_size(720.0, 480.0)
                            .center()
                            .build()
                            {
                                let app2 = app.clone();
                                w.on_window_event(move |event| {
                                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                                        if let Some(w) = app2.get_webview_window("main") {
                                            let _ = w.hide();
                                        }
                                    }
                                });
                            }
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
            app.manage(tray_icon);
            // 先获取当前有几个窗口
            let mut windows = app.webview_windows();
            println!("当前窗口数量: {}", windows.len());
            // 主窗口关闭时最小化到托盘
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle2 = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if let Some(w) = app_handle2.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            } else {
                // setup 时主窗口不存在则创建（dev 模式兜底）
                if let Ok(main_window) =
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                        .title("QuickKit - 快捷工具箱")
                        .inner_size(960.0, 680.0)
                        .min_inner_size(720.0, 480.0)
                        .center()
                        .build()
                {
                    let app_handle2 = app.handle().clone();
                    main_window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            if let Some(w) = app_handle2.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    });
                }
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
                eprintln!("[QuickKit] 创建 QuickLaunch 窗口失败: {e}");
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
            get_shortcuts,
            set_shortcut,
            get_cloud_config,
            set_cloud_config,
            upload_clipboard_image,
            get_upload_history,
            delete_upload,
            close_splash,
            hide_quicklaunch,
            list_apps,
            launch_app,
            set_selected_region,
            open_region_selector,
            close_region_selector,
            open_recording_frame,
            start_recording,
            stop_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
