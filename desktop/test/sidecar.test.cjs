"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { Sidecar } = require("../lib/sidecar.cjs");

function fixture(scenario, options = {}) {
  return new Sidecar({ executable: process.execPath, datasetDir: os.tmpdir(), distDir: os.tmpdir(), version: "test", commit: "test", timeout: 1000, shutdownTimeout: 500,
    spawnProcess: (executable, _args, options) => spawn(executable, [path.join(__dirname, "fixtures/sidecar.cjs"), scenario], options), ...options });
}

test("structured lifecycle diagnostics omit stderr text and cannot disrupt owned cleanup", async () => {
  const rows = []; const backend = fixture("stderr", { diagnostics: (event, fields) => rows.push({ event, ...fields }) });
  const child = await backend.start(); await backend.stop();
  assert.ok(rows.some((row) => row.state === "ready" && row.dataset === true));
  assert.ok(rows.some((row) => row.event === "backend-stderr" && row.bytes > 0));
  assert.equal(JSON.stringify(rows).includes(child.token), false); assert.doesNotMatch(JSON.stringify(rows), /stderr"\s*:/);
  const broken = fixture("ready", { diagnostics: () => { throw new Error("log disk failure"); } });
  await broken.start(); await broken.stop(); assert.equal(broken.owned.closed, true);
});

test("real inherited pipes verify readiness and clean shutdown; concurrent starts own one child", async () => {
  const backend = fixture("ready");
  const first = backend.start();
  assert.equal(first, backend.start());
  const target = await first;
  assert.equal(target.address, "127.0.0.1:54321");
  assert.equal(target.token.length, 64);
  assert.equal(backend.state, "ready");
  await backend.stop();
  assert.equal(backend.state, "stopped");
  assert.equal(target.closed, true);
  assert.equal(target.child.exitCode, 0);
  assert.throws(() => process.kill(target.child.pid, 0), { code: "ESRCH" });
});

test("startup failures, malformed events and identity mismatches fail boundedly without EPIPE dialogs", async (t) => {
  for (const scenario of ["early-exit", "invalid-json", "oversized", "ready-first", "foreign-address", "foreign-pid", "foreign-generation", "wrong-version", "wrong-commit", "missing-dataset", "timeout"]) {
    await t.test(scenario, async () => {
      const backend = fixture(scenario);
      await assert.rejects(backend.start());
      await backend.stop();
      assert.equal(backend.current, null);
      assert.equal(backend.owned.closed, true);
    });
  }
});

test("missing executable rejects without an unhandled pipe error", async () => {
  const backend = new Sidecar({ executable: "/no-such-atom-backend", datasetDir: os.tmpdir(), distDir: os.tmpdir(), version: "test", commit: "test" });
  await assert.rejects(backend.start(), /could not start/);
  await backend.stop();
});

test("listener denial exposes a bounded actionable reason without copying control text", async () => {
  const rows = []; const backend = fixture("listen-failed", { diagnostics: (event, fields) => rows.push({ event, ...fields }) });
  await assert.rejects(backend.start(), /local listener/); await backend.stop();
  assert.ok(rows.some((row) => row.state === "failed" && row.reason === "listener"));
  assert.equal(backend.owned.closed, true);
});

test("a child that ignores shutdown is killed and reaped within the owned shutdown ceiling", async () => {
  const backend = fixture("ignore-shutdown");
  const target = await backend.start();
  await backend.stop();
  assert.equal(target.closed, true);
  assert.equal(target.child.signalCode, "SIGKILL");
  assert.throws(() => process.kill(target.child.pid, 0), { code: "ESRCH" });
});

test("crashes invalidate readiness and cancel in-flight work without replay", async () => {
  const backend = fixture("ready");
  const target = await backend.start();
  const controller = new AbortController(); target.controllers.add(controller);
  target.child.kill("SIGKILL");
  await target.exited;
  assert.equal(controller.signal.aborted, true);
  assert.equal(backend.state, "failed");
  await assert.rejects(backend.ready());
  await backend.stop();
});

test("explicit recovery reaps the old process, cancels its requests and rotates credentials once", async () => {
  const backend = fixture("ready");
  const first = await backend.start();
  const request = new AbortController(); first.controllers.add(request);
  const restarted = backend.restart();
  assert.equal(restarted, backend.restart());
  assert.equal(request.signal.aborted, true);
  assert.equal(backend.current, null);
  const second = await restarted;
  assert.equal(first.closed, true);
  assert.notEqual(first.child.pid, second.child.pid);
  assert.notEqual(first.generation, second.generation);
  assert.notEqual(first.token, second.token);
  assert.throws(() => process.kill(first.child.pid, 0), { code: "ESRCH" });
  await backend.stop();
});

test("recovery during startup cancels and reaps that generation before replacement", async () => {
  const backend = fixture("timeout");
  let launches = 0;
  backend.spawnProcess = (executable, _args, options) => spawn(executable, [path.join(__dirname, "fixtures/sidecar.cjs"), launches++ ? "ready" : "timeout"], options);
  const pending = backend.start();
  const old = backend.owned;
  const restarted = backend.restart();
  await assert.rejects(pending, /cancelled/);
  await restarted;
  assert.equal(old.closed, true);
  assert.equal(launches, 2);
  await backend.stop();
});

test("quit wins a concurrent recovery and cannot spawn another backend", async () => {
  const backend = fixture("ready");
  await backend.start();
  const previous = backend.owned;
  const restarted = backend.restart();
  const stopped = backend.stop();
  assert.equal(stopped, backend.stop());
  await assert.rejects(restarted, /shutting down/);
  await stopped;
  assert.equal(backend.owned, previous);
  assert.equal(previous.closed, true);
  await assert.rejects(backend.start(), /shutting down/);
});

test("public readiness separates listener, dataset and UI without leaking process authority", async () => {
  const backend = fixture("ready");
  const states = [];
  backend.on("status", (value) => states.push(value));
  await backend.start();
  assert.equal(states[0].state, "starting");
  assert.equal(states.find((value) => value.state === "loading-dataset").readiness.listener, true);
  assert.deepEqual(backend.snapshot().readiness, { listener: true, dataset: true, ui: false });
  backend.setUIReady(true);
  assert.deepEqual(backend.snapshot().readiness, { listener: true, dataset: true, ui: true });
  assert.deepEqual(Object.keys(backend.snapshot()).sort(), ["error", "generation", "readiness", "sequence", "state"]);
  assert.equal(JSON.stringify(backend.snapshot()).includes(backend.current.token), false);
  assert.ok(states.every((value, index) => !index || value.sequence > states[index - 1].sequence));
  await backend.stop();
  assert.deepEqual(backend.snapshot().readiness, { listener: false, dataset: false, ui: true });
});

test("control-channel loss and invalid events after readiness invalidate and reap the child", async (t) => {
  for (const scenario of ["late-invalid", "closed-channel"]) await t.test(scenario, async () => {
    const backend = fixture(scenario);
    const child = await backend.start();
    await child.exited;
    assert.equal(backend.state, "failed");
    assert.equal(backend.current, null);
    await backend.stop();
  });
});

test("startup stderr is drained, bounded and credential-redacted in private host memory", async () => {
  const backend = fixture("stderr");
  const child = await backend.start();
  for (let attempt = 0; attempt < 100 && !child.stderr.endsWith("[redacted]"); attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(Buffer.byteLength(child.stderr) <= 8192);
  assert.equal(child.stderr.includes(child.token), false);
  assert.equal(child.stderr.endsWith("[redacted]"), true);
  await backend.stop();
});
