#!/usr/bin/env bash
# Integration test using an isolated installation root and a real prebuilt ELF. Never launch the app.
set -euo pipefail
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
binary=${1:-$root/packages/desktop/src-tauri/target/release/figori-desktop}
test_root=$(mktemp -d /tmp/figori-installer-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT
payload="$test_root/archive"
user_home="$test_root/user home %"
mkdir -p "$payload" "$user_home/.local/bin" "$user_home/.local/share/applications" "$user_home/.local/share/icons/hicolor/256x256/apps" "$user_home/.local/share/com.befeast.figori"
cp "$binary" "$payload/figori-desktop"
cp "$root/packages/desktop/src-tauri/icons/icon.png" "$payload/figori.png"
printf '%040d\n' 1 > "$payload/SOURCE_COMMIT"
(cd "$payload" && sha256sum figori-desktop figori.png SOURCE_COMMIT > SHA256SUMS)
printf 'legacy CLI' > "$user_home/.local/bin/figori"
printf 'old desktop wrapper' > "$user_home/.local/bin/figori-desktop"
printf '[Desktop Entry]\nType=Application\nName=Old Figori\nExec=true\n' > "$user_home/.local/share/applications/com.befeast.figori.desktop"
printf 'old icon' > "$user_home/.local/share/icons/hicolor/256x256/apps/com.befeast.figori.png"
printf 'private recovery sentinel' > "$user_home/.local/share/com.befeast.figori/recovery.json"
# A corrupt payload must fail before creating installation state.
printf 'bad icon' >> "$payload/figori.png"
if bash "$root/scripts/install-linux-user.sh" install "$payload" "$user_home" >/dev/null 2>&1; then echo 'Corrupt payload accepted' >&2; exit 1; fi
test ! -e "$user_home/.local/opt/figori"
cp "$root/packages/desktop/src-tauri/icons/icon.png" "$payload/figori.png"
# Upgrade and verify identity, spaces/percent in launcher paths, and retained private state.
bash "$root/scripts/install-linux-user.sh" install "$payload" "$user_home"
test -f "$user_home/.local/share/applications/figori-desktop.desktop"
test ! -e "$user_home/.local/share/applications/com.befeast.figori.desktop"
grep -qx 'Icon=figori-desktop' "$user_home/.local/share/applications/figori-desktop.desktop"
grep -q 'user home %%' "$user_home/.local/share/applications/figori-desktop.desktop"
bash -n "$user_home/.local/bin/figori-desktop"
test "$(cat "$user_home/.local/bin/figori")" = 'legacy CLI'
test "$(cat "$user_home/.local/share/com.befeast.figori/recovery.json")" = 'private recovery sentinel'
if bash "$root/scripts/install-linux-user.sh" install "$payload" "$user_home" >/dev/null 2>&1; then echo 'Existing revision overwritten' >&2; exit 1; fi
rollback=$(find "$user_home/.local/state/figori/install-backups" -name rollback.sh)
bash "$rollback"
test "$(cat "$user_home/.local/bin/figori-desktop")" = 'old desktop wrapper'
grep -qx 'Name=Old Figori' "$user_home/.local/share/applications/com.befeast.figori.desktop"
test "$(cat "$user_home/.local/share/icons/hicolor/256x256/apps/com.befeast.figori.png")" = 'old icon'
test ! -e "$user_home/.local/share/applications/figori-desktop.desktop"
test ! -e "$user_home/.local/opt/figori/$(cat "$payload/SOURCE_COMMIT")"
test "$(cat "$user_home/.local/share/com.befeast.figori/recovery.json")" = 'private recovery sentinel'
fresh="$test_root/fresh"
mkdir -p "$fresh"
bash "$root/scripts/install-linux-user.sh" install "$payload" "$fresh" >/dev/null
bash "$(find "$fresh/.local/state/figori/install-backups" -name rollback.sh)"
test ! -e "$fresh/.local/bin/figori-desktop"
linked="$test_root/linked"
mkdir -p "$linked/.local/bin" "$linked/.local/share/applications" "$linked/.local/share/icons/hicolor/128x128/apps"
printf 'target sentinel' > "$test_root/sentinel"
ln -s "$test_root/sentinel" "$linked/.local/bin/figori-desktop"
ln -s "$test_root/sentinel" "$linked/.local/share/applications/figori-desktop.desktop"
ln -s "$test_root/sentinel" "$linked/.local/share/icons/hicolor/128x128/apps/figori-desktop.png"
bash "$root/scripts/install-linux-user.sh" install "$payload" "$linked" >/dev/null
test "$(cat "$test_root/sentinel")" = 'target sentinel'
bash "$(find "$linked/.local/state/figori/install-backups" -name rollback.sh)"
for relative in .local/bin/figori-desktop .local/share/applications/figori-desktop.desktop .local/share/icons/hicolor/128x128/apps/figori-desktop.png; do
 test -L "$linked/$relative"
 test "$(readlink "$linked/$relative")" = "$test_root/sentinel"
done
test "$(cat "$test_root/sentinel")" = 'target sentinel'
echo 'PASS: checksum failure, upgrade, path quoting, identity, duplicate prevention, rollback and data preservation'
