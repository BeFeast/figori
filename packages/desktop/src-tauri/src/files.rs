use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub const MAX_SOURCE_BYTES: usize = 5 * 1024 * 1024;
pub fn hash(source: &str) -> String {
    format!("{:x}", Sha256::digest(source.as_bytes()))
}
pub fn read_source(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_SOURCE_BYTES as u64 {
        return Err("Choose a UTF-8 text worksheet smaller than 5 MB.".into());
    }
    let source =
        fs::read_to_string(path).map_err(|e| format!("Cannot read UTF-8 worksheet: {e}"))?;
    if source.len() > MAX_SOURCE_BYTES {
        return Err("Worksheet is larger than 5 MB.".into());
    }
    Ok(source)
}

/// Same-directory temporary + fsync + atomic rename; refuses a stale open-file hash.
pub fn atomic_write(
    path: &Path,
    bytes: &[u8],
    expected: Option<&str>,
    check_conflict: bool,
) -> Result<(), String> {
    if bytes.len() > MAX_SOURCE_BYTES + 65536 {
        return Err("Document is too large.".into());
    }
    let parent = path.parent().ok_or("Missing parent directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    if check_conflict {
        let actual = if path.exists() {
            Some(hash(&read_source(path)?))
        } else {
            None
        };
        if actual.as_deref() != expected {
            return Err("The file changed outside Figori. Open the changed file or use Save As to keep both versions.".into());
        }
    }
    temporary.persist(path).map_err(|e| e.error.to_string())?;
    if let Ok(directory) = fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub path: String,
    pub source: String,
    pub source_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    pub source: String,
    pub settings: Value,
    pub path: Option<String>,
    pub source_hash: Option<String>,
    pub dirty: bool,
}
pub fn settings_path(data: &Path, path: &Path) -> PathBuf {
    data.join("settings")
        .join(format!("{}.json", hash(&path.to_string_lossy())))
}
pub fn is_native(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("figori"))
}
pub fn opened(path: &Path, data: &Path) -> Result<Opened, String> {
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let source = read_source(&path)?;
    let source_hash = hash(&source);
    let mut settings = None;
    let mut warning = None;
    let local = settings_path(data, &path);
    let sidecar = PathBuf::from(format!("{}.my-numi.json", path.display()));
    for metadata in [local, sidecar] {
        if is_native(&path) {
            break;
        }
        if !metadata.exists() {
            continue;
        }
        match read_source(&metadata).and_then(|text| serde_json::from_str::<Value>(&text).map_err(|e| e.to_string())) {
            Ok(value) if value.get("sourceHash").and_then(Value::as_str) == Some(&source_hash) => {
                settings = value.get("settings").filter(|v| v.is_object()).cloned();
                if settings.is_some() { break; }
            },
            Ok(_) => warning = Some("Saved settings do not match these file contents; review the date and billing context.".into()),
            Err(_) => warning = Some("Saved settings could not be read; original worksheet text is intact.".into()),
        }
    }
    Ok(Opened {
        path: path.to_string_lossy().into(),
        source,
        source_hash,
        settings,
        warning,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_save_preserves_utf8_and_rejects_external_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sheet.numi");
        let original = "\u{feff}a = 12\r\n// שלום\n";
        atomic_write(&path, original.as_bytes(), None, true).unwrap();
        assert_eq!(read_source(&path).unwrap(), original);
        let old_hash = hash(original);
        fs::write(&path, "external edit").unwrap();
        assert!(atomic_write(&path, b"new edit", Some(&old_hash), true).is_err());
        assert_eq!(read_source(&path).unwrap(), "external edit");
        atomic_write(&path, b"explicit save", Some(&hash("external edit")), true).unwrap();
        assert_eq!(read_source(&path).unwrap(), "explicit save");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn settings_are_used_only_for_matching_source_and_invalid_utf8_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sheet.numi");
        fs::write(&path, "1+2").unwrap();
        let data = dir.path().join("data");
        let settings = serde_json::json!({"timezone":"Asia/Jerusalem"});
        let metadata = serde_json::json!({"sourceHash":hash("1+2"),"settings":settings});
        atomic_write(
            &settings_path(&data, &path),
            metadata.to_string().as_bytes(),
            None,
            false,
        )
        .unwrap();
        assert_eq!(opened(&path, &data).unwrap().settings, Some(settings));
        fs::write(&path, "2+3").unwrap();
        let changed = opened(&path, &data).unwrap();
        assert!(changed.settings.is_none());
        assert!(changed.warning.is_some());
        fs::write(&path, [0xff, 0xfe]).unwrap();
        assert!(read_source(&path).is_err());
    }
}

pub fn save_expectation(
    path: &Path,
    dialog: bool,
    opened_hash: Option<String>,
) -> Result<Option<String>, String> {
    if dialog {
        if path.exists() {
            Ok(Some(hash(&read_source(path)?)))
        } else {
            Ok(None)
        }
    } else {
        Ok(opened_hash)
    }
}

#[cfg(test)]
mod save_as_tests {
    use super::*;
    #[test]
    fn new_save_as_never_reuses_original_file_hash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.numi");
        let expected = save_expectation(&path, true, Some(hash("old document"))).unwrap();
        assert_eq!(expected, None);
        atomic_write(&path, b"new document", expected.as_deref(), true).unwrap();
        assert_eq!(read_source(&path).unwrap(), "new document");
        let replacement = save_expectation(&path, true, Some(hash("old document"))).unwrap();
        assert_eq!(replacement, Some(hash("new document")));
        assert_eq!(
            save_expectation(&path, false, Some(hash("opened version"))).unwrap(),
            Some(hash("opened version"))
        );
    }
    #[test]
    #[cfg(unix)]
    fn canonicalized_new_file_settings_survive_a_symlink_parent() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real");
        fs::create_dir(&real).unwrap();
        let link = dir.path().join("alias");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let path = link.join("new.numi");
        atomic_write(&path, b"1+2", None, true).unwrap();
        let canonical = fs::canonicalize(&path).unwrap();
        let data = dir.path().join("data");
        let settings = serde_json::json!({"timezone":"UTC"});
        let metadata = serde_json::json!({"sourceHash":hash("1+2"),"settings":settings});
        atomic_write(
            &settings_path(&data, &canonical),
            metadata.to_string().as_bytes(),
            None,
            false,
        )
        .unwrap();
        assert_eq!(opened(&path, &data).unwrap().settings, Some(settings));
    }
}

#[cfg(test)]
mod native_container_tests {
    use super::*;
    #[test]
    fn native_payload_hashes_entire_file_and_ignores_legacy_sidecars() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.figori");
        let raw = "version = 1\nsource = \"2 + 3\"\n";
        fs::write(&path, raw).unwrap();
        fs::write(
            format!("{}.my-numi.json", path.display()),
            serde_json::json!({"sourceHash":hash(raw),"settings":{"timezone":"wrong"}}).to_string(),
        )
        .unwrap();
        let opened = opened(&path, dir.path()).unwrap();
        assert_eq!(opened.source, raw);
        assert_eq!(opened.source_hash, hash(raw));
        assert!(opened.settings.is_none());
        fs::write(&path, format!("{raw}# outside edit\n")).unwrap();
        assert!(atomic_write(&path, raw.as_bytes(), Some(&opened.source_hash), true).is_err());
        // Corrupt TOML is transported verbatim to the authoritative frontend codec.
        fs::write(&path, "not valid [ TOML").unwrap();
        assert_eq!(
            super::opened(&path, dir.path()).unwrap().source,
            "not valid [ TOML"
        );
    }
    #[test]
    fn recovery_preserves_native_container_and_accepts_legacy_envelopes() {
        let legacy = serde_json::json!({"source":"2+3","settings":{},"path":null,"sourceHash":null,"dirty":true});
        let value: Recovery = serde_json::from_value(legacy.clone()).unwrap();
        assert!(value.format.is_none());
        assert!(value.origin_path.is_none());
        let mut native = legacy;
        native["format"] = serde_json::json!("figori");
        native["originPath"] = serde_json::json!("/tmp/import.numi");
        native["source"] = serde_json::json!("version = 1\n");
        let value: Recovery = serde_json::from_value(native).unwrap();
        let roundtrip = serde_json::to_value(value).unwrap();
        assert_eq!(roundtrip["originPath"], "/tmp/import.numi");
        assert_eq!(roundtrip["format"], "figori");
        assert_eq!(roundtrip["source"], "version = 1\n");
    }
}
