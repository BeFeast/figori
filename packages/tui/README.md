# Terminal worksheet

A keyboard-driven source editor with live results, line diagnostics, persistent
worksheets and visible calendar/currency context. It imports the shared core,
document and rates packages directly. No daemon, network connection or clipboard
utility is needed for ordinary calculation and saving.

From source: `bun run --cwd packages/tui start`.
Build the standalone executable: `bun run --cwd packages/tui build`, producing
`dist/figori-tui`. The unified CLI exposes the same view with `figori --tui`
once integrated. `runTui({directory?, source?, format?, id?})` is the adapter API.

The default worksheet directory is `$FIGORI_DATA_DIR`, then legacy `$MY_NUMI_DATA_DIR`, otherwise
`$XDG_DATA_HOME/my-numi/worksheets` (falling back to
`~/.local/share/my-numi/worksheets`). Rates use its `rates/` subdirectory.

| Keys | Action |
| --- | --- |
| Arrows, Home, End | Move through source |
| Enter, Backspace, Delete, Tab | Edit text; paste Unicode/multiline text |
| Ctrl+S | Save to app-owned storage |
| Ctrl+O | Choose saved worksheet by displayed number or id |
| Ctrl+L | Import a UTF-8 .numi or captured .md file |
| Ctrl+E | Export plain .numi plus settings sidecar; refuses an existing path |
| Ctrl+N | Save current changes, then start a new worksheet |
| Ctrl+A | Choose dynamic today or a fixed YYYY-MM-DD anchor |
| Ctrl+T | Change IANA timezone |
| Ctrl+B | Toggle completed versus include-partial monthly billing |
| Ctrl+R | Explicitly refresh ECB exchange rates |
| Ctrl+Y | Copy current result |
| Ctrl+Q / Ctrl+C | Save changes and exit |
| Ctrl+D | Exit immediately, discarding unsaved edits |
| Escape in a prompt | Cancel prompt |
| Ctrl+U in a prompt | Clear existing prompt text |
| Enter in a prompt | Apply input |

The editor shows source/results side by side and scrolls with the cursor. At least
40 columns and 10 rows are required; a resize redraws the current state. Native
Numi source keeps its line ending style. Terminal control characters in pasted
input are removed; imported source remains intact but is sanitized for display.
Unicode source is preserved and supplementary characters are not split by
cursor movement or deletion. Display width is approximate for complex emoji
sequences and bidirectional text; this is a compact v0 editor, not a full editor
with selections, syntax highlighting or undo history.

Open/import/new save the current dirty worksheet first; imports never overwrite
the input file. Export uses the document layer's refusal/recovery rules. If save
fails, the application remains open with the error; Ctrl+D is the explicit way
to leave without saving. Recovery loads are identified visibly.

A change is evaluated synchronously against one current context; there is no
background calculation response that could overwrite a later edit. Currency
refresh evaluates the latest source when the request completes and ignores late
responses after exit. A minute timer and session resume refresh dynamic date
context while the application is running. Source, policies and line identity
persist; generated historical results are not treated as truth.

Clipboard uses `pbcopy` on macOS or `wl-copy` / `xclip` on Linux. If these are
missing, results remain visible and export/save still work. Rates load from cache
offline. Ctrl+R sends only the public ILS/USD currency pair; status and as-of date
remain visible, including stale/offline failures.

For screen readers, redirected input or environments without a compatible TTY,
use the CLI plain-text or versioned JSON document operations. The editor fails
clearly on non-TTY invocation rather than emitting terminal escape sequences.

## Verification

Run `bun test packages/tui` and `bun run --cwd packages/tui typecheck`.
Tests cover source edits replacing dependent results, Unicode/CRLF, diagnostics,
settings, offline currency handling and persistence. On Linux, a real PTY test
using util-linux `script` types an expression, saves, exits with status 0, starts
a new process and reopens the saved source. The test is skipped on macOS because
the system `script` command has different flags; manual native acceptance remains
a separate check.

Manual compiled Linux executable smoke also verified assignment/dependent result,
a pinned leap-year month resolving to 29 days, monthly-policy toggle, save,
plain Numi export with sidecar, and reopen in a different terminal size. Synthetic
worksheet data only was used. This does not establish Raycast or Omarchy desktop
installation.

Figori uses a small ANSI bright-green header accent (a terminal-native approximation of the lime brand accent) and the terminal’s own font. Set `NO_COLOR` (including an empty value) to disable the accent. Existing worksheet paths and `.numi.my-numi.json` sidecars remain compatible.
