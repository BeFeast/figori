mod chrome;
mod export;
mod files;
mod menu;
mod migration;
mod rates;
mod recent;
use files::{Opened, Recovery};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Emitter;
use tauri::Manager;

#[derive(Default)]
struct PendingPaths(Mutex<Vec<String>>);
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_document(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<Opened>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title("Open worksheet")
        .add_filter("Figori documents", &["figori"])
        .add_filter("Import worksheets", &["numi", "txt", "md"])
        .add_filter("All files", &["*"])
        .pick_file()
        .await;
    file.map(|file| files::opened(file.path(), &data_dir(&app)?))
        .transpose()
}
#[tauri::command]
fn read_document(app: tauri::AppHandle, path: String) -> Result<Opened, String> {
    files::opened(Path::new(&path), &data_dir(&app)?)
}
#[tauri::command]
async fn save_document(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    path: Option<String>,
    source: String,
    settings: Value,
    save_as: bool,
    expected_hash: Option<String>,
    suggested_name: Option<String>,
) -> Result<Option<Opened>, String> {
    if source.len() > files::MAX_SOURCE_BYTES {
        return Err("Worksheet is larger than 5 MB.".into());
    }
    let dialog = save_as || path.is_none();
    let proposed = suggested_name
        .as_deref()
        .and_then(|name| Path::new(name).file_stem())
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Worksheet");
    let selected = if dialog {
        let file = rfd::AsyncFileDialog::new()
            .set_parent(&window)
            .set_title("Save worksheet")
            .set_file_name(format!("{proposed}.figori"))
            .add_filter("Figori document", &["figori"])
            .save_file()
            .await;
        match file {
            Some(file) => file.path().to_path_buf(),
            None => return Ok(None),
        }
    } else {
        PathBuf::from(path.unwrap())
    };
    // Canonicalize an existing path so saving an opened symlink updates its target.
    let selected = if selected.exists() {
        std::fs::canonicalize(&selected).map_err(|e| e.to_string())?
    } else {
        selected
    };
    if !files::is_native(&selected) {
        return Err(
            "Save native documents with the .figori extension; use Export for Numi or Markdown."
                .into(),
        );
    }
    let expected = files::save_expectation(&selected, dialog, expected_hash)?;
    files::atomic_write(&selected, source.as_bytes(), expected.as_deref(), true)?;
    let selected = std::fs::canonicalize(&selected).map_err(|e| e.to_string())?;
    let recent_warning =
        recent::record_recent(app.clone(), selected.to_string_lossy().into_owned()).err();
    let source_hash = files::hash(&source);
    let warning = recent_warning;
    Ok(Some(Opened {
        path: selected.to_string_lossy().into(),
        source,
        source_hash,
        settings: Some(settings),
        warning,
    }))
}
#[tauri::command]
fn save_recovery(
    app: tauri::AppHandle,
    source: String,
    settings: Value,
    path: Option<String>,
    source_hash: Option<String>,
    dirty: bool,
    format: Option<String>,
    origin_path: Option<String>,
) -> Result<(), String> {
    if format.as_deref().is_some_and(|value| value != "figori") {
        return Err("Unsupported recovery format".into());
    }
    let recovery = Recovery {
        origin_path,
        format,
        source,
        settings,
        path,
        source_hash,
        dirty,
    };
    files::atomic_write(
        &data_dir(&app)?.join("recovery.json"),
        serde_json::to_string(&recovery)
            .map_err(|e| e.to_string())?
            .as_bytes(),
        None,
        false,
    )
}
#[tauri::command]
fn load_recovery(app: tauri::AppHandle) -> Result<Option<Recovery>, String> {
    let path = data_dir(&app)?.join("recovery.json");
    if !path.exists() {
        return Ok(None);
    }
    serde_json::from_str(&files::read_source(&path)?)
        .map(Some)
        .map_err(|e| format!("Recovery could not be read; it was left intact: {e}"))
}
#[tauri::command]
async fn confirm_close(window: tauri::WebviewWindow) -> String {
    use rfd::{MessageButtons, MessageDialogResult};
    let choice = rfd::AsyncMessageDialog::new()
        .set_parent(&window)
        .set_title("Save changes to this worksheet?")
        .set_description(
            "Save keeps the original file up to date. Discard leaves the original file unchanged.",
        )
        .set_buttons(MessageButtons::YesNoCancelCustom(
            "Save".into(),
            "Discard".into(),
            "Cancel".into(),
        ))
        .show()
        .await;
    match choice {
        MessageDialogResult::Yes => "save".into(),
        MessageDialogResult::No => "discard".into(),
        MessageDialogResult::Custom(text) if text == "Save" => "save".into(),
        MessageDialogResult::Custom(text) if text == "Discard" => "discard".into(),
        _ => "cancel".into(),
    }
}
#[tauri::command]
fn initial_paths(state: tauri::State<PendingPaths>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}
#[tauri::command]
fn load_rates(app: tauri::AppHandle) -> Result<rates::RateState, String> {
    Ok(rates::load(&data_dir(&app)?))
}
#[tauri::command]
async fn refresh_rates(app: tauri::AppHandle) -> Result<rates::RateState, String> {
    Ok(rates::refresh(&data_dir(&app)?).await)
}

pub fn run() {
    migration::prepare()
        .expect("Could not safely migrate Figori state; legacy files were retained");
    let paths = std::env::args()
        .skip(1)
        .filter(|path| !path.starts_with('-') && Path::new(path).is_file())
        .collect();
    let app = tauri::Builder::default()
        .manage(PendingPaths(Mutex::new(paths)))
        .manage(recent::DocumentState::default())
        .setup(|app| {
            menu::install(app)?;
            if let Some(window) = app.get_webview_window("main") {
                chrome::configure_window(&window)?;
            }
            let _ = recent::refresh(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match recent::action(app, id) {
                Ok(true) => return,
                Err(message) => {
                    if let Some(window) = app.get_webview_window("main") {
                        tauri::async_runtime::spawn(async move {
                            rfd::AsyncMessageDialog::new()
                                .set_parent(&window)
                                .set_title("Figori")
                                .set_description(message)
                                .show()
                                .await;
                        });
                    }
                    return;
                }
                Ok(false) => {}
            }
            if id == "quit" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                }
            } else if id == "settings" {
                chrome::settings(app);
            } else if [
                "new",
                "open",
                "save",
                "save-as",
                "export-numi",
                "export-markdown",
                "export-markdown-results",
            ]
            .contains(&id)
            {
                let _ = app.emit("figori-menu", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            chrome::configure_chrome,
            chrome::linux_window_action,
            recent::record_recent,
            recent::configure_document,
            export::export_document,
            export::export_numi,
            open_document,
            read_document,
            save_document,
            save_recovery,
            load_recovery,
            confirm_close,
            initial_paths,
            load_rates,
            refresh_rates
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Figori");
    app.run(|app, event| {
        // Route application quit through the same dirty-window close guard.
        // Once the frontend destroys the window after save/discard, exit is allowed.
        if let tauri::RunEvent::ExitRequested { api, .. } = &event {
            if let Some(window) = app.get_webview_window("main") {
                api.prevent_exit();
                let _ = window.close();
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for path in urls.into_iter().filter_map(|url| url.to_file_path().ok()) {
                let path = path.to_string_lossy().to_string();
                app.state::<PendingPaths>()
                    .0
                    .lock()
                    .unwrap()
                    .push(path.clone());
                let _ = app.emit("figori-open-file", path);
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}
