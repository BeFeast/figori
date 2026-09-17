# Public preview release artifacts

Run the build on a clean committed Linux development checkout with the pinned Bun version and GNU tar/gzip available:

```sh
bun scripts/build-release.ts
```

The script installs the frozen lockfile, runs typecheck/tests and both CLI/Raycast builds, and emits `dist/releases/<commit-prefix>/`:

- Standalone macOS ARM64 and Linux x86_64 CLI binaries, including `--tui` and protocol v1.
- A Raycast compiled distribution archive; the separate full source archive retains the workspace dependencies needed to rebuild/import it.
- An Omarchy archive containing the plugin, matching Linux executable, exact install/rollback scripts, and internal checksums.
- The full tracked source archive without private local worksheets, dependencies or build output.
- `manifest.json` with exact source commit, toolchain and observed check outcomes; `SHA256SUMS` binds all release files and the manifest.

Output is isolated by source commit. A directory with a finished manifest is never silently overwritten. Tar metadata and gzip headers are normalized; hashes attest to each concrete build rather than claiming byte-identical Bun compiler output across different hosts.

The Linux binary receives an actual deterministic calendar smoke check. Cross-compiling a Mach-O binary does not demonstrate macOS execution; run that binary on the target separately and record the result. The build does not install Raycast/Omarchy, change services, publish a store extension, or create a release remotely.

For delivery, inspect the artifact manifest and scripts first, then copy the exact reviewed files to a staging directory on the target. Omarchy's user-scope install script accepts that absolute staging path and a new absolute backup directory. Desktop shortcuts and key bindings are optional separate changes; the default install script does not add them. Preserve worksheet storage across updates and rollback.

## Exact CLI install and rollback (macOS / Linux)

Release assets include [install-cli-user.sh](../scripts/install-cli-user.sh) and [rollback-cli-user.sh](../scripts/rollback-cli-user.sh). These scripts verify the approved binary checksum, record the previous `~/.local/bin/my-numi` executable or its absence in a new backup directory, then atomically replace only that executable. They do not modify PATH, shell profiles, desktop registration, services, or worksheet data.

```sh
bash /absolute/staging/install-cli-user.sh --apply /absolute/staging/my-numi-macos-arm64 APPROVED_SHA256 /absolute/new/backup
bash /absolute/staging/rollback-cli-user.sh --apply /absolute/new/backup
```

Use the Linux binary path instead when delivering only the Linux CLI. Omarchy's combined plugin+CLI installer remains a separate option; do not run both installers over the same executable in one delivery. The exact target staging path, checksum, and backup path are supplied with the concrete release approval.

## Rebuild from the source archive

The source archive contains a `my-numi/` root and all workspace packages. Extract it into a new working directory, then install the locked dependencies with Bun 1.3.14:

```sh
mkdir my-numi-source
tar -xzf /absolute/staging/my-numi-source-COMMIT.tar.gz -C my-numi-source
cd my-numi-source/my-numi
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
bun run --cwd packages/raycast build
```

The source archive intentionally has no `.git` metadata, so `scripts/build-release.ts` (which verifies exact git provenance) runs from a checkout of the recorded commit instead. The ordinary build commands above work from the archive. For Raycast's development import, select the extracted `packages/raycast` directory after the workspace install; follow its README for the actual macOS registration step. Building the extension does not register it in Raycast.
