"use strict";
const crypto = require("node:crypto");
const { lockNavigation } = require("./policy.cjs");

const REPORT_SCHEME = "atom-report";
const REPORT_CSP = "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; connect-src 'none'; form-action 'none'";
const MAX_REPORT_BYTES = 64 * 1024 * 1024;

/** Main-process-only renderer for shared HTML. ReportFiles attaches the
 * user-approved Print/PDF actions; this surface has no bridge or file paths. */
async function createReportSurface({ BrowserWindow, session, parent, html, timeout = 30_000 }) {
  if (typeof html !== "string" || Buffer.byteLength(html) > MAX_REPORT_BYTES) throw new Error("Report HTML exceeds the supported size");
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 30_000) throw new Error("Invalid report load deadline");
  const id = crypto.randomUUID();
  const url = `${REPORT_SCHEME}://${id}/report.html`;
  const isolated = session.fromPartition(`atom-report-${id}`); // No persist: prefix.
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.on("will-download", (event) => event.preventDefault());
  isolated.protocol.handle(REPORT_SCHEME, (request) => {
    if (request.url !== url || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8",
      "content-security-policy": REPORT_CSP, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  });
  const window = new BrowserWindow({ parent, show: false, width: 980, height: 1100, title: "A.T.O.M report",
    webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false,
      webviewTag: false, navigateOnDragDrop: false, spellcheck: false } });
  window.setMenu(null);
  lockNavigation(window.webContents, () => {});
  const contentsID = window.webContents.id;
  let closed = false;
  isolated.webRequest.onBeforeRequest((details, callback) => {
    const localData = ["image", "font"].includes(details.resourceType) && details.url.startsWith("data:");
    callback({ cancel: closed || details.webContentsId !== contentsID || !(localData || (details.url === url && details.resourceType === "mainFrame")) });
  });
  window.once("closed", () => { closed = true; isolated.protocol.unhandle(REPORT_SCHEME); });
  let timer;
  try {
    await Promise.race([window.loadURL(url), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Report surface did not load")), timeout); })]);
    return window;
  } catch (error) { window.destroy(); throw error; }
  finally { clearTimeout(timer); }
}

module.exports = { REPORT_SCHEME, REPORT_CSP, MAX_REPORT_BYTES, createReportSurface };
