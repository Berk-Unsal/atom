"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { Sidecar } = require("../lib/sidecar.cjs");
const { createRouter } = require("../lib/router.cjs");
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

test("real desktop transport authenticates all surfaces before CORS, status or API handlers", async (t) => {
  const { backend } = await realBackend(t);
  const target = await backend.start();
  for (const route of ["/healthz", "/readyz", "/api/meta", "/api/datasets", "/api/processes/batch-experiment", "/api/not-a-route"]) {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const response = await fetch(`http://${target.address}${route}`, { method });
      assert.equal(response.status, 401, `${method} ${route} without a token`);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      const body = await response.text();
      assert.doesNotMatch(body, /application_version|dataset_id|building|tower|secret/);
      assert.equal(body.includes(target.token), false);
    }
  }
  for (const headers of [
    { "x-atom-desktop-token": "f".repeat(64) },
    { "x-atom-desktop-token": target.token.slice(0, 63) },
    { "x-atom-desktop-token": target.token, Host: "rebinding.invalid" },
    { "x-atom-desktop-token": target.token, Host: `localhost:${target.address.split(":")[1]}` },
    { "x-atom-desktop-token": target.token, Origin: "null" },
    { "x-atom-desktop-token": target.token, Origin: "https://foreign.example" },
    { "x-atom-desktop-token": target.token, Origin: "app://atom.evil" },
  ]) {
    // fetch normalizes/ignores Host overrides. Use a raw HTTP client to test
    // rebinding against the actual server rather than its own header policy.
    const response = await new Promise((resolve, reject) => {
      const request = require("node:http").request(`http://${target.address}/api/meta`, { headers }, (incoming) => {
        let body = "";
        incoming.setEncoding("utf8"); incoming.on("data", (chunk) => { body += chunk; });
        incoming.once("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body }));
      });
      request.once("error", reject); request.end();
    });
    assert.ok([401, 403].includes(response.status), `transport rejection returned ${response.status}`);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(response.body.includes(target.token), false);
  }
  const authenticated = await fetch(`http://${target.address}/api/meta`, { headers: { "x-atom-desktop-token": target.token } });
  assert.equal(authenticated.status, 200, "Origin absence never bypasses authentication, but authenticated local clients remain valid");
  const snapshot = JSON.stringify(backend.snapshot());
  for (const privateValue of [target.token, target.address, backend.executable, backend.datasetDir]) assert.equal(snapshot.includes(privateValue), false);
  const args = require("node:child_process").execFileSync("ps", ["-p", String(target.child.pid), "-o", "args="], { encoding: "utf8" });
  assert.equal(args.includes(target.token), false);
  assert.equal(args.includes(target.address), false);
});

test("the closed proxy retains the real engine's experiment job and cancellation routes", async (t) => {
  const { backend } = await realBackend(t);
  const target = await backend.start();
  const route = createRouter({ sidecar: backend });
  const call = (pathname, options = {}) => route(new Request(`app://atom${pathname}`, { ...options,
    headers: { "x-atom-client": "1", "x-atom-runtime-generation": target.generation, "content-type": "application/json" } }));
  const created = await call("/api/processes/batch-experiment/execution", { method: "POST", body: JSON.stringify({ name: "native route fixture",
    base: { tower_lon: 32.85, tower_lat: 39.92, rays: 8, radius_m: 25, frequency_ghz: 2.6, tx_power_dbm: 30, beam_width: 120, azimuth: 0 } }) });
  assert.ok([200, 202].includes(created.status), await created.clone().text());
  const job = await created.json();
  assert.match(job.job_id, /^job-[a-f0-9]{24}$/);
  const result = await call(`/api/jobs/${job.job_id}`);
  assert.equal(result.status, 200); assert.equal((await result.json()).job_id, job.job_id);
  const cancelled = await call(`/api/jobs/${job.job_id}`, { method: "DELETE" });
  assert.equal(cancelled.status, 200); await cancelled.text();
});

test("another OS user cannot read the real desktop API", { skip: process.env.CI !== "true" || !["darwin", "linux"].includes(process.platform) }, async (t) => {
  const { backend } = await realBackend(t);
  const target = await backend.start();
  const status = require("node:child_process").execFileSync("sudo", ["-n", "-u", "nobody", "--", "curl", "--noproxy", "*", "--silent", "--show-error", "--max-time", "5",
    "--output", "/dev/null", "--write-out", "%{http_code}", `http://${target.address}/api/meta`], { encoding: "utf8", timeout: 10_000 });
  assert.equal(status, "401");
});
