# Omarchy panel and terminal launcher

The panel follows the installed Omarchy 4.0.4 Shell Plugins contract: schema version 1, `panel` entrypoint, `open(payloadJson)`, `close()`, capability-scoped `shell.hide`, and a `FloatingWindow`. It invokes the shared CLI asynchronously through argv and JSON stdin. User expressions and file paths are never interpolated into a shell command.

The panel provides multiline source/results, visible timezone and dynamic/fixed anchor controls, include/exclude partial billing month, result copy, saved worksheet list/save/open, and explicit UTF-8 `.numi` import/export. Replacing unsaved content requires an explicit discard action. The host keeps the panel loaded across hiding; use Save for persistence across shell restarts. A request timeout, response-id check, and revision check prevent stale evaluations or delayed loads from replacing newer edits. Export refuses existing destinations. Currency conversion loads only a local cache when opened. The separate Refresh ILS/USD rates button explicitly contacts the documented provider; source, as-of date, freshness and failures remain visible. Missing rates are never fabricated.

## Package layout and prerequisites

Stage `manifest.json` and `Panel.qml` together as one plugin directory. The monorepo root is not a standalone Omarchy plugin, so `omarchy plugin add <monorepo>` is not the correct installation path. `my-numi` must name the compiled/source launcher with `--request` support. For an absolute executable path, summon with a JSON payload:

```sh
omarchy-shell shell summon befeast.my-numi '{"cli":"/absolute/path/to/my-numi"}'
```

`my-numi.desktop` is a terminal fallback for Walker/application menus. It invokes `my-numi --tui`, which must be supplied by the terminal package. The optional Hyprland binding uses `omarchy-launch-terminal` so the user's configured terminal is honored. Launcher assets are not evidence that the TUI has been installed.

## Staged installation and rollback

No installation occurs during build or tests. After approving a concrete install with exact artifact paths:

1. Back up an existing `~/.config/omarchy/plugins/befeast.my-numi` directory, the existing CLI executable, and `~/.config/omarchy/shell.json` if present. Record which paths existed; do not remove unrelated settings on rollback.
2. Copy the reviewed plugin directory into that user plugin path and put the matching CLI executable in the selected user executable location.
3. Run `omarchy-shell shell rescanPlugins`, then `omarchy plugin enable befeast.my-numi`. Summon the panel and verify calculation, save/reopen, fixed anchor, monthly count, and clipboard in the actual desktop session.
4. Install the `.desktop` file and binding only if choosing the terminal fallback; preserve any previous versions independently.
5. Rollback: hide and disable this plugin, restore or remove only the plugin/executable/launcher paths changed in this install, restore the recorded plugin enabled state, and rescan. Keep worksheet storage; removing the plugin does not authorize deleting user data. A wholesale shell.json restore could overwrite newer unrelated settings, so use it only if unchanged since this install.

Default worksheet storage follows `MY_NUMI_DATA_DIR`, otherwise `$XDG_DATA_HOME/my-numi/worksheets`, otherwise `~/.local/share/my-numi/worksheets`. Export is an explicit copy; it does not overwrite imported originals automatically. Settings live in the application's versioned storage/sidecar, not inside `.numi` plain text.
