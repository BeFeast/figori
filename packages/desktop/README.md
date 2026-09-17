# Figori desktop

A Tauri 2 desktop window with a continuous CodeMirror 6 worksheet. The editor supports normal selection, undo, multiline paste and wrapped lines. The result gutter is part of the same CodeMirror scroller and uses native line geometry. Captured historical right-hand results are visually collapsed with atomic decorations; original source bytes stay in the document and file. Click a result for full precision, context, captured output and copy.

Open, Save, Save As and New use native dialogs and Cmd/Ctrl+O, S, Shift+S and N. Drop a file on the window to open it. Unsaved work has recovery storage; closing or replacing it prompts to save, discard or cancel. Saving detects external source changes through a hash. The filename and dirty state appear in the window title. Date anchor, timezone, billing and appearance are in the context dialog; decimal precision affects result display only. Exchange rates use an explicit Refresh action and show unavailable/stale status.

## Development

From the repository root:

```sh
bun install --frozen-lockfile
bun run --cwd packages/desktop typecheck
bun run --cwd packages/desktop test
bun run --cwd packages/desktop build
bun run --cwd packages/desktop tauri dev
```

No frontend server is needed: Bun compiles static browser assets into `dist`, loaded inside the native Tauri window. Core and document evaluation run as bundled TypeScript; filesystem operations and rate fetching use narrow native commands. There is no bundled Bun runtime or shell evaluation in the application.

For distribution on the matching build host, run `bun run --cwd packages/desktop tauri build --bundles app` on macOS, or the selected Linux bundles after verifying their system prerequisites. Building does not install the application. Final acceptance requires actual desktop editing, aligned scrolling, save/reopen, conflict detection, recovery and file-open tests on both target platforms.

The editor suggests prior worksheet variables and supported date phrases, units, currencies and functions while typing. Ctrl-Space opens suggestions explicitly; Tab accepts a suggestion. Arrow keys select a suggestion and Enter accepts that explicit selection; otherwise Enter keeps inserting a new worksheet line. Variable suggestions show their current value without saving or fetching rates.

Currency names are case-insensitive (`usd`, `USD`, `EUR`); results use familiar symbols (`$`, `€`, `£`, `₪`) while the calculation retains ISO currency codes. Both `10 USD in EUR` and `10 USD to EUR` use the explicit cached rate snapshot. Refresh rates when the cache lacks a currency.

Appearance (toolbar sliders icon) controls theme, bundled JetBrains Mono Nerd Font or system mono, text size and line spacing. Preferences stay local and never modify worksheet content or its dirty state. Source and results share typography and refresh their measured alignment after changes. Nerd Font files are bundled offline with their licenses; system fallback renders additional scripts and the shekel symbol.

## Desktop interaction patterns

The worksheet remains the single job of the window, following Soulver's focused editing model. On macOS, AppKit provides the real SF Symbols toolbar and native Settings window (Cmd+,); the frontend hides its Linux fallback only after the native bridge confirms attachment. Settings changes arrive through figori-appearance and persist as local preferences without modifying the worksheet.

Result details borrow the compact, contextual disclosure pattern of CleanShot: a non-modal panel beside the selected result, with Copy and Escape, without a full-window scrim. Calculation context is also a compact non-modal panel. HedRoom's colors remain; MacPaw-inspired grouping does not add dashboards or sidebars. Reduced Motion disables frontend motion. Native controls supply platform accessibility; worksheet result buttons retain descriptive accessible labels.

### macOS UI acceptance bar

Use native AppKit controls first for window chrome, Settings and menus, with consistent SF Symbols, accessible labels and Reduced Motion support. Keep the main window focused on one worksheet. Do not add browser-style path tooltips, full-workspace modal scrims or generic web forms to replace native controls. Editor-specific result disclosures must stay compact and contextual. Review actual light and dark screenshots, keyboard navigation and typography alignment before delivering UI changes; a passing build alone is not visual acceptance.

### Markdown source and export

Open `.md` files to use Markdown worksheet mode: prose and fenced code stay unevaluated while calculator expressions outside fences retain live results. The editor highlights headings, list markers, emphasis and code without rendering or hiding Markdown syntax. Existing `.numi` files keep their compatible calculation semantics. Source bytes, editing and Undo remain intact.

File → Export Markdown writes a separate `.md` copy through the native save dialog; Export Markdown with Results also adds readable, inert quoted results. Neither export changes the current file, dirty state or save destination. Export does not embed timezone/anchor/billing metadata. Worksheet columns use subtle contrasting surfaces, with a resize handle shown only on hover or keyboard focus.

## Native .figori documents

New worksheets save as `.figori`: TOML frontmatter between `+++` delimiters followed by the exact, unescaped Markdown worksheet source. Versioned metadata retains document identity, line identities, source syntax and calculation context; derived results are recalculated. New documents use Markdown semantics. Imported `.numi` files retain their compatible syntax mode.

Opening `.numi` or `.md` imports an unsaved native document, retaining the original filename as the suggested `.figori` name without making the original a save destination. Legacy recovery snapshots are detached from interchange originals on upgrade. Explicit Numi/Markdown exports remain separate, and never change the active save destination. Native saves hash the complete physical file for conflict checks; recovery retains source, settings and identity. Changing context does not recreate line IDs. Existing line matching during arbitrary duplicate-line rearrangements remains heuristic; stable serialization is not a promise of semantic identity across every reorder.

## Publisher

Figori is a BeFeast product. Its designated public website is [figori.befeast.com](https://figori.befeast.com), with [GitHub](https://github.com/befeast/figori) intended as a downstream public mirror. [Forgejo](https://git.oklabs.uk/BeFeast/figori) remains the main development repository. Deployment of those public destinations is separate from application branding.
