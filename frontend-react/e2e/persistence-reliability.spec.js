import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { decodeProjectFile } from "../src/utils/projectStore.js";

const fixtureRoot = new URL("./fixtures/persistence/", import.meta.url);
const fixture = async (name) => JSON.parse(gunzipSync(await readFile(new URL(`${name}.json.gz`, fixtureRoot))));
const seed = JSON.parse(await readFile(new URL("workspace.json", fixtureRoot), "utf8"));

async function setup(page) {
  await page.addInitScript(() => {
    window.persistenceLedger = [];
    window.pendingPersistenceAutosave = null;
    const timestamp = () => performance.timeOrigin + performance.now();
    const setTimer = window.setTimeout;
    const clearTimer = window.clearTimeout;
    const autosaveTimers = new Set();
    window.setTimeout = (callback, delay, ...args) => {
      if (delay !== 500 || typeof callback !== "function" || !callback.toString().includes("saveProjectDraft")) {
        return setTimer(callback, delay, ...args);
      }
      const id = setTimer(() => {
        autosaveTimers.delete(id);
        window.pendingPersistenceAutosave = null;
        window.persistenceLedger.push({ event: "autosave-fire", timestamp: timestamp(), autosaveId: id });
        callback(...args);
      }, delay);
      autosaveTimers.add(id);
      window.pendingPersistenceAutosave = id;
      window.persistenceLedger.push({ event: "autosave-scheduled", timestamp: timestamp(), autosaveId: id });
      return id;
    };
    window.clearTimeout = (id) => {
      if (autosaveTimers.delete(id)) {
        if (window.pendingPersistenceAutosave === id) window.pendingPersistenceAutosave = null;
        window.persistenceLedger.push({ event: "autosave-cancelled", timestamp: timestamp(), autosaveId: id });
      }
      clearTimer(id);
    };
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "workspace") {
        const project = value.projects.find((candidate) => candidate.id === value.activeProjectId);
        const detail = { revision: value.persistence.revision, scenarioId: project.activeScenarioId,
          pendingAutosaveId: window.pendingPersistenceAutosave,
          version: project.scenarios.find((scenario) => scenario.id === project.activeScenarioId)?.domain?.revision ?? null };
        window.persistenceLedger.push({ event: "write-start", timestamp: timestamp(), ...detail });
        this.transaction.addEventListener("complete", () => window.persistenceLedger.push({
          event: "write-complete", timestamp: timestamp(), ...detail,
        }));
      }
      return original.call(this, value, key);
    };
  });
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("persistence-test-seeded")) {
      localStorage.setItem("atom.planning.workspace.v1", JSON.stringify(workspace));
      localStorage.setItem("persistence-test-seeded", "yes");
    }
  }, seed);
  let simulationIndex = 0;
  let optimized = false;
  await page.route("**/api/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    let body;
    switch (endpoint) {
      case "/api/towers": body = await fixture("inventory"); break;
      case "/api/meta": body = { application_version: "0.10.2", model_version: "fspl-walls-cell-profiles-v2", supported_technologies: ["4g", "5g", "6g"] }; break;
      case "/api/datasets": body = { active_id: "ankara-default", datasets: [], warnings: [] }; break;
      case "/api/buildings/summary": body = { total_buildings: 161784 }; break;
      case "/api/evaluate-network": simulationIndex = 0; optimized = false; body = await fixture("evaluate"); break;
      case "/api/optimize-network": simulationIndex = 0; optimized = true; body = await fixture("optimize"); break;
      case "/api/interference": body = await fixture("interference"); break;
      case "/api/simulate": body = await fixture(`${optimized ? "optimized-" : ""}simulate-${++simulationIndex}`); break;
      default: body = { type: "FeatureCollection", features: [] };
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
}

async function tool(page, stage, label, id) {
  const target = page.locator(`#stage-tool-${stage}-${id}`);
  if (!await target.isVisible()) await page.getByRole("button", { name: `${label} workspace` }).click();
  await target.click();
}

async function storedProject(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("atom-planning-workspace", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const workspace = await new Promise((resolve, reject) => {
      const request = db.transaction("workspace").objectStore("workspace").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return workspace?.projects.find((project) => project.id === workspace.activeProjectId);
  });
}

async function save(page) {
  await tool(page, "plan", "Plan", "scenarios");
  await page.getByRole("button", { name: "Save Version", exact: true }).click();
  await expect.poll(async () => (await storedProject(page))?.scenarios.length).toBe(1);
}

test("six-Cell retained results Save Version, Export, Import and reload", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "Large real-response workflow once");
  test.setTimeout(120_000);
  await setup(page);
  await page.getByRole("button", { name: "Evaluate Network", exact: true }).click();
  await expect(page.locator(".run-state")).toHaveText("Ready");
  await tool(page, "analyze", "Analyze", "interference");
  await page.getByRole("button", { name: "Analyze Interference", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyze Interference", exact: true })).toBeEnabled();
  await tool(page, "simulate", "Simulate", "propagation");
  await page.getByRole("button", { name: "Optimize Network", exact: true }).click();
  await expect(page.getByRole("button", { name: "Optimize Network", exact: true })).toBeEnabled();
  // Optimization replaces the displayed baseline and clears interference. Run
  // interference once more so the retained snapshot includes both outputs.
  await tool(page, "analyze", "Analyze", "interference");
  await page.getByRole("button", { name: "Analyze Interference", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyze Interference", exact: true })).toBeEnabled();
  await save(page);
  await page.getByRole("button", { name: "Open project menu" }).click();
  const menu = page.getByRole("dialog", { name: "Project and scenarios" });
  // The project menu permits an explicit saved snapshot even without an RF
  // input edit; the Scenario panel correctly disables an unchanged draft.
  await menu.getByRole("button", { name: "Save current", exact: true }).click();
  await expect.poll(async () => (await storedProject(page))?.scenarios[0]?.domain.revisions.length).toBe(2);
  const before = await storedProject(page);
  let download;
  page.once("download", (file) => { download = file; });
  const exportStarted = performance.now();
  await menu.getByRole("button", { name: "Export", exact: true }).click();
  await expect(menu.getByRole("status")).toHaveText("Project exported");
  await expect.poll(() => Boolean(download)).toBe(true);
  const exportGenerationMs = performance.now() - exportStarted;
  const text = await readFile(await download.path(), "utf8");
  const logical = decodeProjectFile(JSON.parse(text));
  expect(logical).toEqual(before);
  await writeFile(info.outputPath("six-cell.atom-project.json"), text);
  await test.info().attach("export-size", { body: String(Buffer.byteLength(text)), contentType: "text/plain" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const heap = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics
    .filter((metric) => ["JSHeapUsedSize", "JSHeapTotalSize"].includes(metric.name))
    .map((metric) => [metric.name, metric.value]));
  const memoryBefore = await heap();
  await cdp.send("HeapProfiler.collectGarbage");
  const retainedMemoryBefore = await heap();
  const timings = await page.evaluate(async (content) => {
    const { decodeProjectFile, importProjectFile } = await import("/src/utils/projectStore.js");
    const started = performance.now();
    const parsed = JSON.parse(content);
    const parsedAt = performance.now();
    decodeProjectFile(parsed);
    const decodedAt = performance.now();
    importProjectFile(content);
    return { parseMs: parsedAt - started, validationAndReconstructionMs: decodedAt - parsedAt,
      completeImportMs: performance.now() - decodedAt };
  }, text);
  timings.exportGenerationMs = exportGenerationMs;
  const importStarted = performance.now();
  await menu.locator("input[type=file]").setInputFiles({ name: "six-cell.atom-project.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect.poll(async () => (await storedProject(page))?.name).toBe(`${seed.projects[0].name} (Imported)`);
  timings.uiImportAndPersistenceMs = performance.now() - importStarted;
  const memoryAfterImport = await heap();
  await cdp.send("HeapProfiler.collectGarbage");
  const retainedMemoryAfterImport = await heap();
  const hydrationStarted = performance.now();
  await page.reload();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  timings.reloadAndHydrationMs = performance.now() - hydrationStarted;
  const after = await storedProject(page);
  expect(after.scenarios[0].artifacts).toEqual(before.scenarios[0].artifacts);
  expect(after.scenarios[0].plan).toEqual(before.scenarios[0].plan);
  expect(after.scenarios[0].request).toEqual(before.scenarios[0].request);
  expect(after.scenarios[0].domain.revisions).toHaveLength(2);
  const map = after.importProvenance.identityMap;
  before.scenarios[0].domain.revisions.forEach((version, index) => {
    const imported = after.scenarios[0].domain.revisions[index];
    expect(imported.scenario_revision_id).toBe(map[version.scenario_revision_id]);
    expect(imported.resolved_fingerprints).toEqual(version.resolved_fingerprints);
    expect(imported.request_inputs).toEqual(version.request_inputs);
  });
  await writeFile(info.outputPath("timings.json"), JSON.stringify({ bytes: Buffer.byteLength(text), ...timings,
    memoryBefore, retainedMemoryBefore, memoryAfterImport, retainedMemoryAfterImport,
    memoryAfterReload: await heap() }, null, 2));
});

for (const delay of [0, 100, 750, "confirmed"]) test(`six-Cell Scenario Delete, Undo (${delay}) and reload retains the restored selection`, async ({ page }, info) => {
  await setup(page);
  await save(page);
  const before = await storedProject(page);
  await page.evaluate((scenarioId) => window.persistenceLedger.push({ event: "delete", timestamp: performance.timeOrigin + performance.now(), scenarioId }), before.activeScenarioId);
  await page.getByText("More Scenario actions", { exact: true }).click();
  await page.getByRole("button", { name: "Delete Scenario", exact: true }).click();
  if (delay === "confirmed") await expect.poll(async () => (await storedProject(page))?.scenarios.length).toBe(0);
  else if (delay) await page.waitForTimeout(delay);
  await page.evaluate((scenarioId) => window.persistenceLedger.push({ event: "undo-restore", timestamp: performance.timeOrigin + performance.now(), scenarioId,
    pendingAutosaveId: window.pendingPersistenceAutosave }), before.activeScenarioId);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  await expect.poll(async () => (await storedProject(page))?.scenarios.length).toBe(1);
  await page.evaluate((scenarioId) => window.persistenceLedger.push({ event: "post-undo-save", timestamp: performance.timeOrigin + performance.now(), scenarioId }), before.activeScenarioId);
  const ledger = await page.evaluate(() => window.persistenceLedger);
  await page.reload();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  const after = await storedProject(page);
  ledger.push({ event: "reload-read", timestamp: await page.evaluate(() => performance.timeOrigin + performance.now()), scenarioId: after.activeScenarioId });
  await writeFile(info.outputPath("undo-timeline.json"), JSON.stringify(ledger, null, 2));
  expect(after.scenarios[0].id).toBe(before.scenarios[0].id);
  expect(after.scenarios[0].plan).toEqual(before.scenarios[0].plan);
  expect(after.scenarios[0].domain).toEqual(before.scenarios[0].domain);
  expect(after.activeScenarioId).toBe(before.activeScenarioId);
});

test("six-Cell deletion without Undo stays deleted after reload", async ({ page }) => {
  await setup(page);
  await save(page);
  await page.getByText("More Scenario actions", { exact: true }).click();
  await page.getByRole("button", { name: "Delete Scenario", exact: true }).click();
  await expect.poll(async () => (await storedProject(page))?.scenarios.length).toBe(0);
  await page.reload();
  await expect(page.getByRole("group", { name: "RF context" })).toBeVisible();
  expect((await storedProject(page)).scenarios).toHaveLength(0);
  expect((await storedProject(page)).activeScenarioId).toBeNull();
});

test("reload immediately after Undo keeps the six-Cell Scenario", async ({ page }) => {
  await setup(page);
  await save(page);
  const before = await storedProject(page);
  await page.getByText("More Scenario actions", { exact: true }).click();
  await page.getByRole("button", { name: "Delete Scenario", exact: true }).click();
  await expect.poll(async () => (await storedProject(page))?.scenarios.length).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("group", { name: "RF context" })).toContainText("Network · 6 cells");
  expect((await storedProject(page)).scenarios[0].id).toBe(before.scenarios[0].id);
});
