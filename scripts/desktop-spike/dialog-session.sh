#!/bin/sh
# Native GTK chooser qualification for #148, without Xwayland in Wayland mode.
# Run on Ubuntu 24.04 after installing the pinned Electron spike and frontend.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SPIKE="$ROOT/desktop/spike/electron"
OUT="$SPIKE/build/evidence"
session=${1:-wayland}
suite=${2:-dialogs}
case "$session" in x11|wayland) ;; *) echo "usage: $0 x11|wayland [dialogs|full]" >&2; exit 2 ;; esac
case "$suite" in dialogs|full) ;; *) echo "unknown suite: $suite" >&2; exit 2 ;; esac
if [ -z "${ATOM_DIALOG_DBUS_SESSION:-}" ]; then
  exec dbus-run-session -- env ATOM_DIALOG_DBUS_SESSION=1 "$0" "$@"
fi
mkdir -p "$OUT"
XDG_RUNTIME_DIR=$(mktemp -d)
XDG_CONFIG_HOME="$XDG_RUNTIME_DIR/config"
export XDG_RUNTIME_DIR XDG_CONFIG_HOME XDG_CURRENT_DESKTOP=GNOME
chmod 700 "$XDG_RUNTIME_DIR"
mkdir -p "$XDG_CONFIG_HOME/xdg-desktop-portal"
printf '[preferred]\ndefault=gtk\norg.freedesktop.impl.portal.FileChooser=gtk\n' >"$XDG_CONFIG_HOME/xdg-desktop-portal/portals.conf"
dbus-update-activation-environment XDG_RUNTIME_DIR XDG_CONFIG_HOME XDG_CURRENT_DESKTOP
compositor_pid=
xvfb_pid=
portal_pid=
profile_file=
cleanup() {
  [ -z "$portal_pid" ] || kill "$portal_pid" 2>/dev/null || true
  [ -z "$compositor_pid" ] || kill "$compositor_pid" 2>/dev/null || true
  [ -z "$xvfb_pid" ] || kill "$xvfb_pid" 2>/dev/null || true
  if [ -n "$profile_file" ]; then
    sudo apparmor_parser -R "$profile_file" || true
    sudo rm -f "$profile_file"
  fi
  rm -rf "$XDG_RUNTIME_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
unset ELECTRON_RUN_AS_NODE NO_AT_BRIDGE
export GTK_MODULES=atk-bridge ATOM_SPIKE_DIALOG_DRIVER=atspi
gsettings set org.gnome.desktop.interface toolkit-accessibility true
if [ "$session" = wayland ]; then
  unset DISPLAY
  export GDK_BACKEND=wayland WAYLAND_DISPLAY=wayland-atom
  export ATOM_SPIKE_ELECTRON_ARGS=--ozone-platform=wayland
  mutter --wayland --headless --no-x11 --virtual-monitor 1440x900 --wayland-display "$WAYLAND_DISPLAY" >"$OUT/mutter.log" 2>&1 &
  compositor_pid=$!
  for attempt in $(seq 1 50); do
    [ ! -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || break
    kill -0 "$compositor_pid"
    sleep 0.2
  done
  test -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"
else
  unset WAYLAND_DISPLAY ATOM_SPIKE_ELECTRON_ARGS
  export GDK_BACKEND=x11 DISPLAY=:99
  Xvfb "$DISPLAY" -screen 0 1440x900x24 -nolisten tcp >"$OUT/xvfb.log" 2>&1 &
  xvfb_pid=$!
  sleep 2
  mutter --x11 --replace >"$OUT/mutter.log" 2>&1 &
  compositor_pid=$!
fi
# Chromium deliberately disables GTK's in-process ATK bridge. Exercise its
# supported desktop portal backend instead: a real, separate GTK native chooser.
# The driver is restricted to the exact portal process this session owns.
dbus-update-activation-environment GDK_BACKEND
if [ "$session" = wayland ]; then
  dbus-update-activation-environment WAYLAND_DISPLAY
else
  dbus-update-activation-environment DISPLAY
fi
/usr/libexec/xdg-desktop-portal-gtk --replace --verbose >"$OUT/portal-gtk.log" 2>&1 &
portal_pid=$!
export ATOM_SPIKE_DIALOG_PID="$portal_pid"
gdbus wait --session org.freedesktop.impl.portal.desktop.gtk --timeout 15
gdbus call --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop \
  --method org.freedesktop.DBus.Properties.Get org.freedesktop.portal.FileChooser version | tee "$OUT/portal-filechooser-version.txt"
kill -0 "$portal_pid"
# Match the already-qualified Ubuntu userns sandbox arrangement; never disable
# Chromium's sandbox or change the machine-wide userns restriction.
profile_file="/etc/apparmor.d/atom-dialog-$(basename "$XDG_RUNTIME_DIR")"
printf 'abi <abi/4.0>,\ninclude <tunables/global>\nprofile atom-dialog-%s "%s" flags=(unconfined) {\n  userns,\n}\n' \
  "$(basename "$XDG_RUNTIME_DIR")" "$SPIKE/node_modules/electron/dist/electron" | sudo tee "$profile_file" >/dev/null
sudo apparmor_parser -r "$profile_file"
sleep 2
kill -0 "$compositor_pid"
(cd "$ROOT/backend-go" && go build -trimpath -o "$SPIKE/build/atom-api" .)
cd "$SPIKE"
if [ "$suite" = full ]; then
  "$ROOT/scripts/desktop-spike/qualify-electron.sh"
else
  node workflows.mjs "native-dialogs-$session" --dialogs-only
fi
