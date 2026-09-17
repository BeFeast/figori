#!/usr/bin/env bash
# Run on a Linux Docker build host. All large state stays under OUTPUT_PARENT.
set -euo pipefail
[[ $# -ge 1 && $# -le 2 ]] || { echo 'Usage: build-linux-packages.sh NEW_OUTPUT_DIRECTORY [--trial]' >&2; exit 2; }
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
out=$(realpath -m "$1")
trial=${2:-}
[[ ! -e $out && ( -z $trial || $trial == --trial ) ]] || exit 2
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Linux x86_64 Docker host required' >&2; exit 2; }
if [[ -n $(git -C "$root" status --porcelain) && $trial != --trial ]]; then echo 'Commit the source before release build' >&2; exit 1; fi
cache=${FIGORI_PACKAGE_CACHE:-$out/cache}
target=${FIGORI_TARGET_DIR:-$out/target}
for path in "$out" "$cache" "$target"; do
  case "$(realpath -m "$path")/" in "$root/"*) echo 'Build output/cache/target must stay outside the source checkout' >&2; exit 2;; esac
done
mkdir -p "$out/artifacts" "$out/source" "$cache/cargo" "$cache/bun" "$target"
revision=$(git -C "$root" rev-parse HEAD)
printf '%s\n' "$revision" > "$out/artifacts/SOURCE_COMMIT"
git -C "$root" diff --binary HEAD > "$out/artifacts/SOURCE_PATCH.diff"
git -C "$root" ls-files --others --exclude-standard > "$out/artifacts/SOURCE_UNTRACKED.txt"
# Source-only snapshot: ignored caches, private fixtures and worktree internals stay outside.
(cd "$root" && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf -) | tar -xf - -C "$out/source"
(cd "$out/source" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$out/artifacts/SOURCE_FILES.sha256"
image="figori-packages-builder:$(sha256sum "$root/scripts/linux-packages/Dockerfile" | cut -c1-16)"
docker build --progress=plain -t "$image" -f "$root/scripts/linux-packages/Dockerfile" "$root/scripts/linux-packages" 2>&1 | tee "$out/builder.log"
docker image inspect "$image" --format '{{.Id}}' > "$out/artifacts/BUILDER_IMAGE"
# These mounts contain only the isolated snapshot, output and this build's caches.
docker run --rm --cpus=4 --memory=8g --name "figori-packages-$$" \
  -e CARGO_BUILD_JOBS=4 -e CARGO_TARGET_DIR=/target -e CARGO_HOME=/cache/cargo -e BUN_INSTALL_CACHE_DIR=/cache/bun \
  -e RUSTUP_TOOLCHAIN=1.96.1 -e SOURCE_DATE_EPOCH="$(git -C "$root" show -s --format=%ct HEAD)" \
  -v "$out/source:/workspace" -v "$out/artifacts:/output" -v "$cache:/cache" -v "$target:/target" \
  "$image" bash scripts/linux-packages/build-in-container.sh 2>&1 | tee "$out/build.log"
# Docker defaults to root internally; output ownership returns to the invoking user.
docker run --rm -v "$out:/output" "$image" chown -R "$(id -u):$(id -g)" /output
printf '%s\n' "$out/artifacts"
