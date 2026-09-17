#!/usr/bin/env bash
# Install a verified Figori desktop archive into one user's home. No services or MIME defaults.
set -euo pipefail
if [[ ${1:-} != install || $# -lt 2 || $# -gt 3 ]]; then
  echo 'Usage: bash install-linux-user.sh install EXTRACTED_ARCHIVE [USER_HOME]' >&2
  exit 2
fi
payload=$(cd "$2" && pwd -P)
user_home=${3:-$HOME}
[[ $user_home == /* && -d $user_home ]] || { echo 'USER_HOME must be an existing absolute directory' >&2; exit 2; }
user_home=$(cd "$user_home" && pwd -P)
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'This archive requires Linux x86_64' >&2; exit 2; }
for tool in sha256sum ldd file pgrep; do command -v "$tool" >/dev/null || { echo "Required tool: $tool" >&2; exit 2; }; done
(cd "$payload" && sha256sum -c SHA256SUMS)
revision=$(cat "$payload/SOURCE_COMMIT")
[[ $revision =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid SOURCE_COMMIT' >&2; exit 2; }
file "$payload/figori.png" | grep -q '128 x 128' || { echo 'Expected 128x128 PNG icon' >&2; exit 2; }
# Resolve the complete dependency graph before changing any installed path.
dependencies=$(ldd "$payload/figori-desktop")
if grep -q 'not found' <<< "$dependencies"; then printf '%s\n' "$dependencies" >&2; exit 1; fi
if pgrep -x figori-desktop >/dev/null 2>&1; then
  echo 'Save your worksheet and quit Figori before installing this update.' >&2
  exit 1
fi
destination="$user_home/.local/opt/figori/$revision"
[[ ! -e $destination ]] || { echo "This revision is already installed: $destination" >&2; exit 1; }
backup="$user_home/.local/state/figori/install-backups/$(date -u +%Y%m%dT%H%M%SZ)-$revision"
[[ ! -e $backup ]] || { echo 'Backup already exists; retry later' >&2; exit 1; }
mkdir -p "$backup" "$(dirname "$destination")"
printf '%s\n' "$dependencies" > "$backup/DEPENDENCIES_RESOLVED.txt"
rollback="$backup/rollback.sh"
printf '#!/usr/bin/env bash\nset -euo pipefail\nif pgrep -x figori-desktop >/dev/null 2>&1; then echo "Quit Figori before rollback" >&2; exit 1; fi\n' > "$rollback"
# Include the earlier installer identity to avoid two launcher entries after upgrade.
paths=(.local/bin/figori-desktop .local/share/applications/figori-desktop.desktop .local/share/applications/com.befeast.figori.desktop .local/share/icons/hicolor/128x128/apps/figori-desktop.png .local/share/icons/hicolor/256x256/apps/com.befeast.figori.png)
for relative in "${paths[@]}"; do
  target="$user_home/$relative"
  mkdir -p "$(dirname "$target")"
  if [[ -e $target || -L $target ]]; then
    mkdir -p "$backup/$(dirname "$relative")"
    cp -a "$target" "$backup/$relative"
    printf 'rm -f -- %q\ncp -a -- %q %q\n' "$target" "$backup/$relative" "$target" >> "$rollback"
  else
    printf 'rm -f -- %q\n' "$target" >> "$rollback"
  fi
done
printf 'rm -rf -- %q\n' "$destination" >> "$rollback"
printf 'if command -v update-desktop-database >/dev/null; then update-desktop-database %q; fi\n' "$user_home/.local/share/applications" >> "$rollback"
printf 'if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t %q; fi\n' "$user_home/.local/share/icons/hicolor" >> "$rollback"
chmod 700 "$rollback"
# The backup and rollback are complete before the first replacement.
trap 'echo "Installation interrupted. Roll back with: bash $rollback" >&2' ERR
cp -a "$payload" "$destination"
# Replace leaf paths atomically; never follow an existing launcher/icon symlink.
replace_file() {
  local source=$1 target=$2 temporary
  temporary=$(mktemp "${target}.XXXXXX")
  cp -- "$source" "$temporary"
  chmod --reference="$source" "$temporary"
  mv -fT -- "$temporary" "$target"
}
# Shell argv quoting protects user homes containing spaces or shell metacharacters.
printf '#!/usr/bin/env bash\nexec %q "$@"\n' "$destination/figori-desktop" > "$backup/new-launcher"
chmod 755 "$backup/new-launcher"
replace_file "$backup/new-launcher" "$user_home/.local/bin/figori-desktop"
replace_file "$payload/figori.png" "$user_home/.local/share/icons/hicolor/128x128/apps/figori-desktop.png"
# Desktop Entry Exec quoting is distinct from shell quoting.
exec_path="$user_home/.local/bin/figori-desktop"
exec_path=${exec_path//\\/\\\\}; exec_path=${exec_path//\"/\\\"}; exec_path=${exec_path//\$/\\\$}; exec_path=${exec_path//\`/\\\`}; exec_path=${exec_path//%/%%}
cat > "$backup/new-launcher.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Figori
Comment=Calendar-aware calculator worksheets
Exec="$exec_path" %f
Icon=figori-desktop
Terminal=false
Categories=Office;
StartupWMClass=figori-desktop
EOF
if command -v desktop-file-validate >/dev/null; then desktop-file-validate "$backup/new-launcher.desktop"; fi
replace_file "$backup/new-launcher.desktop" "$user_home/.local/share/applications/figori-desktop.desktop"
rm -f "$user_home/.local/share/applications/com.befeast.figori.desktop" "$user_home/.local/share/icons/hicolor/256x256/apps/com.befeast.figori.png"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$user_home/.local/share/applications"; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$user_home/.local/share/icons/hicolor"; fi
printf 'source=%s\ninstalled=%s\nrollback=%s\n' "$revision" "$destination" "$rollback" > "$backup/INSTALL_RECEIPT"
cat "$backup/INSTALL_RECEIPT"
echo 'Installation complete. Launch Figori from your application menu. User documents and the legacy figori CLI were not changed.'
