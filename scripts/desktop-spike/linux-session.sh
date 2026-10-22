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

# Direct launch with logging: shows startup milestones and sandbox errors that
# Playwright's launch timeout would hide.
diagnose() {
  ATOM_SPIKE_TRACE=1 ELECTRON_ENABLE_LOGGING=1 ATOM_SPIKE_DIST="$ROOT/frontend-react/dist" ATOM_SPIKE_SIDECAR=/bin/false     ATOM_SPIKE_PROFILE="$SPIKE/build/profile-diagnose-$1" timeout -s KILL 40     node_modules/electron/dist/electron "$SPIKE" ${ATOM_SPIKE_ELECTRON_ARGS:-} --remote-debugging-port=0 >"$OUT/diagnose-$1.log" 2>&1
  echo "diagnose $1: exit $?"
  grep -E "atom-spike:|DevTools listening|FATAL|ERROR|sandbox|Sandbox|zygote|namespace" "$OUT/diagnose-$1.log" | head -60
}

# Startup-blocker matrix: each variant launches directly for 25 s and records
# whether the main window finishes loading through the app:// handler.
diagnose_variants() {
  ls /usr/share/dbus-1/services >"$OUT/dbus-activatable-services.txt" 2>&1
  # Which part of startup blocks the main thread: no sidecar, a sidecar that
  # exits at once, or the real sidecar. Baseline also gets a native backtrace.
  (cd "$ROOT/backend-go" && go build -o "$SPIKE/build/atom-api" .)
  for variant in no-sidecar exiting-sidecar real-sidecar; do
    case $variant in
      no-sidecar) sidecar=none ;;
      exiting-sidecar) sidecar=/bin/false ;;
      real-sidecar) sidecar="$SPIKE/build/atom-api" ;;
    esac
    ATOM_SPIKE_TRACE=1 ATOM_SPIKE_DIST="$ROOT/frontend-react/dist" ATOM_SPIKE_SIDECAR="$sidecar" ATOM_SPIKE_DATASET_DIR="$ROOT/data-pipeline" ATOM_SPIKE_PROFILE="$SPIKE/build/profile-variant-$variant" \
      node_modules/electron/dist/electron "$SPIKE" ${ATOM_SPIKE_ELECTRON_ARGS:-} >"$OUT/variant-$variant.log" 2>&1 &
    pid=$!
    sleep 15
    if [ "$variant" = exiting-sidecar ] || ! grep -q "main window loaded" "$OUT/variant-$variant.log"; then
      sudo gdb -p "$pid" -batch -ex "info threads" -ex "thread 1" -ex "bt 40" >"$OUT/variant-$variant-gdb.txt" 2>&1
    fi
    kill -9 "$pid" 2>/dev/null; pkill -9 -f "profile-variant-$variant" 2>/dev/null; pkill -9 -f "atom-api --desktop-control" 2>/dev/null
    loaded=$(grep -c "main window loaded" "$OUT/variant-$variant.log")
    echo "variant $variant: window_loaded=$loaded fetch=$(grep -o 'net.fetch[^$]*' "$OUT/variant-$variant.log" | head -1 | cut -c1-60) heartbeat=$(grep -o 'heartbeat 2:.*' "$OUT/variant-$variant.log" | head -1 | cut -c1-200)" | tee -a "$OUT/startup-variants.txt"
    [ -f "$OUT/variant-$variant-gdb.txt" ] && grep -E "^#[0-9]+ " "$OUT/variant-$variant-gdb.txt" | head -25
  done
}

launch_check() {
  node -e '
    const { _electron } = require("playwright-core");
    (async () => {
      const app = await _electron.launch({ chromiumSandbox: true, executablePath: require("electron"), args: [process.cwd(), ...(process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean)],
        env: { ...process.env, ATOM_SPIKE_DIST: process.env.ROOT + "/frontend-react/dist", ATOM_SPIKE_SIDECAR: "/bin/false", ATOM_SPIKE_PROFILE: process.cwd() + "/build/profile-launch-check" }, timeout: 45000 });
      const page = await app.firstWindow();
      console.log("renderer has no Node:", await page.evaluate(() => typeof process === "undefined"), "platform:", JSON.stringify(await app.evaluate(() => global.__atomSpike.platform)));
      await app.close();
    })().catch((error) => { console.error(error.message.split("\n").slice(0, 8).join("\n")); process.exit(1); });'
}

try_sandbox() {
  mode=$1
  diagnose "$mode"
  if launch_check >"$OUT/sandbox-$mode.log" 2>&1; then
    cat "$OUT/sandbox-$mode.log"
    echo "sandbox: $mode" | tee "$OUT/sandbox-mode.txt"
    return 0
  fi
  cat "$OUT/sandbox-$mode.log"
  return 1
}

run_session() {
  start_session
  cd "$SPIKE"
  export ROOT
  # 1. As shipped by npm. 2. AppArmor profile granting userns to this binary,
  # as Ubuntu 24.04 Chromium-based .debs do. 3. SUID chrome-sandbox helper.
  if ! try_sandbox as-shipped; then
    electron_bin="$SPIKE/node_modules/electron/dist/electron"
    printf 'abi <abi/4.0>,
include <tunables/global>
profile atom-desktop-spike %s flags=(unconfined) {
  userns,
  include if exists <local/atom-desktop-spike>
}
' "$electron_bin" | sudo tee /etc/apparmor.d/atom-desktop-spike >/dev/null
    sudo apparmor_parser -r /etc/apparmor.d/atom-desktop-spike
    diagnose_variants
    if ! try_sandbox apparmor-userns-profile; then
      sudo rm -f /etc/apparmor.d/atom-desktop-spike
      sudo apparmor_parser -R atom-desktop-spike 2>/dev/null || true
      sudo chown root:root node_modules/electron/dist/chrome-sandbox
      sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
      try_sandbox suid-chrome-sandbox || { echo "sandbox: FAILED" | tee "$OUT/sandbox-mode.txt"; exit 1; }
    fi
  fi
  "$ROOT/scripts/desktop-spike/qualify-electron.sh"
}

run_session
