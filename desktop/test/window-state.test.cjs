"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { boundedGeometry, readGeometry, writeGeometry } = require("../lib/window-state.cjs");

test("removed monitors, corrupt state and small displays keep the window visible", () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1280, height: 800 } }];
  const restored = boundedGeometry({ x: -5000, y: 9000, width: 9999999, height: -1 }, displays);
  assert.deepEqual(restored, { x: 0, y: 200, width: 1280, height: 600 });
  assert.equal(boundedGeometry(null, displays).width, 1280);
  const small = boundedGeometry({ width: NaN, height: Infinity }, [{ workArea: { x: -640, y: 0, width: 640, height: 480 } }]);
  assert.deepEqual(small, { x: -640, y: 0, width: 640, height: 480 });
});

test("geometry survives restart in a private file; failed/corrupt writes recover", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "atom-window-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "Türkçe space", "window.json");
  const displays = [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }];
  const bounds = { x: 20, y: 30, width: 1000, height: 700 };
  assert.equal(writeGeometry(file, bounds), true);
  assert.deepEqual(readGeometry(file, displays), bounds);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.writeFileSync(file, "broken");
  assert.deepEqual(readGeometry(file, displays), boundedGeometry(null, displays));
  assert.equal(writeGeometry(path.join(file, "cannot-write"), bounds), false);
});
