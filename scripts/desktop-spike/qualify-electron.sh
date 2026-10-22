#!/bin/sh
# D01 (#148) Electron qualification suite. Expects a built frontend-react/dist
# and a display (X11 DISPLAY or WAYLAND_DISPLAY on Linux). Every step runs so
# the evidence is complete; the exit status reports any failure.
#
# Env: ATOM_SPIKE_DIALOG_DRIVER, ATOM_SPIKE_ELECTRON_ARGS (passed through).
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SPIKE="$ROOT/desktop/spike/electron"
EVIDENCE="$SPIKE/build/evidence"
unset ELECTRON_RUN_AS_NODE
mkdir -p "$EVIDENCE"
status=0
step() {
  name=$1; shift
  echo "::group::$name"
  # perl alarm: a portable per-step ceiling so one hung step cannot eat the job.
  if perl -e 'alarm shift; exec @ARGV' 900 "$@" >"$EVIDENCE/$name.log" 2>&1; then echo "PASS $name"; else echo "FAIL $name"; status=1; fi
  tail -n 40 "$EVIDENCE/$name.log"
  echo "::endgroup::"
}

VERSION=$(cat "$ROOT/VERSION")
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD)
(cd "$ROOT/backend-go" && go build -trimpath -ldflags "-X main.appVersion=$VERSION -X main.buildCommit=$COMMIT" -o "$SPIKE/build/atom-api" .) || exit 1
cd "$SPIKE"
step workflows node workflows.mjs workflows
step probe-run1-print node probe.mjs probe-run1 --print
step probe-run2-memory node probe.mjs probe-run2 --memory
step probe-run3-lifecycle node probe.mjs probe-run3 --lifecycle
step parent-death node parent-death.mjs
step missing-sidecar node missing-sidecar.mjs
step hmr node hmr.mjs
exit $status
