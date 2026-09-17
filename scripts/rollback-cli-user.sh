#!/usr/bin/env bash
# Restore the executable snapshot only; application data is retained.
set -euo pipefail
if [[ $# != 2 || $1 != --apply || $2 != /* ]]; then
  printf 'Usage: %s --apply ABSOLUTE_BACKUP_DIR\n' "$0" >&2
  exit 2
fi
backup=$2
[[ -f $backup/installed-sha256 ]] || { echo 'Missing install receipt' >&2; exit 2; }
[[ -e $backup/cli || -L $backup/cli || -f $backup/cli-absent ]] || { echo 'Missing prior executable state' >&2; exit 2; }
cli="$HOME/.local/bin/figori"
[[ -f $backup/installed-target && $(cat "$backup/installed-target") == "$cli" ]] || { echo 'Backup target does not match this Figori executable' >&2; exit 2; }
[[ ! -d $cli ]] || { echo 'CLI destination became a directory' >&2; exit 2; }
rm -f -- "$cli"
if [[ ! -f $backup/cli-absent ]]; then cp -a "$backup/cli" "$cli"; fi
printf 'Restored prior CLI state; profiles, PATH, and worksheet data unchanged.\n'
