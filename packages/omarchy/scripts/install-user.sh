#!/usr/bin/env bash
# Explicitly invoked delivery step; never run by build/CI.
set -euo pipefail
if [[ $# != 3 || $1 != --apply ]]; then
  printf 'Usage: %s --apply ABSOLUTE_ARTIFACT_DIR ABSOLUTE_NEW_BACKUP_DIR\n' "$0" >&2
  exit 2
fi
artifact=$2
backup=$3
[[ $artifact == /* && $backup == /* ]] || { echo 'Both paths must be absolute' >&2; exit 2; }
[[ -d $artifact && ! -e $backup ]] || { echo 'Artifact missing or backup path already exists' >&2; exit 2; }
export OMARCHY_PATH=${OMARCHY_PATH:-/usr/share/omarchy}
plugin_id=befeast.my-numi
plugin="$HOME/.config/omarchy/plugins/$plugin_id"
cli="$HOME/.local/bin/my-numi"
[[ ! -d $cli ]] || { echo 'CLI destination is a directory' >&2; exit 2; }
[[ -f $artifact/my-numi && -f $artifact/Panel.qml && -f $artifact/manifest.json ]] || { echo 'Incomplete artifact' >&2; exit 2; }
[[ $(jq -r '.id' "$artifact/manifest.json") == "$plugin_id" ]] || { echo 'Unexpected plugin id' >&2; exit 2; }
(cd "$artifact" && sha256sum --check SHA256SUMS)
plugin_state=$(omarchy-shell shell listPlugins | jq -c --arg id "$plugin_id" '[.[] | select(.id==$id)] | if length==0 then {present:false,enabled:false} else {present:true,enabled:.[0].enabled} end')
umask 077
mkdir -p "$backup"
printf '%s\n' "$plugin_state" > "$backup/plugin-state.json"
if [[ -e $cli || -L $cli ]]; then cp -a "$cli" "$backup/cli"; else touch "$backup/cli-absent"; fi
if [[ -e $plugin || -L $plugin ]]; then cp -a "$plugin" "$backup/plugin"; else touch "$backup/plugin-absent"; fi
if [[ -e $HOME/.config/omarchy/shell.json ]]; then cp -a "$HOME/.config/omarchy/shell.json" "$backup/shell.json"; fi
# Keep a restorable snapshot; no broad shell.json restore is performed.
mkdir -p "$HOME/.local/bin" "$HOME/.config/omarchy/plugins"
install -m 755 "$artifact/my-numi" "$cli.new"
mv -T "$cli.new" "$cli"
mkdir "$backup/new-plugin"
cp "$artifact/manifest.json" "$artifact/Panel.qml" "$backup/new-plugin/"
if [[ -e $plugin || -L $plugin ]]; then rm -rf -- "$plugin"; fi
mv "$backup/new-plugin" "$plugin"
omarchy-shell shell rescanPlugins
omarchy-shell shell setPluginEnabled "$plugin_id" true
printf 'Installed %s; backup retained at %s\n' "$plugin_id" "$backup"
printf 'Open explicitly with: omarchy-shell shell summon %s '\''{"cli":"%s"}'\''\n' "$plugin_id" "$cli"
