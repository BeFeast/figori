#!/usr/bin/env bash
set -euo pipefail
cd /workspace
bun install --frozen-lockfile
bun run --cwd packages/desktop typecheck
bun run --cwd packages/desktop test
rm -rf /target/release/bundle/deb /target/release/bundle/rpm
bun run --cwd packages/desktop tauri build --bundles deb,rpm -- --locked
version=$(jq -r .version packages/desktop/src-tauri/tauri.conf.json)
cp "/target/release/bundle/deb/"*.deb "/output/Figori-$version-linux-amd64.deb"
cp "/target/release/bundle/rpm/"*.rpm "/output/Figori-$version-linux-x86_64.rpm"
cp /target/release/figori-desktop /output/figori-desktop
{
  rustc --version; cargo --version; bun --version; getconf GNU_LIBC_VERSION
  pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
  dpkg-query -W -f='${Package}=${Version}\n'
} > /output/BUILD_ENVIRONMENT.txt
readelf --version-info /output/figori-desktop > /output/ELF_VERSIONS.txt
readelf --version-info /output/figori-desktop | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1 > /output/GLIBC_FLOOR
floor=$(cat /output/GLIBC_FLOOR)
[[ $(printf '%s\n' "$floor" GLIBC_2.35 | sort -V | tail -1) == GLIBC_2.35 ]] || { echo "Unexpected glibc floor $floor" >&2; exit 1; }
dpkg-deb --info "/output/Figori-$version-linux-amd64.deb" > /output/DEB_METADATA.txt
rpm -qip "/output/Figori-$version-linux-x86_64.rpm" > /output/RPM_METADATA.txt
printf 'version=%s\narchitecture=x86_64\nbaseline=Ubuntu22.04\napt_snapshot=20260917T000000Z\nglibc_floor=%s\nformats=deb,rpm\nreproducibility=recipe-pinned;byte-identical-rebuild-not-claimed\n' "$version" "$floor" > /output/PACKAGING_STATUS
cd /output
sha256sum "Figori-$version-linux-amd64.deb" "Figori-$version-linux-x86_64.rpm" SOURCE_COMMIT PACKAGING_STATUS > SHA256SUMS
