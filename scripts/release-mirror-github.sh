#!/usr/bin/env bash
# Mirror a published Forgejo release to the downstream GitHub repository: push the
# tag, then create the GitHub prerelease with the same notes and attach the same
# asset files. Refuses to touch an existing GitHub release for the tag.
#
# Usage: scripts/release-mirror-github.sh --tag vX.Y.Z --assets DIR --notes FILE [--title TEXT]
#
# Environment:
#   GITHUB_MIRROR_TOKEN  required: fine-grained token with contents:write on the mirror
#   GITHUB_MIRROR_REPO   default BeFeast/figori
set -euo pipefail
GITHUB_MIRROR_REPO=${GITHUB_MIRROR_REPO:-BeFeast/figori}
tag=""; assets=""; notes=""; title=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --tag) tag=$2; shift 2 ;;
    --assets) assets=$2; shift 2 ;;
    --notes) notes=$2; shift 2 ;;
    --title) title=$2; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ && -d $assets && -f $notes ]] || { echo 'Need --tag vX.Y.Z, --assets DIR and --notes FILE' >&2; exit 2; }
[[ -n ${GITHUB_MIRROR_TOKEN:-} ]] || { echo 'GITHUB_MIRROR_TOKEN is not set' >&2; exit 2; }
command -v jq >/dev/null || { echo 'jq is required' >&2; exit 2; }
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
commit=$(git -C "$root" rev-parse "refs/tags/$tag^{commit}")
work=$(mktemp -d); chmod 0700 "$work"; trap 'rm -rf "$work"' EXIT
auth="$work/auth"; body="$work/body"
printf 'Authorization: Bearer %s\n' "$GITHUB_MIRROR_TOKEN" > "$auth"; chmod 0600 "$auth"
askpass="$work/askpass"; printf '#!/usr/bin/env bash\ncase "$1" in *sername*) echo x-access-token ;; *) echo "$GITHUB_MIRROR_TOKEN" ;; esac\n' > "$askpass"; chmod 0700 "$askpass"
base="https://api.github.com/repos/$GITHUB_MIRROR_REPO"
api() { local method=$1 path=$2; shift 2; curl -sS -o "$body" -w '%{http_code}' -X "$method" -H @"$auth" -H 'Accept: application/vnd.github+json' "$@" "$base$path"; }
fail() { echo "$1" >&2; echo "response: $(cat "$body")" >&2; exit 1; }

status=$(api GET "/releases/tags/$tag")
[[ $status == 404 ]] || fail "GitHub release for $tag already exists or lookup failed ($status); refusing to overwrite"
# The tag object is pushed as-is so both hosts resolve it to the same commit.
GIT_ASKPASS=$askpass git -C "$root" push "https://github.com/$GITHUB_MIRROR_REPO.git" "refs/tags/$tag:refs/tags/$tag"
unset GITHUB_MIRROR_TOKEN
status=$(api GET "/commits/$commit"); [[ $status == 200 ]] || fail "Source commit $commit is not on GitHub ($status)"
payload=$(jq -n --arg tag "$tag" --arg target "$commit" --arg title "${title:-Figori ${tag#v}}" --rawfile notes "$notes" \
  '{tag_name: $tag, target_commitish: $target, name: $title, body: $notes, draft: true, prerelease: true, make_latest: "false"}')
status=$(api POST /releases -H 'Content-Type: application/json' --data-binary "$payload"); [[ $status == 201 ]] || fail "Creating GitHub draft failed ($status)"
release_id=$(jq -r .id "$body"); upload_url=$(jq -r .upload_url "$body" | sed 's/{?name,label}//')
for file in "$assets"/*; do
  [[ -f $file ]] || continue
  name=$(basename "$file")
  status=$(curl -sS -o "$body" -w '%{http_code}' -X POST -H @"$auth" -H 'Content-Type: application/octet-stream' --data-binary @"$file" "$upload_url?name=$name")
  [[ $status == 201 ]] || fail "Uploading $name to GitHub failed ($status)"
  asset_id=$(jq -r .id "$body")
  curl -sS -L -H @"$auth" -H 'Accept: application/octet-stream' -o "$work/readback" "$base/releases/assets/$asset_id"
  [[ $(sha256sum "$work/readback" | cut -c1-64) == $(sha256sum "$file" | cut -c1-64) ]] || { echo "GitHub readback digest mismatch for $name; draft $release_id retained" >&2; exit 1; }
  echo "Mirrored $name (asset $asset_id)"
done
status=$(api PATCH "/releases/$release_id" -H 'Content-Type: application/json' --data-binary '{"draft":false,"prerelease":true,"make_latest":"false"}')
[[ $status == 200 ]] || fail "Publishing GitHub release failed ($status)"
echo "GitHub release published at $(jq -r .html_url "$body")"
