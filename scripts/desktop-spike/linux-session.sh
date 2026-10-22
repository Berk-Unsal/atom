#!/bin/sh
# D01 (#148): run the Electron qualification suite inside a GNOME Mutter
# session on Ubuntu: X11 (Mutter as the window manager on Xvfb) or Wayland
# (headless Mutter compositor with a 1440x900 virtual monitor, no Xwayland).
#
# Electron's renderer sandbox is tried first as shipped (user namespaces). If
# Ubuntu's AppArmor userns restriction blocks it, the SUID chrome-sandbox the
# .deb would install is configured instead. --no-sandbox is never used.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SPIKE="$ROOT/desktop/spike/electron"
OUT="$SPIKE/build/evidence"
mkdir -p "$OUT"
session=$1
# Mutter needs a session bus; re-run this script inside a private one.
if [ -z "${ATOM_IN_DBUS_SESSION:-}" ]; then
  ATOM_IN_DBUS_SESSION=1 exec dbus-run-session -- "$0" "$@"
fi
export XDG_RUNTIME_DIR=$(mktemp -d)
chmod 700 "$XDG_RUNTIME_DIR"

start_session() {
  if [ "$session" = x11 ]; then
    Xvfb :99 -screen 0 1440x900x24 -nolisten tcp >"$OUT/xvfb.log" 2>&1 &
    sleep 2
    export DISPLAY=:99
    unset WAYLAND_DISPLAY
    mutter --x11 --replace >"$OUT/mutter.log" 2>&1 &
    export ATOM_SPIKE_DIALOG_DRIVER=xdotool
  else
    unset DISPLAY
    mutter --wayland --headless --no-x11 --virtual-monitor 1440x900 --wayland-display wayland-atom >"$OUT/mutter.log" 2>&1 &
    export WAYLAND_DISPLAY=wayland-atom
    export ATOM_SPIKE_ELECTRON_ARGS="--ozone-platform=wayland"
  fi
  sleep 4
  if pgrep -x mutter >/dev/null; then echo "compositor: mutter ($session)"; else echo "compositor: mutter failed to start"; cat "$OUT/mutter.log"; fi
}

launch_check() {
  node -e '
    const { _electron } = require("playwright-core");
    (async () => {
      const app = await _electron.launch({ executablePath: require("electron"), args: [process.cwd(), ...(process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean)],
        env: { ...process.env, ATOM_SPIKE_DIST: process.env.ROOT + "/frontend-react/dist", ATOM_SPIKE_SIDECAR: "/bin/false", ATOM_SPIKE_PROFILE: process.cwd() + "/build/profile-launch-check" }, timeout: 45000 });
      const page = await app.firstWindow();
      console.log("renderer sandboxed:", await page.evaluate(() => typeof process === "undefined"), "ozone:", JSON.stringify((await app.evaluate(() => global.__atomSpike.platform))));
      await app.close();
    })().catch((error) => { console.error(error.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });'
}

run_session() {
  start_session
  cd "$SPIKE"
  export ROOT
  if ROOT="$ROOT" launch_check >"$OUT/sandbox-userns.log" 2>&1; then
    echo "sandbox: user namespaces" | tee "$OUT/sandbox-mode.txt"
  else
    cat "$OUT/sandbox-userns.log"
    sudo chown root:root node_modules/electron/dist/chrome-sandbox
    sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
    if ROOT="$ROOT" launch_check >"$OUT/sandbox-suid.log" 2>&1; then
      echo "sandbox: SUID chrome-sandbox (user namespaces blocked)" | tee "$OUT/sandbox-mode.txt"
    else
      cat "$OUT/sandbox-suid.log"
      echo "sandbox: FAILED" | tee "$OUT/sandbox-mode.txt"
      exit 1
    fi
  fi
  "$ROOT/scripts/desktop-spike/qualify-electron.sh"
}

run_session
