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
