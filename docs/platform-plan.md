# Platform plan: Omarchy first

Planning snapshot: 2026-09-17. This document authorizes no build, installation or host configuration change. The macOS 0.3.0 artifact keeps its own exact build commit; this later documentation commit does not change application code.

## Recommendation

Prioritize standalone Figori desktop on Omarchy. Reuse the TypeScript engine, CodeMirror worksheet, `.figori` codec and Rust file/recovery/rate bridge. Treat CachyOS as a second Arch-family acceptance target, Ubuntu as a later packaging target, and a desktop Joplin plugin as the next proposed Windows route. A standalone Windows release stays deferred without a demonstrated need.

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
| Windows | Joplin plugin planning; no native artifact | Desktop block MVP and actual note workflow |

AppImage is a useful secondary format, not a guarantee of universal compatibility. Build on the oldest supported base with required WebKitGTK to avoid raising the glibc floor inadvertently. [Tauri AppImage guidance](https://v2.tauri.app/distribute/appimage/). Arch and Debian packaging are documented independently: [AUR recipe](https://v2.tauri.app/distribute/aur/), [Debian packages](https://v2.tauri.app/distribute/debian/). Do not publish to AUR or add Flatpak infrastructure before the primary target works.

If Windows becomes useful, reuse the same app and `.figori` codec with platform controls, paths and shortcuts. Use a Windows build/acceptance host with MSVC Rust, Microsoft C++ tools and WebView2; cross-compilation is not runtime proof. [Prerequisites](https://v2.tauri.app/start/prerequisites/). A per-user NSIS installer is a reasonable first candidate; MSI adds Windows-specific tooling and is unnecessary without an enterprise deployment requirement. [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/).

## Joplin direction before a standalone Windows port

The user's next intended Windows route is Joplin, not a dedicated Figori installer. Plan a desktop Joplin plugin after the initial Joplin setup; this could serve macOS and Linux too. A separate web app or Electron shell remains a later option, justified only by an unmet workflow. Do not create either merely because the engine can run there.

### Editor MVP

Use explicit fenced `figori` blocks rather than evaluating a whole note. Ordinary numbers, dates, task lists and unrelated code must remain ordinary note content. Scope variables to each block; avoid invisible cross-note dependencies. Compute with the existing browser-compatible TypeScript engine and document model, with visible anchor/timezone/rate provenance.

Register a CodeMirror 6 content script, adding result decorations/widgets without writing generated answers into the note. Recompute changed blocks with revision checks, preserve editing/selection/Undo, and retain raw block source when the plugin is disabled. Joplin exposes `codeMirrorWrapper.addExtension`, plus message passing between content and main scripts. Use Joplin's CodeMirror instance instead of bundling a competing copy. [Official CM6 tutorial](https://joplinapp.org/help/api/tutorials/cm6_plugin/).

This is a feasibility-backed design, not an implemented plugin. A dedicated spike must prove multiline blocks, folded sections, note switching, alignment, theme integration and nonmutation. The native Rust/Tauri filesystem, rate cache and AppKit bridge cannot run inside a Joplin content script. Supply separate Joplin adapters; keep calculation semantics unchanged. Joplin explicitly restricts bundled native packages and provides limited desktop-only native access. [Plugin entrypoint API](https://joplinapp.org/api/references/plugin_api/classes/joplin.html).

### Rendered notes and interchange

Editor live results and rendered Markdown are different integrations. Add `MarkdownItPlugin` only after the editor MVP works; escape results and preserve the original source using Joplin's documented Rich Text round-trip metadata. Do not claim that editor decorations automatically appear in HTML/PDF exports or survive Rich Text editing. Test those surfaces independently. [Content script and renderer API](https://joplinapp.org/api/references/plugin_api/enums/contentscripttype.html).

Desktop `.figori` interchange is feasible through `joplin.interop.registerImportModule` and `registerExportModule`; these are host-driven import/export workflows, not Tauri file calls. Import as a new note/block, preserve the original file, and reuse the exact codec for metadata/IDs/source. Export one selected calculation block explicitly; an arbitrary multi-block note must not silently become one worksheet. A native `.figori` envelope inside the fenced block is a candidate for lossless interchange, subject to a fixture proving nested fences and exact body recovery. Do not invent a generic plugin `showSaveDialog`: the documented exporter supplies the destination context. [Interop](https://joplinapp.org/api/references/plugin_api/classes/joplininterop.html), [export module](https://joplinapp.org/api/references/plugin_api/interfaces/exportmodule.html), [import module](https://joplinapp.org/api/references/plugin_api/interfaces/importmodule.html).

### Scope and delivery gates

1. Confirm the user's installed Joplin version and active Markdown editor; use an isolated development profile before touching real notes.
2. Prove one explicit block with assignments, dates, units and nonmutating results. Compare the same fixtures against standalone Figori.
3. Add explicit Copy, context controls and offline rate status; any refresh requires a separate plugin-compatible network/cache adapter.
4. Prove `.figori` import/export with exact source and metadata before offering it as supported interchange.
5. Evaluate optional rendered-note results and mobile only after desktop acceptance.

Joplin's CM6 tutorial targets desktop and mobile, but that is not a promise that every desktop API transfers. `showOpenDialog` is desktop-only; import/export modules have no activation GUI on mobile. Android allows manual plugin installation; iOS permits only recommended plugins, so immediate private iOS delivery must not be promised. [Dialog API](https://joplinapp.org/api/references/plugin_api/classes/joplinviewsdialogs.html), [interop limits](https://joplinapp.org/api/references/plugin_api/classes/joplininterop.html), [plugin installation rules](https://joplinapp.org/help/apps/plugins/).

Revised order: Omarchy standalone acceptance → desktop Joplin block MVP → optional Joplin interchange/rendering → CachyOS/Ubuntu verification as needed. Native Windows, a web app and Electron remain deferred; Joplin provides the first opportunity to test whether another Windows application is necessary.

## Text worksheets and deferred preview direction

User clarification (2026-09-17): image support is **not a Figori feature request**. Keep the standalone product focused on text worksheets, calculation-aware highlighting and explicit export. Joplin is the intended host for surrounding notes and images, with Figori calculations integrated through the scoped plugin direction above.

A future Render/Preview may use a separate window or an external Markdown viewer. This is deferred exploration, not an approved implementation or a reason to embed an image editor, attachment manager or full notes system. Any later preview must remain distinct from editable calculation source and preserve document bytes and context; specify export/render fidelity separately before building it.

## Multi-instance recovery investigation

Current native code writes a single `recovery.json` per application-data directory (`src-tauri/src/lib.rs::save_recovery`). Each frontend serializes its own writes, but that queue does not coordinate separate application processes; the inspected startup has no single-instance plugin or interprocess recovery lock. Two copies running with the same bundle identity could therefore replace each other's recovery snapshot. Atomic file replacement prevents partial JSON, not this last-writer conflict.

This is a confirmed architectural risk, not proof that a particular user's edits were lost. Preserve recovery backups and avoid simultaneous copies during controlled upgrades. A future issue should compare single-instance activation/forwarding with per-window or per-session recovery ownership, including crash recovery and startup reconciliation. Do not silently overwrite an existing recovery to resolve a UI or identity ambiguity. No runtime behavior changes are authorized by this planning note.
