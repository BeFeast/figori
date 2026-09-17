#!/usr/bin/env bash
# Run native-package acceptance in one disposable distribution container.
# Usage: IMAGE PACKAGE [PREVIOUS_PACKAGE]. Images must already be present locally.
set -euo pipefail
[[ $# -ge 2 && $# -le 3 ]] || { echo 'Usage: test-linux-packages.sh IMAGE PACKAGE [PREVIOUS_PACKAGE]' >&2; exit 2; }
image=$1
package=$(realpath "$2")
previous=${3:-}
root=$(cd "$(dirname "$0")/.." && pwd -P)
[[ -f $package ]] || exit 2
case "$package" in *.deb) kind=deb ;; *.rpm) kind=rpm ;; *) echo 'Expected .deb or .rpm' >&2; exit 2 ;; esac
image_id=$(docker image inspect --format '{{.Id}}' "$image")
printf 'image=%s\nimage_id=%s\n' "$image" "$image_id"
docker image inspect --format 'digests={{json .RepoDigests}}' "$image"
sha256sum "$package"
mounts=(--mount "type=bind,src=$package,dst=/artifacts/current.$kind,readonly" --mount "type=bind,src=$root/scripts/test-linux-packages-container.sh,dst=/test.sh,readonly")
if [[ -n $previous ]]; then
  previous=$(realpath "$previous")
  [[ -f $previous && $previous == *.$kind ]] || exit 2
  sha256sum "$previous"
  mounts+=(--mount "type=bind,src=$previous,dst=/artifacts/previous.$kind,readonly")
fi
# No host HOME, graphical sockets, Docker socket, or application data is mounted.
docker run --rm --pull never --memory 2g --cpus 2 --pids-limit 512 \
  "${mounts[@]}" "$image_id" bash /test.sh "$kind"
