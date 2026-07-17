#!/bin/sh
set -eu

DOCS_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TEMP_HTML=${TMPDIR:-/tmp}/atom-academic-report.html
trap 'rm -f "$TEMP_HTML"' EXIT

cd "$DOCS_DIR"
pandoc academic-report.md \
  --from=gfm \
  --to=html5 \
  --standalone \
  --embed-resources \
  --resource-path=. \
  --css=assets/academic-report.css \
  --metadata title=academic-report \
  --output="$TEMP_HTML"
prince "$TEMP_HTML" -o academic-report.pdf
