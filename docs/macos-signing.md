# macOS build, signing and delivery

This is the current end-to-end runbook. A finished installer is a **Developer ID signed, notarized and stapled app inside a signed, notarized and stapled DMG**. Unsigned CI archives and draft DMGs are not substitutes.

## Source and existing credentials

Forgejo is canonical; GitHub is downstream. Desktop runtime currently lives on **feat/standalone-desktop**, not main. Main contains documentation without the complete runtime. Use a dedicated clean Mac checkout of the approved full source SHA; do not reset another session's checkout.

Verified on 2026-09-18:
- Identity: **Developer ID Application: Oleg Kossoy (LA9V2K2376)**, valid with its private key.
- Existing notarytool profile: **Figori-Developer-ID**, authenticated history request successful.
- Active Xcode: /Applications/Xcode.app/Contents/Developer.
- Observed Mac tools: Bun 1.3.11, Rust/Cargo 1.96.1; record Xcode version from the preflight below. Linux's Bun 1.3.14 pin is not a claim about the historical Mac build.

Do not recreate certificates, export private keys or provision a new profile when these work. Missing credentials are a release blocker, never permission to silently fall back to draft mode. No keychain changes are part of this recipe.

## Preflight and exact-source build

Run all shell snippets in the **same dedicated Bash session** (start bash first), with set -euo pipefail as shown; do not paste them into an arbitrary default zsh session. Keep the session variables between stages.

Set SOURCE_SHA to the approved 40-character commit. For historical reproduction only, macOS 0.3.6 used **446c32d33ec828e5294659a6abc203e160eb96e1**. A newer Linux version does not establish a new Mac release.

```bash
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
test -z "${CARGO_TARGET_DIR:-}"
git fetch origin --tags
git status --short --branch
test -z "$(git status --porcelain)"
: "${SOURCE_SHA:?Set the approved full source SHA}"
git checkout --detach "$SOURCE_SHA"
test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
xcode-select -p
xcodebuild -version
xcrun --find clang
bun --version
rustc --version
cargo --version
security find-identity -v -p codesigning
xcrun notarytool history --keychain-profile Figori-Developer-ID --output-format json
bun install --frozen-lockfile
bun run typecheck
bun test
bun run --cwd packages/desktop typecheck
bun run --cwd packages/desktop test
bun run --cwd packages/desktop tauri build --bundles app
test -z "$(git status --porcelain)"
```

Before building, confirm the approved version agrees in packages/desktop/package.json and src-tauri/tauri.conf.json, Cargo.toml and Cargo.lock. Tauri builds the frontend automatically. The output is packages/desktop/src-tauri/target/release/bundle/macos/Figori.app.

The recipe requires CARGO_TARGET_DIR unset/empty so the output path below cannot refer to a stale bundle from another target directory. If building changes Cargo metadata or any tracked file, inspect the diff, deliberately regenerate/commit the necessary metadata and rebuild the new approved SHA; never silently reset it and keep the old artifact.

The existing Cargo release.build-override strip="none" fixes the Rust/LLVM proc-macro LINKEDIT issue ([upstream #157750](https://github.com/rust-lang/rust/issues/157750)); use the normal command, without global toolchain changes.

The manual .forgejo/workflows/desktop.yml lane produces an **unsigned application bundle archive**. It does not sign, notarize, install or verify GUI behavior. Authorized local Mac build/signing is the established delivery route.

## Package in release mode

Choose an absolute new RELEASE_DIR outside the checkout, with an existing parent. Existing release directories are immutable.

```bash
set -euo pipefail
APP="$(pwd)/packages/desktop/src-tauri/target/release/bundle/macos/Figori.app"
: "${RELEASE_DIR:?Set an absolute new output directory}"
FIGORI_SIGNING_IDENTITY='Developer ID Application: Oleg Kossoy (LA9V2K2376)' \
FIGORI_NOTARY_PROFILE='Figori-Developer-ID' \
bash scripts/package-macos-dmg.sh release "$APP" "$RELEASE_DIR" "$SOURCE_SHA"
```

**The script signs a staged COPY, not the original build app. Install only from the FINAL DMG.** Copying target/release/bundle/Figori.app afterward can replace a signed installation with an ad-hoc app.

The script performs app hardened-runtime signing → app notarization Accepted → staple/validate and Gatekeeper → DMG creation/signing → separate DMG notarization Accepted → staple/validate and Gatekeeper → receipts. An uploaded submission alone is not acceptance. Both app and DMG must pass. Nested Frameworks/PlugIns cause a deliberate failure until inside-out signing is implemented. Never modify signed contents afterward.

Failed output is diagnostic evidence, not a release. Draft mode explicitly emits DRAFT-NOT-NOTARIZED and must not be published as a finished installer.

## Verify the final DMG and embedded app

Set DMG to the exact emitted Figori-VERSION-macos-arm64.dmg.

```bash
set -euo pipefail
(cd "$RELEASE_DIR" && shasum -a 256 -c SHA256SUMS)
cat "$RELEASE_DIR/SOURCE_COMMIT" "$RELEASE_DIR/PACKAGING_STATUS"
: "${DMG:?Set the exact final DMG path}"
codesign --verify --strict --verbose=2 "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
MOUNT_DIR="$(mktemp -d)"
hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "$MOUNT_DIR"
codesign --verify --deep --strict --verbose=2 "$MOUNT_DIR/Figori.app"
codesign -dv --verbose=4 "$MOUNT_DIR/Figori.app"
xcrun stapler validate "$MOUNT_DIR/Figori.app"
spctl --assess --type execute --verbose=2 "$MOUNT_DIR/Figori.app"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$MOUNT_DIR/Figori.app/Contents/Info.plist"
lipo -archs "$MOUNT_DIR/Figori.app/Contents/MacOS/figori-desktop"
readlink "$MOUNT_DIR/Applications"
```

Require approved version/source, mode=release, arm64, identifier com.befeast.figori, Developer ID Application authority above, TeamIdentifier LA9V2K2376, valid tickets and accepted Gatekeeper assessments (Notarized Developer ID for app). Applications must resolve to /Applications. Both private submission JSON statuses must be Accepted. The source receipt attests the controlled build; codesign does not establish a Git SHA.

## Safe authorized install and rollback

Installation needs its own delivery authorization. Save the worksheet and quit normally, resolving dirty-document prompts. Do not kill a live session. Preserve the old app and user data. This example uses the established per-user destination; resolve /Applications deliberately if that is the user's chosen location and avoid duplicate running copies.

```bash
set -euo pipefail
DEST="$HOME/Applications/Figori.app"
: "${BACKUP_DIR:?Set an absolute new backup directory}"
test ! -e "$BACKUP_DIR"
test -d "$MOUNT_DIR/Figori.app"
if pgrep -x figori-desktop >/dev/null; then
  echo 'Quit Figori normally before replacement' >&2
  exit 1
fi
mkdir -p "$HOME/Applications"
mkdir "$BACKUP_DIR"
if test -e "$DEST"; then mv "$DEST" "$BACKUP_DIR/Figori.app"; fi
ditto "$MOUNT_DIR/Figori.app" "$DEST"
codesign --verify --deep --strict --verbose=2 "$DEST"
codesign -dv --verbose=4 "$DEST"
xcrun stapler validate "$DEST"
spctl --assess --type execute --verbose=2 "$DEST"
hdiutil detach "$MOUNT_DIR"
rmdir "$MOUNT_DIR"
open "$DEST"
```

Stop on any failed verification before launch. Recheck installed Authority/TeamIdentifier/version, not merely DMG signatures. Confirm the running destination, preserved source/settings/recovery and release-specific synthetic cases. Keep private worksheets/screenshots out of published evidence.

Rollback after quitting normally: move the failed app into the backup directory under a distinct name and restore the saved Figori.app to DEST. If there was no prior app, leave DEST absent. Do not blindly restore/delete worksheet storage.

## Publication and evidence

Follow [desktop-release.md](desktop-release.md). Publish only final DMG, SOURCE_COMMIT, PACKAGING_STATUS and SHA256SUMS; exclude notarization-app.zip and app/dmg-notarization.json. Tag the exact approved source on Forgejo and downstream GitHub with identical bytes and preview status. Verify anonymous downloads against SHA256SUMS before changing website links.

The historical 0.3.6 app and DMG passed notarization/stapling/build-Mac Gatekeeper. This does not prove any later draft or currently installed app is signed. Installed GUI acceptance and fresh-Mac/quarantine acceptance are separate checks; explicitly disclose those not performed.

References: [Tauri signing](https://v2.tauri.app/distribute/sign/macos/) · [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
