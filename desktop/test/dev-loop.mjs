import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fork, execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const root = path.resolve(import.meta.dirname, "../..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-dev-qualification-"));
const fixture = path.join(scratch, "source"); const profile = path.join(scratch, "profile");
const evidence = path.join(root, "desktop/test-results"); await fs.mkdir(evidence, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const exit = (child, timeout = 40_000) => new Promise((resolve, reject) => {
  if (child.exitCode !== null || child.signalCode !== null) return resolve(child.exitCode);
  const timer = setTimeout(() => reject(new Error("Development command did not exit")), timeout);
  child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
});
const apiPID = (parent) => {
  const record = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).find((match) => match && +match[2] === parent && path.basename(match[3]) === "atom-api");
  return record ? +record[1] : null;
};
const groups = () => execFileSync("ps", ["-ax", "-o", "pgid=,pid=,comm="], { encoding: "utf8" }).split("\n").map((line) => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(Boolean);
const noGroups = async (pids) => {
  const deadline = Date.now() + 5000;
  while (groups().some((record) => pids.has(+record[1])) && Date.now() < deadline) await sleep(25);
  assert.equal(groups().some((record) => pids.has(+record[1])), false, "All supervisor-owned process groups must be gone");
};

async function copySource() {
  await fs.mkdir(fixture);
  for (const directory of ["desktop", "frontend-react", "backend-go"]) {
    const source = path.join(root, directory);
    await fs.cp(source, path.join(fixture, directory), { recursive: true, filter: (file) => {
      const relative = path.relative(source, file).split(path.sep);
      return !["node_modules", "build", "dist", "test-results", "spike", ".git"].some((name) => relative.includes(name));
    } });
  }
  for (const directory of ["desktop", "frontend-react"]) await fs.symlink(path.join(root, directory, "node_modules"), path.join(fixture, directory, "node_modules"));
  for (const directory of ["data-pipeline", "icon"]) await fs.symlink(path.join(root, directory), path.join(fixture, directory));
  await fs.copyFile(path.join(root, "VERSION"), path.join(fixture, "VERSION"));
  execFileSync("git", ["init", "-q", fixture]);
  execFileSync("git", ["-c", "user.name=Atom test fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null",
    "commit", "--allow-empty", "-qm", "Isolated native development fixture"], { cwd: fixture });
}

function launch() {
  const child = fork(path.join(fixture, "desktop/scripts/dev.cjs"), ["--profile", profile], {
    env: { ...process.env, ATOM_DESKTOP_DEV_INSPECT: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const events = []; const owned = new Set(); let output = "";
  const record = (chunk) => { output = (output + chunk.toString()).slice(-16_384); };
  child.stdout.on("data", record); child.stderr.on("data", record);
  child.on("message", (event) => { events.push(event); if (event.pid) owned.add(event.pid); });
  return { child, events, owned, output: () => output, async wait(predicate, after = 0, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    do {
      const event = events.slice(after).find(predicate); if (event) return event;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Development command exited: ${output}`);
      await sleep(10);
    } while (Date.now() < deadline);
    throw new Error(`Development event timed out: ${output}`);
  } };
}

let command; let browser; let page; let blocker;
const result = { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  reference: { platform: process.platform, architecture: process.arch, kernel: os.release(), cpu: os.cpus()[0].model,
    logical_cpus: os.cpus().length, memory_bytes: os.totalmem(), node: process.version } };
try {
  await copySource();
  assert.equal(await fs.stat(path.join(fixture, "frontend-react/dist")).then(() => true, () => false), false);
  command = launch();
  const host = await command.wait((event) => event.event === "host-ready");
  await command.wait((event) => event.event === "ready");
  browser = await chromium.connectOverCDP(host.debugURL); page = browser.contexts()[0].pages()[0];
  const consoleMessages = []; page.on("console", (message) => { if (/hmr|websocket|content security/i.test(message.text())) consoleMessages.push(message.text().replace(/token=[^&\s]+/g, "token=[redacted]").slice(0, 200)); });
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  const bridge = await page.evaluate(() => window.atomDesktop.getInfo()); result.reference.electron = bridge.shellVersion;
  result.fixture_build_commit = bridge.commit;
  assert.equal(bridge.version, (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim());
  assert.equal(bridge.rendererSandboxed, true);
  assert.equal(page.url(), "app://atom/");
  assert.equal(await fs.stat(path.join(host.resources, "dist")).then(() => true, () => false), false);
  assert.match(await page.evaluate(async () => (await (await fetch("/")).text())), /@vite\/client/);
  assert.equal((await fetch("http://127.0.0.1:5173/api/meta")).status, 403, "Vite HTTP must not proxy an unrelated API on port 8080");
  const originalRuntime = await page.evaluate(() => window.atomDesktop.getRuntime());
  const originalPID = apiPID(host.pid); assert.ok(originalPID);
  await page.getByRole("button", { name: /^Project menu,/ }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Dev loop retained workspace");
  await page.getByRole("button", { name: "Save project name", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => { globalThis.__atomDevHMRSession = "preserved"; });
  const jsxFile = path.join(fixture, "frontend-react/src/components/WorkspaceChrome.jsx");
  const cssFile = path.join(fixture, "frontend-react/src/styles.css");
  const originalJSX = await fs.readFile(jsxFile, "utf8"); const originalCSS = await fs.readFile(cssFile, "utf8");
  assert.ok(originalJSX.includes("<strong>A.T.O.M</strong>"));
  result.hmr = {};
  for (const kind of ["jsx", "css"]) {
    const samples = [];
    for (let index = 0; index < 23; index++) {
      const started = performance.now();
      if (kind === "jsx") {
        const text = `A.T.O.M HMR${index}`;
        await fs.writeFile(jsxFile, originalJSX.replace("<strong>A.T.O.M</strong>", `<strong>${text}</strong>`));
        await page.waitForFunction((expected) => {
          const element = document.querySelector(".command-brand strong"); return element?.textContent === expected && element.getBoundingClientRect().width > 0;
        }, text, { timeout: 10_000, polling: 16 });
      } else {
        const color = `rgb(${index + 10}, 40, 70)`;
        await fs.writeFile(cssFile, `${originalCSS}\n.command-bar { border-top: 3px solid ${color}; }\n`);
        await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".command-bar")).borderTopColor === expected, color, { timeout: 10_000, polling: 16 });
      }
      if (index >= 3) samples.push(performance.now() - started);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    result.hmr[kind] = { samples_ms: samples, p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1], max_ms: sorted.at(-1) };
    assert.ok(result.hmr[kind].p95_ms <= 1000, `${kind} warmed HMR exceeded 1s p95`);
  }
  await page.screenshot({ path: path.join(evidence, "dev-loop-hmr.png") });
  await fs.writeFile(jsxFile, originalJSX); await fs.writeFile(cssFile, originalCSS);
  await page.waitForFunction(() => document.querySelector(".command-brand strong")?.textContent === "A.T.O.M");
  assert.equal(await page.evaluate(() => globalThis.__atomDevHMRSession), "preserved");
  assert.equal((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, originalRuntime.generation);
  assert.equal(command.events.filter((event) => event.event === "go-build-start").length, 1);
  assert.equal(command.events.filter((event) => event.event === "host-ready").length, 1);
  result.hmr_no_go_rebuild_or_host_reload = true;

  const goFile = path.join(fixture, "backend-go/main.go"); const originalGo = await fs.readFile(goFile, "utf8");
  let cursor = command.events.length;
  await fs.writeFile(goFile, `${originalGo}\nthis is invalid Go\n`);
  await command.wait((event) => event.event === "build-failed" && event.kind === "Go", cursor);
  assert.equal(apiPID(host.pid), originalPID);
  assert.equal((await page.evaluate(() => window.atomDesktop.getRuntime())).generation, originalRuntime.generation);
  const metaStatus = () => page.evaluate(async () => { const runtime = await window.atomDesktop.getRuntime();
    return (await fetch("/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": runtime.generation } })).status; });
  assert.equal(await metaStatus(), 200); result.failed_compile_preserved_last_good = true;
  cursor = command.events.length; const goStarted = performance.now();
  await fs.writeFile(goFile, `${originalGo}\n// Desktop development warm Go edit.\n`);
  const replaced = await command.wait((event) => event.event === "go-ready", cursor);
  result.warm_go_edit_to_ready_ms = performance.now() - goStarted;
  assert.ok(result.warm_go_edit_to_ready_ms <= 5000, "Warm Go edit exceeded 5s guidance");
  assert.notEqual(replaced.runtime.generation, originalRuntime.generation);
  assert.equal(alive(originalPID), false); assert.equal(await metaStatus(), 200);
  assert.equal(await page.evaluate(async (generation) => (await fetch("/api/meta", { headers: { "x-atom-client": "1", "x-atom-runtime-generation": generation } })).status, originalRuntime.generation), 409);
  result.successful_swap_rejected_stale_generation = true;

  const shellFile = path.join(fixture, "desktop/main.cjs"); const originalShell = await fs.readFile(shellFile, "utf8");
  cursor = command.events.length;
  await fs.writeFile(shellFile, `${originalShell}\nthis is invalid JavaScript\n`);
  await command.wait((event) => event.event === "build-failed" && event.kind === "shell", cursor);
  assert.equal(alive(host.pid), true); assert.equal(await metaStatus(), 200);
  result.failed_shell_syntax_preserved_host = true;
  cursor = command.events.length; const shellStarted = performance.now();
  await fs.writeFile(shellFile, `${originalShell}\n// Desktop development warm shell edit.\n`);
  const nextHost = await command.wait((event) => event.event === "host-ready", cursor);
  await command.wait((event) => event.event === "shell-ready", cursor);
  await browser.close(); browser = await chromium.connectOverCDP(nextHost.debugURL); page = browser.contexts()[0].pages()[0];
  await page.getByRole("button", { name: "Run Sector", exact: true }).waitFor({ timeout: 60_000 });
  result.warm_shell_edit_to_ready_ms = performance.now() - shellStarted;
  assert.ok(result.warm_shell_edit_to_ready_ms <= 10_000, "Warm shell edit exceeded 10s guidance");
  assert.notEqual(host.pid, nextHost.pid); assert.equal(alive(host.pid), false);
  await page.getByRole("button", { name: "Project menu, Dev loop retained workspace", exact: true }).waitFor();
  assert.equal(command.events.filter((event) => event.event === "go-build-start").length, 3);
  const latestAPI = apiPID(nextHost.pid); assert.ok(latestAPI);
  command.child.kill("SIGINT"); assert.equal(await exit(command.child), 130);
  assert.equal(alive(nextHost.pid), false); assert.equal(alive(latestAPI), false); await noGroups(command.owned);
  assert.equal(await fs.stat(host.resources).then(() => true, () => false), false);
  result.ctrl_c_reaped_owned_processes_and_removed_scratch = true;
  await browser.close(); browser = null;

  command = launch();
  await command.wait((event) => event.event === "go-build-start");
  await fs.writeFile(goFile, `${originalGo}\n// Edit during the initial development build must not be missed.\n`);
  const relaunched = await command.wait((event) => event.event === "host-ready");
  await command.wait((event) => event.event === "ready");
  assert.ok(command.events.some((event) => event.event === "go-ready"));
  browser = await chromium.connectOverCDP(relaunched.debugURL); page = browser.contexts()[0].pages()[0];
  await page.getByRole("button", { name: "Project menu, Dev loop retained workspace", exact: true }).waitFor();
  command.child.kill("SIGTERM"); assert.equal(await exit(command.child), 0); await noGroups(command.owned);
  await browser.close(); browser = null;
  result.same_profile_relaunch_retained_workspace = true;
  result.edit_during_initial_build_was_applied = true;

  command = launch();
  await command.wait((event) => event.event === "go-build-start");
  command.child.kill("SIGINT"); assert.equal(await exit(command.child), 130); await noGroups(command.owned);
  assert.equal(command.events.some((event) => event.event === "host-ready"), false);
  result.startup_cancellation_reaped_compiler = true;

  command = launch();
  await command.wait((event) => event.event === "go-build-start");
  await fs.writeFile(path.join(fixture, "VERSION"), "0.13.1-development-probe\n");
  assert.equal(await exit(command.child), 1); await noGroups(command.owned);
  assert.match(command.output(), /VERSION changed/);
  assert.equal(command.events.some((event) => event.event === "host-ready"), false);
  await fs.copyFile(path.join(root, "VERSION"), path.join(fixture, "VERSION"));
  result.version_change_during_bootstrap_stopped_cleanly = true;

  blocker = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => { blocker.once("error", reject); blocker.listen(5173, "127.0.0.1", resolve); });
  command = launch(); assert.equal(await exit(command.child), 1); await noGroups(command.owned);
  assert.match(command.output(), /5173/); assert.equal(blocker.listening, true);
  assert.equal(command.events.some((event) => event.event === "go-build-start"), false);
  result.occupied_vite_port_failed_without_takeover = true;
  result.console_hmr_messages = consoleMessages;
  result.result = "PASS";
  await fs.writeFile(path.join(evidence, "dev-loop.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(evidence, "failed-dev-loop.png") }).catch(() => {});
  const failure = { ...result, error: error.stack, output: command?.output(), events: command?.events.map(({ debugURL, resources, ...event }) => event) };
  await fs.writeFile(path.join(evidence, "failed-dev-loop.json"), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure, null, 2)); throw error;
} finally {
  if (command && command.child.exitCode === null && command.child.signalCode === null) { command.child.kill("SIGTERM"); await exit(command.child); }
  await browser?.close().catch(() => {});
  if (blocker?.listening) await new Promise((resolve) => blocker.close(resolve));
  await fs.rm(scratch, { recursive: true, force: true });
}
