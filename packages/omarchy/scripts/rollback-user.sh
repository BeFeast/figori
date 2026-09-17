#!/usr/bin/env bash
# Explicit rollback for install-user.sh; worksheet data is retained.
set -euo pipefail
if [[ $# != 2 || $1 != --apply || $2 != /* ]]; then
  printf 'Usage: %s --apply ABSOLUTE_BACKUP_DIR\n' "$0" >&2
  exit 2
fi
backup=$2
[[ -f $backup/plugin-state.json ]] || { echo 'Missing install receipt' >&2; exit 2; }
export OMARCHY_PATH=${OMARCHY_PATH:-/usr/share/omarchy}
plugin_id=befeast.my-numi
plugin="$HOME/.config/omarchy/plugins/$plugin_id"
cli="$HOME/.local/bin/my-numi"
# Verify both restore sources before changing live state.
[[ -e $backup/cli || -L $backup/cli || -f $backup/cli-absent ]] || exit 2
[[ -e $backup/plugin || -L $backup/plugin || -f $backup/plugin-absent ]] || exit 2
if omarchy-shell shell listPlugins | jq -e --arg id "$plugin_id" 'any(.[];.id==$id)' >/dev/null; then
  omarchy-shell shell hide "$plugin_id"
  omarchy-shell shell setPluginEnabled "$plugin_id" false
fi
[[ ! -d $cli ]] || { echo 'CLI destination unexpectedly became a directory' >&2; exit 2; }
rm -f -- "$cli"
if [[ ! -f $backup/cli-absent ]]; then cp -a "$backup/cli" "$cli"; fi
rm -rf -- "$plugin"
if [[ ! -f $backup/plugin-absent ]]; then cp -a "$backup/plugin" "$plugin"; fi
omarchy-shell shell rescanPlugins
if [[ $(jq -r '.present' "$backup/plugin-state.json") == true ]]; then
  omarchy-shell shell setPluginEnabled "$plugin_id" "$(jq -r '.enabled' "$backup/plugin-state.json")"
fi
printf 'Restored prior plugin/executable state; worksheets and unrelated shell settings retained.\n'
