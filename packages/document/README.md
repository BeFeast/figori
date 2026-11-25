# Worksheet documents

This package preserves calculator source separately from evaluation and UI state.
It has no runtime dependencies. The evaluator is injected; no source is executed as
JavaScript or shell code.

## API

- `importDocument(source, {format, id?, settings?})` creates an independent worksheet.
  Specify `markdown` for Markdown export behavior and `numi` for native plain text.
  Both formats recognize unambiguous captured `expression = result` lines.
- `updateDocument(document, source)` keeps unchanged/moved line identities and
  reuses identities for edited lines. Duplicate lines retain occurrence order.
- `evaluateDocument(document, evaluateExpression, context)` resolves assignments
  sequentially and passes a shared clock and variables to the injected evaluator.
  Failed assignments invalidate dependents while independent lines still run.
- `serializeNumi(document)` returns `{text, warnings}`. Native Numi imports round-trip
  exactly, including Unicode, BOM, blank lines and newline endings. Markdown export
  removes captured historical RHS values but preserves other original source.
- `Worksheet.settings` holds `timezone`, `anchor: {mode: "today" | "fixed", date?}`
  and `billing: "completed" | "include-partial"`. Rates are evaluation context,
  not silently fetched by this package.

In both formats, `price = 25` is an assignment; `price * 4 = 100`
contains a historical result. `next = price * 5 = 125` combines both.
Reserved `today` and `now` on the left identify captured expressions.
A bare identifier with a single equals is inherently ambiguous and deliberately
uses assignment semantics. The original source always remains available.
Explicit Markdown headings, plain headings such as `Budget 2031/2032 (example)`,
blank lines and comments survive. Source that is expression-like but unsupported
is evaluated for diagnostics instead of discarded. Line normalization affects
evaluation only (nonbreaking spaces and compact AM/PM times).

## File storage

Import from `@my-numi/document/storage`:

- `importFile(path, {format?, settings?, readSidecar?})` reads strict UTF-8 without
  modifying input. Defaults to Markdown for `.md`, otherwise Numi.
- `saveDocument(document, {directory})` atomically writes an app-owned snapshot,
  returning `{path, recoveryPath}`. It never targets the import path.
- `loadDocument(id, {directory})` returns `{document, recovered}`; a corrupt
  primary falls back to the previous validated snapshot. Show recovery in the UI.
- `listDocuments({directory})` returns id, title, format, updatedAt and recovered.
- `exportNumi(document, path, {overwrite?, sidecar?})` defaults to refusing any
  existing destination and writing an accompanying `.my-numi.json` sidecar.
  It returns paths plus compatibility warnings. `overwrite: true` is an explicit
  save operation and preserves an existing plain-text recovery copy.

App snapshots use schema version 1 and contain original source, settings, line
identities and a source checksum in one atomic JSON replacement. A previous
snapshot is independently retained as `.recovery.json`. Files use mode 0600.
A per-document lock refuses concurrent writers. An interrupted process may leave
a `.lock` directory: after confirming no writer is active, the owner may remove
that empty directory and retry. Never remove another process's live lock.

The exported Numi file is plain text, never a JSON envelope. Sidecar version 1
contains the document id, source checksum, settings and line ids. Text and sidecar
are individually atomic, not a cross-file transaction; after interruption a
checksum mismatch fails visibly. Explicit `readSidecar: false` recovers the text
without applying potentially stale settings. No automatic file synchronization
is provided.

Numi does not carry Figori anchor/timezone/billing policy in its text format.
Text interchange does not imply numerical calendar compatibility. Reopening the
export in actual Numi is a separate macOS acceptance step.

Run `bun test packages/document` from the repository root. Fixtures are synthetic.

Saved worksheets are reparsed from their preserved source when loaded. Old imported rows with stale `= result` parsing therefore recover without re-import, source rewriting, or changes to line identities. Historical results remain metadata, never assertions that the current result must match.
