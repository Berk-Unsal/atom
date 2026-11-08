"use strict";

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, screen, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { Sidecar } = require("./lib/sidecar.cjs");
const { createRouter } = require("./lib/router.cjs");
const { APP_ORIGIN, assertMainFrame, externalURL, lockNavigation } = require("./lib/policy.cjs");
const { readGeometry, writeGeometry } = require("./lib/window-state.cjs");

const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, "build/resources");
app.setName("A.T.O.M");
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);
// Local builds get a separate profile and lock; never reuse browser/release data.
if (!app.isPackaged) app.setPath("userData", process.env.ATOM_DESKTOP_TEST_PROFILE
  ? path.resolve(process.env.ATOM_DESKTOP_TEST_PROFILE) : path.join(app.getPath("appData"), "A.T.O.M-local"));

let window;
let backend;
let quitting = false;
let stopped = false;
const openExternal = async (url) => { try { await shell.openExternal(url); } catch { /* Browser launch failure never opens content in the app. */ } };

async function launch() {
  const info = JSON.parse(fs.readFileSync(path.join(resources, "build-info.json"), "utf8"));
  app.setAboutPanelOptions({ applicationName: "A.T.O.M", applicationVersion: info.version,
    version: `${info.commit} · Electron ${process.versions.electron} · ${process.platform}/${process.arch}`,
    iconPath: path.join(resources, "atom.png"), copyright: "A.T.O.M contributors" });
  const profile = app.getPath("userData");
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
  const geometryFile = path.join(profile, "window.json");
  const geometry = readGeometry(geometryFile, [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id)]);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  backend = new Sidecar({ executable: path.join(resources, "atom-api"), datasetDir: path.join(resources, "data-pipeline"),
    distDir: path.join(resources, "dist"), version: info.version, commit: info.commit });
  protocol.handle("app", createRouter({ distDir: path.join(resources, "dist"), sidecar: backend }));
  const icon = nativeImage.createFromPath(path.join(resources, "atom.png"));
  if (app.dock) app.dock.setIcon(icon);
  window = new BrowserWindow({ ...geometry, minWidth: Math.min(800, geometry.width), minHeight: Math.min(600, geometry.height),
    title: "A.T.O.M", icon, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false, spellcheck: false, navigateOnDragDrop: false },
  });
  window.on("page-title-updated", (event) => { event.preventDefault(); });
  window.once("ready-to-show", () => window.show());
  window.on("close", () => { writeGeometry(geometryFile, window.getNormalBounds()); });
  window.on("closed", () => { window = null; app.quit(); });
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
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ label: "A.T.O.M", submenu: [{ label: "About A.T.O.M", click: () => app.showAboutPanel() }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "File", submenu: [{ role: "quit" }] },
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "A.T.O.M documentation", click: () => void openExternal("https://berk-unsal.github.io/atom/") },
      ...(process.platform === "darwin" ? [] : [{ label: "About A.T.O.M", click: () => app.showAboutPanel() }])] },
  ]));
  // Start readiness before the renderer's early fetches; errors leave the UI
  // available with a bounded failure response instead of an exception dialog.
  backend.start().catch(() => {});
  await window.loadURL(`${APP_ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.on("web-contents-created", (_event, contents) => lockNavigation(contents, openExternal));
  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => { if (window) window.show(); });
  app.on("before-quit", (event) => {
    if (stopped || !backend) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    backend.stop().finally(() => { stopped = true; app.quit(); });
  });
  app.whenReady().then(launch).catch(async () => {
    await dialog.showMessageBox({ type: "error", title: "A.T.O.M could not start", message: "Local desktop resources are missing or invalid.",
      detail: "Run npm run build in desktop, then start the application again. Existing projects are preserved." });
    app.quit();
  });
}
