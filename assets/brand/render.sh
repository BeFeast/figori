#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v rsvg-convert >/dev/null
for size in 16 32 64 128 256 512; do
  rsvg-convert -w "$size" -h "$size" figori-app.svg -o "icons/figori-$size.png"
done
rsvg-convert figori-social.svg -o figori-social.png
rsvg-convert figori-lockup.svg -o figori-lockup.png
rsvg-convert -w 512 -h 512 figori-app-cobalt.svg -o icons/figori-cobalt-512.png
