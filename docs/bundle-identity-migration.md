# BeFeast bundle identity migration

The native bundle identifier is `com.befeast.figori`. Previous previews used `uk.oklabs.figori`; this is retained only as a migration source, never as current branding.

Before Tauri creates the first WebView, startup copies missing legacy application-state directories to the new identity. On macOS these are `~/Library/Application Support/<identifier>` (recovery, settings and cached rates) and `~/Library/WebKit/<identifier>` (WebsiteData, localStorage and its SQLite companions). On Linux the application-data root is `$XDG_DATA_HOME` or `~/.local/share`.

The complete tree is copied into a temporary sibling before publishing the destination. Existing new-identity directories are authoritative and never merged with old data. Old directories remain unchanged for rollback. Unexpected symlinks/special files cause startup to stop rather than following external paths or silently ignoring state. No network credentials, certificates, Keychain items or application binaries are migrated.

Close the old application after saving before the controlled upgrade; live SQLite state must not be copied while the old WebView writes to it. Do not clear either identity directory to force a rerun. A future merge/recovery action for independently used identities needs explicit conflict handling.

Tests cover recovery bytes, WebKit SQLite/WAL copy, repeated startup without overwriting new state, missing source and failed copy without partial destination. Installed upgrade acceptance must additionally verify worksheet recovery and typography/precision/theme preferences in the actual new app. A compile/test result alone does not prove WebKit restored its preferences.
