"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const { observeRenderer } = require("./renderer-observation.cjs");
const request = (url, method = "GET") => ({ url: () => url, method: () => method, failure: () => ({ errorText: "net::ERR_FAILED" }) });
test("observes bounded app asset/API failures without credentials, queries or foreign destinations", () => {
  const page = new EventEmitter(), observer = observeRenderer(page);
  page.emit("requestfailed", request("app://atom/assets/missing.js?secret=do-not-copy"));
  page.emit("requestfailed", request("https://foreign.example/private"));
  page.emit("requestfailed", request("app://user:do-not-copy@atom/assets/x.js"));
  page.emit("requestfailed", request("app://atom/api/unknown/do-not-copy"));
  page.emit("response", { request: () => request("app://atom/api/meta?token=do-not-copy"), status: () => 502 });
  page.emit("response", { request: () => request("app://atom/api/meta"), status: () => 200 });
  assert.deepEqual(observer.records.failed_requests, [{ method: "GET", path: "/assets/missing.js", reason: "net::ERR_FAILED" }]);
  assert.deepEqual(observer.records.failed_responses, [{ method: "GET", path: "/api/meta", status: 502 }]);
  assert.doesNotMatch(JSON.stringify(observer.records), /do-not-copy|foreign/);
});
test("keeps exception class, hash and app frames while excluding arbitrary exception/source values", () => {
  const page = new EventEmitter(), observer = observeRenderer(page), error = new TypeError('private-source-row {"coordinates":[1,2]}');
  error.stack = error.message + "\n at app://atom/assets/index-abc.js:12:34\n at https://foreign.example/private.js:1:2";
  page.emit("pageerror", error);
  assert.equal(observer.records.page_errors[0].name, "TypeError"); assert.match(observer.records.page_errors[0].message_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(observer.records.page_errors[0].frames, ["app://atom/assets/index-abc.js:12:34"]);
  assert.doesNotMatch(JSON.stringify(observer.records), /private-source-row|coordinates|foreign/);
});
test("caps each diagnostic class and detaches without affecting the page", () => {
  const page = new EventEmitter(), observer = observeRenderer(page);
  for (let index = 0; index < 30; index++) page.emit("requestfailed", request("app://atom/assets/x.js"));
  assert.equal(observer.records.failed_requests.length, 20); observer.stop(); page.emit("pageerror", new Error("after detach"));
  assert.equal(observer.records.page_errors.length, 0); assert.equal(page.listenerCount("requestfailed"), 0);
});

test("redacts dynamic source identifiers and console text, retaining only error hashes and crash observations", () => {
  const page = new EventEmitter(), observer = observeRenderer(page);
  page.emit("requestfailed", request("app://atom/api/spatial-evidence/buildings/private-source-row"));
  page.emit("requestfailed", request("app://atom/api/jobs/job-0123456789abcdef01234567"));
  for (let index = 0; index < 25; index++) page.emit("console", { type: () => "error", text: () => "private-source-row token=do-not-copy" });
  page.emit("console", { type: () => "log", text: () => { throw new Error("Ordinary logs must not be read"); } });
  page.emit("crash");
  assert.deepEqual(observer.records.failed_requests.map((value) => value.path), ["/api/spatial-evidence/buildings/:id", "/api/jobs/:id"]);
  assert.equal(observer.records.console_errors.length, 1); assert.equal(observer.records.console_errors[0].occurrences, 25);
  assert.match(observer.records.console_errors[0].message_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(observer.records.crashes, [{ observed: true }]);
  assert.doesNotMatch(JSON.stringify(observer.records), /private-source-row|do-not-copy|0123456789/);
  observer.stop(); assert.equal(page.listenerCount("console"), 0); assert.equal(page.listenerCount("crash"), 0);
});
