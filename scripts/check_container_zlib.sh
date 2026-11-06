#!/bin/sh
# CVE-2026-85091 regression check for the built Alpine runtime images.
set -eu
if [ "$#" -ne 1 ]; then
  echo "usage: $0 IMAGE" >&2
  exit 2
fi
docker run --rm --entrypoint /bin/sh "$1" -ec '
  if ! apk info -e zlib >/dev/null 2>&1; then
    echo "zlib is absent; CVE-2026-85091 does not apply"
    exit 0
  fi
  package=$(apk info -e -v zlib)
  version=${package#zlib-}
  test -n "$version"
  comparison=$(apk version -t "$version" 1.3.2-r1)
  case "$comparison" in
    "="|">") ;;
    "<") echo "CVE-2026-85091: zlib $version is older than fixed 1.3.2-r1" >&2; exit 1 ;;
    *) echo "Could not compare zlib version: $version" >&2; exit 1 ;;
  esac
  echo "zlib $version meets the CVE-2026-85091 security floor"
'
