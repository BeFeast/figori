# my-numi

A local-first, Numi-like calculator with a shared TypeScript engine, a Raycast extension, a standalone terminal interface, and an Omarchy integration.

## Accepted direction

- Use TypeScript and Temporal for the shared calculation engine, with Bun for development tooling.
- Treat calendar dates, zoned instants, and durations as distinct values. Calendar months and years must not silently become fixed day counts.
- Default date-dependent conversions to today with a visible anchor date and timezone, allowing a fixed date to be selected and saved.
- Count rent in whole months with an explicit choice to include or exclude the partial current period.
- Support UTF-8 `.numi` worksheet import and export; preserve user text and keep personal worksheets private.
- Reuse one calculation contract across Raycast, terminal, and Omarchy surfaces.

This repository is bootstrapped for issue-driven implementation. No product engine or interface has been implemented yet.

## Development and CLI

Requires Bun 1.3.14. Install dependencies with `bun install --frozen-lockfile`, then run `bun run typecheck`, `bun test`, and `bun run build`.

```sh
bun run cli --json --now 2024-02-01T10:00:00Z '13 may 2022 + 9 months'
bun run cli --anchor 2023-02-01 '1 month in days'
bun run cli --timezone America/New_York '(11 mar 2024 00:00 - 10 mar 2024 00:00) in hours'
bun run cli --billing 2024-01-31 2024-03-30 --include-partial
```

The built portable Bun entrypoint is `dist/index.js`. JSON output uses protocol version 1 and exposes the value, diagnostics, anchor, timezone, and explanatory notes. `--rates snapshot.json` injects an offline snapshot shaped as `{ "base": "USD", "rates": { "ILS": "3.7" }, "source": "synthetic", "asOf": "2024-02-01" }`; the core never fetches rates. Without a rate snapshot currency conversion fails explicitly. Money arithmetic keeps decimal precision and rounds only its displayed result.

Date-only differences use calendar days. Timestamp differences use elapsed time; timestamp conversion to days means 24-hour units and says so in the result basis. Mixed date/timestamp differences promote the date to local start of day visibly. Calendar month/year conversions retain endpoints and express any fractional remainder against the adjacent anchored period. This is distinct from `--billing`, which counts whole anchored months with optional inclusion of the trailing partial period. Missing or ambiguous local DST times produce an actionable diagnostic. `previous saturday` excludes today even when today is Saturday.

Core v0 limitations: no compound/inverse units, no fractional calendar additions, no automatic currency provider, no implicit proration, and no timezone-locale date parsing beyond the documented English/ISO forms. Unsupported syntax produces a diagnostic. Desktop integrations and worksheet persistence are separate packages; this slice alone does not establish installed UI acceptance.
