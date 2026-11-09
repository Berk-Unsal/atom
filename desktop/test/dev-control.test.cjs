"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { DevControl, createDevControl } = require("../lib/dev-control.cjs");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(restart = async () => ({ token: "private-token", address: "private-endpoint" })) {
  const input = new PassThrough(); const output = new PassThrough(); let wire = ""; let quits = 0;
  output.on("data", (chunk) => { wire += chunk.toString(); });
  const status = { sequence: 1, state: "ready", generation: "public-generation", readiness: { listener: true, dataset: true, ui: true }, error: null };
  const control = new DevControl({ input, output, restart, snapshot: () => status, quit: () => { quits++; } });
  return { control, input, output, send: (id, command = "restart") => input.write(`${JSON.stringify({ protocol: 1, id, command })}\n`),
    wire: () => wire, messages: () => wire.trim().split("\n").filter(Boolean).map(JSON.parse), quits: () => quits };
}

test("packaged and non-Vite hosts never open supervisor pipes even with the environment flag", () => {
  const openPipe = () => { throw new Error("must not be opened"); };
  for (const configuration of [{ isPackaged: true, enabled: "1", devServer: "http://127.0.0.1:5173" },
    { isPackaged: false, enabled: "", devServer: "http://127.0.0.1:5173" },
    { isPackaged: false, enabled: "1", devServer: "http://localhost:5173" }]) assert.equal(createDevControl({ ...configuration, openPipe }), null);
});

test("restart acknowledgements contain no private Sidecar return value", async () => {
  const host = fixture(); host.send(1); await tick();
  assert.equal(host.messages()[0].event, "restarted"); assert.equal(host.messages()[1].runtime.state, "ready");
  assert.doesNotMatch(host.wire(), /private-token|private-endpoint/);
  host.send(2, "quit"); host.input.end(); await tick();
  assert.equal(host.quits(), 1);
});

test("overlapping replacements do not replay restart and EOF wins pending work", async () => {
  let release; let calls = 0;
  const host = fixture(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  host.send(1); host.send(2); await tick();
  assert.equal(calls, 1); assert.equal(host.messages()[0].event, "rejected");
  host.input.end(); await tick(); assert.equal(host.quits(), 1);
  release({ token: "private-token" }); await tick();
  assert.equal(host.messages().length, 1);
});

test("unknown fields, replayed commands and oversized input fail closed", async () => {
  for (const input of ['{"protocol":1,"id":1,"command":"exec","path":"/tmp/other"}\n', "x".repeat(4097), "not-json\n"]) {
    const host = fixture(); host.input.write(input); await tick(); assert.equal(host.quits(), 1);
  }
  const host = fixture(); host.send(1); await tick(); host.send(1); await tick(); assert.equal(host.quits(), 1);
});
