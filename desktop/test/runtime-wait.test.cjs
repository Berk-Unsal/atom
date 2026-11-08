"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("native readiness polling awaits each IPC value and never accepts a false promise", async () => {
  const { waitForRuntime } = await import("./runtime-wait.mjs");
  const statuses = [{ state: "restarting", generation: "old" }, { state: "loading-dataset", generation: "new" }, { state: "ready", generation: "new" }];
  let calls = 0;
  const page = { evaluate: async () => statuses[calls++] };
  assert.deepEqual(await waitForRuntime(page, (status) => status.state === "ready" && status.generation !== "old", 1000, 1), statuses[2]);
  assert.equal(calls, 3);
  await assert.rejects(waitForRuntime({ evaluate: async () => statuses[0] }, (status) => status.state === "ready", 5, 1), /condition timed out/);
});
