use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct AppEntry {
    pub name: String,
    pub path: String,
}

pub fn list_apps() -> Result<Vec<AppEntry>, String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut apps: Vec<AppEntry> = Vec::new();

    let start_menu_dirs = [
        dirs_or_empty(|| {
            let base = std::env::var("APPDATA").ok()?;
            Some(PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"))
        }),
        dirs_or_empty(|| {
            let base = std::env::var("PROGRAMDATA").ok()?;
            Some(PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"))
        }),
    ];

    for dir in &start_menu_dirs {
        if !dir.exists() { continue; }
        for entry in walkdir::WalkDir::new(dir).follow_links(true).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()) {
            let path = entry.path();
            if path.extension().map(|e| e.to_ascii_lowercase()) != Some(std::ffi::OsStr::new("lnk").to_os_string()) { continue; }
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if name.is_empty() || seen.contains(&name) { continue; }
            seen.insert(name.clone());
            apps.push(AppEntry { name, path: path.to_string_lossy().to_string() });
        }
    }

    if let Ok(entries) = scan_registry_app_paths() {
        for entry in entries {
            if seen.contains(&entry.name) { continue; }
            seen.insert(entry.name.clone());
            apps.push(entry);
        }
    }

    if let Ok(entries) = scan_registry_uninstall() {
        for entry in entries {
            if seen.contains(&entry.name) { continue; }
            seen.insert(entry.name.clone());
            apps.push(entry);
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}

fn scan_registry_app_paths() -> Result<Vec<AppEntry>, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let mut apps = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = match hklm.open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths", KEY_READ) {
        Ok(k) => k, Err(_) => return Ok(apps),
    };
    for name in key.enum_keys().filter_map(|k| k.ok()) {
        let subkey = match key.open_subkey_with_flags(&name, KEY_READ) { Ok(k) => k, Err(_) => continue };
        let path: String = match subkey.get_value("") { Ok(p) => p, Err(_) => continue };
        apps.push(AppEntry { name: name.trim_end_matches(".exe").to_string(), path });
    }
    Ok(apps)
}

fn scan_registry_uninstall() -> Result<Vec<AppEntry>, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let mut apps = Vec::new();
    let roots = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];
    for (hkey, path) in &roots {
        let key = match RegKey::predef(*hkey).open_subkey_with_flags(path, KEY_READ) { Ok(k) => k, Err(_) => continue };
        for name in key.enum_keys().filter_map(|k| k.ok()) {
            let subkey = match key.open_subkey_with_flags(&name, KEY_READ) { Ok(k) => k, Err(_) => continue };
            let display_name: String = match subkey.get_value("DisplayName") { Ok(n) => n, Err(_) => continue };
            if display_name.is_empty() { continue; }
            let install_path: String = subkey.get_value("DisplayIcon").or_else(|_| subkey.get_value("InstallLocation")).unwrap_or_default();
            if install_path.is_empty() { continue; }
            let clean_path = install_path.split(',').next().unwrap_or("").trim().to_string();
            if clean_path.is_empty() || !std::path::Path::new(&clean_path).exists() { continue; }
            apps.push(AppEntry { name: display_name, path: clean_path });
        }
    }
    Ok(apps)
}

fn dirs_or_empty(f: impl Fn() -> Option<PathBuf>) -> PathBuf {
    f().unwrap_or_default()
}

pub fn activate_or_launch(path: &str) -> Result<(), String> {
    let lower = path.to_lowercase();
    let exe_name = std::path::Path::new(&lower).file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !exe_name.ends_with(".exe") { return launch_raw(path); }
    if let Some(pid) = find_process(exe_name) {
        bring_window_to_foreground(pid);
        Ok(())
    } else {
        launch_raw(path)
    }
}

fn launch_raw(path: &str) -> Result<(), String> {
    std::process::Command::new("cmd").arg("/c").arg("start").arg("").arg(path).spawn().map_err(|e| format!("启动失败: {}", e))?;
    Ok(())
}

fn find_process(exe_name: &str) -> Option<u32> {
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    use windows_sys::Win32::Foundation::CloseHandle;
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot as isize == -1 { return None; }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let name = String::from_utf16_lossy(&entry.szExeFile).trim_end_matches('\0').to_lowercase();
                if name == exe_name { CloseHandle(snapshot); return Some(entry.th32ProcessID); }
                if Process32NextW(snapshot, &mut entry) == 0 { break; }
            }
        }
        CloseHandle(snapshot);
        None
    }
}

fn bring_window_to_foreground(pid: u32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    use std::ffi::c_void;
    unsafe {
        let mut data: (u32, Option<*mut c_void>) = (pid, None);
        let ctx = &mut data as *mut (u32, Option<*mut c_void>) as isize;
        EnumWindows(Some(enum_window_callback), ctx);
        if let Some(hwnd) = data.1 {
            if IsIconic(hwnd) != 0 { ShowWindow(hwnd, SW_RESTORE); }
            SetForegroundWindow(hwnd);
        }
    }
}

unsafe extern "system" fn enum_window_callback(hwnd: *mut std::ffi::c_void, lparam: isize) -> i32 {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let data = &mut *(lparam as *mut (u32, Option<*mut std::ffi::c_void>));
    let mut window_pid: u32 = 0;
    let _ = GetWindowThreadProcessId(hwnd, &mut window_pid);
    if window_pid == data.0 && IsWindowVisible(hwnd) != 0 { data.1 = Some(hwnd); return 0; }
    1
}
