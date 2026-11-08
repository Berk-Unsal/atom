"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { isAppURL, isTrustedDocument, allowRendererRequest, externalURL, lockNavigation, assertMainFrame } = require("../lib/policy.cjs");

test("custom scheme trust uses the exact authority, never URL.origin=null", () => {
  assert.equal(isAppURL("app://atom/index.html"), true);
  for (const raw of ["app://evil/", "app://atom.evil/", "app://user@atom/", "app://atom:8080/", "https://atom/", "file:///etc/passwd", "data:text/html,", "null", "app://atom@evil/"]) assert.equal(isAppURL(raw), false, raw);
});

test("the session permits only the owned application and approved tile images", () => {
  const contents = { id: 7, mainFrame: {}, isDestroyed: () => false, getURL: () => "app://atom/" };
  const check = (url, resourceType = "xhr", extra = {}, dev = "") => allowRendererRequest({ url, resourceType, webContentsId: 7, frame: contents.mainFrame, ...extra }, contents, dev);
  assert.equal(check("app://atom/", "mainFrame"), true);
  assert.equal(check("app://atom/assets/index.js", "script"), true);
  assert.equal(check("app://atom/api/meta"), true);
  assert.equal(check("https://tiles.stadiamaps.com/tiles/1.png", "image"), true);
  assert.equal(check("data:image/png;base64,AA==", "image"), true);
  for (const [url, type] of [["https://evil.test/", "mainFrame"], ["app://atom/report.html", "mainFrame"], ["app://atom/", "subFrame"],
    ["file:///etc/passwd", "image"], ["http://127.0.0.1:43210/api/meta", "xhr"], ["https://evil.test/image", "image"],
    ["https://tiles.stadiamaps.com/steal", "xhr"], ["https://tiles.stadiamaps.com/code.js", "script"], ["blob:app://atom/123", "mainFrame"],
    ["ws://127.0.0.1:5173", "webSocket"]]) assert.equal(check(url, type), false, `${type} ${url}`);
  assert.equal(check("app://atom/api/meta", "xhr", { webContentsId: 8 }), false);
  assert.equal(check("app://atom/assets/index.js", "script", { frame: {} }), false);
  assert.equal(check("app://atom/api/meta", "xhr", { frame: null }), false);
  assert.equal(check("ws://127.0.0.1:5173", "webSocket", {}, "http://127.0.0.1:5173"), true);
  assert.equal(check("ws://evil.test:5173", "webSocket", {}, "http://127.0.0.1:5173"), false);
  contents.getURL = () => "https://evil.test/";
  assert.equal(check("app://atom/api/meta"), false);
});

test("native authority belongs only to the trusted application document", () => {
  for (const raw of ["app://atom/", "app://atom/index.html", "app://atom/#review"]) assert.equal(isTrustedDocument(raw), true);
  for (const raw of ["app://atom/report.html", "app://atom/assets/report.html", "app://atom/?html=untrusted", "app://evil/", "about:blank", "blob:app://atom/123"]) assert.equal(isTrustedDocument(raw), false, raw);
});

test("only explicit HTTPS external links are accepted", () => {
  assert.equal(externalURL("https://example.com/docs"), "https://example.com/docs");
  for (const raw of ["file:///etc/passwd", "javascript:alert(1)", "http://example.com", "https://name:secret@example.com", {}, "a".repeat(9000)]) assert.equal(externalURL(raw), null);
});

test("navigation, redirects, subframes and popups cannot replace the trusted app", () => {
  const contents = new EventEmitter();
  contents.setWindowOpenHandler = (handler) => { contents.open = handler; };
  const opened = [];
  lockNavigation(contents, (url) => { opened.push(url); });
  let blocked = 0;
  for (const kind of ["will-navigate", "will-frame-navigate", "will-redirect", "will-attach-webview"]) {
    contents.emit(kind, { preventDefault: () => { blocked++; } }, "https://example.com/");
  }
  assert.equal(blocked, 4);
  assert.deepEqual(opened, ["https://example.com/"]);
  assert.deepEqual(contents.open({ url: "file:///etc/passwd" }), { action: "deny" });
  assert.deepEqual(contents.open({ url: "https://example.com/docs" }), { action: "deny" });
  assert.equal(opened.length, 2);
});

test("native IPC rejects foreign frames, other windows and navigated documents", () => {
  const frame = { url: "app://atom/" };
  const contents = { mainFrame: frame };
  const window = { webContents: contents, isDestroyed: () => false };
  assert.doesNotThrow(() => assertMainFrame({ sender: contents, senderFrame: frame }, window));
  assert.throws(() => assertMainFrame({ sender: contents, senderFrame: { url: frame.url } }, window));
  assert.throws(() => assertMainFrame({ sender: {}, senderFrame: frame }, window));
  frame.url = "https://evil.example/";
  assert.throws(() => assertMainFrame({ sender: contents, senderFrame: frame }, window));
});
