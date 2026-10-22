#!/bin/sh
# D01 (#148) disposable spike: build the existing React dist, the existing Go
# API as a desktop sidecar, and a Wails v2 host around them. Not a release build.
#
# Usage: scripts/desktop-spike/build-wails.sh [--probe] [--skip-frontend]
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SPIKE="$ROOT/desktop/spike/wails"
TAGS=""
BUILD_FRONTEND=1
for arg in "$@"; do
  case "$arg" in
    --probe) TAGS="spikeprobe" ;;
    --skip-frontend) BUILD_FRONTEND=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$BUILD_FRONTEND" = 1 ]; then
  (cd "$ROOT/frontend-react" && npm run build)
fi
rm -rf "$SPIKE/frontend-dist"
cp -R "$ROOT/frontend-react/dist" "$SPIKE/frontend-dist"

VERSION=$(cat "$ROOT/VERSION")
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD)
(cd "$ROOT/backend-go" && go build -trimpath \
  -ldflags "-X main.appVersion=$VERSION -X main.buildCommit=$COMMIT" \
  -o "$SPIKE/build/sidecar/atom-api" .)

cd "$SPIKE"
if [ -n "$TAGS" ]; then
  wails build -s -tags "$TAGS"
else
  wails build -s
fi

case "$(uname -s)" in
  Darwin) BIN_DIR="$SPIKE/build/bin/atom-wails-spike.app/Contents/MacOS" ;;
  *) BIN_DIR="$SPIKE/build/bin" ;;
esac
cp "$SPIKE/build/sidecar/atom-api" "$BIN_DIR/atom-api"
echo "built: $BIN_DIR"
