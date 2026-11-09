"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { RebuildQueue } = require("../lib/rebuild-queue.cjs");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("failed compilation preserves the last good service and a later edit can recover", async () => {
  let service = "last-good"; let calls = 0; const failures = [];
  const queue = new RebuildQueue({ debounce: 1, build: async () => { if (calls++ === 0) throw new Error("compile failed"); return "replacement"; },
    apply: async (candidate) => { service = candidate; }, discard: async () => {} });
  queue.on("build-failed", ({ error }) => failures.push(error.message));
  queue.request(); await queue.idle();
  assert.equal(service, "last-good"); assert.deepEqual(failures, ["compile failed"]);
  queue.request(); await queue.idle();
  assert.equal(service, "replacement"); await queue.close();
});

test("burst edits never run concurrent compilers or install a superseded candidate", async () => {
  const compiling = deferred(); const release = deferred();
  const built = []; const applied = []; const discarded = [];
  const queue = new RebuildQueue({ debounce: 1, build: async ({ revision }) => { built.push(revision); if (built.length === 1) { compiling.resolve(); await release.promise; } return revision; },
    apply: async (candidate) => applied.push(candidate), discard: async (candidate) => { discarded.push(candidate); } });
  queue.request(); await compiling.promise;
  queue.request(); queue.request(); queue.request();
  assert.deepEqual(built, [1]);
  release.resolve(); await queue.idle();
  assert.deepEqual(built, [1, 4]); assert.deepEqual(applied, [4]); assert.deepEqual(discarded, [1]);
  await queue.close();
});

test("shutdown cancels compilation and cannot install or schedule a replacement", async () => {
  const compiling = deferred(); const applied = []; const discarded = [];
  const queue = new RebuildQueue({ debounce: 1, build: async ({ signal }) => {
    compiling.resolve(); await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })); return "cancelled-candidate";
  }, apply: async (candidate) => applied.push(candidate), discard: async (candidate) => { discarded.push(candidate); } });
  queue.request(); await compiling.promise;
  await queue.close(); queue.request(); await queue.idle();
  assert.deepEqual(applied, []); assert.deepEqual(discarded, ["cancelled-candidate"]);
});
