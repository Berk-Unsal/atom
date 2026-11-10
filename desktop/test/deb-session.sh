#!/bin/sh
set -eu
umask 077
session=${1:?x11 or wayland required}
case "$session" in x11|wayland) ;; *) exit 2 ;; esac
ATOM_DESKTOP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export XDG_RUNTIME_DIR=$(mktemp -d /tmp/atom-deb-runtime-XXXXXX)
export ATOM_DEB_DISPLAY_SESSION="$session" LIBGL_ALWAYS_SOFTWARE=1
dbus-update-activation-environment XDG_RUNTIME_DIR
unset ELECTRON_RUN_AS_NODE
compositor_pid=
cleanup() {
  if [ -n "$compositor_pid" ]; then kill "$compositor_pid" 2>/dev/null || true; wait "$compositor_pid" 2>/dev/null || true; fi
  rm -rf "$XDG_RUNTIME_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$ATOM_DESKTOP_ROOT/test-results"
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
node "$ATOM_DESKTOP_ROOT/test/deb-installed.mjs"
