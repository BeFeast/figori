# Platform plan: Omarchy first

Planning snapshot: 2026-09-17. This document authorizes no build, installation or host configuration change. The macOS 0.3.0 artifact keeps its own exact build commit; this later documentation commit does not change application code.

## Recommendation

Prioritize standalone Figori desktop on Omarchy. Reuse the TypeScript engine, CodeMirror worksheet, `.figori` codec and Rust file/recovery/rate bridge. Treat CachyOS as a second Arch-family acceptance target, Ubuntu as a later packaging target, and Windows as deferred until a real Windows worksheet workflow is identified. There is no evidence yet that a Windows release is needed.

Retain Qalculate for quick calculations and advanced mathematics. Do not replace Figori's engine or turn the worksheet into a Qalculate plugin merely to reach Linux. The same `.figori` document must use the same calculation semantics on every platform.

## What exists and what remains

The repository already contains a cross-platform Tauri shell, shared document codec, native filesystem operations and Linux portal-based file dialogs. macOS toolbar/Settings are AppKit-specific; Linux currently retains the frontend fallback. The default bundle configuration still targets `app`, so successful Rust compilation alone does not constitute a Linux distribution or accepted Linux UI.

An earlier Omarchy QML panel and CLI/TUI exist separately. Their worksheet storage, launcher and release contract predate the new native `.figori` workflow. Do not imply that the old panel has acquired the desktop application's identity/recovery behavior. Prefer a launcher for the standalone app first; retain the existing panel and data until an explicit migration/replacement decision.

The primary Omarchy target was inspected read-only: an x86_64 Arch-family desktop with WebKitGTK 4.1, GTK3, desktop portal integration, `qalc` and the Qalculate Qt application already available. Their presence is a prerequisite observation, not a successful Figori desktop launch. Check the existing Walker quick-calculation experience before adding another mini calculator.

## Qalculate integration assessment

Qalculate exposes a C++ calculation library and CLI, plus GTK/Qt interfaces. Its documented extension surfaces include user-defined functions, units and variables. The reviewed official material did not identify a general GUI plugin contract for embedding a separate persistent worksheet application. A custom function or unit definition would not provide Figori's editor, source-preserving documents or recovery. [Project and extension examples](https://github.com/Qalculate/libqalculate), [library API](https://qalculate.github.io/reference/).

Embedding libqalculate would introduce another evaluation engine and native dependency boundary. It could be researched as an optional cross-platform advanced/offline-unit backend only after defining a semantic contract. A `qalc` subprocess adapter likewise needs argv/stdin transport, timeouts and separately labeled semantics. Neither should silently change date anchors, monthly billing, currency provenance or Mac/Linux results. First demonstrate a specific unsupported calculation and its value; defer the adapter otherwise. [Qalculate manual](https://qalculate.github.io/manual/).

## Omarchy acceptance sequence

1. Add a Linux bundle configuration and resolve GTK/WebKit build dependencies on the development surface. Keep pinned frontend/Rust dependencies. Verify that macOS-only Swift compilation stays excluded.
2. Produce an isolated Linux x86_64 artifact with source SHA/checksums. Stage it on the primary Omarchy desktop without replacing the old CLI, panel, launchers or worksheet data.
3. Verify actual Wayland launch, focus, native file portals, clipboard, keyboard shortcuts, window scaling and light/dark appearance. Adapt Linux chrome to the platform rather than copying AppKit or considering the old web-like fallback accepted automatically.
4. Run synthetic `.figori` open/save/reopen/recovery, external-change conflicts, import-original preservation, Numi/Markdown export, duplicate-line IDs, context controls, currency refresh/offline cache, h1–h6 and long-document gutter alignment.
5. Only after visible acceptance, prepare a reversible user-scope install, application entry/icon and `.figori` association. A Hyprland shortcut should focus/open the app, not start another calculation engine. Keep the terminal fallback optional.

Linux development needs WebKitGTK and other distribution-specific libraries. Check official Arch and Debian lists against the selected build image; do not automatically upgrade the user's desktop. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Distribution strategy

| Target | First deliverable | Gate for broader support |
| --- | --- | --- |
| Omarchy | Staged standalone app, then a reviewed Arch package | Actual primary desktop acceptance |
| CachyOS | Same architecture and Arch packaging recipe | Separate compositor/portal/font smoke checks |
| Ubuntu | AppImage candidate; `.deb` if regular use warrants it | Name a supported Ubuntu baseline and test it |
| Windows | No artifact yet | A concrete user workflow and real Windows acceptance host |

AppImage is a useful secondary format, not a guarantee of universal compatibility. Build on the oldest supported base with required WebKitGTK to avoid raising the glibc floor inadvertently. [Tauri AppImage guidance](https://v2.tauri.app/distribute/appimage/). Arch and Debian packaging are documented independently: [AUR recipe](https://v2.tauri.app/distribute/aur/), [Debian packages](https://v2.tauri.app/distribute/debian/). Do not publish to AUR or add Flatpak infrastructure before the primary target works.

If Windows becomes useful, reuse the same app and `.figori` codec with platform controls, paths and shortcuts. Use a Windows build/acceptance host with MSVC Rust, Microsoft C++ tools and WebView2; cross-compilation is not runtime proof. [Prerequisites](https://v2.tauri.app/start/prerequisites/). A per-user NSIS installer is a reasonable first candidate; MSI adds Windows-specific tooling and is unnecessary without an enterprise deployment requirement. [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/).
