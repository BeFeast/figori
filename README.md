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
