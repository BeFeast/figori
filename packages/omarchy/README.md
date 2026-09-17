# Figori for Omarchy

The panel follows the installed Omarchy 4.0.4 Shell Plugins contract: schema version 1, `panel` entrypoint, `open(payloadJson)`, `close()`, capability-scoped `shell.hide`, and a `FloatingWindow`. It invokes the shared CLI asynchronously through argv and JSON stdin. User expressions and file paths are never interpolated into a shell command.

The panel provides multiline source/results, visible timezone and dynamic/fixed anchor controls, include/exclude partial billing month, result copy, saved worksheet list/save/open, and explicit UTF-8 `.numi` import/export. Replacing unsaved content requires an explicit discard action. The host keeps the panel loaded across hiding; use Save for persistence across shell restarts. A request timeout, response-id check, and revision check prevent stale evaluations or delayed loads from replacing newer edits. Export refuses existing destinations. Currency conversion loads only a local cache when opened. The separate Refresh ILS/USD rates button explicitly contacts the documented provider; source, as-of date, freshness and failures remain visible. Missing rates are never fabricated.

## Package layout and prerequisites

Stage `manifest.json`, `Panel.qml` and `figori-mark.svg` together as one plugin directory. The monorepo root is not a standalone Omarchy plugin, so `omarchy plugin add <monorepo>` is not the correct installation path. `figori` must name the compiled/source launcher with `--request` support. For an absolute executable path, summon with a JSON payload:

```sh
omarchy-shell shell summon befeast.my-numi '{"cli":"/absolute/path/to/figori"}'
```

`figori.desktop` is a terminal fallback for Walker/application menus. It invokes `figori --tui`, which must be supplied by the terminal package. The optional Hyprland binding uses `omarchy-launch-terminal` so the user's configured terminal is honored. Launcher assets are not evidence that the TUI has been installed.

## Staged installation and rollback

No installation occurs during build or tests. After approving a concrete install with exact artifact paths:

1. Back up an existing `~/.config/omarchy/plugins/befeast.my-numi` directory, the existing CLI executable, and `~/.config/omarchy/shell.json` if present. Record which paths existed; do not remove unrelated settings on rollback.
2. Copy the reviewed plugin directory into that user plugin path and put the matching CLI executable in the selected user executable location.
3. Run `omarchy-shell shell rescanPlugins`, then `omarchy plugin enable befeast.my-numi`. Summon the panel and verify calculation, save/reopen, fixed anchor, monthly count, and clipboard in the actual desktop session.
4. Install the `.desktop` file and binding only if choosing the terminal fallback; preserve any previous versions independently.
5. Rollback: hide and disable this plugin, restore or remove only the plugin/executable/launcher paths changed in this install, restore the recorded plugin enabled state, and rescan. Keep worksheet storage; removing the plugin does not authorize deleting user data. A wholesale shell.json restore could overwrite newer unrelated settings, so use it only if unchanged since this install.

Default worksheet storage follows `FIGORI_DATA_DIR`, then legacy `MY_NUMI_DATA_DIR`, otherwise `$XDG_DATA_HOME/my-numi/worksheets`, otherwise `~/.local/share/my-numi/worksheets`. Export is an explicit copy; it does not overwrite imported originals automatically. Settings live in the application's versioned storage/sidecar, not inside `.numi` plain text.

The exact user-scope delivery implementation is in [install-user.sh](scripts/install-user.sh) and [rollback-user.sh](scripts/rollback-user.sh). Installation requires an artifact directory containing `figori`, `Panel.qml`, `figori-mark.svg`, `manifest.json`, and `SHA256SUMS`, plus a new absolute backup directory. It verifies hashes, snapshots the old CLI/plugin and current plugin enabled state, preserves a reference copy of shell.json, replaces only this executable/plugin, rescans and enables this plugin. It does not install launcher bindings or touch services. Rollback restores the recorded CLI/plugin paths and enabled state while retaining user worksheets and unrelated settings.

```sh
bash scripts/install-user.sh --apply /absolute/reviewed/artifact /absolute/new/backup
bash scripts/rollback-user.sh --apply /absolute/new/backup
```

These are reviewable delivery scripts, not commands run by this implementation. The panel refreshes the local clock and cached rate age every 60 seconds while visible and idle, including after resume; no background network refresh is introduced.

## Branding and upgrade identity

Figori uses cobalt `#284BFF`, lime `#DDFC45`, ink `#111827` and paper `#F7F8FC`. The panel header carries the brand; editor controls and text retain native system/monospace typography and theme behavior.

The plugin id remains `befeast.my-numi` deliberately so upgrades replace the existing panel and preserve enabled state. Legacy data directories and `MY_NUMI_DATA_DIR` remain supported; no worksheets are moved. The new installer replaces only `~/.local/bin/figori`, leaving an existing `my-numi` executable intact. New rollback receipts record the executable name; old receipts without that field restore their original `my-numi` target. No live installation happens during build or branding.

The fallback launcher is `figori.desktop` with `Exec=figori --tui`. Its `Icon=figori` entry expects the supplied Figori icon to be registered under that name when the optional desktop launcher is installed; the panel uses its bundled SVG directly. Numi remains the attribution for the supported `.numi` interchange format, not the product name.
