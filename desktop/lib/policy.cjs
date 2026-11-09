"use strict";

const APP_ORIGIN = "app://atom";
const API_HEADER = "x-atom-client";
const GENERATION_HEADER = "x-atom-runtime-generation";
const RELEASE_CSP = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:";

function isAppURL(raw) {
  try {
    const url = new URL(raw);
    // Node's URL.origin is "null" for custom schemes. Check every authority field.
    return url.protocol === "app:" && url.hostname === "atom" && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function isTrustedDocument(raw) {
  if (!isAppURL(raw)) return false;
  const url = new URL(raw);
  return ["/", "/index.html"].includes(url.pathname) && !url.search;
}

function externalURL(raw) {
  if (typeof raw !== "string" || raw.length > 8192) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function allowRendererRequest(details, contents, devServer = "") {
  if (!contents || contents.isDestroyed() || details.webContentsId !== contents.id) return false;
  if (details.resourceType === "mainFrame") return isTrustedDocument(details.url);
  if (["subFrame", "object"].includes(details.resourceType) || !isTrustedDocument(contents.getURL())) return false;
  if (!details.frame || details.frame !== contents.mainFrame) return false;
  if (isAppURL(details.url)) return true;
  try {
    const url = new URL(details.url);
    if (details.resourceType === "image" && url.origin === "https://tile.openstreetmap.org" && !url.username && !url.password && !url.search) {
      const tile = /^\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.png$/.exec(url.pathname);
      if (tile && +tile[1] <= 19 && +tile[2] < 2 ** +tile[1] && +tile[3] < 2 ** +tile[1]) return true;
    }
    if (["image", "font"].includes(details.resourceType) && url.protocol === "data:") return true;
    return devServer === "http://127.0.0.1:5173" && details.resourceType === "webSocket" && url.origin === "ws://127.0.0.1:5173";
  } catch { return false; }
}

function lockNavigation(contents, openExternal) {
  // Navigation never conveys native authority. Only user-initiated main-frame
  // HTTPS navigation is offered to the system browser; frames/redirects are denied.
  contents.on("will-navigate", (event, target) => {
    event.preventDefault();
    const url = externalURL(target);
    if (url) void openExternal(url);
  });
  contents.on("will-frame-navigate", (event) => {
    // Electron emits this before will-navigate. Let the main-frame event reach
    // the handler above so ordinary HTTPS links actually reach the browser.
    if (!event.isMainFrame) event.preventDefault();
  });
  contents.on("will-redirect", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    const safe = externalURL(url);
    if (safe) void openExternal(safe);
    return { action: "deny" };
  });
}

function assertMainFrame(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame || !isTrustedDocument(event.senderFrame.url)) {
    throw new Error("Native capability unavailable in this frame");
  }
}

module.exports = { APP_ORIGIN, API_HEADER, GENERATION_HEADER, RELEASE_CSP, isAppURL, isTrustedDocument, allowRendererRequest, externalURL, lockNavigation, assertMainFrame };
