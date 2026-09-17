use crate::files;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
#[derive(Default)]
pub struct DocumentState(pub Mutex<Option<String>>);
static RECENT_LOCK: Mutex<()> = Mutex::new(());
const LIMIT: usize = 12;
fn load(data: &Path) -> Result<Vec<String>, String> {
    let file = data.join("recent.json");
    if !file.exists() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&files::read_source(&file)?)
        .map_err(|e| format!("Cannot read recent documents: {e}"))
}
fn write(data: &Path, entries: &[String]) -> Result<(), String> {
    files::atomic_write(
        &data.join("recent.json"),
        &serde_json::to_vec(entries).map_err(|e| e.to_string())?,
        None,
        false,
    )
}
fn record(data: &Path, path: &Path) -> Result<(), String> {
    // Read failures never alter history; cancelled opens never invoke this operation.
    files::read_source(path)?;
    let path = path
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let mut entries = load(data)?;
    entries.retain(|entry| entry != &path);
    entries.insert(0, path);
    entries.truncate(LIMIT);
    write(data, &entries)
}
fn file_item(app: &tauri::AppHandle, id: &str) -> Option<tauri::menu::MenuItemKind<tauri::Wry>> {
    match app.menu()?.get("file")? {
        tauri::menu::MenuItemKind::Submenu(file) => file.get(id),
        _ => None,
    }
}
pub fn refresh(app: &tauri::AppHandle) -> Result<(), String> {
    let entries = load(&crate::data_dir(app)?)?;
    let Some(tauri::menu::MenuItemKind::Submenu(menu)) = file_item(app, "open-recent") else {
        return Ok(());
    };
    for item in menu.items().map_err(|e| e.to_string())? {
        menu.remove(&item).map_err(|e| e.to_string())?;
    }
    for (index, path) in entries.iter().enumerate() {
        let title = format!(
            "{} — {}",
            Path::new(path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy(),
            Path::new(path).parent().unwrap_or(Path::new("")).display()
        );
        menu.append(
            &tauri::menu::MenuItem::with_id(
                app,
                format!("recent:{index}"),
                title,
                true,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }
    menu.append(&tauri::menu::PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    menu.append(
        &tauri::menu::MenuItem::with_id(
            app,
            "clear-recent",
            "Clear Menu",
            !entries.is_empty(),
            None::<&str>,
        )
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn record_recent(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _guard = RECENT_LOCK.lock().map_err(|e| e.to_string())?;
    record(&crate::data_dir(&app)?, Path::new(&path))?;
    refresh(&app)
}
pub fn action(app: &tauri::AppHandle, id: &str) -> Result<bool, String> {
    if id == "clear-recent" {
        let _guard = RECENT_LOCK.lock().map_err(|e| e.to_string())?;
        write(&crate::data_dir(app)?, &[])?;
        refresh(app)?;
        return Ok(true);
    }
    if let Some(index) = id
        .strip_prefix("recent:")
        .and_then(|s| s.parse::<usize>().ok())
    {
        if let Some(path) = load(&crate::data_dir(app)?)?.get(index) {
            app.emit("figori-open-file", path)
                .map_err(|e| e.to_string())?;
        }
        return Ok(true);
    }
    if id == "show-in-finder" {
        reveal(app)?;
        return Ok(true);
    }
    Ok(false)
}
#[tauri::command]
pub fn configure_document(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    path: Option<String>,
) -> Result<(), String> {
    *app.state::<DocumentState>()
        .0
        .lock()
        .map_err(|e| e.to_string())? = path.clone();
    if let Some(tauri::menu::MenuItemKind::MenuItem(item)) = file_item(&app, "show-in-finder") {
        item.set_enabled(path.is_some())
            .map_err(|e| e.to_string())?;
    }
    crate::chrome::document(window, path)
}
fn reveal(app: &tauri::AppHandle) -> Result<(), String> {
    let path = app
        .state::<DocumentState>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Save the document before revealing it.")?;
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "The document no longer exists at its saved location.".to_string())?;
    crate::chrome::reveal(app, &path)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_history_deduplicates_persists_and_excludes_failed_reads() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("state");
        let mut paths = vec![];
        for index in 0..15 {
            let path = dir.path().join(format!("{index}.figori"));
            std::fs::write(&path, "2+3").unwrap();
            record(&data, &path).unwrap();
            paths.push(path);
        }
        let entries = load(&data).unwrap();
        assert_eq!(entries.len(), LIMIT);
        assert_eq!(entries[0], paths[14].to_string_lossy());
        record(&data, &paths[5]).unwrap();
        let entries = load(&data).unwrap();
        assert_eq!(entries[0], paths[5].to_string_lossy());
        assert_eq!(entries.len(), LIMIT);
        assert!(record(&data, &dir.path().join("missing.figori")).is_err());
        assert_eq!(load(&data).unwrap(), entries);
        write(&data, &[]).unwrap();
        assert!(load(&data).unwrap().is_empty());
        assert_eq!(std::fs::read_to_string(&paths[5]).unwrap(), "2+3");
    }
}
