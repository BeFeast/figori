# Figori for Raycast

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

Worksheets use the document packages atomic/recovery storage under Raycasts persistent `environment.supportPath/worksheets`. Import creates a new local document and never overwrites the input. Select the import interpretation explicitly: Numi preserves variable assignments, while captured Markdown recognizes historical right-hand results. Export refuses existing destinations and explains metadata that native Numi cannot understand. Optional sidecars retain Figori settings.

Dynamic anchors resolve against one current instant and the selected IANA timezone, updating while the command is open. Pinned dates stay fixed. Monthly billing counts completed periods by default; the checkbox includes a trailing incomplete period. Results expose semantic basis and line diagnostics. Invalid dates and timezones prevent saving/evaluation, rather than silently normalizing them.

## Acceptance still required

A TypeScript/build pass does not establish desktop acceptance. On macOS verify all three commands, keyboard copy, multiline editing, reopen persistence, invalid input, midnight/resume refresh, native `.numi` reopen, and rate availability/offline status. No worker installs or modifies the live Raycast application.

## macOS developer installation

With the matching Raycast application available, the operator can run:

```sh
bun run --cwd packages/raycast dev
```

This invokes Raycast's supported development workflow and imports the extension into the desktop application. It is an operator installation step, not part of CI or worker verification. Distribution output is written explicitly to `packages/raycast/dist`; all three bundled commands and icon assets are included.

Exchange rates are loaded from the shared rates package's local cache. **Refresh Exchange Rates** performs the explicit provider request; no rate request sends worksheet content. Fresh/stale/unavailable state, source, as-of date and refresh failures remain visible. Refresh failures retain usable cached rates and do not masquerade as a successful refresh.

Export supports both Numi plain text and the original Markdown source. Neither overwrites an existing destination. Markdown source export does not carry application metadata; Numi export can include a separate Figori sidecar.

## Branding and existing data

The visible product name and icon are Figori. The Raycast extension identifier intentionally remains `name: my-numi`, and command names remain unchanged. This keeps the existing `environment.supportPath`, saved worksheets and local quick-calculation settings in place; branding does not create a new extension or migrate files. Native Raycast typography and controls are retained. The icon uses Figori cobalt `#284BFF` and lime `#DDFC45`; calculation text follows Raycast accessibility/theme choices. References to Numi describe the original file format and compatibility only.
