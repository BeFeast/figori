# Desktop prerelease publication

Desktop releases are separate from the earlier CLI/Raycast/Omarchy release set. A desktop publication must identify its actual platform and tested surface; do not describe a macOS zip as a new Linux build or claim complete Soulver/Numi parity.

## Immutable release input

For `v0.3.0`, prepare a fresh directory containing:

- `Figori-macos-arm64.zip`: the reviewed native application bundle, without personal worksheets, recovery files or host credentials.
- `SOURCE_COMMIT`: only the exact 40-character source commit followed by a newline.
- `SHA256SUMS`: SHA-256 records for the zip and `SOURCE_COMMIT`, using two spaces before each basename.
- `RELEASE_NOTES.md`: human-readable changelog and observed verification limits; this is the release body, not a release asset.

The zip must already have passed native application acceptance. Hashes establish artifact identity, not runtime correctness. Preserve existing releases and staging directories. Do not silently replace an existing tag or asset.

The source may be the desktop preview branch while its implementation PR remains open. Tag the reviewed full commit explicitly; never let the release API default to the current `main` head.

## Publication sequence

1. Wait for the exact final source SHA and completed native build. Verify `SOURCE_COMMIT`, then every `SHA256SUMS` entry after transfer to the publication host.
2. Check that both `v0.3.0` and its release are absent. An existing object or unexpected API response is a stop condition, not permission to overwrite it.
3. Create a draft prerelease using `tag_name`, `target_commitish` and a human-readable body.
4. Upload the zip, `SOURCE_COMMIT` and `SHA256SUMS`. Download each asset again and compare its digest with the local file.
5. Verify the draft targets the approved full commit, then change only `draft` to false, retaining `prerelease: true`. Forgejo may create the tag only when the draft is published: a prepublication tag lookup can legitimately return 404.
6. After publication, resolve the tag and verify it equals the approved commit; read back the public release URL and asset names. A mismatch is a delivery failure to report, never permission to move or overwrite an existing tag. Keep a failed partial upload as a draft for inspection; do not delete or modify previous releases.

Use the existing Forgejo repo/actions credential only through the invoking process environment. Never print token values, put them in command arguments, or store them in release notes. The publication host can load its existing scoped environment immediately before invoking the release helper.

The release notes must disclose that the current macOS ARM64 bundle is a local Xcode build without public signing/notarization. State the actual feature set and that natural-language input remains limited to the implemented grammar. Do not imply App Store distribution, complete Soulver parity, or that publication installs the application.

Observed during the 0.3.0 publication: this Forgejo instance materialized the release tag at draft publication, not draft creation. An alternative workflow may explicitly create and verify the tag before creating the draft, but must still refuse an existing conflicting tag. A later code fix receives a new version and immutable artifact set; never replace a published zip in place.
