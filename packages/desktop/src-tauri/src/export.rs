use crate::files;
use std::path::{Path, PathBuf};

fn canonical_destination(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return std::fs::canonicalize(path).map_err(|e| e.to_string());
    }
    let parent = path.parent().ok_or("Missing export directory")?;
    let name = path.file_name().ok_or("Missing export filename")?;
    Ok(std::fs::canonicalize(parent)
        .map_err(|e| e.to_string())?
        .join(name))
}
fn export_target(path: &Path, current: Option<&Path>) -> Result<PathBuf, String> {
    let target = canonical_destination(path)?;
    if let Some(current) = current {
        let current = canonical_destination(current)?;
        if target == current {
            return Err(
                "Choose a different destination. Export cannot overwrite the current worksheet."
                    .into(),
            );
        }
        #[cfg(unix)]
        if let (Ok(a), Ok(b)) = (std::fs::metadata(&target), std::fs::metadata(&current)) {
            use std::os::unix::fs::MetadataExt;
            if a.dev() == b.dev() && a.ino() == b.ino() {
                return Err(
                    "Export destination refers to the current worksheet. Choose another file."
                        .into(),
                );
            }
        }
    }
    Ok(target)
}
async fn export_text(
    window: tauri::WebviewWindow,
    source: String,
    suggested_name: String,
    current_path: Option<String>,
    extension: &str,
    label: &str,
) -> Result<Option<serde_json::Value>, String> {
    if source.len() > files::MAX_SOURCE_BYTES {
        return Err("Export is larger than 5 MB.".into());
    }
    // Treat the suggested name as a filename, never as a destination path.
    let name = Path::new(&suggested_name)
        .file_stem()
        .and_then(|v| v.to_str())
        .filter(|v| !v.is_empty())
        .unwrap_or("Worksheet");
    let selected = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title(format!("Export {label}"))
        .set_file_name(format!("{name}.{extension}"))
        .add_filter(label, &[extension])
        .save_file()
        .await;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = export_target(selected.path(), current_path.as_deref().map(Path::new))?;
    let expected = files::save_expectation(&destination, true, None)?;
    files::atomic_write(&destination, source.as_bytes(), expected.as_deref(), true)?;
    Ok(Some(
        serde_json::json!({"path": destination.to_string_lossy()}),
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_refuses_source_aliases_and_preserves_source_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("worksheet.md");
        std::fs::write(&source, "# Original\r\n₪12\n").unwrap();
        assert!(export_target(&source, Some(&source)).is_err());
        #[cfg(unix)]
        {
            let link = dir.path().join("alias.md");
            std::os::unix::fs::symlink(&source, &link).unwrap();
            assert!(export_target(&link, Some(&source)).is_err());
            let hard = dir.path().join("hard.md");
            std::fs::hard_link(&source, &hard).unwrap();
            assert!(export_target(&hard, Some(&source)).is_err());
        }
        let destination = export_target(&dir.path().join("export.md"), Some(&source)).unwrap();
        files::atomic_write(&destination, "# Export\n€12\n".as_bytes(), None, true).unwrap();
        assert_eq!(
            std::fs::read_to_string(&source).unwrap(),
            "# Original\r\n₪12\n"
        );
        assert_eq!(
            std::fs::read_to_string(destination).unwrap(),
            "# Export\n€12\n"
        );
    }
}

#[tauri::command]
pub async fn export_document(
    window: tauri::WebviewWindow,
    source: String,
    suggested_name: String,
    current_path: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    export_text(
        window,
        source,
        suggested_name,
        current_path,
        "md",
        "Markdown",
    )
    .await
}
#[tauri::command]
pub async fn export_numi(
    window: tauri::WebviewWindow,
    source: String,
    suggested_name: String,
    current_path: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    export_text(window, source, suggested_name, current_path, "numi", "Numi").await
}
