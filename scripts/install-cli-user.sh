#!/usr/bin/env bash
# Explicit user-scope CLI delivery for macOS or Linux; no PATH/profile changes.
set -euo pipefail
if [[ $# != 4 || $1 != --apply || $2 != /* || $4 != /* ]]; then
  printf 'Usage: %s --apply ABSOLUTE_BINARY EXPECTED_SHA256 ABSOLUTE_NEW_BACKUP_DIR\n' "$0" >&2
  exit 2
fi
artifact=$2
expected=$3
backup=$4
[[ -f $artifact && ! -e $backup && $expected =~ ^[[:xdigit:]]{64}$ ]] || { echo 'Invalid artifact, checksum, or backup destination' >&2; exit 2; }
actual=$(shasum -a 256 "$artifact" | awk '{print $1}')
[[ $actual == "$expected" ]] || { echo 'Artifact checksum mismatch' >&2; exit 2; }
cli="$HOME/.local/bin/figori"
[[ ! -d $cli ]] || { echo 'CLI destination is a directory' >&2; exit 2; }
umask 077
mkdir -p "$backup" "$HOME/.local/bin"
if [[ -e $cli || -L $cli ]]; then cp -a "$cli" "$backup/cli"; else touch "$backup/cli-absent"; fi
printf '%s\n' "$expected" > "$backup/installed-sha256"
printf '%s\n' "$cli" > "$backup/installed-target"
temporary=$(mktemp "$HOME/.local/bin/.figori.XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT
install -m 755 "$artifact" "$temporary"
mv -f "$temporary" "$cli"
printf 'Installed %s; backup retained at %s\n' "$cli" "$backup"
