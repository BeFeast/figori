#!/usr/bin/env bash
# Create or resume a Forgejo release for a tag, attach every file in an asset
# directory, verify each upload by size and digest, then publish. Uses only curl,
# jq and the Forgejo REST API. Published releases are immutable unless --replace
# is given; a draft left by an earlier attempt is resumed.
#
# Usage: scripts/release-publish.sh --tag vX.Y.Z --assets DIR --notes FILE
#                                   [--title TEXT] [--replace] [--attach-only]
#
# Environment:
#   FORGEJO_TOKEN  required: the run's automatic token or a PAT with write access
#   FORGEJO_API    default https://git.oklabs.uk/api/v1
#   REPO           default BeFeast/figori
#
# --attach-only adds assets to an already published release without touching
# its notes (used by the macOS job that finishes after the Linux publication).
set -euo pipefail
FORGEJO_API=${FORGEJO_API:-https://git.oklabs.uk/api/v1}; FORGEJO_API=${FORGEJO_API%/}
REPO=${REPO:-BeFeast/figori}
tag=""; assets=""; notes=""; title=""; replace=false; attach_only=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --tag) tag=$2; shift 2 ;;
    --assets) assets=$2; shift 2 ;;
    --notes) notes=$2; shift 2 ;;
    --title) title=$2; shift 2 ;;
    --replace) replace=true; shift ;;
    --attach-only) attach_only=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ && -d $assets ]] || { echo 'Need --tag vX.Y.Z and an existing --assets directory' >&2; exit 2; }
[[ $attach_only == true || -f $notes ]] || { echo '--notes FILE is required unless --attach-only' >&2; exit 2; }
[[ -n ${FORGEJO_TOKEN:-} ]] || { echo 'FORGEJO_TOKEN is not set' >&2; exit 2; }
command -v jq >/dev/null || { echo 'jq is required' >&2; exit 2; }
work=$(mktemp -d); chmod 0700 "$work"; trap 'rm -rf "$work"' EXIT
auth="$work/auth"; body="$work/body"
# The token never appears on a command line: curl reads the header from a private file.
printf 'Authorization: token %s\n' "$FORGEJO_TOKEN" > "$auth"; chmod 0600 "$auth"; unset FORGEJO_TOKEN
base="$FORGEJO_API/repos/$REPO"
api() { local method=$1 path=$2; shift 2; curl -sS -o "$body" -w '%{http_code}' -X "$method" -H @"$auth" -H 'Accept: application/json' "$@" "$base$path"; }
fail() { echo "$1" >&2; echo "response: $(cat "$body")" >&2; exit 1; }
# Portable across the Linux container and the macOS runner.
digest() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -c1-64; else shasum -a 256 "$1" | cut -c1-64; fi; }
bytes() { wc -c < "$1" | tr -d ' '; }

status=$(api GET "/tags/$tag")
[[ $status == 200 ]] || fail "Tag $tag does not exist on $REPO ($status)"
tag_commit=$(jq -r '.commit.sha' "$body")

release_id=""; was_draft=true
status=$(api GET "/releases/tags/$tag")
case $status in
  200)
    release_id=$(jq -r .id "$body"); was_draft=$(jq -r .draft "$body")
    if [[ $was_draft == true ]]; then echo "Resuming draft release $tag (id $release_id)"
    elif [[ $attach_only == true || $replace == true ]]; then echo "Release $tag is published (id $release_id); adding assets"
    else echo "Release $tag is already published; published releases are immutable without --replace" >&2; exit 1; fi
    if [[ $attach_only != true ]]; then
      patch=$(jq -n --arg title "$title" --rawfile notes "$notes" '{body: $notes} + (if $title != "" then {name: $title} else {} end)')
      status=$(api PATCH "/releases/$release_id" -H 'Content-Type: application/json' --data-binary "$patch")
      [[ $status == 200 ]] || fail "Updating release notes failed ($status)"
    fi ;;
  404)
    [[ $attach_only != true ]] || fail "Release $tag does not exist; nothing to attach to"
    payload=$(jq -n --arg tag "$tag" --arg target "$tag_commit" --arg title "${title:-Figori ${tag#v}}" --rawfile notes "$notes" \
      '{tag_name: $tag, target_commitish: $target, name: $title, body: $notes, draft: true, prerelease: true}')
    status=$(api POST /releases -H 'Content-Type: application/json' --data-binary "$payload")
    [[ $status == 201 ]] || fail "Creating draft release failed ($status)"
    release_id=$(jq -r .id "$body"); echo "Created draft release $tag (id $release_id)" ;;
  *) fail "Looking up release $tag failed ($status)" ;;
esac

status=$(api GET "/releases/$release_id"); [[ $status == 200 ]] || fail "Reading release failed ($status)"
cp "$body" "$work/release.json"
for file in "$assets"/*; do
  [[ -f $file ]] || continue
  name=$(basename "$file")
  existing=$(jq -r --arg n "$name" '.assets[] | select(.name == $n) | .id' "$work/release.json")
  if [[ -n $existing ]]; then
    if [[ $replace == true || $was_draft == true ]]; then
      echo "Replacing existing asset $name (id $existing)"
      status=$(api DELETE "/releases/$release_id/assets/$existing"); [[ $status == 204 ]] || fail "Deleting asset $name failed ($status)"
    else
      echo "Asset $name already exists on $tag; refusing to overwrite without --replace" >&2; exit 1
    fi
  fi
  status=$(api POST "/releases/$release_id/assets?name=$name" -F "attachment=@$file"); [[ $status == 201 ]] || fail "Uploading $name failed ($status)"
  asset_id=$(jq -r .id "$body"); size=$(jq -r .size "$body")
  [[ $size == $(bytes "$file") ]] || fail "Uploaded size mismatch for $name"
  echo "Attached $name ($size bytes, asset $asset_id)"
done

if [[ $was_draft == true ]]; then
  status=$(api PATCH "/releases/$release_id" -H 'Content-Type: application/json' --data-binary '{"draft":false,"prerelease":true}')
  [[ $status == 200 ]] || fail "Publishing release failed ($status)"
fi
status=$(api GET "/releases/tags/$tag"); [[ $status == 200 ]] || fail "Reading published release failed ($status)"
[[ $(jq -r .draft "$body") == false && $(jq -r .target_commitish "$body") == "$tag_commit" ]] || fail "Published release state is not the expected one"
# Draft attachments are not downloadable with the run token, so the byte-for-byte
# check happens once the release is public: every uploaded file is fetched
# anonymously and compared with the local copy. A mismatch fails the job loudly.
cp "$body" "$work/published.json"
for file in "$assets"/*; do
  [[ -f $file ]] || continue
  name=$(basename "$file")
  url=$(jq -r --arg n "$name" '.assets[] | select(.name == $n) | .browser_download_url' "$work/published.json")
  [[ -n $url ]] || fail "Published release lacks asset $name"
  curl -fsS -L -o "$work/readback" "$url" || fail "Anonymous download of $name failed"
  [[ $(digest "$work/readback") == $(digest "$file") ]] || fail "Published asset $name differs from the local file"
  echo "Verified $name after publication"
done
echo "Release $tag published at $(jq -r .html_url "$body") with $(jq -r '.assets | length' "$body") assets, target $tag_commit"
