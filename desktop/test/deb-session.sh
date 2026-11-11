#!/bin/sh
set -eu
umask 077
session=${1:?x11 or wayland required}
case "$session" in x11|wayland) ;; *) exit 2 ;; esac
suite=${2:-installed}
case "$suite" in installed|dialogs) ;; *) exit 2 ;; esac
ATOM_DESKTOP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ATOM_DESKTOP_ROOT/test/deb-runtime-cleanup.sh"
export XDG_RUNTIME_DIR=$(mktemp -d /tmp/atom-deb-runtime-XXXXXX)
export ATOM_DEB_DISPLAY_SESSION="$session" LIBGL_ALWAYS_SOFTWARE=1
dbus-update-activation-environment XDG_RUNTIME_DIR
unset ELECTRON_RUN_AS_NODE
compositor_pid=
portal_pid=
pipewire_pid=
wireplumber_pid=
surface_root=
cleanup() {
  if [ -n "$portal_pid" ]; then kill "$portal_pid" 2>/dev/null || true; wait "$portal_pid" 2>/dev/null || true; fi
  if [ -n "$compositor_pid" ]; then kill "$compositor_pid" 2>/dev/null || true; wait "$compositor_pid" 2>/dev/null || true; fi
  if [ -n "$wireplumber_pid" ]; then kill "$wireplumber_pid" 2>/dev/null || true; wait "$wireplumber_pid" 2>/dev/null || true; fi
  if [ -n "$pipewire_pid" ]; then kill "$pipewire_pid" 2>/dev/null || true; wait "$pipewire_pid" 2>/dev/null || true; fi
  cleanup_deb_runtime "$XDG_RUNTIME_DIR"
  if [ -n "$surface_root" ]; then rm -rf -- "$surface_root"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$ATOM_DESKTOP_ROOT/test-results"
if [ "$suite" = dialogs ]; then
  [ "${GITHUB_ACTIONS:-}" = true ] || { echo 'Native dialog qualification requires a disposable Actions VM' >&2; exit 1; }
  surface_root=$(mktemp -d /tmp/atom-native-surfaces-XXXXXX)
  export ATOM_NATIVE_SURFACE_ROOT="$surface_root"
  export ATOM_NATIVE_SURFACE_HOME="$surface_root/Native home — çığ spaces"
  export XDG_CONFIG_HOME="$ATOM_NATIVE_SURFACE_HOME/config" XDG_DATA_HOME="$ATOM_NATIVE_SURFACE_HOME/data"
  export XDG_CACHE_HOME="$ATOM_NATIVE_SURFACE_HOME/cache" XDG_STATE_HOME="$ATOM_NATIVE_SURFACE_HOME/state"
  export ATOM_NATIVE_SURFACE_DOCUMENTS="$ATOM_NATIVE_SURFACE_HOME/Documents — Türkçe uzun klasör with spaces"
  export XDG_CURRENT_DESKTOP=GNOME GTK_MODULES=atk-bridge LANG=C.UTF-8 LC_ALL=C.UTF-8
  unset NO_AT_BRIDGE
  mkdir -p "$XDG_CONFIG_HOME/xdg-desktop-portal" "$ATOM_NATIVE_SURFACE_DOCUMENTS"
  printf '[preferred]\ndefault=gtk\norg.freedesktop.impl.portal.FileChooser=gtk\n' >"$XDG_CONFIG_HOME/xdg-desktop-portal/portals.conf"
  printf 'XDG_DOCUMENTS_DIR="%s"\n' "$ATOM_NATIVE_SURFACE_DOCUMENTS" >"$XDG_CONFIG_HOME/user-dirs.dirs"
  gsettings set org.gnome.desktop.interface toolkit-accessibility true
  dbus-update-activation-environment "HOME=$ATOM_NATIVE_SURFACE_HOME" XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME XDG_CURRENT_DESKTOP GTK_MODULES LANG LC_ALL
  pipewire >"$ATOM_DESKTOP_ROOT/test-results/native-pipewire.log" 2>&1 &
  pipewire_pid=$!
  for attempt in $(seq 1 100); do
    [ ! -S "$XDG_RUNTIME_DIR/pipewire-0" ] || break
    kill -0 "$pipewire_pid" 2>/dev/null || exit 1
    sleep 0.1
  done
  [ -S "$XDG_RUNTIME_DIR/pipewire-0" ] || exit 1
  wireplumber >"$ATOM_DESKTOP_ROOT/test-results/native-wireplumber.log" 2>&1 &
  wireplumber_pid=$!
fi
if [ "$session" = wayland ]; then
  unset DISPLAY
  export GDK_BACKEND=wayland WAYLAND_DISPLAY=wayland-atom-deb XDG_SESSION_TYPE=wayland
  mutter --wayland --headless --no-x11 --virtual-monitor 1440x900 --wayland-display "$WAYLAND_DISPLAY" >"$ATOM_DESKTOP_ROOT/test-results/deb-compositor.log" 2>&1 &
  compositor_pid=$!
  for attempt in $(seq 1 300); do
    [ ! -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || break
    kill -0 "$compositor_pid" 2>/dev/null || { cat "$ATOM_DESKTOP_ROOT/test-results/deb-compositor.log" >&2; exit 1; }
    sleep 0.2
  done
  [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || { cat "$ATOM_DESKTOP_ROOT/test-results/deb-compositor.log" >&2; exit 1; }
  dbus-update-activation-environment GDK_BACKEND WAYLAND_DISPLAY XDG_SESSION_TYPE
else
  unset WAYLAND_DISPLAY
  export GDK_BACKEND=x11 XDG_SESSION_TYPE=x11
  : "${DISPLAY:?Run the X11 session under xvfb-run}"
  mutter --x11 --replace >"$ATOM_DESKTOP_ROOT/test-results/deb-compositor.log" 2>&1 &
  compositor_pid=$!
  dbus-update-activation-environment GDK_BACKEND DISPLAY XDG_SESSION_TYPE
fi
if [ "$suite" = dialogs ]; then
  export ATOM_NATIVE_COMPOSITOR_PID="$compositor_pid"
  HOME="$ATOM_NATIVE_SURFACE_HOME" /usr/libexec/xdg-desktop-portal-gtk --replace --verbose >"$ATOM_DESKTOP_ROOT/test-results/native-dialog-portal.log" 2>&1 &
  portal_pid=$!
  export ATOM_NATIVE_DIALOG_PID="$portal_pid"
  gdbus wait --session org.freedesktop.impl.portal.desktop.gtk --timeout 15
  gdbus call --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop --method org.freedesktop.DBus.Properties.Get org.freedesktop.portal.FileChooser version >"$ATOM_DESKTOP_ROOT/test-results/native-dialog-portal-version.txt"
  node "$ATOM_DESKTOP_ROOT/test/native-surfaces.mjs"
else
  node "$ATOM_DESKTOP_ROOT/test/deb-installed.mjs"
fi
