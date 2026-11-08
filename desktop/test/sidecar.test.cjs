"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { Sidecar } = require("../lib/sidecar.cjs");

function fixture(scenario) {
  return new Sidecar({ executable: process.execPath, datasetDir: os.tmpdir(), distDir: os.tmpdir(), version: "test", commit: "test", timeout: 1000, shutdownTimeout: 50,
    spawnProcess: (executable, _args, options) => spawn(executable, [path.join(__dirname, "fixtures/sidecar.cjs"), scenario], options) });
}

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
  assert.throws(() => process.kill(target.child.pid, 0), { code: "ESRCH" });
});

test("startup failures, malformed events and identity mismatches fail boundedly without EPIPE dialogs", async (t) => {
  for (const scenario of ["early-exit", "invalid-json", "oversized", "ready-first", "foreign-address", "foreign-pid", "wrong-version", "missing-dataset", "timeout"]) {
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

test("a child that ignores shutdown is killed and reaped within the owned shutdown ceiling", async () => {
  const backend = fixture("ignore-shutdown");
  const target = await backend.start();
  await backend.stop();
  assert.equal(target.closed, true);
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
