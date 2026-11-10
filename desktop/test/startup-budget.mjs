// Production-host measurements. Fresh profile/process means no existing app
// state; OS filesystem caches are uncontrolled, never described as cold disk.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { launchNative } from "./native-launch.mjs";
import { waitForRuntime } from "./runtime-wait.mjs";
import { startupDiagnostics } from "./startup-diagnostics.mjs";
import { sourceIdentity, distribution, processTree, assertExited, sha256, sleep } from "./qualification-support.mjs";

const require = createRequire(import.meta.url);
const desktop = path.resolve(import.meta.dirname, "..");
const root = path.dirname(desktop);
const output = path.join(desktop, "test-results/startup-budget.json");
const resources = path.join(desktop, "build/resources");
const result = { ...sourceIdentity(root), method: "20 paired fresh-profile launches and same-profile relaunches; OS file cache uncontrolled; no cache purge", samples: [] };
const build = JSON.parse(await fs.readFile(path.join(resources, "build-info.json"), "utf8"));
assert.equal(build.commit, result.source_commit, "Rebuild native resources for the measured source");
assert.equal(result.source_dirty, false, "Measure a committed, clean source");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-startup-budget-"));
result.resource_build_commit = build.commit;
result.binary_sha256 = sha256(await fs.readFile(path.join(resources, "atom-api")));
result.manifest_sha256 = sha256(await fs.readFile(path.join(resources, "data-pipeline/manifest.json")));
await fs.mkdir(path.dirname(output), { recursive: true });
const checkpoint = () => fs.writeFile(output, JSON.stringify(result, null, 2) + "\n");
let application;
let currentProfile;
let currentPage;
async function launch(profile, resourceRoot = resources) {
  currentProfile = profile;
  const started = Date.now();
  const env = { ...process.env, ATOM_DESKTOP_TEST_PROFILE: profile, ATOM_DESKTOP_TEST_RESOURCES: resourceRoot };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await launchNative({ executablePath: require("electron"), args: [desktop], env, chromiumSandbox: true, timeout: 60_000 });
  const nativeProcess = application.process();
  nativeProcess.once("exit", (code, signal) => { result.last_application_exit = { code, signal, time: new Date().toISOString() }; });
  const page = await application.firstWindow(); currentPage = page;
  result.current_renderer_errors = [];
  page.on("pageerror", (error) => { if (result.current_renderer_errors.length < 20) result.current_renderer_errors.push(String(error.message).slice(0, 1000)); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Run Sector" && !button.disabled));
  await waitForRuntime(page, (status) => status.state === "ready" && status.readiness.ui && status.readiness.dataset);
  const launchToPlannable = Date.now() - started;
  const info = await page.evaluate(() => window.atomDesktop.getInfo());
  assert.equal(info.rendererSandboxed, true);
  assert.equal(info.commit, build.commit);
  result.reference.electron = info.shellVersion;
  const records = (await fs.readFile(path.join(profile, "native-state/logs/backend.log"), "utf8")).trim().split("\n").map(JSON.parse);
  const current = records.slice(records.findLastIndex((record) => record.event === "runtime" && record.state === "starting"));
  const began = current.find((record) => record.event === "runtime" && record.state === "starting");
  const ready = current.find((record) => record.event === "runtime" && record.dataset);
  assert.ok(began && ready, "Actual lifecycle logs must contain sidecar start and dataset readiness");
  return { page, launch_to_plannable_ms: launchToPlannable, launch_to_dataset_ready_ms: Date.parse(ready.time) - started,
    sidecar_start_to_dataset_ready_ms: Date.parse(ready.time) - Date.parse(began.time) };
}
async function close() {
  const tree = await processTree(application.process().pid);
  assert.equal(tree.processes.filter((row) => row.executable === "atom-api").length, 1);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await application.close(); application = null;
  await assertExited(tree.processes.map((row) => row.pid));
}
try {
  for (let index = 0; index < 20; index++) {
    const profile = path.join(scratch, `profile-${index}`);
    for (const state of ["fresh_profile", "same_profile_relaunch"]) {
      result.current_sample = { index, state };
      const { page: _page, ...sample } = await launch(profile);
      result.samples.push({ index, state, ...sample });
      await close(); await checkpoint();
      console.log(`Startup sample ${index + 1}/20 ${state}: ${sample.launch_to_plannable_ms} ms`);
    }
  }
  result.startup = {};
  for (const state of ["fresh_profile", "same_profile_relaunch"]) {
    const rows = result.samples.filter((row) => row.state === state);
    result.startup[state] = Object.fromEntries(["launch_to_plannable_ms", "launch_to_dataset_ready_ms", "sidecar_start_to_dataset_ready_ms"].map((key) => [key, distribution(rows.map((row) => row[key]))]));
  }
  result.idle = {};
  // The same host/UI/binary is measured with the declared full pack and the
  // canonical tiny sample pack. No post-start removal or empty-index shortcut.
  const smallResources = path.join(scratch, "sample-resources"); await fs.mkdir(smallResources);
  for (const name of ["atom-api", "dist", "atom.png", "build-info.json"]) await fs.symlink(path.join(resources, name), path.join(smallResources, name));
  await fs.cp(path.join(root, "backend-go/raytracer/testdata/sample-pack"), path.join(smallResources, "data-pipeline"), { recursive: true });
  for (const [name, resourceRoot] of [["full_pack", resources], ["sample_pack", smallResources]]) {
    await launch(path.join(scratch, `idle-${name}`), resourceRoot);
    console.log(`Measuring ${name} after 60 seconds idle`);
    await sleep(30_000); await sleep(30_000);
    result.idle[name] = await processTree(application.process().pid);
    result.idle[name].manifest_sha256 = sha256(await fs.readFile(path.join(resourceRoot, "data-pipeline/manifest.json")));
    await close(); await checkpoint();
  }
  result.idle.full_minus_sample_rss_bytes = result.idle.full_pack.rss_bytes - result.idle.sample_pack.rss_bytes;
  result.budgets = {
    fresh_profile_launch_p95_10s: result.startup.fresh_profile.launch_to_plannable_ms.p95 <= 10_000,
    same_profile_launch_p95_5s: result.startup.same_profile_relaunch.launch_to_plannable_ms.p95 <= 5000,
    fresh_profile_sidecar_dataset_p95_8s: result.startup.fresh_profile.sidecar_start_to_dataset_ready_ms.p95 <= 8000,
    same_profile_sidecar_dataset_p95_4s: result.startup.same_profile_relaunch.sidecar_start_to_dataset_ready_ms.p95 <= 4000,
    aggregate_idle_rss_500MiB: result.idle.full_pack.rss_bytes <= 500 * 1024 * 1024,
  };
  result.result = Object.values(result.budgets).every(Boolean) ? "PASS" : "BUDGET_REVIEW_REQUIRED";
} catch (error) {
  result.result = "FAIL"; result.failure = error.message;
  result.failure_diagnostics = {};
  if (application && currentPage) {
    result.failure_diagnostics.native = await startupDiagnostics(application, currentPage);
    await currentPage.screenshot({ path: path.join(desktop, "test-results/startup-failed.png"), timeout: 5000 }).catch(() => {});
  }
  if (currentProfile) for (const component of ["host", "backend"]) {
    const contents = await fs.readFile(path.join(currentProfile, `native-state/logs/${component}.log`), "utf8").catch(() => "");
    result.failure_diagnostics[component] = contents.trim().split("\n").filter(Boolean).slice(-40).map(JSON.parse);
  }
  throw error;
}
finally {
  await checkpoint();
  if (application) await application.close().catch(() => {});
  await fs.rm(scratch, { recursive: true, force: true });
}
assert.equal(result.result, "PASS", JSON.stringify(result.budgets));
