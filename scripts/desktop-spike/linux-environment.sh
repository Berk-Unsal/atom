#!/bin/sh
# D01 (#148): record the Ubuntu platform and which shared libraries the pinned
# Electron binary still lacks. Run once before and once after installing the
# runtime packages; the "before" list is the D14 package dependency input.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SPIKE="$ROOT/desktop/spike/electron"
OUT="$SPIKE/build/evidence"
mkdir -p "$OUT"
phase=${1:-snapshot}
{
  echo "== os-release"; cat /etc/os-release
  echo "== kernel"; uname -srm
  echo "== glibc"; ldd --version | head -1
  echo "== unprivileged userns (AppArmor)"; sysctl kernel.apparmor_restrict_unprivileged_userns kernel.unprivileged_userns_clone 2>&1
  echo "== cpu"; nproc; grep -m1 "model name" /proc/cpuinfo
  echo "== memory"; grep MemTotal /proc/meminfo
  echo "== mutter"; mutter --version 2>&1 | head -1
  echo "== weston"; weston --version 2>&1 | head -1
  echo "== Electron missing libraries"; ldd "$SPIKE/node_modules/electron/dist/electron" | grep "not found" || echo "none"
  echo "== chrome-sandbox"; ls -l "$SPIKE/node_modules/electron/dist/chrome-sandbox"
} >"$OUT/linux-environment-$phase.txt" 2>&1
cat "$OUT/linux-environment-$phase.txt"
