// Functional launch of the final stapled archive. Clean-machine/quarantine and
// offline Gatekeeper acceptance remain separate evidence, never bypassed here.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { launchNative } from "./native-launch.mjs";
import { processTree, assertExited, sha256 } from "./qualification-support.mjs";
const require = createRequire(import.meta.url);
const { inventory } = require("../lib/package-contract.cjs");
const directory = path.resolve(process.argv[2]);
const receipt = JSON.parse(await fs.readFile(path.join(directory, "signing.json"), "utf8"));
assert.equal(receipt.result, "SIGNED_CANDIDATE"); assert.equal(receipt.trust, "developer-id-notarized-candidate");
assert.equal(process.platform, "darwin"); assert.equal(receipt.arch, process.arch);
const archive = receipt.artifacts.find((artifact) => artifact.file.endsWith(".zip"));
assert.ok(archive && path.basename(archive.file) === archive.file);
const file = path.join(directory, archive.file); assert.equal(sha256(await fs.readFile(file)), archive.sha256);
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-signed-native-"));
const home = path.join(scratch, "Native home — çığ"); await fs.mkdir(home, { mode: 0o700 });
const appPath = path.join(scratch, "A.T.O.M.app");
let application; let page;
const result = { source_commit: receipt.source_commit, arch: process.arch, version: receipt.version, archive_sha256: archive.sha256, rf_posts: [],
  scope: "Native hosted functional launch from final signed/stapled ZIP; not downloaded/quarantined clean-machine or offline qualification" };
try {
  execFileSync("/usr/bin/ditto", ["-x", "-k", file, scratch]);
  const before = sha256(JSON.stringify(inventory(appPath), null, 2) + "\n"); assert.equal(before, receipt.final_app_inventory_sha256);
  application = await launchNative({ executablePath: path.join(appPath, "Contents/MacOS/atom-desktop"), args: [], cwd: home,
    env: { PATH: "/usr/bin:/bin", HOME: home, TMPDIR: process.env.TMPDIR || os.tmpdir(), LANG: "en_US.UTF-8" }, chromiumSandbox: true, timeout: 60_000 });
  page = await application.firstWindow(); page.setDefaultTimeout(60_000); await page.waitForLoadState("domcontentloaded");
  page.on("request", (request) => { if (request.method() === "POST" && request.url().startsWith("app://atom/api/")) result.rf_posts.push(new URL(request.url()).pathname); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Run Sector" && !button.disabled));
  const info = await page.evaluate(() => window.atomDesktop.getInfo());
  assert.equal(info.commit, receipt.source_commit); assert.equal(info.version, receipt.version); assert.equal(info.rendererSandboxed, true);
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true);
  const sector = page.waitForResponse((response) => response.url().endsWith("/api/analyze-sector") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Run Sector", exact: true }).click(); assert.equal((await sector).status(), 200);
  await page.locator(".run-state").filter({ hasText: /^Ready$/ }).waitFor({ timeout: 120_000 });
  const processes = await processTree(application.process().pid);
  await application.close(); application = null; await assertExited(processes.processes.map((row) => row.pid));
  assert.equal(sha256(JSON.stringify(inventory(appPath), null, 2) + "\n"), before);
  assert.deepEqual(result.rf_posts, ["/api/analyze-sector"]);
  result.native_sandbox_run_and_owned_cleanup = true; result.result = "PASS";
} catch (error) { result.result = "FAIL"; result.failure = error.message; throw error; }
finally {
  if (application) await application.close().catch(() => {});
  await fs.writeFile(path.join(directory, "signed-smoke.json"), JSON.stringify(result, null, 2) + "\n");
  await fs.writeFile(path.join(directory, `atom-${receipt.version}-darwin-${receipt.arch}.smoke.json`), JSON.stringify(result, null, 2) + "\n");
  await fs.rm(scratch, { recursive: true, force: true });
}
