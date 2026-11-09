"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { registerDatasets } = require("../lib/dataset-bridge.cjs");
const { activateDataset } = require("../lib/dataset-activation.cjs");
test("every dataset operation checks the exact main document before paths, dialogs or registry effects", async () => {
  const handlers = new Map(); const calls = [];
  const frame = { url: "app://atom/" }; const contents = { mainFrame: frame };
  const registry = {};
  for (const method of ["status", "choose", "install", "activateID", "cancel"]) registry[method] = (request) => { calls.push([method, request]); return {}; };
  registerDatasets({ ipcMain: { handle: (name, action) => handlers.set(name, action) }, getWindow: () => ({ webContents: contents, isDestroyed: () => false }), registry });
  assert.equal(handlers.size, 5);
  for (const action of handlers.values()) {
    await assert.rejects(action({ sender: contents, senderFrame: { url: frame.url } }, {}));
    await assert.rejects(action({ sender: {}, senderFrame: frame }, {}));
  }
  assert.equal(calls.length, 0);
  await handlers.get("atom:dataset-choose")({ sender: contents, senderFrame: frame }, "directory");
  assert.deepEqual(calls, [["choose", "directory"]]);
  registry.install = () => { throw new Error("/private/provider-key/source-path"); };
  const error = await handlers.get("atom:dataset-install")({ sender: contents, senderFrame: frame }, {});
  assert.equal(error.ok, false); assert.doesNotMatch(JSON.stringify(error), /provider-key|source-path|stack/);
  frame.url = "app://atom/assets/imported.html";
  await assert.rejects(handlers.get("atom:dataset-status")({ sender: contents, senderFrame: frame }));
});
function backend() {
  const target = { address: "127.0.0.1:12345", token: "a".repeat(64), generation: "b".repeat(32) };
  return { current: target, datasetDir: "/bundle", snapshot: () => ({ state: "ready" }), ready: async () => target };
}
test("activation sends only the approved opaque ID to the current private destination", async () => {
  const runtime = backend(); const calls = [];
  const result = await activateDataset(runtime, { id: "Türkçe pack", path: "/approved/root" }, async (url, options) => {
    calls.push({ url, options }); return Response.json({ status: "active", dataset: { id: "Türkçe pack" } });
  });
  assert.equal(result.status, "active"); assert.equal(runtime.datasetDir, "/approved/root");
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "http://127.0.0.1:12345/api/datasets/switch");
  assert.equal(calls[0].options.body, JSON.stringify({ id: "Türkçe pack" }));
  assert.equal(calls[0].options.headers["x-atom-desktop-token"], runtime.current.token);
  assert.equal(calls[0].options.headers.origin, "app://atom");
  runtime.current.address = "evil.invalid:443";
  await assert.rejects(activateDataset(runtime, { id: "p", path: "/approved/root" }, () => { assert.fail("untrusted destination requested"); }));
});
test("failed validation preserves future startup root; interrupted commit is reconciled without replay", async () => {
  const runtime = backend(); const entry = { id: "pack", path: "/approved" };
  await assert.rejects(activateDataset(runtime, entry, async () => Response.json({ error: "invalid" }, { status: 422 })), { code: "dataset_activation_failed" });
  assert.equal(runtime.datasetDir, "/bundle");
  const requests = [];
  const active = await activateDataset(runtime, entry, async (url) => {
    requests.push(url);
    if (url.endsWith("/switch")) throw new Error("lost response");
    return Response.json({ dataset: { id: "pack" } });
  });
  assert.equal(active.status, "active"); assert.match(active.warning, /confirmed/);
  assert.deepEqual(requests.map((url) => new URL(url).pathname), ["/api/datasets/switch", "/api/meta"]);
  assert.equal(runtime.datasetDir, "/approved");
});
test("failed-service recovery uses only the explicitly selected pack and restores future root on failure", async () => {
  const runtime = backend(); runtime.snapshot = () => ({ state: "failed" });
  let restarts = 0;
  runtime.restart = async () => { restarts++; assert.equal(runtime.datasetDir, "/selected"); throw new Error("bad pack"); };
  await assert.rejects(activateDataset(runtime, { id: "pack", path: "/selected" }), { code: "dataset_activation_failed" });
  assert.equal(runtime.datasetDir, "/bundle"); assert.equal(restarts, 1);
  runtime.restart = async () => { restarts++; };
  assert.equal((await activateDataset(runtime, { id: "pack", path: "/selected" })).recovered, true);
  assert.equal(restarts, 2); assert.equal(runtime.datasetDir, "/selected");
});
