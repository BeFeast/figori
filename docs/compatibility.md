# Worksheet compatibility map

The private acceptance corpus comprises two independent worksheets with 26 and 44 captured expression lines. Private source and historical results remain outside this repository. This map records their expression families using synthetic fixtures; it is not a claim that upstream Numi evaluates dates identically.

| Expression family | Synthetic coverage / implementation | Evidence |
| --- | --- | --- |
| Arithmetic, parentheses, signs, logarithm, percentages | `-(2+3)*4`, `ln(1)`, `200 * 10%` | Core arithmetic tests |
| Calendar dates and English month spellings | `31 jan 2024 + 1 month` | Core month-end and invalid-month tests |
| Date + calendar months/years | Leap-day and month-end constrain semantics | Core calendar arithmetic tests |
| `today`, `now`, English AM/PM timestamps | Explicit clock and timezone; ambiguous/missing local time rejected | Core timestamp/DST tests |
| `previous saturday` plus local time | Strictly before the reference date, including on Saturday | Core relative-date test |
| Date/date and mixed timestamp/date subtraction | Endpoint-preserving intervals; mixed values promoted to local start of day | Core interval and historical-offset tests |
| `in years/months/weeks/days/hours` and nested conversions | Calendar months/years use endpoints; elapsed hours use instants | Core anchored conversion and DST tests |
| Currency amount, grouped amount, NIS/ILS alias, USD conversion | Decimal amounts, injected snapshot, source/as-of basis | Core money and rates adapter tests |
| Monthly rent from an interval multiplied by money | Explicit completed/include-partial policy, no hidden fractional proration | Core legacy rent and original-anchor billing tests |
| Native assignments, labels, named references, captured Markdown RHS | Document normalization separated from original source | Document parsing, dependency and source-fidelity tests |
| Headings, blank lines, punctuation and unsupported source | Preserved with line identities; unsupported expressions stay diagnosable | Document fidelity tests |
| UTF-8 `.numi` import/export and restart persistence | Plain text, separate versioned settings, recovery, refusal to overwrite by default | Document storage and CLI protocol tests |

## Deliberate differences from historical Numi results

- A year or month has no universal day coefficient. Calendar conversions resolve a visible dynamic-today or fixed anchor.
- Calendar additions constrain month-end rather than overflowing into another month. Repeated billing boundaries derive from the original anchor, avoiding accumulated clamp drift.
- Date-only subtraction counts calendar days without historical timezone residue. Timestamp conversion to hours is elapsed time; timestamp conversion to days is explicitly 24-hour units.
- Bare intervals show a human-readable calendar decomposition while retaining endpoints internally.
- Generic fractional calendar-month display is separate from whole-month billing. Legacy rent syntax retains its source but uses the selected billing count and explains that choice in the basis.
- Currency rates carry provider/date/freshness information; unavailable rates produce diagnostics. No invented default exchange rate is used.
- Imported historical `= result` text is evidence, not an assertion that a current recomputation must match.

The independently run private acceptance evaluates all 70 expression lines successfully with the selected context and injected test rates. That checks supported shapes, not historical numeric equality or installed desktop UI behavior. Automated tests use synthetic data only. Numi reopening and actual Raycast/Omarchy interaction remain separate target acceptance stages.

## Calendar-day questions

`days since DATE` and `days until DATE` count signed calendar days relative to actual local today in the selected timezone. `today to DATE` (or `DATE to DATE`) retains an interval, displayed as calendar years/months/days; append `in days` for a day count. A past target gives a negative `days until` result. Invalid dates remain errors.

A date-only expression followed by `in days` counts from the visible selected anchor to that date. For example, with anchor `2026-09-17`, `(10 dec 2010 + 16 years) in days` is `84 days`. Pinning the anchor changes this reference; it does not redefine `today`, `days since`, or `days until`. An omitted year comes from the selected anchor year without future-year rollover. Basis notes disclose these reference choices.

These counts use calendar dates across DST, not an assumed 24-hour elapsed day. A lone timestamp cannot implicitly convert to days; use an explicit timestamp range or subtraction to request elapsed-time conversion. Existing `in` syntax for quantities and currencies is unchanged. Core regression tests cover signs, leap dates, pinned anchors, DST, and invalid inputs.
