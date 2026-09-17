# Private release artifacts

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
