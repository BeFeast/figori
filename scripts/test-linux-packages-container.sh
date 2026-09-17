#!/usr/bin/env bash
# Invoked only by the disposable-container harness; never run on the host.
set -euo pipefail
[[ -f /.dockerenv && -f /artifacts/current.${1:-} ]] || { echo 'Container-only test' >&2; exit 2; }
kind=$1
cat /etc/os-release
export DEBIAN_FRONTEND=noninteractive
if [[ $kind == deb ]]; then
  apt-get update -qq
  apt-get install -y --no-install-recommends desktop-file-utils file xvfb x11-utils dbus-x11 util-linux
  name=$(dpkg-deb -f /artifacts/current.deb Package)
  install_package() { apt-get install -y --no-install-recommends "$1"; }
  reinstall_package() { apt-get install -y --reinstall /artifacts/current.deb; }
  remove_package() { apt-get purge -y "$name"; }
  installed_version() { dpkg-query -W -f='${Version}\n' "$name"; }
else
  dnf install -y --setopt=install_weak_deps=False desktop-file-utils file findutils diffutils xorg-x11-server-Xvfb xorg-x11-utils dbus-daemon util-linux shadow-utils
  name=$(rpm -qp --qf '%{NAME}' /artifacts/current.rpm)
  install_package() { dnf install -y --setopt=install_weak_deps=False "$1"; }
  reinstall_package() { dnf reinstall -y /artifacts/current.rpm; }
  remove_package() { dnf remove -y "$name"; }
  installed_version() { rpm -q --qf '%{VERSION}-%{RELEASE}\n' "$name"; }
fi
user_home=/home/figori-test
mkdir -p "$user_home/Documents" "$user_home/.local/share/com.befeast.figori" "$user_home/.local/share/applications" "$user_home/.local/bin"
printf '# Synthetic worksheet\nprice = 12\nprice * 3\n' > "$user_home/Documents/retained.numi"
printf '{"source":"price = 12","dirty":true}\n' > "$user_home/.local/share/com.befeast.figori/recovery.json"
printf '#!/bin/sh\necho legacy-cli\n' > "$user_home/.local/bin/figori"
# Native packages must not delete a user's prior launcher. It may shadow the system entry.
printf '[Desktop Entry]\nType=Application\nName=Previous Figori\nExec=/old/figori-desktop\n' > "$user_home/.local/share/applications/figori-desktop.desktop"
find "$user_home" -type f -print0 | sort -z | xargs -0 sha256sum > /tmp/user-state.sha256
check_state() { sha256sum -c /tmp/user-state.sha256; }
startup_smoke() {
  useradd -m -d /home/figori-smoke figori-smoke
  mkdir -p /tmp/figori-smoke-runtime
  chmod 700 /tmp/figori-smoke-runtime
  chown figori-smoke:figori-smoke /tmp/figori-smoke-runtime
  runuser -u figori-smoke -- env HOME=/home/figori-smoke XDG_RUNTIME_DIR=/tmp/figori-smoke-runtime GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 dbus-run-session -- bash -s <<'SMOKE'
set -euo pipefail
Xvfb :99 -screen 0 1024x768x24 >/tmp/figori-xvfb.log 2>&1 &
xvfb_pid=$!
app_pid=
trap 'if [[ -n $app_pid ]]; then kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; fi; kill "$xvfb_pid" 2>/dev/null || true' EXIT
export DISPLAY=:99
for attempt in {1..20}; do xdpyinfo >/dev/null 2>&1 && break; sleep 0.2; done
/usr/bin/figori-desktop >/tmp/figori-startup.log 2>&1 &
app_pid=$!
for attempt in {1..30}; do
  kill -0 "$app_pid" || { cat /tmp/figori-startup.log; exit 1; }
  window_id=$(xwininfo -root -tree | awk 'tolower($0) ~ /"[^"]*figori[^"]*"/ && $1 ~ /^0x/ { print $1; exit }')
  if [[ -n $window_id ]] && xwininfo -id "$window_id" | grep -q 'Map State: IsViewable'; then
    echo 'PASS: headless X11 mapped Figori window'
    sleep 2
    kill -0 "$app_pid"
    cat /tmp/figori-startup.log
    exit 0
  fi
  sleep 0.5
done
cat /tmp/figori-startup.log
echo 'FAIL: no mapped Figori window within 15 seconds' >&2
exit 1
SMOKE
}
check_install() {
  test -x /usr/bin/figori-desktop
  file /usr/bin/figori-desktop | grep -q 'ELF 64-bit.*x86-64'
  ldd /usr/bin/figori-desktop > /tmp/figori-ldd.txt
  cat /tmp/figori-ldd.txt
  ! grep -q 'not found' /tmp/figori-ldd.txt
  local entry=/usr/share/applications/figori-desktop.desktop
  desktop-file-validate "$entry"
  grep -Eq '^Exec=(/usr/bin/)?figori-desktop([[:space:]]|$)' "$entry"
  grep -qx 'Icon=figori-desktop' "$entry"
  find /usr/share/icons -type f -path '*/apps/figori-desktop.*' | grep -q .
  check_state
  installed_version
}
if [[ -f /artifacts/previous.$kind ]]; then
  install_package "/artifacts/previous.$kind"
  before=$(installed_version)
  install_package "/artifacts/current.$kind"
  after=$(installed_version)
  [[ $before != "$after" ]] || { echo 'Upgrade fixture must use a different package version' >&2; exit 1; }
  check_install
  echo 'PASS: upgrade from distinct previous version'
  remove_package
  check_state
else
  echo 'SKIP: upgrade (no previous package supplied; reinstall is not upgrade evidence)'
fi
install_package "/artifacts/current.$kind"
check_install
echo 'PASS: fresh install and dependency resolution'
reinstall_package
check_install
echo 'PASS: reinstall'
startup_smoke
remove_package
check_state
test ! -e /usr/bin/figori-desktop
test ! -e /usr/share/applications/figori-desktop.desktop
echo 'PASS: uninstall preserves synthetic worksheets, recovery, old user launcher and CLI'
echo 'LIMIT: headless X11 startup only; no native Wayland visual or interaction acceptance'
echo 'NOTE: a pre-existing user launcher can shadow the system launcher and requires explicit user migration'
