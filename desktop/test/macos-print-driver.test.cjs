"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { choosePrintPanel } = require("./macos-print-driver.cjs");
function fixture() { return { role: "AXSheet", name: "", frame: { x: 10, y: 10, width: 600, height: 700 }, controls: [
  { id: "cancel", role: "AXButton", name: "Cancel", enabled: true, frame: { x: 400, y: 650, width: 70, height: 25 } },
  { id: "print", role: "AXButton", name: "Print", enabled: true, frame: { x: 500, y: 650, width: 70, height: 25 } },
  { id: "queue", role: "AXPopUpButton", name: "Printer", value: "AtomQualification", enabled: true, expanded: false, frame: { x: 50, y: 50, width: 400, height: 25 } },
] }; }
test("selects actual sheet controls and the collapsed selected qualification queue", () => {
  const selected = choosePrintPanel([fixture()], "AtomQualification"); assert.equal(selected.print.id, "print"); assert.equal(selected.cancel.id, "cancel");
});
test("rejects renderer Print, unselected queues and disabled native buttons", () => {
  let panel = fixture(); panel.role = "AXGroup"; assert.throws(() => choosePrintPanel([panel], "AtomQualification"));
  panel = fixture(); panel.controls[2].value = "Different printer"; assert.throws(() => choosePrintPanel([panel], "AtomQualification"));
  panel = fixture(); panel.controls[2].expanded = true; assert.throws(() => choosePrintPanel([panel], "AtomQualification"));
  panel = fixture(); panel.controls[1].enabled = false; assert.throws(() => choosePrintPanel([panel], "AtomQualification"));
});
test("rejects ambiguous panels/buttons and controls outside the native panel", () => {
  assert.throws(() => choosePrintPanel([fixture(), fixture()], "AtomQualification"));
  let panel = fixture(); panel.controls.push({ ...panel.controls[0], id: "other" }); assert.throws(() => choosePrintPanel([panel], "AtomQualification"));
  panel = fixture(); panel.controls[1].frame.x = 800; assert.throws(() => choosePrintPanel([panel], "AtomQualification"));
  assert.throws(() => choosePrintPanel([fixture()], "foreign"));
});

test("refuses non-CI execution before accessing System Events", () => {
  const vm = require("node:vm"), fs = require("node:fs"); let accesses = 0;
  const context = { ObjC: { import() {}, unwrap: (value) => value },
    $: { NSProcessInfo: { processInfo: { environment: { objectForKey: () => "false" } } }, getuid: () => 1000 },
    Application: () => { accesses++; throw new Error("Must not access the desktop"); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve("./macos-print-driver.cjs"), "utf8"), context);
  assert.throws(() => context.run(["123", "print"]), /restricted/); assert.equal(accesses, 0);
});
test("does not retry an ambiguous native AXPress failure", () => {
  const vm = require("node:vm"), fs = require("node:fs"); let clicks = 0;
  const native = (row, children = []) => ({ role: () => row.role, subrole: () => row.subrole || "", name: () => row.name || "", value: () => row.value || "",
    enabled: () => row.enabled === true, position: () => [row.frame?.x, row.frame?.y], size: () => [row.frame?.width, row.frame?.height], uiElements: () => children,
    attributes: { byName: () => ({ value: () => false }) }, click: () => { clicks++; throw new Error("AXPress delivery is ambiguous"); } });
  const panel = fixture(); const window = native({ ...panel, role: "AXWindow", name: "Print" }, panel.controls.map((row) => native(row)));
  const process = { bundleIdentifier: () => "io.github.berk-unsal.atom", windows: () => [window] };
  const context = { ObjC: { import() {}, unwrap: (value) => value },
    $: { NSProcessInfo: { processInfo: { environment: { objectForKey: () => "true" } } }, getuid: () => 1000 },
    Application: () => ({ applicationProcesses: { whose: () => () => [process] } }), delay: () => { throw new Error("Must not retry input"); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve("./macos-print-driver.cjs"), "utf8"), context);
  assert.throws(() => context.run(["123", "print"]), /AXPress delivery is ambiguous/); assert.equal(clicks, 1);
});

test("the harness refuses unsupported or personal execution before resolving desktop dependencies", () => {
  const { spawnSync } = require("node:child_process"), path = require("node:path");
  const env = { ...process.env }; delete env.GITHUB_ACTIONS;
  const result = spawnSync(process.execPath, [path.join(__dirname, "macos-print.mjs")], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Printer setup requires disposable GitHub Actions|Actual macOS Print requires Darwin/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});
