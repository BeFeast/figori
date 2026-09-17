# macOS DMG delivery

The public distribution goal is a Developer ID signed, notarized and stapled app inside a signed, notarized and stapled DMG. An Apple Development certificate or an ad-hoc signature does not meet this goal. A draft is never described or published as the finished installer.

Official references: [Tauri signing](https://v2.tauri.app/distribute/sign/macos/), [Tauri DMG](https://v2.tauri.app/distribute/dmg/), [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Credentials and prerequisites

- A valid **Developer ID Application** certificate with its matching private key accessible to codesign on the build Mac. Developer ID Installer is for installer packages, not this drag-and-drop DMG. Creating/importing certificates is a separate authorized action; the packaging script never mutates keychains.
- Existing `notarytool` keychain profile named by `FIGORI_NOTARY_PROFILE`. Provision separately with an App Store Connect API key (key ID, issuer ID, private `.p8` file), or Apple ID + app-specific password + developer team ID. Use runtime secret retrieval; never put credentials in repository files or shell histories.
- Xcode command-line tools, native compiler/Bun dependencies and a completed app build. Current artifact architecture is Apple Silicon, not a universal Intel build.

## Reproducible packaging

Build the exact committed source using the documented native build process. The script accepts the resulting app plus its complete source SHA and creates a **new** output directory; it never overwrites an existing release directory.

```sh
scripts/package-macos-dmg.sh draft /absolute/path/Figori.app /absolute/new/draft-output FULL_SOURCE_SHA
FIGORI_SIGNING_IDENTITY='Developer ID Application: Account Name (TEAMID)' \
FIGORI_NOTARY_PROFILE='existing-profile-name' \
  scripts/package-macos-dmg.sh release /absolute/path/Figori.app /absolute/new/release-output FULL_SOURCE_SHA
```

Draft names contain `DRAFT-NOT-NOTARIZED`; mode is recorded in PACKAGING_STATUS. Release mode fails unless both submissions return Accepted, stapler validates both tickets, and Gatekeeper assessments pass. Submission JSON is diagnostic evidence; do not claim completion merely because upload succeeded. A failed output directory is evidence to inspect, not a publishable artifact.

The current Tauri app has one executable. If nested frameworks/plugins are introduced, the script fails until explicit inside-out signing is implemented. No blanket entitlement exceptions are added. After signing and notarizing, do not modify app contents.

The DMG includes Figori.app, the portable standard `/Applications` shortcut, and Install.txt explaining the optional `~/Applications` destination. A mounted image cannot encode a portable per-user absolute symlink. Neither opening the image nor running the packaging script installs anything. Existing worksheets must be saved before app replacement.

Before publication: mount read-only and inspect app/shortcut, verify app version/source receipts and architecture, validate signatures/tickets, and test a downloaded quarantined artifact on a fresh Mac. CI/build success is not fresh-machine Gatekeeper acceptance. Preserve earlier release assets; publish a new version instead of replacing an immutable artifact.
