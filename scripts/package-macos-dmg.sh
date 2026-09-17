#!/bin/bash
# Package an already-built single-executable Tauri app. No installs or keychain mutation.
set -euo pipefail
if [[ $# -ne 4 ]]; then
  echo "Usage: $0 draft|release /absolute/Figori.app /absolute/new-output-directory SOURCE_SHA" >&2
  exit 2
fi
mode=$1
app=$2
out=$3
revision=$4
[[ $(uname -s) == Darwin ]] || { echo 'macOS is required' >&2; exit 2; }
[[ $mode == draft || $mode == release ]] || exit 2
[[ $app == /* && $out == /* && -d $app && $revision =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ ! -e $out ]] || { echo 'Output must be a new immutable directory' >&2; exit 2; }
if [[ $mode == release ]]; then
  : "${FIGORI_SIGNING_IDENTITY:?Developer ID Application identity required}"
  : "${FIGORI_NOTARY_PROFILE:?Existing notarytool keychain profile required}"
  [[ $FIGORI_SIGNING_IDENTITY == 'Developer ID Application:'* ]] || { echo 'Use Developer ID Application, not Apple Development' >&2; exit 2; }
fi
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
arch=$(lipo -archs "$app/Contents/MacOS/figori-desktop" | tr ' ' '-')
mkdir "$out"
stage=$(mktemp -d "${TMPDIR:-/tmp}/figori-dmg.XXXXXX")
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/Figori.app"
# The current app has one executable and only Apple system runtime dependencies.
# Fail closed if future packaging adds nested code that needs inside-out signing.
if [[ -d "$stage/Figori.app/Contents/Frameworks" || -d "$stage/Figori.app/Contents/PlugIns" ]]; then
  echo 'Nested code detected: extend inside-out signing before release' >&2; exit 1
fi
if [[ $mode == release ]]; then
  codesign --force --options runtime --timestamp --sign "$FIGORI_SIGNING_IDENTITY" "$stage/Figori.app"
  codesign --verify --deep --strict --verbose=2 "$stage/Figori.app"
  ditto -c -k --sequesterRsrc --keepParent "$stage/Figori.app" "$out/notarization-app.zip"
  xcrun notarytool submit "$out/notarization-app.zip" --keychain-profile "$FIGORI_NOTARY_PROFILE" --wait --output-format json > "$out/app-notarization.json"
  /usr/bin/plutil -extract status raw -o - "$out/app-notarization.json" | /usr/bin/grep -qx Accepted
  xcrun stapler staple "$stage/Figori.app"
  xcrun stapler validate "$stage/Figori.app"
  spctl --assess --type execute --verbose=2 "$stage/Figori.app"
  suffix=''
else
  codesign --force --sign - "$stage/Figori.app"
  suffix='-DRAFT-NOT-NOTARIZED'
fi
ln -s /Applications "$stage/Applications"
cat > "$stage/Install.txt" <<'TXT'
Figori

Drag Figori.app to Applications, then eject this disk image.
For a per-user installation, copy Figori.app into your home Applications folder instead.
Quit an existing Figori instance after saving your worksheet before replacing it.
No system extension, background service, or command-line installation is required.
TXT
name="Figori-${version}-macos-${arch}${suffix}.dmg"
hdiutil create -volname "Figori ${version}" -srcfolder "$stage" -ov -format UDZO "$out/$name"
if [[ $mode == release ]]; then
  codesign --force --timestamp --sign "$FIGORI_SIGNING_IDENTITY" "$out/$name"
  xcrun notarytool submit "$out/$name" --keychain-profile "$FIGORI_NOTARY_PROFILE" --wait --output-format json > "$out/dmg-notarization.json"
  /usr/bin/plutil -extract status raw -o - "$out/dmg-notarization.json" | /usr/bin/grep -qx Accepted
  xcrun stapler staple "$out/$name"
  xcrun stapler validate "$out/$name"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$out/$name"
fi
printf '%s\n' "$revision" > "$out/SOURCE_COMMIT"
printf 'mode=%s\nversion=%s\narchitecture=%s\n' "$mode" "$version" "$arch" > "$out/PACKAGING_STATUS"
(cd "$out" && shasum -a 256 "$name" SOURCE_COMMIT PACKAGING_STATUS > SHA256SUMS && shasum -a 256 -c SHA256SUMS)
echo "$out/$name"
