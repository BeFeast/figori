# Agent instructions

## Workflow

Implement accepted, bounded issues through the project's Maestro workflow. Inspect `git status --short --branch` before edits. Other workers may be active: preserve their changes and coordinate ownership. Use focused branches and pull requests; do not merge or change orchestration policy without the owning workflow's authority.

## Stack and product contract

- Shared engine: TypeScript and Temporal. Use Bun for JavaScript/TypeScript dependency management and scripts.
- Keep engine semantics separate from Raycast, terminal, and Omarchy UI adapters.
- Calendar arithmetic is contextual. Distinguish date-only values, zoned instants, elapsed time, and calendar durations. Cover leap years, month-end behavior, and daylight-saving transitions in meaningful tests.
- Date-dependent unit conversions default to today with visible, editable date and timezone context; worksheets retain the chosen dynamic or fixed policy.
- Rent calculations use whole periods anchored to the start date, with an explicit include/exclude choice for a partial period.
- `.numi` import/export is UTF-8 plain text. Do not infer compatibility with undocumented formats or silently discard worksheet text.

## Evidence and boundaries

- Read the issue acceptance criteria before implementation. Add meaningful behavioral tests for engine and persistence changes, including negative cases; avoid tests that merely mirror implementation.
- Keep code, comments, commit messages, and pull requests in English.
- Never commit raw personal worksheets, private financial calculations, credentials, host inventory, or machine-specific paths. Use sanitized synthetic fixtures.
- Do not install into live user applications, deploy services, modify host configuration, or restart services as part of a coding issue. Those steps require a separate explicit delivery scope.
- Report verified results separately from assumptions and unverified UI behavior. Passing tests alone do not establish acceptance in the actual target application.

## macOS delivery entrypoint

Read [docs/macos-signing.md](docs/macos-signing.md) before Mac build/sign/install/publication work. Use the existing Developer ID identity and notary profile; never silently fall back to draft. Packaging signs a staged copy: install only from the final notarized DMG. Main may contain documentation without desktop runtime; use the exact approved source SHA.

## Engineering handover — 2026-09-18

Start with [docs/handover.md](docs/handover.md) for the portable Codex/Claude continuation prompt, subsystem map, release evidence, source/site branch split and remaining acceptance. Refresh later-session0.3.9 state before acting; documentation does not authorize installation or an implementation merge.
