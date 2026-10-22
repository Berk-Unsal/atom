"use strict";

// D01 (#148) Electron fallback spike. Same React build, same Go API executable
// in --desktop-control mode (backend-go/desktop_control.go), stable app://atom
// origin, locked navigation and an isolated print surface. Not a release shell.

const { app, BrowserWindow, dialog, net, protocol, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { Readable } = require("node:stream");

const APP_ORIGIN = "app://atom";
const TOKEN_HEADER = "x-atom-desktop-token";
const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

const config = {
  distDir: path.resolve(process.env.ATOM_SPIKE_DIST || path.join(process.resourcesPath, "dist")),
  sidecar: process.env.ATOM_SPIKE_SIDECAR || path.join(process.resourcesPath, "atom-api"),
  datasetDir: process.env.ATOM_SPIKE_DATASET_DIR || path.join(process.resourcesPath, "data-pipeline"),
  devServer: process.env.ATOM_SPIKE_DEV_SERVER || "",
  profile: process.env.ATOM_SPIKE_PROFILE || "",
  openExternal: process.env.ATOM_SPIKE_NO_EXTERNAL !== "1",
  downloadsDir: process.env.ATOM_SPIKE_DOWNLOADS || "",
};

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
};

const TILE_ORIGINS = "https://tile.openstreetmap.org https://tiles.stadiamaps.com";
// Mirrors backend-go/security_headers.go; the dev policy only adds what Vite
// HMR needs on loopback and never reaches a release build.
const RELEASE_CSP = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: ${TILE_ORIGINS}; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:`;
const DEV_CSP = RELEASE_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173");

const trace = (message) => { if (process.env.ATOM_SPIKE_TRACE === "1") console.log(`atom-spike: ${message}`); };

// Observations for the Playwright probe; nothing here is read by the UI.
const spike = {
  blockedNavigations: [], externalRequests: [], apiRequests: [], rejectedRequests: [], events: [], downloads: [], sidecar: null, secondInstance: 0,
  platform: { platform: process.platform, arch: process.arch, wayland_display: Boolean(process.env.WAYLAND_DISPLAY), x11_display: Boolean(process.env.DISPLAY), session_type: process.env.XDG_SESSION_TYPE || null, argv: process.argv.slice(1) },
};
global.__atomSpike = spike;

if (config.profile) app.setPath("userData", config.profile);
app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

let mainWindow = null;
let current = null;
let resolveFirstSidecar;
const firstSidecar = new Promise((resolve) => { resolveFirstSidecar = resolve; });

function curatedEnv() {
  const env = { GIN_MODE: "release", ATOM_DATASET_DIR: config.datasetDir };
  for (const key of ["HOME", "TMPDIR", "LANG"]) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function startSidecar() {
  const token = crypto.randomBytes(32).toString("hex");
  const generation = crypto.randomBytes(8).toString("hex");
  const started = Date.now();
  const child = spawn(config.sidecar, ["--desktop-control"], { stdio: ["ignore", "inherit", "inherit", "pipe", "pipe"], env: curatedEnv() });
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  return new Promise((resolve, reject) => {
    const state = { child, token, generation, exited, address: null, pid: child.pid, dataset: null, readyMs: null, stopping: false };
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("sidecar startup timed out")), STARTUP_TIMEOUT_MS);
    child.once("error", (error) => fail(new Error(`sidecar could not start: ${error.code || error.message}`)));
    exited.then(({ code, signal }) => {
      spike.events.push({ event: "sidecar-exit", generation, code, signal, expected: state.stopping });
      fail(new Error(`sidecar exited during startup: ${code ?? signal}`));
    });
    const [control, events] = [child.stdio[3], child.stdio[4]];
    if (!control || !events) return fail(new Error("sidecar control pipes are unavailable"));
    // A child that exits early closes its end of the pipes. That must surface
    // as a failed startup or a recorded crash, never as an uncaught exception
    // (Electron would block the main thread on a native error dialog).
    for (const stream of [control, events]) {
      stream.on("error", (error) => {
        spike.events.push({ event: "control-pipe-error", generation, code: error.code });
        fail(new Error(`sidecar control pipe: ${error.code || error.message}`));
      });
    }
    control.write(`${JSON.stringify({ protocol: 1, token, generation, allowed_origins: [APP_ORIGIN] })}\n`);
    readline.createInterface({ input: events }).on("line", (line) => {
      let event;
      try { event = JSON.parse(line); } catch { return fail(new Error("sidecar sent an unreadable control event")); }
      if (event.generation !== generation || event.protocol !== 1) return fail(new Error("sidecar generation mismatch"));
      spike.events.push({ event: event.event, generation, at_ms: Date.now() - started });
      if (event.event === "listening") {
        if (!/^127\.0\.0\.1:\d+$/.test(event.address) || event.pid !== child.pid) return fail(new Error("sidecar identity mismatch"));
        state.address = event.address;
        state.meta = { version: event.application_version, commit: event.build_commit, model: event.model_version };
      } else if (event.event === "dataset") {
        state.dataset = event.dataset;
      } else if (event.event === "ready" && !settled) {
        settled = true;
        clearTimeout(timer);
        state.readyMs = Date.now() - started;
        resolve(state);
      } else if (event.event === "failed") {
        fail(new Error(`sidecar failed: ${event.error}`));
      }
    });
  });
}

async function stopSidecar(state) {
  if (!state || state.stopping) return state && state.exited;
  state.stopping = true;
  state.child.stdio[3].end(`${JSON.stringify({ command: "shutdown" })}\n`);
  const outcome = await Promise.race([state.exited, new Promise((resolve) => setTimeout(() => resolve(null), SHUTDOWN_TIMEOUT_MS))]);
  if (outcome) return outcome;
  state.child.kill("SIGKILL");
  return state.exited;
}

const isAPIPath = (pathname) => pathname.startsWith("/api/") || pathname === "/healthz" || pathname === "/readyz";
const isAppURL = (raw) => { try { return new URL(raw).origin === APP_ORIGIN; } catch { return false; } };

function reject(status, reason, request) {
  spike.rejectedRequests.push({ reason, url: request.url, origin: request.headers.get("origin"), site: request.headers.get("sec-fetch-site") });
  return new Response(JSON.stringify({ error: "desktop transport rejected" }), { status, headers: { "content-type": "application/json" } });
}

async function proxyAPI(request, url) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin && origin !== APP_ORIGIN) return reject(403, "foreign-origin", request);
  if (site && site !== "same-origin" && site !== "none") return reject(403, "cross-site", request);
  const target = await Promise.race([firstSidecar, new Promise((resolve) => setTimeout(() => resolve(null), STARTUP_TIMEOUT_MS))]);
  if (!target || !current) return new Response(JSON.stringify({ error: "desktop backend is starting" }), { status: 503 });
  const sidecar = current;
  const headers = new Headers(request.headers);
  headers.delete(TOKEN_HEADER);
  headers.delete("host");
  headers.set(TOKEN_HEADER, sidecar.token);
  const entry = { method: request.method, path: url.pathname, origin, site, generation: sidecar.generation, status: null, aborted: false };
  if (spike.apiRequests.length < 400) spike.apiRequests.push(entry);
  request.signal?.addEventListener("abort", () => { entry.aborted = true; });
  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const response = await fetch(`http://${sidecar.address}${url.pathname}${url.search}`, {
      method: request.method, headers, body: hasBody ? request.body : undefined, duplex: hasBody ? "half" : undefined,
      redirect: "manual", signal: request.signal,
    });
    entry.status = response.status;
    const outHeaders = new Headers(response.headers);
    // Node fetch already decoded the body; do not let Chromium decode it again.
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    // Renderer cancellation arrives as a cancel of this stream (the protocol
    // Request signal is not aborted); cancelling the upstream reader closes the
    // sidecar connection so its request context is cancelled too.
    if (!response.body) return new Response(null, { status: response.status, statusText: response.statusText, headers: outHeaders });
    const reader = response.body.getReader();
    let bytes = 0;
    const body = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { entry.bytes = bytes; controller.close(); return; }
        bytes += value.byteLength;
        controller.enqueue(value);
      },
      cancel(reason) { entry.cancelled = true; entry.bytes = bytes; return reader.cancel(reason); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: outHeaders });
  } catch (error) {
    entry.status = error.name === "AbortError" ? "aborted" : "error";
    return new Response(JSON.stringify({ error: "desktop backend unavailable" }), { status: 502 });
  }
}

function serveDist(url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return new Response("bad request", { status: 400 }); }
  let file = path.resolve(config.distDir, `.${pathname}`);
  if (file !== config.distDir && !file.startsWith(config.distDir + path.sep)) return new Response("not found", { status: 404 });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(config.distDir, "index.html");
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const headers = { "content-type": type, "x-content-type-options": "nosniff" };
  if (type.startsWith("text/html")) headers["content-security-policy"] = RELEASE_CSP;
  return new Response(Readable.toWeb(fs.createReadStream(file)), { headers });
}

async function serveDev(request, url) {
  const response = await fetch(`${config.devServer}${url.pathname}${url.search}`, { headers: { accept: request.headers.get("accept") || "*/*" } });
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  if ((headers.get("content-type") || "").startsWith("text/html")) headers.set("content-security-policy", DEV_CSP);
  return new Response(response.body, { status: response.status, headers });
}

let tracedRequests = 0;
function handleApp(request) {
  const url = new URL(request.url);
  if (tracedRequests < 25) { tracedRequests += 1; trace(`protocol ${request.method} ${url.pathname}`); }
  if (url.host !== "atom") return new Response("not found", { status: 404 });
  if (isAPIPath(url.pathname)) return proxyAPI(request, url);
  return config.devServer ? serveDev(request, url) : serveDist(url);
}

function openExternalSafely(raw, via) {
  let url;
  try { url = new URL(raw); } catch { return; }
  if (url.protocol !== "https:") return;
  spike.externalRequests.push({ url: url.href, via });
  if (config.openExternal) shell.openExternal(url.href);
}

function lockNavigation(contents) {
  const guard = (kind) => (event, raw) => {
    const target = typeof raw === "string" ? raw : event.url;
    if (isAppURL(target)) return;
    event.preventDefault();
    spike.blockedNavigations.push({ kind, url: target });
    openExternalSafely(target, kind);
  };
  contents.on("will-navigate", guard("will-navigate"));
  contents.on("will-frame-navigate", guard("will-frame-navigate"));
  contents.on("will-redirect", guard("will-redirect"));
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    spike.blockedNavigations.push({ kind: "window-open", url });
    openExternalSafely(url, "window-open");
    return { action: "deny" };
  });
}

// The report print surface: in-memory session, no network, no preload, no
// script, and no route back to the main window.
async function printHtmlToPDF(html) {
  const printSession = session.fromPartition("atom-report-print", { cache: false });
  printSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith("data:") }));
  printSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const window = new BrowserWindow({ show: false, webPreferences: { session: printSession, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  try {
    await window.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`);
    // No user-agent margins: the report's own @page CSS decides, matching the
    // Chromium page.pdf reference the report tests use.
    return await window.webContents.printToPDF({ pageSize: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 }, printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true, generateDocumentOutline: true });
  } finally {
    window.destroy();
  }
}
spike.printHtmlToPDF = printHtmlToPDF;

// Native Save/Open through the OS dialogs, the shape D07 will expose as a
// typed capability: the host owns the chosen path and does the file I/O.
spike.saveWithDialog = async (base64, defaultPath, title) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title, defaultPath });
  if (canceled || !filePath) return { canceled: true };
  const temporary = `${filePath}.atom-tmp-${process.pid}`;
  fs.writeFileSync(temporary, Buffer.from(base64, "base64"), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return { canceled: false, filePath };
};
spike.openWithDialog = async (defaultPath, title) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title, defaultPath, properties: ["openFile"], filters: [{ name: "A.T.O.M project", extensions: ["json"] }] });
  if (canceled || !filePaths.length) return { canceled: true };
  return { canceled: false, filePath: filePaths[0], base64: fs.readFileSync(filePaths[0]).toString("base64") };
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    spike.secondInstance += 1;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on("web-contents-created", (_event, contents) => lockNavigation(contents));
  app.on("window-all-closed", () => app.quit());

  let stopped = false;
  app.on("before-quit", (event) => {
    if (stopped || !current) return;
    event.preventDefault();
    stopSidecar(current).then((outcome) => {
      spike.events.push({ event: "sidecar-stopped", outcome });
      stopped = true;
      app.quit();
    });
  });

  app.whenReady().then(async () => {
    // Dialog automation on Linux reads the accessibility tree (AT-SPI); Chromium
    // only joins it when accessibility support is on.
    if (process.env.ATOM_SPIKE_A11Y === "1") app.setAccessibilitySupportEnabled(true);
    trace(`app ready (${process.platform}, sandbox enabled for renderers)`);
    if (process.env.ATOM_SPIKE_TRACE === "1") {
      // Heartbeat: proves the main thread is alive and lists child processes.
      let beats = 0;
      const timer = setInterval(() => {
        beats += 1;
        trace(`heartbeat ${beats}: ${app.getAppMetrics().map((m) => `${m.type}${m.serviceName ? `(${m.serviceName})` : ""}:${m.sandboxed === undefined ? "?" : m.sandboxed ? "sandboxed" : "unsandboxed"}`).join(" ")}`);
        if (beats >= 8) clearInterval(timer);
      }, 2500);
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // Without a handler Electron would open its own Save dialog for every
    // download; the spike records the bytes instead. D09 replaces this path.
    session.defaultSession.on("will-download", (_event, item) => {
      const record = { filename: item.getFilename(), mime: item.getMimeType(), state: "progressing", path: null };
      spike.downloads.push(record);
      if (!config.downloadsDir) return;
      fs.mkdirSync(config.downloadsDir, { recursive: true });
      record.path = path.join(config.downloadsDir, path.basename(item.getFilename()));
      item.setSavePath(record.path);
      item.once("done", (_doneEvent, state) => { record.state = state; });
    });
    protocol.handle("app", handleApp);
    mainWindow = new BrowserWindow({
      width: 1440, height: 900, minWidth: 1024, minHeight: 700, title: "A.T.O.M (Electron spike)",
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, spellcheck: false },
    });
    const contents = mainWindow.webContents;
    contents.once("did-finish-load", () => trace("main window loaded"));
    contents.on("did-start-loading", () => trace("main window did-start-loading"));
    contents.on("dom-ready", () => trace("main window dom-ready"));
    contents.on("did-fail-load", (_event, code, description, url) => trace(`main window did-fail-load ${code} ${description} ${url}`));
    contents.on("render-process-gone", (_event, details) => trace(`renderer gone: ${details.reason} ${details.exitCode}`));
    contents.on("console-message", (event) => trace(`renderer console ${event.level}: ${String(event.message).slice(0, 160)}`));
    app.on("child-process-gone", (_event, details) => trace(`child process gone: ${details.type} ${details.reason} ${details.exitCode}`));
    mainWindow.loadURL(`${APP_ORIGIN}/`);
    if (process.env.ATOM_SPIKE_TRACE === "1") {
      net.fetch(`${APP_ORIGIN}/index.html`).then((r) => trace(`main-process net.fetch app:// -> ${r.status}`), (e) => trace(`main-process net.fetch failed: ${e.message}`));
    }
    if (config.sidecar === "none") {
      // Diagnostic: start the shell without spawning any sidecar.
      trace("sidecar skipped");
      resolveFirstSidecar(null);
      return;
    }
    try {
      current = await startSidecar();
      spike.sidecar = { address: current.address, generation: current.generation, pid: current.pid, readyMs: current.readyMs, dataset: current.dataset, meta: current.meta };
      resolveFirstSidecar(current);
    } catch (error) {
      spike.events.push({ event: "startup-failed", error: String(error.message) });
      console.error(`sidecar startup failed: ${error.message}`);
      resolveFirstSidecar(null);
    }
  });
}
