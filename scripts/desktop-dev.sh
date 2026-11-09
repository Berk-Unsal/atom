#!/bin/sh
set -eu
ATOM_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec node "$ATOM_REPO_ROOT/desktop/scripts/dev.cjs" "$@"
