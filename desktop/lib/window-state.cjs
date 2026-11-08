"use strict";

const fs = require("node:fs");
const path = require("node:path");

function boundedGeometry(saved, displays) {
  const primary = displays[0].workArea;
  const area = displays.find(({ workArea: a }) => Number.isFinite(saved?.x) && Number.isFinite(saved?.y) &&
    saved.x >= a.x && saved.y >= a.y && saved.x + 100 <= a.x + a.width && saved.y + 100 <= a.y + a.height)?.workArea || primary;
  const width = Math.round(Math.min(area.width, Math.max(800, Number.isFinite(saved?.width) ? saved.width : 1440)));
  const height = Math.round(Math.min(area.height, Math.max(600, Number.isFinite(saved?.height) ? saved.height : 900)));
  const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - width, Number.isFinite(saved?.x) ? saved.x : area.x + (area.width - width) / 2)));
  const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - height, Number.isFinite(saved?.y) ? saved.y : area.y + (area.height - height) / 2)));
  return { x, y, width, height };
}

function readGeometry(file, displays) {
  try {
    if (fs.statSync(file).size > 4096) throw new Error("oversized window state");
    return boundedGeometry(JSON.parse(fs.readFileSync(file, "utf8")), displays);
  } catch { return boundedGeometry(null, displays); }
}

function writeGeometry(file, bounds) {
  const temporary = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, JSON.stringify(bounds), { mode: 0o600 });
    fs.renameSync(temporary, file);
    return true;
  } catch {
    try { fs.unlinkSync(temporary); } catch { /* Failed state writes do not prevent quitting. */ }
    return false;
  }
}

module.exports = { boundedGeometry, readGeometry, writeGeometry };
