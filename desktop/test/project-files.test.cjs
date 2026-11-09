"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ProjectFiles } = require("../lib/project-files.cjs");
const { SettingsStore } = require("../lib/settings-store.cjs");

async function fixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "atom-project-files-")));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const choices = { open: { canceled: true }, save: { canceled: true } }; let dialogs = 0;
  const settings = new SettingsStore(path.join(directory, "config/settings.json"));
  const service = new ProjectFiles({ settings, selectOpen: async () => choices.open, selectSave: async () => { dialogs++; return choices.save; } });
  service.setProjects([{ id: "p", revision: "r1" }]);
  return { directory, choices, service, settings, dialogs: () => dialogs };
}
const payload = (changes = {}) => ({ projectId: "p", revision: "r1", mode: "save", name: "Ankara.atom-project.json", text: '{"schemaVersion":3,"project":{"id":"p"}}', ...changes });

test("cancelled native Open/Save and discarded invalid imports do not create associations", async (t) => {
  const { service, choices, directory } = await fixture(t);
  assert.deepEqual(await service.open(), { canceled: true }); assert.deepEqual(await service.save(payload()), { canceled: true });
  const file = path.join(directory, "invalid.json"); await fs.writeFile(file, "invalid JSON; shared parser rejects before activation"); choices.open = { filePaths: [file] };
  const opened = await service.open(); service.discardOpen(opened.ticket);
  assert.throws(() => service.acceptOpen({ ticket: opened.ticket, projectId: "p" }), { code: "file_receipt_expired" });
  assert.equal(service.status()[0].path, null); assert.equal(service.status()[0].dirty, true);
});
test("Save writes the association; Save As changes it only on success; Export is a copy", async (t) => {
  const { service, choices, directory, dialogs } = await fixture(t);
  const first = path.join(directory, "first ç.atom-project.json"); choices.save = { filePath: first };
  assert.equal((await service.save(payload())).associated, true); assert.equal(service.status()[0].dirty, false);
  await service.save(payload({ revision: "r2" })); assert.equal(dialogs(), 1);
  service.setProjects([{ id: "p", revision: "r3" }]); assert.equal(service.status()[0].dirty, true);
  choices.save = { canceled: true }; await service.save(payload({ mode: "saveAs" })); assert.equal(service.status()[0].path, first);
  const copy = path.join(directory, "copy.atom-project.json"); choices.save = { filePath: copy };
  assert.equal((await service.save(payload({ mode: "export" }))).associated, false); assert.equal(service.status()[0].path, first);
  assert.equal(await fs.readFile(copy, "utf8"), payload().text);
  choices.save = { filePath: first }; await assert.rejects(service.save(payload({ mode: "export" })), { code: "file_export_destination" });
  choices.save = { filePath: copy }; await service.save(payload({ mode: "saveAs", revision: "r3" })); assert.equal(service.status()[0].path, copy);
  assert.equal(service.status()[0].dirty, false);
});
test("Open associates only after shared validation, and external changes preserve the file and association", async (t) => {
  const { service, choices, directory, settings } = await fixture(t);
  const file = path.join(directory, "source.json"); await fs.writeFile(file, payload().text); choices.open = { filePaths: [file] };
  const opened = await service.open(); assert.equal(service.status()[0].path, null);
  service.acceptOpen({ ticket: opened.ticket, projectId: "p" }); assert.equal(service.status()[0].dirty, true);
  await fs.writeFile(file, "externally changed");
  await assert.rejects(service.save(payload()), { code: "file_conflict" }); assert.equal(await fs.readFile(file, "utf8"), "externally changed");
  assert.equal(service.status()[0].path, await fs.realpath(file));
  const next = new ProjectFiles({ settings, selectOpen: async () => ({}), selectSave: async () => ({}) });
  assert.equal(next.setProjects([{ id: "p", revision: "r1" }])[0].path, await fs.realpath(file));
});
test("changes during a native dialog remain dirty after a successful older snapshot save", async (t) => {
  const { service, directory } = await fixture(t); let finish;
  service.selectSave = () => new Promise((resolve) => { finish = resolve; });
  const saving = service.save(payload());
  service.setProjects([{ id: "p", revision: "new revision" }]);
  await assert.rejects(service.open(), { code: "file_busy" });
  finish({ filePath: path.join(directory, "saved.json") }); await saving;
  assert.equal(service.status()[0].dirty, true);
});
test("a metadata failure after file commit reports truthful success and a retention warning", async (t) => {
  const { service, choices, directory, settings } = await fixture(t); const file = path.join(directory, "saved.json"); choices.save = { filePath: file };
  settings.save = () => { throw new Error("full settings disk"); };
  const result = await service.save(payload()); assert.equal(result.saved, true); assert.match(result.warning, /succeeded/);
  assert.equal(await fs.readFile(file, "utf8"), payload().text); assert.equal(service.status()[0].path, file);
});
test("renderer-supplied paths and non-project envelopes fail before opening a dialog", async (t) => {
  const { service, dialogs } = await fixture(t);
  await assert.rejects(service.save(payload({ path: "/unapproved/file" })), { code: "file_invalid_request" });
  await assert.rejects(service.save(payload({ text: "[]" })), { code: "file_invalid_request" });
  await assert.rejects(service.save(payload({ name: "../outside.json" })), { code: "file_invalid_request" });
  assert.equal(dialogs(), 0);
});
test("failed Save As keeps the old file association and leaves the chosen destination untouched", async (t) => {
  const { service, choices, directory } = await fixture(t);
  const first = path.join(directory, "first.json"); choices.save = { filePath: first }; await service.save(payload());
  const next = path.join(directory, "next.json"); await fs.writeFile(next, "original destination bytes"); choices.save = { filePath: next };
  service.io = { ...fs, async rename() { const error = new Error("quota"); error.code = "EDQUOT"; throw error; } };
  await assert.rejects(service.save(payload({ mode: "saveAs" })), { code: "file_disk_full" });
  assert.equal(service.status()[0].path, first); assert.equal(await fs.readFile(next, "utf8"), "original destination bytes");
});
