"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { Sidecar } = require("../lib/sidecar.cjs");
const resources = path.resolve(__dirname, "../build/resources");

async function realBackend(t, overrides = {}) {
  const info = JSON.parse(await fs.readFile(path.join(resources, "build-info.json"), "utf8"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "atom-runtime-"));
  const backend = new Sidecar({ executable: path.join(resources, "atom-api"), datasetDir: path.join(resources, "data-pipeline"), distDir: path.join(workspace, "missing-dist"), ...info, ...overrides });
  t.after(async () => { await backend.stop(); await fs.rm(workspace, { recursive: true, force: true }); });
  return { backend, workspace };
}

function occupy(port) {
  const server = net.createServer((socket) => socket.end());
  return new Promise((resolve, reject) => {
    server.once("error", (error) => error.code === "EADDRINUSE" ? resolve(null) : reject(error));
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const request = (target, token = target.token) => fetch(`http://${target.address}/readyz`, { headers: { "x-atom-desktop-token": token, Origin: "app://atom" } });

test("real API uses ephemeral loopback with 8080 occupied and no dist or endpoint files", async (t) => {
  const busy = await occupy(8080); t.after(() => busy?.close());
  const { backend, workspace } = await realBackend(t);
  const target = await backend.start();
  assert.match(target.address, /^127\.0\.0\.1:/);
  assert.notEqual(target.address, "127.0.0.1:8080");
  assert.equal((await request(target)).status, 200);
  assert.deepEqual(backend.snapshot().readiness, { listener: true, dataset: true, ui: false });
  assert.deepEqual(await fs.readdir(workspace), []);
});

test("real binary identity and missing pack failures are deterministic and reaped", async (t) => {
  for (const scenario of ["version", "commit", "dataset", "hash"]) await t.test(scenario, async (subtest) => {
    const missing = await fs.mkdtemp(path.join(os.tmpdir(), "atom-bad-pack-"));
    subtest.after(() => fs.rm(missing, { recursive: true, force: true }));
    if (scenario === "hash") {
      const manifest = JSON.parse(await fs.readFile(path.join(resources, "data-pipeline/manifest.json"), "utf8"));
      await fs.writeFile(path.join(missing, "manifest.json"), JSON.stringify(manifest));
      for (const file of Object.values(manifest.files)) await fs.writeFile(path.join(missing, file), '{"type":"FeatureCollection","features":[]}');
    }
    const { backend } = await realBackend(subtest, scenario === "version" ? { version: "not-this-build" } : scenario === "commit" ? { commit: "not-this-build" } : { datasetDir: missing });
    await assert.rejects(backend.start(), ["version", "commit"].includes(scenario) ? /binary identity mismatch/ : /dataset is unavailable/);
    await backend.owned.exited;
    assert.throws(() => process.kill(backend.owned.child.pid, 0), { code: "ESRCH" });
  });
});

test("real recovery rotates port/credential/generation and rejects the previous credential", async (t) => {
  const { backend } = await realBackend(t);
  const first = await backend.start();
  first.child.kill("SIGKILL"); await first.exited;
  await assert.rejects(backend.ready());
  const busy = await occupy(Number(first.address.split(":")[1])); t.after(() => busy?.close());
  const second = await backend.restart();
  assert.notEqual(second.generation, first.generation);
  assert.notEqual(second.token, first.token);
  assert.notEqual(second.address, first.address);
  assert.equal((await request(second, first.token)).status, 401);
  assert.equal((await request(second)).status, 200);
});

test("real API observes parent-control EOF and releases its listener", async (t) => {
  const { backend } = await realBackend(t);
  const target = await backend.start();
  target.child.stdio[3].destroy();
  await Promise.race([target.exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Parent EOF did not stop the API")), 30_000); timer.unref(); })]);
  await assert.rejects(request(target));
  assert.throws(() => process.kill(target.child.pid, 0), { code: "ESRCH" });
});
