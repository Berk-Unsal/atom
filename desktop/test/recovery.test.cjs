"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRecoveryAction } = require("../lib/recovery.cjs");

test("recovery is explicit, single-flight and cancellation leaves running work alone", async () => {
  let prompts = 0; let restarts = 0; let answer;
  const window = { isDestroyed: () => false };
  const backend = { restart: async () => { restarts++; } };
  const recover = createRecoveryAction({ backend, getWindow: () => window, showMessageBox: () => { prompts++; return new Promise((resolve) => { answer = resolve; }); } });
  const cancelled = recover();
  assert.equal(cancelled, recover());
  answer({ response: 1 });
  await cancelled;
  assert.equal(restarts, 0);
  const confirmed = recover(); answer({ response: 0 }); await confirmed;
  assert.equal(restarts, 1);
  assert.equal(prompts, 2);
});

test("quit while the confirmation is open prevents a replacement process", async () => {
  let answer; let restarts = 0;
  const backend = { stopping: false, restart: async () => { restarts++; } };
  const recover = createRecoveryAction({ backend, getWindow: () => ({ isDestroyed: () => false }), showMessageBox: () => new Promise((resolve) => { answer = resolve; }) });
  const pending = recover(); backend.stopping = true; answer({ response: 0 }); await pending;
  assert.equal(restarts, 0);
});
