#!/usr/bin/env bash
# Generate the Forgejo release body for a tag from the repository history and the
# assembled asset directory. Output is Markdown on stdout. No network access.
#
# Usage: scripts/release-notes.sh TAG ASSET_DIRECTORY [RUN_URL]
#
# ASSET_DIRECTORY must contain SHA256SUMS plus, when present, PACKAGING_STATUS,
# ACCEPTANCE_UBUNTU24.txt and ACCEPTANCE_FEDORA44.txt from the Linux build. The
# body states only what those receipts record; interactive desktop acceptance is
# never claimed by this script.
set -euo pipefail
[[ $# == 2 || $# == 3 ]] || { echo 'Usage: release-notes.sh TAG ASSET_DIRECTORY [RUN_URL]' >&2; exit 2; }
tag=$1
assets=$2
run_url=${3:-}
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
[[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ && -f $assets/SHA256SUMS ]] || { echo 'Expected a vX.Y.Z tag and an asset directory with SHA256SUMS' >&2; exit 2; }
version=${tag#v}; version=${version%%-*}
commit=$(git -C "$root" rev-parse "refs/tags/$tag^{commit}")
previous=$(git -C "$root" describe --tags --abbrev=0 --match 'v[0-9]*' "$commit^" 2>/dev/null || true)

echo "# Figori $version — Linux desktop preview"
echo
echo "Figori by [BeFeast](https://befeast.com). Product site: [figori.befeast.com](https://figori.befeast.com)."
echo
echo "Linux x86_64 packages built by Forgejo Actions from source commit \`$commit\`. A macOS build is attached separately by the macOS job when its runner is online; see the asset list and its own checksum file."
echo
echo "## Changes"
echo
if [[ -n $previous ]]; then
  echo "Commits since $previous:"
  echo
  git -C "$root" log --no-merges --format='- %s' "$previous..$commit"
else
  echo "First tagged release; no previous tag to compare."
fi
echo
echo "## Linux packages"
echo
echo "- \`Figori-$version-linux-amd64.deb\` and \`Figori-$version-linux-x86_64.rpm\`: built on the pinned Ubuntu 22.04 baseline (see PACKAGING_STATUS). Install with \`sudo apt install ./Figori-$version-linux-amd64.deb\` or \`sudo dnf install ./Figori-$version-linux-x86_64.rpm\`; see [docs/linux-packages.md](https://git.oklabs.uk/BeFeast/figori/src/tag/$tag/docs/linux-packages.md)."
echo "- \`Figori-$version-linux-x86_64.tar.gz\`: dynamically linked per-user archive for Omarchy/Arch-family desktops. Extract, save and quit any running Figori, then run \`bash install-linux-user.sh install .\` inside the extracted directory; see [docs/linux-install.md](https://git.oklabs.uk/BeFeast/figori/src/tag/$tag/docs/linux-install.md)."
echo
if [[ -f $assets/PACKAGING_STATUS ]]; then
  echo '```'
  cat "$assets/PACKAGING_STATUS"
  echo '```'
  echo
fi
echo "## Verification"
echo
[[ -n $run_url ]] && echo "- Build and package checks: [workflow run]($run_url)."
for receipt in ACCEPTANCE_UBUNTU24.txt:"Ubuntu 24.04 DEB" ACCEPTANCE_FEDORA44.txt:"Fedora 44 RPM"; do
  file=${receipt%%:*}
  label=${receipt#*:}
  if [[ -f $assets/$file ]]; then
    if grep -q '^FAIL' "$assets/$file"; then
      echo "- $label: FAIL recorded in \`$file\`."
    else
      echo "- $label: $(grep -c '^PASS' "$assets/$file") checks passed in a disposable container (fresh install, reinstall, headless X11 window, uninstall preserving user data)."
    fi
  fi
done
echo "- Headless container checks are not interactive Wayland, clipboard, file-portal or theme acceptance. Debian and other distribution versions are unverified."
echo "- Verify downloads against \`SHA256SUMS\`; \`SOURCE_COMMIT\` and \`PACKAGING_STATUS\` describe the exact build."
echo
echo "[Forgejo](https://git.oklabs.uk/BeFeast/figori) is canonical for development, PRs and CI; [GitHub](https://github.com/BeFeast/figori) is downstream distribution. Inspired by [Numi](https://numi.app); support its original developer through the official site. No full Soulver parity or universal Linux compatibility is claimed."
