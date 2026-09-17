# My Numi v0 implementation contract

Status: user-authorized implementation, 2026-09-17. Stack: TypeScript, Temporal, Bun tooling. This is a product contract, not evidence of delivery.

## Outcome

A local-first calculator worksheet available through a macOS Raycast extension, a standalone CLI/TUI, and an Omarchy integration. Preserve Numi's convenient notation and plain-text files while deliberately improving calendar semantics. All surfaces use one evaluator. No LLM, JavaScript eval, cloud account, or mandatory background daemon.

## Boundaries and architecture

- Core is a pure TypeScript package independent of Bun APIs and UI frameworks; use a pinned, qualified Temporal implementation and exact decimal money arithmetic.
- Suggested packages: core, document, cli, terminal, raycast, omarchy. Use simpler structure if it preserves these boundaries.
- Raycast imports core directly. QML invokes our CLI over a versioned JSON protocol. CLI ships plain text and JSON modes; it must not imply upstream numi-cli has these modes.
- Forgejo is the canonical development, issues, PR, CI, and release platform. GitHub is an optional downstream mirror only, not a prerequisite or independent queue.
- Development is on the configured Maestro execution host/worktree. Do not install desktop extensions, alter machine services, change SSH, or deploy from implementation workers.
- Private user worksheets stay outside source control. Commit synthetic representative fixtures only. Never place personal dates, amounts, host paths, credentials, or private discussion in public artifacts.

## Evaluation model

Input: document text plus explicit context (clock, timezone, default anchor mode, rate snapshot, formatting preferences). Output: stable line identity, original source, expression, typed value when successful, formatted result, diagnostic when unsuccessful, and explanation metadata (resolved anchor, calendar/elapsed/billing basis, timezone and rate provenance).

Use one clock/rate context per document evaluation. An error on one independent line must not blank the document. Dependent lines receive dependency diagnostics. Reject invalid syntax and unsupported conversions rather than inventing numbers. Cancel or discard stale UI requests.

Core value categories include Decimal number, money, CalendarDate, ZonedDateTime/Instant, CalendarPeriod, ElapsedDuration, and anchored interval. Preserve interval endpoints until conversion/formatting so calendar months are not derived from a fixed seconds coefficient.

## Required expression families

- Arithmetic +, -, *, /, parentheses, natural logarithm (`16*ln(13)+31`), signed numbers, percentage basics, named variables and ordinary unit conversion.
- English month dates (`13 may 2022`), date plus time (`24 feb 2022 4:00 am`, `7 oct 2023 6:00am`, `27 dec 1969 10:00pm`). Parse explicitly; do not rely on implementation-defined Date.parse.
- `today`, `now`, `previous saturday 15:00`; date differences with grouping, nested arithmetic and `in years/months/weeks/days/hours`.
- Date + calendar years/months; date or datetime + days/hours with documented type-aware behavior.
- Currency notation `9000 nis`, `(7500+1655) nis`, and `in usd`; NIS and ILS share one ISO currency identity. Rates are injected/testable; live provider is an adapter, never part of parsing.
- Plain-text headings, blank lines, labels and comments; retain unsupported lines with diagnostics.
- The supplied private evidence contains 26 + 44 expression lines across two independent sheets. Cover all expression shapes; intentionally changed semantics must be documented, not forced to match historical RHS values.

## Calendar rules

1. Default calendar: ISO/Gregorian. Default timezone: Asia/Jerusalem, user-replaceable.
2. `today` is the local date, `now` the current instant represented in the selected timezone. Date-only subtraction returns calendar days without historical offset residue. Hours/seconds between instants are elapsed time.
3. Years/months are calendar operations. `13 may 2022 + 9 months` yields 13 February 2023. No blanket 365-day year or averaged month conversion.
4. Proposed explicit month-end behavior: constrain to the last valid day (31 January + one month => 28/29 February). For repeated billing anchors derive each occurrence from the original anchor, avoiding accumulating clamp drift. Invalid input dates must not silently normalize.
5. For unanchored `1 month in days` or `1 year in days`, default anchor is dynamic today. Always show the resolved date/timezone and allow replacement with a pinned date. Expression-specific override takes precedence over worksheet default. Persist dynamic versus pinned mode, not just the last resolved date. Re-evaluate dynamic sheets consistently after midnight/resume.
6. Mixed date-only and timestamp calculations explicitly indicate start-of-day promotion; do not silently discard the supplied time. Ambiguous local DST times must have a documented visible disambiguation rule or actionable diagnostic.
7. Timestamp `in days` exposes calendar-day versus 24-hour elapsed basis. Do not hide the choice in a coefficient. Calendar interval display in years/months/days remains anchored.
8. Proposed `previous saturday` meaning: most recent Saturday strictly before the reference local date; make this behavior visible/documented and test Saturday itself. If product review chooses a different rule, change fixtures and docs together.
9. Preserve signs for past/future intervals. Test zero, reversed endpoints, leap years, month boundaries, DST gaps/folds and historical offsets. Locale formatting must not change numeric semantics.

## Monthly rent/count policy

Rent uses whole billing months anchored at the start date, not necessarily the first day of the calendar month. Expose and persist an option to include or exclude the trailing incomplete month. At an exact boundary do not count an additional month; show both completed count and selected billed count. Excluding the incomplete period is a proposed initial UI selection, not a claim about law. No default fractional proration. Treat generic calendar interval conversion and monthly billing count as distinct typed operations/options. Adapt imported legacy fractional-month rent expressions transparently; never silently change their source. Calculate money exactly, round only for final presentation.

## Document and Numi compatibility

- Import both provided Markdown sheets independently, retaining headings, blank lines, source order and original text. Their trailing `= result` values are historical snapshots, not current truth.
- Support `.numi` UTF-8 plain-text import/export in the first document slice. No JSON envelope inside `.numi` files. Preserve original Unicode/newline style where feasible and do not overwrite the input file without an explicit save operation.
- Native `variable = expression` must remain an assignment. Distinguish it from captured Markdown `expression = old result`; never blindly split every line at equals.
- Keep original source plus an evaluation-normalized copy (NBSP/spacing, AM/PM forms). Headings with numbers, parentheses or slashes are not automatically expressions.
- App-specific anchor/timezone/billing/rate settings live in a versioned sidecar or application storage. Export reports which settings are not expressible in Numi. Unsupported syntax survives round-trip.
- Native Numi may compute dates differently; file compatibility is not numerical bug compatibility. Use documented optional variables/labels fixtures and verify reopening exported text in actual Numi during macOS acceptance.
- Stable user-data storage, atomic saves, recovery copy, explicit import/export and persistence after restart. v0 does not synchronize files across machines automatically.

## User surfaces

Raycast: Quick Calculate with current input/result and copy action; Saved Worksheets with list/result detail; multiline edit using supported Form components; explicit anchor and monthly count controls, refresh, errors and rate status. Do not promise a line-aligned editor gutter unsupported by Raycast's native UI.

Terminal: one-expression and document CLI; text/JSON output, deterministic context flags for tests; interactive worksheet editing/result view, keyboard navigation, copy, save/open and visible basis controls. A missing clipboard utility must not prevent evaluation or saving.

Omarchy: detect target capabilities/version. Current documented Shell Plugins use manifest.json and QML panel; invoke shared CLI for calculation without blocking the shell. For Walker installations provide a desktop entry/hotkey integration that opens the TUI in the user's configured terminal. Do not build a custom Elephant provider for v0. Package integration assets; actual desktop installation needs a separate concrete install step.

Currency: choose a documented provider supporting ILS/USD, record source/as-of time, use cached rate snapshots offline with visible staleness. Without a usable rate, show unavailable; never substitute zero or an invented exchange rate. Tests must be offline and use fixed snapshots. Live provider access should be independently verifiable without any user financial data.

## Delivery and acceptance

- Meaningful offline tests: typed semantics, calendar cases above, dependency errors, assignments, exact money, import/export preservation, metadata settings and subprocess protocol.
- Automated checks must run on the real execution surface using Bun. macOS-specific Raycast build/UI and Numi reopen acceptance are separate explicit evidence stages.
- Forgejo CI for lint/typecheck/tests/build with pinned compatible toolchain; document commands and release artifacts. Avoid GitHub-only APIs in worker scripts or gates.
- Release CLI artifacts for macOS ARM64 and Linux x86_64 first; retain a documented portable source path. Add other architectures only when validated. Package Raycast extension and Omarchy assets with their installation instructions.
- Each slice produces a real user action, not an empty scaffold. First core slice must calculate and explain a calendar expression through CLI. Subsequent slices add documents, currencies, desktop integrations, then release/acceptance.
- Definition of done: identical semantic outputs on target platforms for identical context; source survives reopen; UI exposes mutable anchors and monthly count mode; invalid lines remain recoverable; offline behavior is honest; supported Numi files round-trip. Build success alone does not prove desktop installation or UI acceptance.
