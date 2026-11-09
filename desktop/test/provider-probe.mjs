// Explicit, bounded online qualification: one fixed visible tile, no pan/zoom
// and no area prefetch. Routine native/CI suites block public OSM from startup.
import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const desktop = path.resolve(import.meta.dirname, "..");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: desktop, encoding: "utf8" }).trim();
const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: desktop, encoding: "utf8" }).trim());
const buildInfo = JSON.parse(await fs.readFile(path.join(desktop, "build/resources/build-info.json"), "utf8"));
assert.equal(buildInfo.commit, sourceCommit, "Rebuild desktop resources for this source before provider qualification");
const version = (await fs.readFile(path.join(desktop, "../VERSION"), "utf8")).trim();
const tile = "https://tile.openstreetmap.org/12/2421/1552.png";
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-provider-probe-"));
const fixture = path.join(scratch, "app"); await fs.mkdir(fixture);
for (const name of ["lib", "preload.cjs", "build"]) await fs.symlink(path.join(desktop, name), path.join(fixture, name));
await fs.copyFile(path.join(desktop, "package.json"), path.join(fixture, "package.json"));
const original = await fs.readFile(path.join(desktop, "main.cjs"), "utf8");
const needle = "callback({ cancel: !allowRendererRequest(details, window?.webContents, devServer) });";
assert.ok(original.includes(needle));
const instrumented = original.replace(needle, `callback({ cancel: !allowRendererRequest(details, window?.webContents, devServer) || (details.url.startsWith("https://tile.openstreetmap.org/") && details.url !== ${JSON.stringify(tile)}) });`)
  .replace("session.defaultSession.setPermissionRequestHandler", `
  globalThis.__providerProbe = { sent: [], completed: [] };
  session.defaultSession.webRequest.onSendHeaders((details) => {
    if (details.url !== ${JSON.stringify(tile)}) return;
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([key, value]) => [key.toLowerCase(), value]));
    globalThis.__providerProbe.sent.push({ user_agent: headers["user-agent"], referer: headers.referer || null, origin: headers.origin || null,
      authorization_present: Boolean(headers.authorization || headers["x-atom-desktop-token"]), cache_control: headers["cache-control"] || null });
  });
  session.defaultSession.webRequest.onCompleted((details) => {
    if (details.url !== ${JSON.stringify(tile)}) return;
    const headers = Object.fromEntries(Object.entries(details.responseHeaders).map(([key, value]) => [key.toLowerCase(), value]));
    globalThis.__providerProbe.completed.push({ status: details.statusCode, from_cache: details.fromCache,
      cache_control: headers["cache-control"], expires: headers.expires, etag: headers.etag, content_type: headers["content-type"] });
  });
  session.defaultSession.setPermissionRequestHandler`);
await fs.writeFile(path.join(fixture, "main.cjs"), instrumented);
const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: path.join(scratch, "profile") }; delete env.ELECTRON_RUN_AS_NODE;
let application;
async function open() {
  application = await electron.launch({ executablePath: require("electron"), args: [fixture], env, chromiumSandbox: true, timeout: 60_000 });
  const page = await application.firstWindow();
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  return page;
}
async function loadTile(page) {
  return page.evaluate((url) => new Promise((resolve, reject) => {
    const image = new Image(); image.alt = "OSM provider qualification tile";
    image.style.cssText = "position:fixed;top:110px;right:30px;width:256px;height:256px;z-index:3000";
    const timer = setTimeout(() => { image.remove(); reject(new Error("The single provider tile timed out")); }, 15_000);
    image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { clearTimeout(timer); image.remove(); reject(new Error("The single provider tile failed")); };
    document.body.append(image); image.src = url;
  }), tile);
}
async function close() {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await application.close(); application = null;
}
try {
  const page = await open();
  assert.deepEqual(await loadTile(page), { width: 256, height: 256 });
  assert.deepEqual(await loadTile(page), { width: 256, height: 256 });
  const initial = await application.evaluate(() => globalThis.__providerProbe);
  assert.ok(initial.completed.some((entry) => entry.status === 200));
  assert.ok(initial.sent.every((entry) => entry.user_agent === `A.T.O.M/${version} (+https://github.com/Berk-Unsal/atom)`
    && !entry.authorization_present && !entry.referer?.includes("localhost") && entry.cache_control !== "no-cache"));
  await close();
  const reopened = await open();
  assert.deepEqual(await loadTile(reopened), { width: 256, height: 256 });
  const afterRelaunch = await application.evaluate(() => globalThis.__providerProbe);
  assert.ok(afterRelaunch.completed.some((entry) => entry.from_cache), "Normal native HTTP cache must survive relaunch");
  const result = { checked_at: new Date().toISOString(), source_commit: sourceCommit, source_dirty: sourceDirty, resource_build_commit: buildInfo.commit, platform: process.platform, architecture: process.arch,
    tile, fixture: "production host with a test-only additional deny rule allowing exactly this OSM tile; all other grid images blocked before renderer startup", initial, after_relaunch: afterRelaunch,
    normal_native_cache_reused_after_relaunch: true, no_pan_zoom_or_area_prefetch: true, result: "PASS" };
  await fs.mkdir(path.join(desktop, "test-results"), { recursive: true });
  await fs.writeFile(path.join(desktop, "test-results/provider-probe.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  await close();
} finally {
  if (application) { await application.evaluate(({ app }) => app.exit()).catch(() => {}); await application.close(); }
  await fs.rm(scratch, { recursive: true, force: true });
}
