"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { ReportFiles } = require("../lib/report-files.cjs");

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const request = (format = "html", bytes = Buffer.from("<!doctype html><h1>Türkçe retained evidence</h1>")) => ({ format, name: `Original.${format === "markdown" ? "md" : format}`, bytes, sha256: digest(bytes) });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "atom-report-file-test-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = []; let choice = { canceled: true }; const surfaces = [];
  const files = new ReportFiles({ selectSave: async (value) => { calls.push(value); return choice; }, createSurface: async (html) => {
    const surface = new EventEmitter(); surface.dead = false;
    Object.assign(surface, { html, isDestroyed: () => surface.dead, destroy: () => { surface.dead = true; surface.emit("closed"); }, show: () => {}, webContents: {
      printToPDF: async (options) => { surface.pdfOptions = options; return Buffer.from("%PDF-fixed-shared-output"); },
      print: (_options, callback) => callback(false, "Print job canceled"),
    } }); surfaces.push(surface); return surface;
  } });
  return { root, calls, surfaces, files, choose: (value) => { choice = value; } };
}
test("native Save preserves exact retained HTML/Markdown/SVG/ZIP bytes and reports their original hash", async (t) => {
  const f = await fixture(t);
  for (const format of ["html", "markdown", "svg", "zip"]) {
    const payload = request(format, Buffer.from(format === "zip" ? [0x50, 0x4b, 0xff, 0] : "Original lineage — çağı"));
    const file = path.join(f.root, `Retained ${format} — çığ`); f.choose({ canceled: false, filePath: file });
    const saved = await f.files.save(payload); assert.equal(saved.sha256, payload.sha256); assert.deepEqual(await fs.readFile(file), payload.bytes);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  }
  assert.equal(f.surfaces.length, 0);
});
test("cancel and integrity/path attacks leave retained bytes and destinations untouched", async (t) => {
  const f = await fixture(t); const payload = request();
  assert.deepEqual(await f.files.save(payload), { canceled: true });
  assert.equal(f.calls.length, 1);
  await assert.rejects(f.files.save({ ...payload, path: "/unapproved/file" }), { code: "report_invalid_request" });
  await assert.rejects(f.files.save({ ...payload, sha256: "a".repeat(64) }), { code: "report_integrity" });
  assert.equal(f.calls.length, 1);
  await f.files.save({ ...payload, name: "../../private\\script.exe\n" });
  assert.doesNotMatch(f.calls.at(-1).name, /[/\\\n]/); assert.match(f.calls.at(-1).name, /\.html$/);
  assert.equal(f.surfaces.length, 0);
});
test("cancelled PDF does not create a surface; PDF uses the exact shared HTML and A4 options", async (t) => {
  const f = await fixture(t); const { format: _, ...payload } = request(); payload.mode = "pdf";
  assert.deepEqual(await f.files.output(payload), { canceled: true }); assert.equal(f.surfaces.length, 0);
  const file = path.join(f.root, "Report.pdf"); f.choose({ canceled: false, filePath: file });
  const saved = await f.files.output(payload); assert.equal(saved.sha256, digest(await fs.readFile(file)));
  assert.equal(f.surfaces[0].html, payload.bytes.toString()); assert.equal(f.surfaces[0].pdfOptions.pageSize, "A4");
  assert.equal(f.surfaces[0].pdfOptions.landscape, false); assert.equal(f.surfaces[0].dead, true);
});
test("native Print cancellation and closed preview are cancellations, not failed evidence writes", async (t) => {
  const f = await fixture(t); const { format: _, ...payload } = request(); payload.mode = "print";
  assert.deepEqual(await f.files.output(payload), { canceled: true }); assert.equal(f.calls.length, 0); assert.equal(f.surfaces[0].dead, true);
  const create = f.files.createSurface;
  f.files.createSurface = async (html) => { const surface = await create(html); surface.webContents.print = () => setImmediate(() => surface.destroy()); return surface; };
  assert.deepEqual(await f.files.output(payload), { canceled: true }); assert.equal(f.files.busy, false);
});
test("PDF timeout and print failure preserve the previous destination and bounded error text", async (t) => {
  const f = await fixture(t); const file = path.join(f.root, "Existing.pdf"); await fs.writeFile(file, "last good"); f.choose({ canceled: false, filePath: file });
  const create = f.files.createSurface;
  f.files.timeout = 10;
  f.files.createSurface = async (html) => { const surface = await create(html); surface.webContents.printToPDF = () => new Promise(() => {}); return surface; };
  const { format: _, ...payload } = request();
  await assert.rejects(f.files.output({ ...payload, mode: "pdf" }), { code: "report_pdf_timeout" });
  assert.equal(await fs.readFile(file, "utf8"), "last good"); assert.equal(f.surfaces[0].dead, true);
  f.files.createSurface = async (html) => { const surface = await create(html); surface.webContents.print = (_options, callback) => callback(false, "/private/user/provider-key"); return surface; };
  await assert.rejects(f.files.output({ ...payload, mode: "print" }), (error) => error.code === "report_print_failed" && !error.message.includes("private"));
  assert.equal(f.files.busy, false);
});
test("concurrent operations share the native busy gate before opening another dialog", async (t) => {
  const f = await fixture(t); let finish;
  f.files.selectSave = () => new Promise((resolve) => { finish = resolve; });
  const first = f.files.save(request()); await assert.rejects(f.files.save(request()), { code: "file_busy" });
  finish({ canceled: true }); await first;
  f.files.isBusy = () => true; await assert.rejects(f.files.save(request()), { code: "file_busy" });
});
