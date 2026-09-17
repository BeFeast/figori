#[cfg(target_os = "macos")]
mod mac {
    use std::{
        ffi::{c_char, c_void, CStr, CString},
        sync::OnceLock,
    };
    use tauri::{Emitter, Manager};
    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
    extern "C" {
        fn figori_chrome_configure(
            window: *mut c_void,
            prefs: *const c_char,
            callback: extern "C" fn(*const c_char),
        );
        fn figori_chrome_settings();
        fn figori_document_path(window: *mut c_void, path: *const c_char);
        fn figori_reveal_path(path: *const c_char);
    }
    extern "C" fn event(json: *const c_char) {
        let Ok(event) =
            serde_json::from_slice::<serde_json::Value>(unsafe { CStr::from_ptr(json) }.to_bytes())
        else {
            return;
        };
        if let Some(app) = APP.get() {
            let name = if event["type"] == "precision" {
                "figori-precision"
            } else if event["type"] == "appearance" {
                "figori-appearance"
            } else {
                "figori-menu"
            };
            let _ = app.emit(name, &event["value"]);
        }
    }
    pub fn configure(
        window: tauri::WebviewWindow,
        appearance: serde_json::Value,
    ) -> Result<(), String> {
        let _ = APP.set(window.app_handle().clone());
        let pointer = window.ns_window().map_err(|e| e.to_string())? as usize;
        let prefs = CString::new(appearance.to_string()).map_err(|e| e.to_string())?;
        window
            .run_on_main_thread(move || unsafe {
                figori_chrome_configure(pointer as *mut c_void, prefs.as_ptr(), event)
            })
            .map_err(|e| e.to_string())
    }
    pub fn document(window: tauri::WebviewWindow, path: Option<String>) -> Result<(), String> {
        let pointer = window.ns_window().map_err(|e| e.to_string())? as usize;
        let path = CString::new(path.unwrap_or_default()).map_err(|e| e.to_string())?;
        window
            .run_on_main_thread(move || unsafe {
                figori_document_path(pointer as *mut c_void, path.as_ptr())
            })
            .map_err(|e| e.to_string())
    }
    pub fn reveal(app: &tauri::AppHandle, path: &std::path::Path) -> Result<(), String> {
        let path = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        app.run_on_main_thread(move || unsafe { figori_reveal_path(path.as_ptr()) })
            .map_err(|e| e.to_string())
    }
    pub fn settings(app: &tauri::AppHandle) {
        let _ = app.run_on_main_thread(|| unsafe { figori_chrome_settings() });
    }
}
fn validate_appearance(value: &serde_json::Value) -> Result<(), String> {
    let font = value["font"].as_str().unwrap_or("");
    let theme = value["theme"].as_str().unwrap_or("");
    let size = value["size"].as_f64().unwrap_or(0.0);
    let spacing = value["spacing"].as_f64().unwrap_or(0.0);
    if !["nerd", "system"].contains(&font)
        || !["dark", "light", "system"].contains(&theme)
        || !(12.0..=24.0).contains(&size)
        || !(1.4..=2.2).contains(&spacing)
    {
        return Err("Invalid appearance preferences".into());
    }
    Ok(())
}
#[tauri::command]
pub fn configure_chrome(
    window: tauri::WebviewWindow,
    appearance: serde_json::Value,
) -> Result<bool, String> {
    validate_appearance(&appearance)?;
    #[cfg(target_os = "macos")]
    {
        mac::configure(window, appearance)?;
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, appearance);
        Ok(false)
    }
}
pub fn settings(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    mac::settings(app);
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Emitter;
        let _ = app.emit("figori-menu", "appearance");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_preferences_reject_invalid_controls() {
        let good = serde_json::json!({"font":"nerd","theme":"system","size":16,"spacing":1.9});
        assert!(validate_appearance(&good).is_ok());
        for (key, value) in [
            ("size", serde_json::json!(1000)),
            ("spacing", serde_json::json!(0)),
            ("theme", serde_json::json!("other")),
            ("font", serde_json::json!("missing")),
        ] {
            let mut bad = good.clone();
            bad[key] = value;
            assert!(validate_appearance(&bad).is_err());
        }
    }
}

pub fn document(window: tauri::WebviewWindow, path: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        mac::document(window, path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, path);
        Ok(())
    }
}
pub fn reveal(app: &tauri::AppHandle, path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        mac::reveal(app, path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        std::process::Command::new("xdg-open")
            .arg(path.parent().ok_or("Missing parent directory")?)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

// Hide GTK chrome without detaching the menu's accelerator group.
pub fn configure_window(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    {
        window.set_decorations(false)?;
        window.hide_menu()?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = window;
    Ok(())
}

#[tauri::command]
pub fn linux_window_action(window: tauri::WebviewWindow, action: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let result = match action.as_str() {
            "menu" => window.popup_menu(&window.menu().ok_or("Window menu unavailable")?),
            "drag" => window.start_dragging(),
            "minimize" => window.minimize(),
            "maximize" => {
                if window.is_maximized().map_err(|e| e.to_string())? {
                    window.unmaximize()
                } else {
                    window.maximize()
                }
            }
            // close() emits the same close request used by the dirty-document guard.
            "close" => window.close(),
            _ => return Err("Unknown window action".into()),
        };
        result.map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (window, action);
        Err("Linux window controls unavailable on this platform".into())
    }
}
