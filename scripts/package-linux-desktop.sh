#!/usr/bin/env bash
# Package an already-built Linux executable; no GUI launch, installation, or dependency changes.
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: package-linux-desktop.sh BUILT_EXECUTABLE NEW_OUTPUT_DIRECTORY' >&2; exit 2; }
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
binary=$(realpath "$1")
out=$(realpath -m "$2")
[[ $(uname -s) == Linux && $(uname -m) == x86_64 && -f $binary && ! -e $out ]] || { echo 'Requires Linux x86_64, an existing executable, and a new output directory' >&2; exit 2; }
[[ -z $(git -C "$root" status --porcelain) ]] || { echo 'Commit source and restore generated manifest normalization before packaging' >&2; exit 1; }
revision=$(git -C "$root" rev-parse HEAD)
version=$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$root/packages/desktop/src-tauri/Cargo.toml" | head -1)
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
file "$binary" | grep -q 'ELF 64-bit.*x86-64' || { echo 'Expected x86-64 ELF binary' >&2; exit 2; }
name="Figori-$version-linux-x86_64"
payload="$out/$name"
mkdir -p "$payload"
cp "$binary" "$payload/figori-desktop"
cp "$root/packages/desktop/src-tauri/icons/icon.png" "$payload/figori.png"
cp "$root/scripts/install-linux-user.sh" "$payload/install-linux-user.sh"
cp "$root/site/examples/consulting-project.figori" "$payload/example.figori"
cp "$root/docs/linux-install.md" "$payload/README.md"
printf '%s\n' "$revision" > "$payload/SOURCE_COMMIT"
printf 'version=%s\narchitecture=x86_64\nformat=dynamic-linux-executable\n' "$version" > "$payload/BUILD_INFO"
{
  echo 'Direct ELF shared-library requirements:'
  readelf -d "$binary" | sed -n 's/.*Shared library: \[\([^]]*\)\].*/\1/p'
  echo 'Required glibc symbol floor:'
  readelf --version-info "$binary" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1
} > "$payload/DEPENDENCIES.txt"
(cd "$payload" && sha256sum figori-desktop figori.png install-linux-user.sh example.figori README.md SOURCE_COMMIT BUILD_INFO DEPENDENCIES.txt > SHA256SUMS)
tar -czf "$out/$name.tar.gz" -C "$out" "$name"
cp "$payload/SOURCE_COMMIT" "$out/SOURCE_COMMIT"
printf 'version=%s\narchitecture=x86_64\npackage=dynamic-linux-executable\nrequirements=GTK3,WebKitGTK4.1,libsoup3,glibc2.39+\n' "$version" > "$out/PACKAGING_STATUS"
(cd "$out" && sha256sum "$name.tar.gz" SOURCE_COMMIT PACKAGING_STATUS > SHA256SUMS)
echo "$out/$name.tar.gz"
