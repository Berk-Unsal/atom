"use strict";

// Host-created directories/files and inherited sidecar writes are private.
process.umask(0o077);
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, screen, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { Sidecar } = require("./lib/sidecar.cjs");
const { createRouter } = require("./lib/router.cjs");
const { APP_ORIGIN, assertMainFrame, allowRendererRequest, isTrustedDocument, externalURL, lockNavigation } = require("./lib/policy.cjs");
const { readGeometry, writeGeometry } = require("./lib/window-state.cjs");
const { createRecoveryAction } = require("./lib/recovery.cjs");
const { REPORT_SCHEME } = require("./lib/report-surface.cjs");
const { createDevControl } = require("./lib/dev-control.cjs");
const { nativePaths, privateDirectory, prepareNativePaths } = require("./lib/native-paths.cjs");
const { SettingsStore } = require("./lib/settings-store.cjs");
const { DiagnosticLogs, safeReason } = require("./lib/diagnostic-logs.cjs");
const { createDiagnosticActions, notifyRuntime } = require("./lib/diagnostic-actions.cjs");

const resources = app.isPackaged ? process.resourcesPath : path.resolve(process.env.ATOM_DESKTOP_TEST_RESOURCES || path.join(__dirname, "build/resources"));
const devServer = app.isPackaged ? "" : process.env.ATOM_DESKTOP_DEV_SERVER || "";
app.setName("A.T.O.M");
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
  { scheme: REPORT_SCHEME, privileges: { standard: true, secure: true, stream: true } }]);
let storage;
let storageError;
try {
  storage = nativePaths({ packaged: app.isPackaged, localProfile: !app.isPackaged ? process.env.ATOM_DESKTOP_TEST_PROFILE : undefined });
  privateDirectory(storage.profile);
  // Both paths must be set synchronously before Electron's ready event.
  app.setPath("userData", storage.profile);
  app.setPath("sessionData", storage.profile);
  app.commandLine.appendSwitch("disk-cache-dir", path.join(storage.cache, "http"));
} catch (error) { storageError = error; }

let window;
let backend;
let devControl;
let quitting = false;
let stopped = false;
let logs;
let diagnostics;
const openExternal = async (url) => { try { await shell.openExternal(url); } catch { /* Browser launch failure never opens content in the app. */ } };

async function launch() {
  if (storageError) throw storageError;
  const info = JSON.parse(fs.readFileSync(path.join(resources, "build-info.json"), "utf8"));
  logs.setBuild(info); logs.record("host", "build");
  app.setAboutPanelOptions({ applicationName: "A.T.O.M", applicationVersion: info.version,
    version: `${info.commit} · Electron ${process.versions.electron} · ${process.platform}/${process.arch}`,
    iconPath: path.join(resources, "atom.png"), copyright: "A.T.O.M contributors" });
  const settings = new SettingsStore(storage.settings);
  try {
    const hostSettings = settings.load();
    settings.save({ ...hostSettings, preferences: { ...hostSettings.preferences, lastVersion: info.version } });
  } catch (error) { storageError = error; throw error; }
  const geometryFile = storage.geometry;
  const geometry = readGeometry(geometryFile, [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id)]);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowRendererRequest(details, window?.webContents, devServer) });
  });
  backend = new Sidecar({ executable: path.join(resources, "atom-api"), datasetDir: path.join(resources, "data-pipeline"),
    distDir: path.join(resources, "dist"), version: info.version, commit: info.commit,
    diagnostics: (event, fields) => logs.record("backend", event, fields) });
  devControl = createDevControl({ isPackaged: app.isPackaged, enabled: process.env.ATOM_DESKTOP_DEV_CONTROL, devServer,
    restart: () => backend.restart(), snapshot: () => backend.snapshot(), quit: () => app.quit() });
  protocol.handle("app", createRouter({ distDir: path.join(resources, "dist"), sidecar: backend, devServer }));
  const icon = nativeImage.createFromPath(path.join(resources, "atom.png"));
  if (app.dock) app.dock.setIcon(icon);
  window = new BrowserWindow({ ...geometry, minWidth: Math.min(800, geometry.width), minHeight: Math.min(600, geometry.height),
    title: "A.T.O.M", icon, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false, spellcheck: false, navigateOnDragDrop: false },
  });
  window.on("page-title-updated", (event) => { event.preventDefault(); });
  window.once("ready-to-show", () => window.show());
  window.on("close", () => {
    if (!writeGeometry(geometryFile, window.getNormalBounds())) { logs.record("host", "layout-write-failed"); dialog.showErrorBox("Window layout was not saved", "The native state directory could not be written. Existing workspace and report stores were not reset. Check available disk space and directory permissions before the next launch."); }
  });
  window.on("closed", () => { backend.setUIReady(false); window = null; app.quit(); });
  let rendererLoaded = false;
  window.webContents.on("did-finish-load", () => {
    rendererLoaded = true;
    if (!quitting && window && !window.isDestroyed() && isTrustedDocument(window.webContents.getURL())) backend.setUIReady(true);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    backend.setUIReady(false);
    logs.record("host", "renderer-gone", { reason: safeReason(details.reason), generation: backend.snapshot().generation });
    if (!quitting) void diagnostics.renderer(details.reason).catch(() => app.quit());
  });
  window.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      backend.setUIReady(false);
      logs.record("host", "renderer-load-failed", { reason: "resources", generation: backend.snapshot().generation });
      if (rendererLoaded && !quitting) void diagnostics.renderer("resources").catch(() => app.quit());
    }
  });
  backend.on("status", (status) => {
    devControl?.publish(status);
    notifyRuntime(window, status);
  });
  ipcMain.handle("atom:runtime", (event) => { assertMainFrame(event, window); return backend.snapshot(); });
  ipcMain.handle("atom:info", (event) => {
    assertMainFrame(event, window);
    return { kind: "desktop", version: info.version, commit: info.commit, platform: process.platform, arch: process.arch,
      shell: "electron", shellVersion: process.versions.electron };
  });
  ipcMain.handle("atom:open-external", async (event, raw) => {
    assertMainFrame(event, window);
    const safe = externalURL(raw);
    if (!safe) throw new Error("Only HTTPS links are supported");
    await openExternal(safe);
  });
  const recover = createRecoveryAction({ backend, getWindow: () => window, showMessageBox: (...args) => dialog.showMessageBox(...args) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ label: "A.T.O.M", submenu: [{ label: "About A.T.O.M", click: () => app.showAboutPanel() }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "File", submenu: [{ role: "quit" }] },
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "A.T.O.M documentation", click: () => void openExternal("https://berk-unsal.github.io/atom/") },
      { id: "atom-open-logs", label: "Open Logs", click: () => { void diagnostics.openLogs().catch(() => {}); } },
      { id: "atom-restart-service", label: "Restart planning service…", click: () => { void recover().catch(() => {}); } },
      ...(process.platform === "darwin" ? [] : [{ label: "About A.T.O.M", click: () => app.showAboutPanel() }])] },
  ]));
  // Start readiness before the renderer's early fetches; errors leave the UI
  // available with a bounded failure response instead of an exception dialog.
  backend.start().catch(() => {});
  await window.loadURL(`${APP_ORIGIN}/`);
  if (window && !window.isDestroyed() && !quitting) backend.setUIReady(true);
}

if (!storageError && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  logs = new DiagnosticLogs({ directory: storage?.logs, debug: !app.isPackaged });
  logs.record("host", "host-start", { fallback: logs.status().fallback });
  diagnostics = createDiagnosticActions({ logs, openPath: (directory) => shell.openPath(directory),
    showMessageBox: (...args) => dialog.showMessageBox(...args), getWindow: () => window,
    relaunch: () => app.relaunch(), quit: () => app.quit() });
  if (!storageError) {
    try { storage = prepareNativePaths(storage, fs, { prepareLogs: false }); }
    catch (error) { storageError = error; }
  }
  if (logs.status().directory) try { app.setAppLogsPath(logs.status().directory); } catch { /* Our structured sink remains authoritative. */ }
  app.on("will-quit", () => logs.record("host", "host-stop"));
  app.on("will-quit", () => { try { if (storage?.runtime) fs.rmSync(storage.runtime, { recursive: true, force: true }); } catch { /* Disposable runtime cleanup must not reset persistent storage or block quitting. */ } });
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    // A second launch is an explicit request to activate the existing app.
    // Showing a window alone does not activate a hidden macOS application.
    if (process.platform === "darwin") { app.show(); app.focus({ steal: true }); }
    window.show(); window.focus();
  });
  app.on("web-contents-created", (_event, contents) => lockNavigation(contents, (url) => {
    if (window && !window.isDestroyed() && contents === window.webContents && isTrustedDocument(contents.getURL())) void openExternal(url);
  }));
  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => { if (window) window.show(); });
  app.on("before-quit", (event) => {
    if (stopped || !backend) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    session.defaultSession.flushStorageData();
    backend.stop().finally(() => { stopped = true; app.quit(); });
  });
  app.whenReady().then(launch).catch(async (error) => {
    if (quitting) return;
    try { await diagnostics.startup(error, Boolean(storageError)); }
    catch { app.quit(); }
  });
}
