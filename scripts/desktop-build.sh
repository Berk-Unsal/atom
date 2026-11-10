#!/bin/sh
set -eu
ATOM_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -ne 0 ]; then
  printf '%s\n' 'Usage: scripts/desktop-build.sh (unsigned local resources; use scripts/desktop-package.sh for internal bundles)' >&2
  exit 2
fi
exec npm run build --prefix "$ATOM_REPO_ROOT/desktop"
