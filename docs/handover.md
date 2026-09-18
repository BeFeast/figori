# Figori engineering handover — 2026-09-18

## Start here

Figori by BeFeast is a local-first calculator worksheet. It grew from a Numi-like Raycast/terminal/Omarchy proposal into a shared TypeScript engine and standalone Tauri desktop app. The product site is [figori.befeast.com](https://figori.befeast.com); development is canonical on [Forgejo](https://git.oklabs.uk/BeFeast/figori), with [GitHub](https://github.com/BeFeast/figori) as the public downstream source/release surface.

This is a portable Codex/Claude handover, not permission to install, deploy, alter credentials or merge implementation. The private management home is Dev/Areas/figori in the operator's vault; resolve it through that vault's project index rather than assuming a filesystem path. Its optional private operator map is handovers/2026-09-18-desktop-release-operator-map.md. It records this work through the verified 0.3.8 delivery and separately identifies later work from another session. Refresh live state before acting: installed, built, tagged, publicly downloadable and GUI-accepted are different facts.

### Copyable next-agent prompt

> Read AGENTS.md and docs/handover.md first. Resolve the authoritative development checkout with the operator's private execution context; never infer a host from this public document. Inspect git status, remotes, current branch and upstream before changes. Forgejo is canonical and GitHub is downstream. Main currently contains docs/static content and older adapters, not the full standalone runtime; inspect feat/standalone-desktop and the exact target release SHA. Preserve other sessions' changes and user documents. Identify the focused issue and existing authorization/workflow before implementation. Read the linked subsystem contract and tests, then make the smallest owned change. Use synthetic fixtures only. Keep package version, source commit, artifact hashes, publication and actual UI acceptance separate. For Mac delivery use docs/macos-signing.md, the existing Developer ID/profile, and install only from the final notarized DMG. Do not rebuild or replace a release merely because its version is newest. Report concrete evidence, remaining limitations and exact links; update this handover when authorized.

## Branch and workflow contract

- **main is not the standalone runtime baseline.** Documentation, site and manual workflow registration have been selectively transferred to main without merging [PR32](https://git.oklabs.uk/BeFeast/figori/pulls/32). Never build a desktop release by defaulting to main.
- Runtime branch: feat/standalone-desktop. At this handover's initial inspection, 5410b147bdfc2376dc62e03e3a8fc5bb18bdade2 contained the Mac runbook over later-session 0.3.9/calendar changes.
- Work normally uses issue-driven Maestro. This session had an explicit direct-work bypass after Maestro's repo validation rejected Forgejo origins because its matcher accepted GitHub only. The defect was not fixed and no functioning Maestro worker was claimed. Do not generalize the bypass to unrelated work.
- Non-trivial work needs focused intake; public GitHub issues are crosslinked to canonical Forgejo implementation/acceptance issues. Existing [desktop #31](https://git.oklabs.uk/BeFeast/figori/issues/31), [platform acceptance #7](https://git.oklabs.uk/BeFeast/figori/issues/7), and [parity #33](https://git.oklabs.uk/BeFeast/figori/issues/33) remain the relevant umbrellas.
- Use the real development surface for edits/tests/commits. Mac-native build/UI/signing is inherently local when authorized. Host mapping and credential lookup belong to private operational context, not this public mirror.
- Safe fast-forward downstream sync only; no force push, tag movement, mirror deletion or implicit runtime merge.

## Architecture and ownership map

| Surface | Source / contract | Important boundary |
| --- | --- | --- |
| Typed evaluation | packages/core; [implementation contract](implementation-contract.md), [compatibility](compatibility.md) | No UI, network, arbitrary eval or LLM execution. Decimal money; Temporal calendar context. |
| Worksheet model/interchange | packages/document/src/index.ts, figori.ts, storage.ts and tests | Source, identity and settings survive; derived answers are not native-file truth. |
| CLI/TUI | packages/cli, packages/tui; [CLI releases](releases.md) | Plain/JSON evaluation and terminal editing are separate adapters, not a desktop UI. |
| Raycast | packages/raycast | Native List/Detail/Form interactions, quick calculation and saved worksheets; no arbitrary DOM gutter. Earlier preview does not imply every later desktop feature is installed there. |
| Legacy Omarchy panel | packages/omarchy | Quickshell QML adapter plus CLI JSON. Preserve old panel/data; it is not the standalone app. |
| Desktop frontend | packages/desktop/src/{main,model,operation,completion,markdown,typography,splitter}.ts and style.css | CodeMirror editor/results, operation serialization, context, completion and appearance; platform UI bridge is separate. |
| Native bridge | packages/desktop/src-tauri/src/{files,export,rates,recent,migration,menu,chrome,lib}.rs | Atomic/conflict-aware file operations, recovery, native dialogs/menu, cached rates, identity migration. |
| Branding/site | assets/brand, docs/branding.md, site/ | Figori identity, public synthetic screenshots/examples, static Pages delivery. |
| Distribution | scripts/package-macos-dmg.sh and Linux packaging/validation scripts; .forgejo/workflows | Exact source/artifact receipts; deployment and native acceptance are separate gates. |

## Product evolution and accepted semantics

The original two private Markdown calculation sheets contained 26 and 44 expression shapes. They were used as private intake, kept separate and excluded from public git, releases and screenshots. Historical right-hand answers were snapshots, not golden truth.

The first idea was to qualify upstream numi-cli as a shared backend. The user explicitly chose improved contextual date semantics instead of reproducing Numi's fixed-month behavior, so the accepted engine is TypeScript + Temporal with Decimal arithmetic. Numi remains the inspiration and interoperable text format, not the authoritative date engine. Preserve the README's link to [Numi](https://numi.app) and its original developer.

Calendar rules:
- Calendar dates, zoned timestamps, calendar periods and elapsed durations are different types. Years/months use calendar addition, including leap years and constrained month ends: January 31 + one month ends on February's last day.
- Unanchored month/year conversion defaults to visible local today; a sheet can pin an anchor. A month in days depends on that anchor, not 30 or 365/12 by default.
- Today is a local date; now is an instant. Explicit elapsed hours/seconds account for historical timezone/DST offsets. Do not silently discard time components.
- Rent counts whole periods anchored to rental start, with explicit include/exclude incomplete period. There is no hidden fractional-month proration or implied legal policy.
- Omitted years and month-only dates disclose assumed anchor year/day 1. Exact existing variables take precedence over date names. Since/until and date-range behavior is documented/tested; later-session timestamp grammar changes must be assessed at their own SHA.
- Calendar/elapsed results may be compact in rows and the first popup while exact detail/Copy exact result retains precision. Display formatting must not alter stored typed values.

Currency and parser work:
- USD/usd/$ and EUR/eur/€ aliases share typed ISO identity; ILS/NIS/nis/₪ display ₪. Canonical USD/EUR results use $/€; negatives retain conventional sign placement.
- Currency annotations and in/to conversion work consistently through document classification. A dimensionless amount converted to money must not silently assume ILS.
- Native ECB/Frankfurter refresh/cache supplies dated ILS-base USD/EUR/GBP values; errors and source/as-of remain visible. A legacy USD-only cache is not equivalent to a full refreshed snapshot. Provider refresh is explicit; no worksheet text is transmitted.
- English thousands grouping was fixed for inputs such as $2,659.57 to NIS. Malformed grouping and function commas require distinct grammar handling.
- Percentage metadata survives variables, unary operations, scalar arithmetic and serialized values. Covered cases include 15% of 490 = 73.5, 55 + tip_rate where tip_rate=25% = 68.75, and 55 + (25% * 2) = 82.5.
- Natural-language annotations are deliberately bounded; examples such as $3k earnings divided by 5 people and lunch was $55 + 25% tip do not establish arbitrary prose understanding. Misspelled variables must remain errors.

## Native files, imports and exports

The accepted .figori format is **raw worksheet text with TOML frontmatter**, not full-file JSON or full-file TOML:
1. Opening +++ line at the start of the file.
2. Versioned TOML metadata: format/schema_version/id/source_format/line_ids/settings.
3. Closing +++ line plus newline.
4. Raw worksheet body, preserved exactly, including leading/trailing blank lines, Unicode and mixed LF/CRLF.

See parseFigori/serializeFigori and tests in packages/document. Header formatting/comments normalize; worksheet bytes do not. Unknown fields, future schema versions, invalid/duplicate/mismatched line identities fail explicitly. Manual edits that change line count without updating identities are not silently rebound. No cached results or exchange-rate cache are stored as authoritative native-file answers. Appearance is app-level preference, not a promised native-sheet field.

Numi import/export is UTF-8 plain text with original assignments intact. Legacy Markdown captured RHS results are distinct from native assignments. Source labels/blank lines/Unicode remain; unsupported expressions produce diagnostics rather than disappearing. CLI sidecars and desktop .figori metadata are different storage contracts. Desktop export notices correctly tell users to keep .figori for settings.

Markdown headings, emphasis, lists, fences and thematic breaks remain source text, not rendered HTML. Fenced numbers/assignments are inert, including on Numi-origin worksheets; unterminated/variable-length fences are tested. Source-only Markdown export is exact; results export uses readable blockquote results/diagnostics that remain inert on import. Rendering preview/Joplin integration is deferred.

Legacy recovery without a format marker once displayed .figori frontmatter as raw calculation text. 0.3.2 was withdrawn; 0.3.3 fixed recovery compatibility. Do not remove migration paths merely because newly saved files work.

## Desktop UX and actual acceptance

Mac evolved from a web-like fallback into native toolbar/menu/Settings and a continuous CodeMirror worksheet. Lifecycle operations are serialized across startup/open/new/save/close/dialogs; dirty guards must work for Cmd-Q as well as the window close button. Preserve selection, Undo, scroll, source identity and recovery during asynchronous operations.

Observed Mac checks across delivered revisions included:
- Editing 12 × 3 to 20 × 3 recalculated 36→60, Undo restored 12/36.
- Unsaved recovery after process termination; Open/Discard and Save As; source bytes retained.
- Native .numi roundtrip into Numi; deliberate date-result differences remained visible.
- Currency refresh/offline metadata, native file opening, .figori recovery migration.
- Light/Dark warm H1→H6 hierarchy (largest most muted, smallest closest to body), bundled fonts and currency fallback.
- Recent list capped at 12, clear menu, deduplication/MRU and navigation both directions.
- Show in Finder selected the correct file; represented URL was verified, but exact titlebar Cmd-click gesture was not exercised.
- 0.3.6 large-font/zoomed-window Open/Recent alignment worked immediately without clicking the editor.

Current source typography contract (typography.ts): bundled JetBrainsMono Nerd Mono is the default, size16, line spacing1.9; normalization bounds size12–24 and spacing1.4–2.2. A dedicated Figori Currency font face precedes Nerd/system monospace because the Nerd font lacked the shekel glyph; bundled Heebo supplies UI/currency coverage. Keep font provenance/licenses and avoid assuming generic fallback fixes missing glyphs. Source and answer panes use a draggable, persisted split (default answer ratio0.34) with minimum widths; layout must stay aligned after font changes, resize and document replacement. Appearance and split preferences are app-level, not native worksheet metadata. Warm heading colors monotonically approach body text from H1 through H6 in both themes.

These are revision-specific observations, not proof that a future installed app is identical or every interaction is covered. Use synthetic fixtures for future evidence and never publish private document content.

Linux received platform Ctrl labels, working Appearance dispatch/focus/Escape, compact chrome instead of duplicated title/menu bars, retained window actions and a matching figori-desktop launcher/icon identity. Browser layout checks covered large fonts and small windows. Native Omarchy launch was mapped Wayland with expected class, dependencies resolved and clean runtime log. Full interactive Linux popup/theme/file-workflow acceptance was not completed by the package smoke tests.

## Release and verification ledger

| Version / target | Immutable source | Verified boundary |
| --- | --- | --- |
| 0.1 previews: CLI/Raycast/QML | See [earlier release notes](releases.md) | Earlier adapters implemented/installed where explicitly recorded; not current desktop feature parity. |
| 0.3.0 Mac ZIP | Historical [publication record](desktop-release.md) | Unsigned experiment; never current signing instructions. |
| 0.3.2 Mac | Historical tag retained | Withdrawn recovery regression. Historical session report: Forgejo draft retained; user deleted the GitHub release. Do not recreate/reuse it. |
| 0.3.3–0.3.5 Mac | Respective release SOURCE_COMMIT | Recovery, Markdown/native UX, grouped-number fixes; see immutable release notes for each acceptance limit. |
| **0.3.6 Mac ARM64** | 446c32d33ec828e5294659a6abc203e160eb96e1 | Developer ID app+DMG notarized/stapled; Gatekeeper and installed alignment acceptance. Remains pinned website Mac preview. |
| **0.3.7 Linux x86_64 tar** | afd139d374642e49dd506f22057289e514d0334b | Omarchy reversible user install, matching icon/desktop identity, exact binary Wayland launch; dynamic libraries required. |
| **0.3.8 DEB/RPM** | 95307fffc71f0f909ff894672619bee3c9811ca6 | Ubuntu24.04 and Fedora44 package matrices plus independent CI137. Details below. |
| **0.3.9 other-session work** | Annotated tag peels to 9a5dadabace7c531039afc318ab4662b4877bdbc on both hosts | Live audit found Forgejo 11 assets including Mac DMG; GitHub 8 Linux assets without Mac DMG. Operator separately verified installed Mac0.3.9 Developer ID/team and notarization. Full GUI acceptance is not inherited from0.3.6. |

At handover, the website still pins Mac0.3.6 / DEB-RPM0.3.8 / tar0.3.7. The 0.3.9 Forgejo ACCEPTANCE text still says no macOS build despite its later Mac assets: this is a reconciliation task, not permission to republish or overwrite artifacts. A separate active completion/datetime fix checkout exists; coordinate before changes. The earlier observation of an ad-hoc installed0.3.9 was superseded by the operator's later signed-install verification.

0.3.8 exact published package hashes:
- DEB: 8702fda17852c02d27de37ca8d31afb43a984175465c54d481876e7a10f44829.
- RPM: c4f50bc6366879604c180b4666e42ddb1988265aff104fb45da4d1f322beccc0.

[Forgejo 0.3.8](https://git.oklabs.uk/BeFeast/figori/releases/tag/v0.3.8) and [GitHub 0.3.8](https://github.com/BeFeast/figori/releases/tag/v0.3.8) anonymous downloads matched these hashes. Exact published packages passed fresh install, reinstall, distinct development-0.3.7→0.3.8 upgrade, dependencies/desktop/icon checks, headless X11 IsViewable window with live process, uninstall preserving synthetic data and prior launcher/CLI. The predecessor was a development native package, not a historically published DEB/RPM.

[CI137](https://git.oklabs.uk/BeFeast/figori/actions/runs/137) independently built/tested the exact source on the existing heavy runner. Do not assert its package bytes equal the separately published build without comparing hashes. Baseline was pinned Ubuntu22.04 snapshot, Rust1.96.1 and Bun1.3.14; measured ELF highest GLIBC symbol2.34, declared floor2.35. Debian and other distributions were not tested. AppImage was explicitly deferred.

[Linux archive install](linux-install.md) and [DEB/RPM installation](linux-packages.md) cover rollback/dependencies. System packages install /usr/bin/figori-desktop; a prior user wrapper/desktop entry can override them. Never silently delete user files to switch channels.

## Signing, distribution and site operations

[macOS delivery runbook](macos-signing.md) is the single current build→Developer ID→both notarizations→verification→safe install→publication procedure. Existing identity/profile are recorded there; do not recreate/export credentials. Crucial: the script signs a staged copy, so **install only from the final notarized DMG**, not the original Tauri build bundle. A later installed ad-hoc app does not invalidate an earlier signed DMG, but it is not a signed installation.

[Desktop publication](desktop-release.md) defines immutable tags/assets and allowed public receipts. Notary JSON, credential material, private inventory and personal worksheets stay out. Preserve platform-specific preview versions: Mac0.3.6, Omarchy tar0.3.7, DEB/RPM0.3.8 are distinct downloads. No implementation merge is needed to publish docs/static updates.

Figori's approved folded-F identity now uses the HedRoom-derived charcoal/off-white/warm-red palette; see [branding](branding.md). Older cobalt/lime exploration is historical. BeFeast is the product brand; don't rename compatibility storage IDs without a migration.

The portable [site release runbook](site-release.md) distinguishes SITE_SHA from runtime SOURCE_COMMIT. Release-upload helpers used during this session were external temporary tools, not a promised tracked repo API. The static [site](../site/README.md) uses Cloudflare Pages project figori, custom domain figori.befeast.com, no analytics/cookies/client dependencies. Actual native screenshots show public synthetic consulting/travel/calendar worksheets. All three downloadable .figori examples are linked; fixture rates are synthetic and may differ from live screenshots.

A returning-browser bug showed new HTML with old four-hour-cached CSS. Main commit1b36cf0f4b3a0e74c899967d086a3bd9240d3a0c changed the href to style.css?v=67212d18e937 (CSS content hash prefix). Actual browser reload then showed three package cards at1280px; mobile390px had no overflow. Change that hash when CSS changes, verify returning-tab behavior, and deploy from authoritative main static content. Normal bunx Wrangler works; forcing --bun previously exited during upload without a completed deployment. Never infer successful production deployment from uploaded assets alone.

## Open work and next priorities

- Full Soulver parity remains a requested roadmap, not a completed claim: [inventory](soulver-parity.md) and canonical #33. Multi-word/global variables, stable semantic line references, totals/tags, broad units/functions, automation/export, sync/mobile and Studio require scoped acceptance.
- Raycast and legacy QML adapters remain separate products/snapshots. Historical session report: a later user choice disabled the Raycast extension in favor of the built-in mini calculator; this handover does not claim its current runtime state. Revalidate shared-engine/file version compatibility before upgrading them.
- Linux actual interactive Wayland workflows need more acceptance beyond mapped launch/headless package tests; [GitHub #2](https://github.com/BeFeast/figori/issues/2), Forgejo#31/#7 carry the boundary.
- DEB/RPM delivery [Forgejo #46](https://git.oklabs.uk/BeFeast/figori/issues/46) / [GitHub #3](https://github.com/BeFeast/figori/issues/3) completed for Ubuntu24.04/Fedora44. AppImage, Debian acceptance, ARM Linux, Windows/mobile and wider portability are deferred.
- Markdown rendered preview (optional separate window or renderer app), Joplin integration and image features are proposals, not delivered behavior. The accepted planning direction is Joplin desktop integration first for the Windows use case, rather than an immediate standalone Windows port. [Platform plan](platform-plan.md) is a dated planning snapshot; later release evidence above supersedes its old “Linux not launched/Ubuntu later” statements.
- Refresh the later-session0.3.9 source/releases/installed state before continuation. Do not touch a running app, unsaved document, ongoing signing job or draft because an older handover suggests another version.
- No full fresh-machine Mac/quarantine test or complete cross-platform conformance suite is claimed. Named tool/tests/CI success is not a substitute for requested UI evidence.

## How to extend this record

Keep code-project knowledge in repository docs, not private agent memory. Update narrow runbooks/contracts with new facts and link them here rather than duplicating commands. Add exact source/artifact/verification evidence and distinguish implementation, deployment and acceptance. Public docs must remain safe to mirror; keep private execution maps and credential retrieval references in their authorized private home.
