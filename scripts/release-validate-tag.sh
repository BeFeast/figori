#!/usr/bin/env bash
# Refuse to build a release unless the tag is a stable SemVer tag that points at the
# checked-out commit and matches the desktop version manifests.
#
# Usage: scripts/release-validate-tag.sh TAG
set -euo pipefail
[[ $# == 1 ]] || { echo 'Usage: release-validate-tag.sh TAG' >&2; exit 2; }
tag=$1
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
# A -rc.N suffix marks a rehearsal: it must still carry the exact version it rehearses.
[[ $tag =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.[0-9]+)?$ ]] || { echo "Release tag must look like v1.2.3 or v1.2.3-rc.1, got: $tag" >&2; exit 1; }
[[ $(git -C "$root" tag --points-at HEAD | grep -Fx "$tag") == "$tag" ]] || { echo "Checked-out commit is not tagged $tag" >&2; exit 1; }
version=${tag#v}; version=${version%%-*}
for manifest in packages/desktop/src-tauri/tauri.conf.json packages/desktop/package.json; do
  found=$(jq -r .version "$root/$manifest")
  [[ $found == "$version" ]] || { echo "$manifest declares $found, tag says $version" >&2; exit 1; }
done
found=$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$root/packages/desktop/src-tauri/Cargo.toml" | head -1)
[[ $found == "$version" ]] || { echo "Cargo.toml declares $found, tag says $version" >&2; exit 1; }
echo "Tag $tag matches desktop version $version at $(git -C "$root" rev-parse HEAD)"
