"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { RebuildQueue, buildInitialRevision } = require("../lib/rebuild-queue.cjs");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("initial compilation retries an observed partial write instead of exiting", async () => {
  let revision = 0; let builds = 0;
  const entered = deferred(); const release = deferred();
  const building = buildInitialRevision({ debounce: 1, getRevision: () => revision, signal: new AbortController().signal,
    build: async () => { if (++builds === 1) { entered.resolve(); await release.promise; throw new Error("expected package, found EOF"); } return "latest"; }, discard: async () => {} });
  await entered.promise; revision++; release.resolve();
  assert.equal(await building, "latest"); assert.equal(builds, 2);
});

test("initial compilation surfaces a genuine current-source error without retry", async () => {
  const failure = new Error("invalid Go source"); let builds = 0;
  await assert.rejects(buildInitialRevision({ getRevision: () => 0, signal: new AbortController().signal,
    build: async () => { builds++; throw failure; }, discard: async () => {} }), failure);
  assert.equal(builds, 1);
});

test("initial compilation discards a successful output superseded by an edit", async () => {
  let revision = 0; let builds = 0; const discarded = [];
  const entered = deferred(); const release = deferred();
  const building = buildInitialRevision({ debounce: 1, getRevision: () => revision, signal: new AbortController().signal,
    build: async () => { if (++builds === 1) { entered.resolve(); await release.promise; return "old"; } return "current"; }, discard: async (value) => discarded.push(value) });
  await entered.promise; revision++; release.resolve();
  assert.equal(await building, "current"); assert.deepEqual(discarded, ["old"]);
});

test("shutdown discards an initial output and never retries its changed source", async () => {
  const controller = new AbortController(); const entered = deferred(); const release = deferred(); const discarded = [];
  const building = buildInitialRevision({ getRevision: () => 0, signal: controller.signal,
    build: async () => { entered.resolve(); await release.promise; return "stopping"; }, discard: async (value) => discarded.push(value) });
  await entered.promise; controller.abort(); release.resolve();
  await assert.rejects(building, { name: "AbortError" }); assert.deepEqual(discarded, ["stopping"]);
});

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
