"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { chooseFilePanel, targetWithinRoot } = require("./macos-file-driver.cjs");
function panel(kind = "save") { return { role: "AXSheet", frame: { x: 10, y: 10, width: 700, height: 500 }, controls: [
  { id: "cancel", role: "AXButton", name: "Cancel", enabled: true, frame: { x: 450, y: 450, width: 80, height: 25 } },
  { id: "confirm", role: "AXButton", name: { save: "Save", open: "Open", path: "Go" }[kind], enabled: true, frame: { x: 550, y: 450, width: 80, height: 25 } },
  { id: "filename", role: "AXTextField", name: kind === "save" ? "Save As:" : "", enabled: true, frame: { x: 100, y: 50, width: 400, height: 25 } },
] }; }
test("selects bounded native Open, Save and Go controls and the labeled filename", () => {
  for (const kind of ["open", "save", "path"]) assert.equal(chooseFilePanel([panel(kind)], kind, true).confirm.id, "confirm");
  const value = panel(); value.controls.push({ ...value.controls[2], id: "other", name: "Tags:" });
  assert.equal(chooseFilePanel([value], "save", true).field.id, "filename");
});
test("permits cancellation before a file is selected but never confirms a disabled operation", () => {
  const value = panel("open"); value.controls[1].enabled = false;
  assert.equal(chooseFilePanel([value], "open", false).cancel.id, "cancel");
  assert.throws(() => chooseFilePanel([value], "open", true));
});
test("rejects renderer controls, ambiguity, out-of-panel controls and unknown operations", () => {
  let value = panel(); value.role = "AXGroup"; assert.throws(() => chooseFilePanel([value], "save", true));
  assert.throws(() => chooseFilePanel([panel(), panel()], "save", true));
  value = panel(); value.controls[1].frame.x = 1000; assert.throws(() => chooseFilePanel([value], "save", true));
  value = panel(); value.controls.push({ ...value.controls[1], id: "duplicate" }); assert.throws(() => chooseFilePanel([value], "save", true));
  value = panel(); value.controls[2].name = ""; value.controls.push({ ...value.controls[2], id: "other" }); assert.throws(() => chooseFilePanel([value], "save", true));
  assert.throws(() => chooseFilePanel([panel()], "foreign", true));
});
test("accepts owned Unicode paths and rejects traversal, siblings, controls and nonqualification roots", () => {
  const root = "/private/tmp/atom-macos-files-ABC123";
  assert.equal(targetWithinRoot(root, root + "/Documents — çığ/Plan.atom-project.json"), true);
  for (const target of [root + "/../escape", root + "/./file", root + "s/file", root + "/a//file", root + "/bad\nfile", "/other/file"]) assert.equal(targetWithinRoot(root, target), false);
  assert.equal(targetWithinRoot("/private/tmp/foreign", "/private/tmp/foreign/file"), false);
});
test("refuses non-CI execution before System Events or filesystem ownership access", () => {
  const vm = require("node:vm"), fs = require("node:fs"); let accesses = 0;
  const context = { ObjC: { import() {}, bindFunction() {}, unwrap: (value) => value },
    $: { NSProcessInfo: { processInfo: { environment: { objectForKey: () => "false" } } }, getuid: () => 501 },
    Application: () => { accesses++; throw new Error("Desktop must not be accessed"); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve("./macos-file-driver.cjs"), "utf8"), context);
  assert.throws(() => context.run([]), /restricted/); assert.equal(accesses, 0);
});
test("the harness refuses personal execution before resolving desktop dependencies", () => {
  const { spawnSync } = require("node:child_process"), path = require("node:path"); const env = { ...process.env }; delete env.GITHUB_ACTIONS;
  const result = spawnSync(process.execPath, [path.join(__dirname, "macos-files.mjs")], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /disposable GitHub Actions|Actual macOS files require Darwin/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});

test("never retries an uncertain native Cancel input", () => {
  const vm = require("node:vm"), fs = require("node:fs"); let clicks = 0;
  const value = panel("open");
  const native = (row, children = []) => ({ role: () => row.role, subrole: () => row.subrole || "", name: () => row.name || "", description: () => "",
    enabled: () => row.enabled === true, position: () => [row.frame?.x, row.frame?.y], size: () => [row.frame?.width, row.frame?.height], uiElements: () => children,
    attributes: { byName: () => ({ value: () => "" }) }, click: () => { clicks++; throw new Error("AXPress delivery uncertain"); } });
  const root = native(value, value.controls.map((row) => native(row)));
  const process = { bundleIdentifier: () => "io.github.berk-unsal.atom", windows: () => [{ subrole: () => "AXStandardWindow", sheets: () => [root] }] };
  const dollar = (value) => ({ stringByResolvingSymlinksInPath: value });
  Object.assign(dollar, { NSProcessInfo: { processInfo: { environment: { objectForKey: () => "true" } } }, getuid: () => 501,
    NSFileManager: { defaultManager: { attributesOfItemAtPathError: (target) => target.endsWith("ABC123") ? { objectForKey: (name) => ({ NSFileOwnerAccountID: 501, NSFilePosixPermissions: 448, NSFileType: "NSFileTypeDirectory" })[name] } : null } } });
  const context = { ObjC: { import() {}, bindFunction() {}, unwrap: (value) => value }, $: dollar,
    Application: () => ({ applicationProcesses: { whose: () => () => [process] } }), delay: () => { throw new Error("Must not retry input"); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve("./macos-file-driver.cjs"), "utf8"), context);
  assert.throws(() => context.run(["123", "cancel-open", "Open A.T.O.M project", "/private/tmp/atom-macos-files-ABC123/file.json", "/private/tmp/atom-macos-files-ABC123"]), /AXPress delivery uncertain/);
  assert.equal(clicks, 1);
});
