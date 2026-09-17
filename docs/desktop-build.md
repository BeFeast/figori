# Desktop source build

The standalone Figori app uses a Tauri shell and the shared TypeScript evaluator.
This is an unsigned local application build, not a notarized distribution.
Raycast and Omarchy remain separate adapters.

## macOS requirements

Use an existing Apple Silicon macOS host with Xcode command-line tooling, Rust/Cargo
and Bun. The current build lane uses the existing Forgejo runner label `macos`
(host executor registration `macos:host`). It does not use GitHub-hosted runners,
install system packages or alter runner configuration.

Observed toolchain on 2026-09-17: Xcode 27.0, Rust/Cargo 1.96.1 and Bun 1.3.11.
The lockfile is authoritative for JavaScript dependencies. Toolchain availability
does not prove successful compilation or GUI acceptance of a particular revision.

## Local build

Run from the repository root:

```bash
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun install --frozen-lockfile
bun run --cwd packages/desktop typecheck
bun run --cwd packages/desktop test
bun run --cwd packages/desktop tauri build --bundles app
```

Tauri's before-build hook builds the frontend; no development web server is needed.
The application bundle is produced at
`packages/desktop/src-tauri/target/release/bundle/macos/Figori.app`.
Build does not install or launch it. Open that exact bundle for authorized local
GUI acceptance; keep an existing installed app and its user data untouched until
a separate delivery step.

## Manual Forgejo workflow

Dispatch `.forgejo/workflows/desktop.yml` against the revision to build.
There are no push, pull-request or scheduled triggers. The existing `macos` runner
checks its toolchain, installs only locked project dependencies, checks the
frontend, builds the app and uploads `figori-desktop-macos-arm64` using Forgejo's
artifact action. The artifact contains the zipped app, SHA256SUMS and full source
commit receipt, retained for 14 days.

This initial lane builds the local macOS target only. It does not provide code
signing, notarization or Linux desktop packaging. A workflow build alone does not
prove GUI acceptance; local acceptance evidence is recorded below. A running
runner process is separate evidence from a completed workflow run.

## macOS build and acceptance evidence

On 2026-09-17 the normal bundle command succeeded on Apple Silicon with the
toolchain above. Cargo's release build override sets `strip = "none"` for host
build artifacts, avoiding the misaligned proc-macro dylib described in
[Rust issue #157750](https://github.com/rust-lang/rust/issues/157750).
No external compiler flags, system changes or deployment-target reduction are
required by the recipe.

The resulting app was launched and checked on macOS: multiline paste and editing
recalculated 12 × 3 to 36 and 20 × 3 to 60; Undo restored 12/36. Date results aligned
with their source lines. Restart after a terminated test process restored unsaved
work. Parented native Open/Discard and Save As dialogs worked, and a synthetic
saved copy matched the original bytes. Captured historical results stayed hidden
while current results were evaluated. Explicit rate refresh cached the ECB
2026-09-16 snapshot and evaluated 100 ILS as 32.99 USD.

These checks cover the macOS source build. Linux standalone UI, idunn installation,
signing/notarization and a manual Forgejo desktop workflow run remain unverified.
