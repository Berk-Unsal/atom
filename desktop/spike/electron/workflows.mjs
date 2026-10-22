// D01 (#148) Electron workflow qualification: drives the real app (committed
// frontend, real sidecar and dataset) through the product flows with real
// input, then exercises native Save/Open dialogs through the OS.
//
// Usage: node workflows.mjs <run-name>
// Env:   ATOM_SPIKE_DIALOG_DRIVER = macos | xdotool | (unset: dialogs not run)
//        ATOM_SPIKE_ELECTRON_ARGS = extra Chromium switches
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron as electron } from "playwright-core";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const evidence = resolve(here, "build/evidence");
const downloads = resolve(here, "build/downloads");
const reports = resolve(here, "build/reports");
for (const dir of [evidence, reports]) mkdirSync(dir, { recursive: true });
rmSync(downloads, { recursive: true, force: true });
const runName = process.argv[2] || "workflows";
const driver = process.env.ATOM_SPIKE_DIALOG_DRIVER || "";
const TURKISH = "Çankaya İş Ağı Şebeke Öğrenim Üssü";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const within = (promise, ms, label) => Promise.race([promise, sleep(ms).then(() => { throw new Error(`${label} timed out after ${ms} ms`); })]);

const { ELECTRON_RUN_AS_NODE: _ignored, ...inherited } = process.env;
const app = await electron.launch({ chromiumSandbox: true,
  executablePath: process.env.ATOM_SPIKE_ELECTRON || (await import("electron")).default,
  args: [here, ...(process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean)],
  env: {
    ...inherited,
    ATOM_SPIKE_DIST: process.env.ATOM_SPIKE_DIST || resolve(root, "frontend-react/dist"),
    ATOM_SPIKE_SIDECAR: resolve(here, "build/atom-api"),
    ATOM_SPIKE_DATASET_DIR: resolve(root, "data-pipeline"),
    ATOM_SPIKE_PROFILE: resolve(here, `build/profile-${runName}`),
    ATOM_SPIKE_DOWNLOADS: downloads,
    ATOM_SPIKE_NO_EXTERNAL: "1",
  },
  timeout: 60_000,
});
const page = await app.firstWindow();
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 300)));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${message.text().slice(0, 200)} @ ${message.location()?.url || "unknown"}`); });
const spikeState = () => app.evaluate(() => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(global.__atomSpike).filter(([, v]) => typeof v !== "function")))));

const result = { run: runName, platform: (await spikeState()).platform, steps: [] };
async function step(name, fn, { critical = true } = {}) {
  const started = Date.now();
  try {
    const detail = await fn();
    result.steps.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? null });
    console.log(`PASS ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    result.steps.push({ name, ok: false, critical, ms: Date.now() - started, error: String(error.message).split("\n")[0].slice(0, 400) });
    console.log(`FAIL ${name} (${Date.now() - started} ms) — ${result.steps.at(-1).error}`);
    await page.screenshot({ path: resolve(evidence, `${runName}-failed-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  }
}
const button = (name, exact = true) => page.getByRole("button", { name, exact });
const ready = (timeout = 120_000) => page.locator(".run-state", { hasText: "Ready" }).waitFor({ timeout });
async function selectTool(stage, label, tool) {
  await button(`${label} workspace`).click();
  await page.locator(`#stage-tool-${stage}-${tool}`).click();
}
async function waitDownload(match, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = (await within(spikeState(), 10_000, "main-process state")).downloads.find((d) => match.test(d.filename) && d.state === "completed");
    if (found) return found;
    await sleep(200);
  }
  throw new Error(`download ${match} did not complete`);
}

await step("startup to plannable", async () => {
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Run Sector" && !b.disabled), null, { timeout: 120_000 });
  return { sidecar: (await spikeState()).sidecar };
});

await step("rename project with Turkish characters", async () => {
  await page.getByRole("button", { name: /^Project menu/ }).click();
  const menu = page.getByRole("dialog", { name: "Project and scenarios" });
  await menu.getByRole("textbox", { name: "Project name" }).fill(TURKISH);
  await menu.getByRole("button", { name: "Save project name" }).click();
  await page.getByRole("button", { name: new RegExp(`^Project menu, ${TURKISH}`) }).waitFor({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  if (await menu.isVisible()) await page.getByRole("button", { name: /^Project menu/ }).click();
});

await step("Run Sector, Signal surface and rays", async () => {
  await button("Run Sector").click();
  await ready();
  const signal = button("Signal layer");
  await signal.click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Signal layer"]')?.getAttribute("data-surface-state") === "ready", null, { timeout: 120_000 });
  await page.locator(".leaflet-image-layer").first().waitFor({ timeout: 30_000 });
  const rays = button("Propagation rays layer");
  await rays.click();
  return { rays_pressed: await rays.getAttribute("aria-pressed"), image_layers: await page.locator(".leaflet-image-layer").count() };
});

let selected = 0;
await step("select Cells on the map and Evaluate Network", async () => {
  await page.getByRole("button", { name: /^Network mode,/ }).click();
  const interaction = button("Select cells");
  if (await interaction.isVisible()) {
    await interaction.click();
  } else {
    const trigger = page.getByRole("button", { name: /^Map interaction:/ });
    if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
    await page.locator(".map-interaction-popover").getByRole("button", { name: "Select cells", exact: true }).click();
  }
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  await button("Draw selection area").click();
  const left = Math.min(box.width - 240, Math.max(460, box.width * 0.4));
  for (const position of [{ x: left, y: 150 }, { x: box.width - 100, y: 150 }, { x: box.width - 100, y: Math.max(270, box.height - 180) }, { x: left, y: Math.max(270, box.height - 180) }]) {
    await map.click({ force: true, position });
  }
  await button("Finish").click();
  const label = await page.getByRole("button", { name: /^Network mode, \d+ selected/ }).getAttribute("aria-label") || await page.getByRole("button", { name: /^Network mode, \d+ selected/ }).innerText();
  selected = Number(/(\d+) selected/.exec(label)?.[1] || 0);
  if (selected < 2) throw new Error(`only ${selected} Cells selected`);
  await button("Evaluate Network").click();
  await ready();
  return { selected_cells: selected, markers: await page.locator(".tower-order-badge").count() };
});

await step("Results drawer shows the network card", async () => {
  await selectTool("review", "Review", "results");
  await page.locator(".network-card").first().waitFor({ timeout: 15_000 });
});

await step("Interference analysis", async () => {
  await selectTool("analyze", "Analyze", "interference");
  await button("Analyze Interference").click();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Analyze Interference"); return b && !b.disabled; }, null, { timeout: 120_000 });
  return { alerts: await page.getByRole("alert").allInnerTexts() };
});

await step("Optimize Network and inspect Pareto solutions", async () => {
  await selectTool("simulate", "Simulate", "propagation");
  await button("Optimize Network").click();
  await ready(240_000);
  await selectTool("review", "Review", "results");
  const solutions = page.getByRole("tab", { name: "Solutions", exact: true });
  await ((await solutions.count()) ? solutions : page.getByRole("tab", { name: /Candidates/ }).first()).click();
  await page.locator(".pareto-explorer").waitFor({ timeout: 15_000 });
  const inspect = page.getByRole("button", { name: /Inspect Pareto solution 2/i });
  if (await inspect.count()) await inspect.first().click();
  await page.screenshot({ path: resolve(evidence, `${runName}-pareto.png`) });
  return { pareto_rows: await page.locator(".pareto-cell-row").count(), solutions: await page.getByRole("button", { name: /Inspect Pareto solution/i }).count() };
});

await step("every workspace drawer opens", async () => {
  const stages = [["plan", "Plan", ["setup", "inventory", "scenarios"]], ["simulate", "Simulate", ["propagation", "experiments", "surfaces"]],
    ["analyze", "Analyze", ["interference", "validation", "building-entry", "core"]], ["review", "Review", ["results", "history", "data", "report"]]];
  const opened = [];
  for (const [stage, label, tools] of stages) {
    for (const tool of tools) {
      await button(`${label} workspace`).click();
      const choice = page.locator(`#stage-tool-${stage}-${tool}`);
      if (await choice.isDisabled()) { opened.push(`${stage}/${tool}:disabled`); continue; }
      await choice.click();
      await button("Close tool drawer").waitFor({ timeout: 10_000 });
      opened.push(`${stage}/${tool}:open`);
    }
    await page.screenshot({ path: resolve(evidence, `${runName}-drawers-${stage}.png`) });
  }
  return { opened };
});

await step("keyboard reaches the primary RF action", async () => {
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 3, y: 3 } }).catch(() => {});
  for (let presses = 1; presses <= 60; presses += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (["Run Sector", "Evaluate Network"].includes(focused)) return { tab_presses: presses, focused };
  }
  throw new Error("primary RF action not reached with Tab");
});

let projectBytes = null;
await step("project Save Version and Export download", async () => {
  await page.getByRole("button", { name: /^Project menu/ }).click();
  const menu = page.getByRole("dialog", { name: "Project and scenarios" });
  await menu.getByRole("button", { name: "Save Version" }).click();
  await menu.getByRole("status").filter({ hasText: "Version saved" }).waitFor({ timeout: 10_000 });
  await menu.getByRole("button", { name: "Export" }).click();
  const download = await waitDownload(/\.atom-project\.json$/);
  projectBytes = readFileSync(download.path);
  await page.getByRole("button", { name: /^Project menu/ }).click();
  return { filename: download.filename, bytes: projectBytes.length, contains_turkish: projectBytes.toString("utf8").includes(TURKISH) };
});

await step("report HTML artifact and Markdown download", async () => {
  await selectTool("review", "Review", "report");
  await button("PDF / Print").click();
  // The committed print path opens a popup, which the navigation lock denies.
  await sleep(1500);
  const alerts = await page.getByRole("alert").allInnerTexts();
  await page.getByRole("button", { name: /^Download / }).first().click();
  const html = await waitDownload(/\.html$/);
  copyFileSync(html.path, resolve(reports, "app-report.html"));
  await button("Markdown").click();
  const markdown = await waitDownload(/\.md$/);
  const text = readFileSync(html.path, "utf8");
  return { html: html.filename, html_bytes: text.length, html_contains_turkish: text.includes(TURKISH), markdown: markdown.filename, popup_print_alert: alerts };
});

const dialogTrace = [];
async function driveDialog(kind, title, target) {
  await sleep(1500);
  if (driver === "macos") {
    const lines = kind === "save"
      ? ['tell application "System Events" to tell process "Electron"', "set frontmost to true", "repeat 40 times", "if exists sheet 1 of window 1 then exit repeat", "delay 0.25", "end repeat",
        'set sheetSeen to (exists sheet 1 of window 1) as text', "keystroke return", 'return "sheet=" & sheetSeen & " frontmost=" & ((frontmost) as text)', "end tell"]
      : [`set the clipboard to ${JSON.stringify(target)}`, 'tell application "System Events" to tell process "Electron"', "set frontmost to true", "repeat 40 times", "if exists sheet 1 of window 1 then exit repeat", "delay 0.25", "end repeat",
        'keystroke "g" using {command down, shift down}', "delay 1", 'keystroke "a" using {command down}', 'keystroke "v" using {command down}', "delay 0.5", "keystroke return", "delay 1.5", "keystroke return", "end tell"];
    const { stdout } = await run("osascript", lines.flatMap((line) => ["-e", line]), { timeout: 40_000 });
    dialogTrace.push(`${kind}: ${stdout.trim() || "ok"}`);
  } else if (driver === "xdotool") {
    const { stdout } = await run("xdotool", ["search", "--sync", "--name", title], { timeout: 20_000 });
    const id = stdout.trim().split("\n")[0];
    await run("xdotool", ["windowfocus", "--sync", id]);
    if (kind === "open") {
      await run("xdotool", ["key", "--clearmodifiers", "ctrl+l"]);
      await run("xdotool", ["type", "--delay", "15", target]);
      await sleep(300);
    }
    await run("xdotool", ["key", "--clearmodifiers", "Return"]);
  }
}

async function dialogDriverAvailable() {
  if (driver !== "macos") return driver === "xdotool";
  // Without Accessibility for the calling app, System Events cannot press keys
  // and the sheet would stay open; check first instead of hanging.
  try {
    const { stdout } = await run("osascript", ["-e", "with timeout of 10 seconds", "-e", 'tell application "System Events" to get UI elements enabled', "-e", "end timeout"], { timeout: 20_000 });
    return stdout.trim() === "true";
  } catch { return false; }
}

await step("native Save and Open dialogs", async () => {
  if (!driver) throw new Error("no dialog driver for this platform");
  if (!(await dialogDriverAvailable())) throw new Error(`${driver} dialog driver unavailable (Accessibility/UI scripting not permitted)`);
  if (!projectBytes) throw new Error("no exported project bytes");
  const folder = resolve(here, "build/dialog", "Çankaya Ağ Planı klasörü with a deliberately long directory name", "İkinci düzey — uzun yol testi için ek klasör adı");
  rmSync(resolve(here, "build/dialog"), { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const target = resolve(folder, `${TURKISH} ${Date.now()}.atom-project.json`);
  const save = app.evaluate((_e, [b64, file]) => global.__atomSpike.saveWithDialog(b64, file, "A.T.O.M Save Project"), [projectBytes.toString("base64"), target]);
  save.catch(() => {});
  await within(Promise.all([save, driveDialog("save", "A.T.O.M Save Project", target)]), 60_000, "Save dialog").catch((error) => { throw new Error(`${error.message}; driver: ${dialogTrace.join(" | ") || "no output"}`); });
  const saved = await save;
  if (saved.canceled || !existsSync(saved.filePath)) throw new Error("Save dialog did not write the file");
  const open = app.evaluate((_e, dir) => global.__atomSpike.openWithDialog(dir, "A.T.O.M Open Project"), folder);
  open.catch(() => {});
  await within(Promise.all([open, driveDialog("open", "A.T.O.M Open Project", saved.filePath)]), 60_000, "Open dialog");
  const opened = await open;
  if (opened.canceled) throw new Error("Open dialog was cancelled");
  const [savedStat, openedStat] = [statSync(saved.filePath), statSync(opened.filePath)];
  if (savedStat.ino !== openedStat.ino || savedStat.dev !== openedStat.dev) throw new Error(`Open dialog returned a different file: ${opened.filePath}`);
  const roundTrip = Buffer.from(opened.base64, "base64");
  if (sha256(roundTrip) !== sha256(projectBytes)) throw new Error("opened bytes differ from saved bytes");
  // macOS panels may hand back decomposed (NFD) Unicode or resolved symlinks;
  // D07 must compare paths by identity, not by string.
  return { saved_path_chars: saved.filePath.length, opened_identical_string: opened.filePath === saved.filePath,
    opened_same_after_nfc: opened.filePath.normalize("NFC") === saved.filePath.normalize("NFC"),
    opened_same_realpath_nfc: realpathSync(opened.filePath).normalize("NFC") === realpathSync(saved.filePath).normalize("NFC"), opened_same_file_identity: true,
    saved_path: saved.filePath, opened_path: opened.filePath, sha256: sha256(roundTrip), bytes: roundTrip.length };
});

await step("no uncaught page errors", async () => {
  if (pageErrors.length) throw new Error(pageErrors.join(" | "));
  return { console_errors: consoleErrors.slice(0, 20) };
});

const state = await Promise.race([spikeState(), sleep(10_000).then(() => ({ blockedNavigations: [], downloads: [] }))]);
result.blocked_navigations = state.blockedNavigations;
result.downloads = state.downloads.map(({ filename, state: downloadState }) => ({ filename, state: downloadState }));
// A dialog left open by a failed driver can block quit; destroy the windows
// and bound the close so evidence is always written.
await Promise.race([app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())), sleep(5_000)]).catch(() => {});
await Promise.race([app.close(), sleep(20_000)]).catch(() => {});
try { app.process().kill("SIGKILL"); } catch { /* already exited */ }
result.critical_failures = result.steps.filter((s) => !s.ok && s.critical !== false).map((s) => s.name);
writeFileSync(resolve(evidence, `${runName}.json`), JSON.stringify(result, null, 2));
process.exitCode = result.critical_failures.length ? 1 : 0;
