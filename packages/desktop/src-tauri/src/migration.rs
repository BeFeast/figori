//! Preserve legacy state before the first WebView opens under the new bundle identity.
use std::{
    fs,
    path::{Path, PathBuf},
};
const OLD_ID: &str = "uk.oklabs.figori";
const NEW_ID: &str = "com.befeast.figori";

fn copy_tree(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir(target).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        let to = target.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &to)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), to).map_err(|e| e.to_string())?;
        } else {
            return Err(
                "Unexpected link or special file in legacy state; original left intact".into(),
            );
        }
    }
    Ok(())
}
/// Publish a complete copied directory; never merge legacy state into an existing identity.
fn migrate_directory(parent: &Path) -> Result<(), String> {
    let source = parent.join(OLD_ID);
    let destination = parent.join(NEW_ID);
    if destination.exists() || !source.exists() {
        return Ok(());
    }
    if !fs::symlink_metadata(&source)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_dir()
    {
        return Err("Legacy application state is not a directory".into());
    }
    let stage = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let copied = stage.path().join("state");
    copy_tree(&source, &copied)?;
    // A concurrent new process may have initialized its own state while copying.
    if destination.exists() {
        return Ok(());
    }
    fs::rename(&copied, &destination).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn prepare() -> Result<(), String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("HOME unavailable for state migration")?;
    #[cfg(target_os = "macos")]
    let parents = vec![
        home.join("Library/Application Support"),
        home.join("Library/WebKit"),
    ];
    #[cfg(not(target_os = "macos"))]
    let parents = vec![std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local/share"))];
    for parent in parents {
        if parent.exists() {
            migrate_directory(&parent)?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_recovery_and_webkit_files_without_overwriting_either_identity() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join(OLD_ID);
        fs::create_dir_all(old.join("WebsiteData/Default/origin/LocalStorage")).unwrap();
        let recovery = b"{\"dirty\":true,\"source\":\"private fixture\"}";
        fs::write(old.join("recovery.json"), recovery).unwrap();
        let sqlite = old.join("WebsiteData/Default/origin/LocalStorage/store.sqlite3");
        fs::write(&sqlite, b"sqlite bytes").unwrap();
        fs::write(sqlite.with_extension("sqlite3-wal"), b"wal bytes").unwrap();
        migrate_directory(root.path()).unwrap();
        let new = root.path().join(NEW_ID);
        assert_eq!(fs::read(new.join("recovery.json")).unwrap(), recovery);
        assert_eq!(
            fs::read(new.join("WebsiteData/Default/origin/LocalStorage/store.sqlite3-wal"))
                .unwrap(),
            b"wal bytes"
        );
        fs::write(new.join("recovery.json"), b"new state").unwrap();
        migrate_directory(root.path()).unwrap();
        assert_eq!(fs::read(new.join("recovery.json")).unwrap(), b"new state");
        assert_eq!(fs::read(old.join("recovery.json")).unwrap(), recovery);
    }
    #[test]
    fn missing_legacy_state_does_not_create_an_empty_new_identity() {
        let root = tempfile::tempdir().unwrap();
        migrate_directory(root.path()).unwrap();
        assert!(!root.path().join(NEW_ID).exists());
    }
    #[cfg(unix)]
    #[test]
    fn unexpected_symlinks_fail_without_publishing_partial_state() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join(OLD_ID);
        fs::create_dir(&old).unwrap();
        std::os::unix::fs::symlink("/tmp", old.join("external")).unwrap();
        assert!(migrate_directory(root.path()).is_err());
        assert!(!root.path().join(NEW_ID).exists());
        assert!(old.exists());
    }
}
