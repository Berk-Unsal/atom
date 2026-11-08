"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { isAppURL, externalURL, lockNavigation, assertMainFrame } = require("../lib/policy.cjs");

test("custom scheme trust uses the exact authority, never URL.origin=null", () => {
  assert.equal(isAppURL("app://atom/index.html"), true);
  for (const raw of ["app://evil/", "app://atom.evil/", "app://user@atom/", "app://atom:8080/", "https://atom/", "file:///etc/passwd", "data:text/html,", "null", "app://atom@evil/"]) assert.equal(isAppURL(raw), false, raw);
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
