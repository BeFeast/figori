# Figori 0.3.7 Linux preview

This archive contains the standalone **Linux x86_64** desktop app. It is dynamically linked, not an AppImage or universal distribution bundle. macOS users should use the separately published 0.3.6 DMG.

## Requirements

GTK 3, WebKitGTK 4.1, libsoup 3 and glibc 2.39 or newer. A working desktop portal is needed for native file dialogs. This preview targets Omarchy/Arch-family Wayland desktops; other distributions require separate verification. The installer checks archive checksums and dynamic dependencies before writing application files. Consult release notes for actual target acceptance.

## Install for the current user

Download `Figori-0.3.7-linux-x86_64.tar.gz` and verify it against the published SHA256SUMS. Save your worksheet and quit any existing Figori instance before updating.

```sh
tar -xzf Figori-0.3.7-linux-x86_64.tar.gz
cd Figori-0.3.7-linux-x86_64
bash install-linux-user.sh install .
```

The installation creates:

- Versioned app files in `~/.local/opt/figori/<SOURCE_SHA>`.
- Executable launcher `~/.local/bin/figori-desktop`.
- Launcher `~/.local/share/applications/figori-desktop.desktop`.
- Icon `~/.local/share/icons/hicolor/128x128/apps/figori-desktop.png`.

Launch **Figori** from your desktop launcher or run `~/.local/bin/figori-desktop`. The legacy `figori` CLI, MIME defaults, old Omarchy panel and worksheet/recovery storage are not changed. An earlier standalone launcher/icon using the com.befeast.figori name is backed up and replaced by the matching figori-desktop identity to avoid duplicate entries.

## Rollback

The installer prints a backup directory under `~/.local/state/figori/install-backups/`. After quitting Figori, run `bash` with the full path to `rollback.sh` inside that specific backup directory. Rollback restores or removes only application paths recorded by the installation; it does not delete worksheet or recovery data.

## Verification and limits

The release includes SOURCE_COMMIT and checksum manifests. Check native window controls, shortcuts, launcher identity, Settings and file dialogs on the actual target. Release notes distinguish completed checks from unverified cross-distribution behavior.

Development: https://git.oklabs.uk/BeFeast/figori. Public downloads: https://github.com/BeFeast/figori. Inspired by Numi; support its original developer at https://numi.app.
