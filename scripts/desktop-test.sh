#!/bin/sh
set -eu
ATOM_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -gt 1 ]; then
  printf '%s\n' 'Choose one desktop test mode; use --help for options.' >&2
  exit 2
fi
case "${1:-unit}" in
  --help) printf '%s\n' 'Usage: scripts/desktop-test.sh [unit|--runtime|--native|--dev-loop]'; exit 0 ;;
  unit) exec npm test --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --native) exec npm run test:native --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --runtime) exec npm run test:runtime --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --dev-loop) exec npm run test:dev-loop --prefix "$ATOM_REPO_ROOT/desktop" ;;
  *) printf '%s\n' 'Usage: scripts/desktop-test.sh [unit|--runtime|--native|--dev-loop]' >&2; exit 2 ;;
esac
