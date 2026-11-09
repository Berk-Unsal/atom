#!/bin/sh
set -eu
ATOM_REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -gt 1 ]; then
  printf '%s\n' 'Choose one desktop test mode; use --help for options.' >&2
  exit 2
fi
case "${1:-unit}" in
  --help) printf '%s\n' 'Usage: scripts/desktop-test.sh [unit|--runtime|--native|--dev-loop|--storage|--project-files|--reports|--datasets|--diagnostics]'; exit 0 ;;
  unit) exec npm test --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --native) exec npm run test:native --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --runtime) exec npm run test:runtime --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --dev-loop) exec npm run test:dev-loop --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --storage) exec npm run test:storage --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --project-files) exec npm run test:project-files --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --reports) exec npm run test:reports --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --datasets) exec npm run test:datasets --prefix "$ATOM_REPO_ROOT/desktop" ;;
  --diagnostics) exec npm run test:diagnostics --prefix "$ATOM_REPO_ROOT/desktop" ;;
  *) printf '%s\n' 'Usage: scripts/desktop-test.sh [unit|--runtime|--native|--dev-loop|--storage|--project-files|--reports|--datasets|--diagnostics]' >&2; exit 2 ;;
esac
