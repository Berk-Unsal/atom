"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const GENERATION = "a".repeat(32);
const { createRouter } = require("../lib/router.cjs");

test("assets are bounded to the shared dist, including symlinks and decoded paths", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atom-assets-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const distDir = path.join(directory, "dist");
  await fs.mkdir(distDir);
  await fs.mkdir(path.join(distDir, "assets"));
  await fs.writeFile(path.join(distDir, "index.html"), "<h1>shared</h1>");
  await fs.writeFile(path.join(distDir, "assets/index.js"), "export const trusted = true;");
  await fs.writeFile(path.join(distDir, "report.html"), "<script>untrusted()</script>");
  await fs.writeFile(path.join(directory, "secret.txt"), "private");
  await fs.symlink(path.join(directory, "secret.txt"), path.join(distDir, "assets/leak.js"));
  const route = createRouter({ distDir });
  const response = await route(new Request("app://atom/"));
  assert.equal(await response.text(), "<h1>shared</h1>");
  assert.match(response.headers.get("content-security-policy"), /script-src 'self';/);
  assert.match(await (await route(new Request("app://atom/assets/index.js"))).text(), /trusted/);
  for (const url of ["app://evil/", "app://atom/assets/leak.js", "app://atom/report.html", "app://atom/..%2fsecret.txt", "app://atom/%00", "app://atom/missing.js"]) {
    assert.ok((await route(new Request(url))).status >= 400, url);
  }
  assert.equal((await route(new Request("app://atom/", { method: "POST" }))).status, 405);
});

test("closed route and destination policies fail before a credential can leave the host", async () => {
  const target = { address: "127.0.0.1:12345", token: "b".repeat(64), generation: GENERATION, controllers: new Set() };
  const sidecar = { current: target, ready: async () => target, snapshot: () => ({ generation: GENERATION, state: "ready" }) };
  let calls = 0;
  const route = createRouter({ sidecar, fetchAPI: async () => { calls++; return Response.json({}); } });
  const headers = { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION };
  for (const [method, url] of [["GET", "app://atom/api/admin"], ["POST", "app://atom/api/meta"], ["GET", "app://atom/api/%2f%2fevil.test"], ["GET", "app://atom/api/jobs/%2e%2e%2fmeta"]]) {
    const response = await route(new Request(url, { method, headers }));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  for (const address of ["evil.test:12345", "0.0.0.0:12345", "127.0.0.1:12345@evil.test", "127.0.0.1:12345/path"]) {
    target.address = address;
    assert.equal((await route(new Request("app://atom/api/meta", { headers }))).status, 502);
  }
  assert.equal(calls, 0);
});

test("API routing keeps token/destination host-owned and preserves JSON, Blob and abort", async () => {
  const target = { address: "127.0.0.1:12345", token: "b".repeat(64), generation: GENERATION, controllers: new Set() };
  const sidecar = { current: target, ready: async () => target, snapshot: () => ({ generation: GENERATION, state: "ready" }) };
  const calls = [];
  const route = createRouter({ sidecar, fetchAPI: async (url, options) => { calls.push({ url, options }); return new Response(new Uint8Array([0, 1, 255]), { headers: { "content-type": "application/octet-stream", "set-cookie": "secret=1" } }); } });
  for (const headers of [{}, { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION, origin: "https://evil.example" }, { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION, "sec-fetch-site": "cross-site" }]) {
    assert.equal((await route(new Request("app://atom/api/meta", { headers }))).status, 403);
  }
  assert.equal(calls.length, 0);
  const response = await route(new Request("app://atom/api/coverage-surface?f=geojson", {
    method: "POST", headers: { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION, "x-atom-desktop-token": "forged", "content-type": "application/json" }, body: '{"test":true}',
  }));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 1, 255]));
  assert.equal(calls[0].url, "http://127.0.0.1:12345/api/coverage-surface?f=geojson");
  assert.equal(calls[0].options.headers["x-atom-desktop-token"], "b".repeat(64));
  assert.equal(calls[0].options.headers.origin, "app://atom");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(target.controllers.size, 0);
  const abortResponse = await route(new Request("app://atom/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION } }));
  await abortResponse.body.cancel();
  assert.equal(calls[1].options.signal.aborted, true);
});

test("unready, redirected and stale-generation responses never reach the renderer", async () => {
  const request = () => new Request("app://atom/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION } });
  assert.equal((await createRouter({ sidecar: { ready: async () => { throw new Error("missing"); }, snapshot: () => ({ generation: GENERATION, state: "failed" }) } })(request())).status, 503);
  const target = { address: "127.0.0.1:12345", token: "b".repeat(64), generation: GENERATION, controllers: new Set() };
  const sidecar = { current: target, ready: async () => target, snapshot: () => ({ generation: GENERATION, state: "ready" }) };
  assert.equal((await createRouter({ sidecar, fetchAPI: async () => new Response(null, { status: 302, headers: { location: "https://evil.example" } }) })(request())).status, 502);
  assert.equal((await createRouter({ sidecar, fetchAPI: async () => { sidecar.current = {}; return Response.json({ stale: true }); } })(request())).status, 409);
});

test("the shared RF follow-up capability survives both directions of the proxy", async () => {
  const target = { address: "127.0.0.1:12345", token: "b".repeat(64), generation: GENERATION, controllers: new Set() };
  const sidecar = { current: target, ready: async () => target, snapshot: () => ({ generation: GENERATION, state: "ready" }) };
  const workflowID = "a".repeat(32);
  const route = createRouter({ sidecar, fetchAPI: async (_url, options) => {
    assert.equal(options.headers["rf-workflow"], "network-maps-v1");
    assert.equal(options.headers["rf-workflow-id"], workflowID);
    assert.equal(options.headers["rf-workflow-index"], "0");
    return Response.json({}, { headers: { "RF-Workflow-ID": workflowID, "RF-Workflow-Remaining": "2", "RF-Workflow-Expires": "120", "RF-Budget-Policy": "bounded-followups-v1", "RateLimit-Remaining": "19" } });
  } });
  const response = await route(new Request("app://atom/api/evaluate-network", { method: "POST", headers: { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION, "RF-Workflow": "network-maps-v1", "RF-Workflow-ID": workflowID, "RF-Workflow-Index": "0" } }));
  assert.equal(response.headers.get("RF-Workflow-ID"), workflowID);
  assert.equal(response.headers.get("RF-Workflow-Remaining"), "2");
  assert.equal(response.headers.get("RF-Workflow-Expires"), "120");
  assert.equal(response.headers.get("RF-Budget-Policy"), "bounded-followups-v1");
  assert.equal(response.headers.get("RateLimit-Remaining"), "19");
  await response.text();
});

test("prior-generation requests fail before transport and a draining response cannot continue", async () => {
  const target = { address: "127.0.0.1:12345", generation: GENERATION, token: "b".repeat(64), controllers: new Set() };
  const sidecar = { current: target, snapshot: () => ({ state: "ready", generation: GENERATION }), ready: async () => target };
  let calls = 0; let nextChunk;
  const route = createRouter({ sidecar, fetchAPI: async () => { calls++; return new Response(new ReadableStream({ pull(controller) { nextChunk = () => { controller.enqueue(new Uint8Array([1])); }; } })); } });
  assert.equal((await route(new Request("app://atom/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": "b".repeat(32) } }))).status, 409);
  assert.equal(calls, 0);
  const response = await route(new Request("app://atom/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION } }));
  const reading = response.arrayBuffer();
  sidecar.current = null;
  nextChunk();
  await assert.rejects(reading, /generation changed/);
  assert.equal(calls, 1);
  assert.equal(target.controllers.size, 0);
});

test("clean Vite routing needs no dist and never changes the private API destination", async () => {
  assert.throws(() => createRouter({ devServer: "http://0.0.0.0:5173" }), /loopback/);
  const target = { address: "127.0.0.1:12345", generation: GENERATION, token: "b".repeat(64), controllers: new Set() };
  const sidecar = { current: target, snapshot: () => ({ state: "ready", generation: GENERATION }), ready: async () => target };
  const uiCalls = []; const apiCalls = [];
  const route = createRouter({ distDir: "/no-dist", devServer: "http://127.0.0.1:5173", sidecar,
    fetchUI: async (url) => { uiCalls.push(url); return new Response("Vite source", { headers: { "content-type": "text/html" } }); },
    fetchAPI: async (url) => { apiCalls.push(url); return Response.json({ status: "ok" }); },
  });
  const html = await route(new Request("app://atom/"));
  assert.equal(await html.text(), "Vite source");
  assert.match(html.headers.get("content-security-policy"), /ws:\/\/127.0.0.1:5173/);
  await (await route(new Request("app://atom/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": GENERATION } }))).text();
  assert.deepEqual(uiCalls, ["http://127.0.0.1:5173/"]);
  assert.deepEqual(apiCalls, ["http://127.0.0.1:12345/api/meta"]);
});
