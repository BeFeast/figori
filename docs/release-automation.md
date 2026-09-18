# Automated desktop releases

`.forgejo/workflows/release.yml` builds and publishes a desktop release for a version tag. It replaces the manual DEB/RPM dispatch, the hand-built Omarchy archive and the hand-written publication helpers; the macOS build is included when the `macos` runner is online.

## Cutting a release

1. Merge the version bump: `packages/desktop/package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` and `docs/linux-packages.md` must all carry the new version.
2. Tag the merged commit and push the tag as a person: `git tag -a v0.4.0 -m 'Figori 0.4.0' <sha> && git push origin v0.4.0`. A tag pushed by an Actions token does not trigger workflows.
3. Watch the run. The Linux job validates the tag against the manifests, builds DEB and RPM in the pinned Ubuntu 22.04 container, runs the Ubuntu 24.04 and Fedora 44 container acceptance, packages the Omarchy archive from the same binary and uploads everything as a run artifact. The publish job creates a draft Forgejo release, attaches the assets, verifies each upload by size and digest, then publishes it as a prerelease. The macOS job builds `Figori.app`, packages the DMG and attaches it with its own checksum file after the Linux publication.
4. Read the release page: assets, `PACKAGING_STATUS*`, `ACCEPTANCE_*.txt` and the generated notes. A green run proves build, packaging and container checks, not interactive desktop acceptance on any target.

Rehearse without publishing through `workflow_dispatch` with `publish=false`; a `-rc.N` tag (for example `v0.4.0-rc.1`) is accepted only through dispatch and must carry the version it rehearses. `replace_existing` overwrites the notes and assets of an already published release; otherwise published releases are immutable.

## macOS signing

The macOS job signs and notarizes only when the repository variables `FIGORI_SIGNING_IDENTITY` (a `Developer ID Application:` identity) and `FIGORI_NOTARY_PROFILE` (an existing `notarytool` keychain profile) name credentials that the runner session can use; `security find-identity` must list the identity. Without them the job produces a `-DRAFT-NOT-NOTARIZED` image, never described as a finished installer. See [macos-signing.md](macos-signing.md).

## GitHub mirror

When the repository secret `MIRROR_GITHUB_TOKEN` (fine-grained token with contents write on `BeFeast/figori`) exists, the mirror job pushes the tag to GitHub and republishes the Forgejo release there with the same notes and assets. Without it the job reports and exits; the GitHub release is then a manual step.

## Scripts

- `scripts/release-validate-tag.sh` refuses tags that do not match the desktop manifests.
- `scripts/release-notes.sh` writes the release body from the commit log and the assembled receipts.
- `scripts/release-publish.sh` creates or resumes the Forgejo release and verifies every attachment; `--attach-only` adds the macOS assets later.
- `scripts/release-mirror-github.sh` mirrors a published release to GitHub.
