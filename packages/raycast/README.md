# My Numi for Raycast

Three commands share the calendar evaluator and document package:

- **Quick Calculate**: enter an expression, inspect result/basis, copy the result, and edit the date anchor, timezone and monthly-period policy.
- **Saved Worksheets**: open local sheets; edit, refresh, copy results/source, import Numi or captured Markdown, and export `.numi` text.
- **New Worksheet**: create a multiline sheet with a live result preview and persistent context settings.

## Development

Run from the repository root after installing workspace dependencies:

```sh
bun install --frozen-lockfile
bun run --cwd packages/raycast typecheck
bun run --cwd packages/raycast test
bun run --cwd packages/raycast build
```

The API dependency is pinned to Raycast 2.4.1. Raycast owns the React/Node runtime; the extension does not call Bun APIs. The source SVG and generated PNG icon are original geometric artwork.

## Data and context

Worksheets use the document packages atomic/recovery storage under Raycasts persistent `environment.supportPath/worksheets`. Import creates a new local document and never overwrites the input. Select the import interpretation explicitly: Numi preserves variable assignments, while captured Markdown recognizes historical right-hand results. Export refuses existing destinations and explains metadata that native Numi cannot understand. Optional sidecars retain My Numi settings.

Dynamic anchors resolve against one current instant and the selected IANA timezone, updating while the command is open. Pinned dates stay fixed. Monthly billing counts completed periods by default; the checkbox includes a trailing incomplete period. Results expose semantic basis and line diagnostics. Invalid dates and timezones prevent saving/evaluation, rather than silently normalizing them.

## Acceptance still required

A TypeScript/build pass does not establish desktop acceptance. On macOS verify all three commands, keyboard copy, multiline editing, reopen persistence, invalid input, midnight/resume refresh, native `.numi` reopen, and rate availability/offline status. No worker installs or modifies the live Raycast application.
