"use strict";
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { fork, execFileSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { stageDatasetPack } = require("./resources.cjs");
const { RebuildQueue, buildInitialRevision } = require("./rebuild-queue.cjs");
const { DevHost } = require("./dev-host.cjs");
const { runOwned, stopOwned } = require("./dev-process.cjs");

const HOST_LIBRARIES = new Set(["sidecar.cjs", "router.cjs", "policy.cjs", "routes.cjs", "recovery.cjs", "window-state.cjs", "report-surface.cjs", "dev-control.cjs", "native-paths.cjs", "settings-store.cjs", "project-file-io.cjs", "project-files.cjs", "project-file-bridge.cjs", "project-file-close.cjs", "project-file-shortcuts.cjs", "portable-file-io.cjs", "report-files.cjs", "report-file-bridge.cjs", "dataset-source.cjs", "dataset-registry.cjs", "dataset-bridge.cjs", "dataset-activation.cjs", "diagnostic-logs.cjs", "diagnostic-actions.cjs"]);
const backendSource = (file) => ["go.mod", "go.sum"].includes(file) || (file.endsWith(".go") && !file.endsWith("_test.go") && !file.startsWith("vendor/"));
const privateDirectory = async (directory) => {
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fsp.stat(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error("Choose a private, user-owned development profile directory (0700)");
};

function defaultDevProfile() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library/Application Support/A.T.O.M-dev");
  const data = process.env.XDG_DATA_HOME;
  return path.join(data && path.isAbsolute(data) ? data : path.join(os.homedir(), ".local/share"), "atom-dev/profile");
}

class DevSession extends EventEmitter {
  constructor({ root = path.resolve(__dirname, "../.."), profile = defaultDevProfile(), inspect = false } = {}) {
    super();
    this.root = root; this.desktop = path.join(root, "desktop"); this.profile = path.resolve(profile); this.inspect = inspect;
    this.abort = new AbortController(); this.watchers = []; this.commands = new Set(); this.operations = Promise.resolve(); this.builds = 0; this.launches = 0;
    this.stopping = false; this.host = null;
  }

  notice(event, fields = {}) { this.emit("event", { event, ...fields }); }
  run(command, args, options) {
    let pid;
    const pending = runOwned(command, args, { ...options, onSpawn: (child) => { pid = child.pid; this.notice("command-start", { command, pid }); } });
    this.commands.add(pending);
    return pending.finally(() => { this.commands.delete(pending); this.notice("command-stop", { command, pid }); });
  }
  serialize(action) {
    const pending = this.operations.then(() => { if (this.stopping) throw new Error("Development session is stopping"); return action(); });
    this.operations = pending.catch(() => {}); return pending;
  }

  async startVite() {
    const child = fork(path.join(this.desktop, "scripts/vite-dev.mjs"), [], { cwd: this.root, detached: true,
      env: { ...process.env, ATOM_DESKTOP_DEV: "1" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    this.vite = child;
    let output = "";
    const append = (chunk) => { output = (output + chunk.toString()).slice(-8192); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Vite startup timed out: ${output}`)), 20_000);
      const fail = () => { clearTimeout(timer); reject(new Error(`Vite could not start on 127.0.0.1:5173: ${output}`)); };
      child.once("error", fail); child.once("exit", fail);
      child.once("message", (message) => {
        clearTimeout(timer);
        if (message.event === "ready" && message.address === "127.0.0.1" && message.port === 5173) resolve();
        else reject(new Error("Unexpected development Vite listener"));
      });
    });
    child.once("exit", () => { if (!this.stopping) { this.notice("fatal", { message: "Owned Vite server stopped" }); void this.stop(); } });
    this.notice("vite-ready", { pid: child.pid });
  }

  async buildGo({ signal }) {
    const candidate = path.join(this.resources, `atom-api-candidate-${crypto.randomUUID()}`);
    this.builds++; const started = performance.now(); this.notice("go-build-start", { builds: this.builds });
    try {
      // The supervisor already captures canonical VERSION/commit. Avoid repeated
      // Git probes as well as DWARF linking work on each supervised edit;
      // production builds and the standalone Go debugger workflow are unchanged.
      await this.run("go", ["build", "-buildvcs=false", "-trimpath", "-ldflags", `-w -X main.appVersion=${this.version} -X main.buildCommit=${this.commit}`, "-o", candidate, "."],
        { cwd: path.join(this.root, "backend-go"), signal });
      this.notice("go-built", { builds: this.builds, milliseconds: performance.now() - started });
      return candidate;
    } catch (error) { await fsp.rm(candidate, { force: true }); throw error; }
  }

  async launchHost() {
    if (this.stopping) throw new Error("Development session is stopping");
    const env = { ...process.env, ATOM_DESKTOP_DEV_CONTROL: "1", ATOM_DESKTOP_DEV_SERVER: "http://127.0.0.1:5173",
      ATOM_DESKTOP_TEST_RESOURCES: this.resources, ATOM_DESKTOP_TEST_PROFILE: this.profile };
    delete env.ELECTRON_RUN_AS_NODE;
    const host = new DevHost({ executable: require("electron"), desktop: this.desktop, env, inspect: this.inspect });
    this.host = host; this.launches++;
    host.on("status", (runtime) => this.notice("runtime-status", { runtime }));
    host.once("exit", () => {
      if (!host.expectedExit && !this.stopping) { this.notice("fatal", { message: "Development host stopped; restart the development command" }); void this.stop(); }
    });
    const runtime = await host.waitReady(this.inspect);
    this.notice("host-ready", { pid: host.child.pid, runtime, builds: this.builds, launches: this.launches,
      resources: this.resources, ...(this.inspect ? { debugURL: host.debugURL } : {}) });
    return runtime;
  }

  async stopHost() {
    const host = this.host; this.host = null;
    await host?.stop();
  }

  watch(directory, match, queue) {
    const watcher = fs.watch(directory, { recursive: true }, (_kind, filename) => {
      if (!filename || match(filename.toString().split(path.sep).join("/"))) queue.request();
    });
    watcher.on("error", (error) => { this.notice("fatal", { message: error.message }); void this.stop(); });
    this.watchers.push(watcher);
  }

  start() { this.starting = this.bootstrap(); return this.starting; }

  async bootstrap() {
    if (!["darwin", "linux"].includes(process.platform)) throw new Error("Desktop development currently supports macOS and Linux; Windows is deferred (#163)");
    if (+process.versions.node.split(".")[0] < 24) throw new Error("Desktop development requires Node 24 or later");
    this.version = (await fsp.readFile(path.join(this.root, "VERSION"), "utf8")).trim();
    const versionWatcher = fs.watch(path.join(this.root, "VERSION"), () => { this.notice("fatal", { message: "VERSION changed; restart the development command for a consistent build identity" }); void this.stop(); });
    versionWatcher.on("error", (error) => { this.notice("fatal", { message: error.message }); void this.stop(); });
    this.watchers.push(versionWatcher);
    this.commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: this.root, encoding: "utf8" }).trim();
    await privateDirectory(this.profile);
    this.abort.signal.throwIfAborted();
    this.workspace = await fsp.mkdtemp(path.join(os.tmpdir(), "atom-dev-"));
    this.abort.signal.throwIfAborted();
    this.resources = path.join(this.workspace, "resources"); await fsp.mkdir(this.resources, { mode: 0o700 });
    await this.startVite(); // Fail on an occupied port before any expensive build.
    this.abort.signal.throwIfAborted();
    stageDatasetPack({ source: path.join(this.root, "data-pipeline"), destination: path.join(this.resources, "data-pipeline") });
    await fsp.copyFile(path.join(this.root, "icon/png/atom-256.png"), path.join(this.resources, "atom.png"));
    await fsp.writeFile(path.join(this.resources, "build-info.json"), JSON.stringify({ version: this.version, commit: this.commit,
      development: true, platform: process.platform, arch: process.arch, shell: "electron", shellVersion: require("../package.json").devDependencies.electron }), { mode: 0o600 });
    // Remember edits made during the first cold build/launch as well as warm
    // edits. Install the normal watcher before removing this bootstrap watch.
    let bootstrapChanged = false;
    let bootstrapRevision = 0;
    const bootstrapWatch = fs.watch(path.join(this.root, "backend-go"), { recursive: true }, (_kind, filename) => {
      if (!filename || backendSource(filename.toString().split(path.sep).join("/"))) { bootstrapChanged = true; bootstrapRevision++; }
    });
    bootstrapWatch.on("error", (error) => { this.notice("fatal", { message: error.message }); void this.stop(); });
    this.watchers.push(bootstrapWatch);
    const initial = { getRevision: () => bootstrapRevision, signal: this.abort.signal };
    await buildInitialRevision({ ...initial, build: ({ signal }) => this.run("go", ["run", "./cmd/validate-dataset", path.join(this.resources, "data-pipeline")],
      { cwd: path.join(this.root, "backend-go"), signal }).then(() => undefined), discard: async () => {} });
    const first = await buildInitialRevision({ ...initial, build: (options) => this.buildGo(options), discard: (candidate) => fsp.rm(candidate, { force: true }),
      onSuperseded: () => this.notice("go-build-superseded", { builds: this.builds }) });
    bootstrapChanged = false;
    this.abort.signal.throwIfAborted(); await fsp.rename(first, path.join(this.resources, "atom-api"));
    await this.launchHost();

    this.goQueue = new RebuildQueue({ build: (options) => this.buildGo(options), discard: (candidate) => fsp.rm(candidate, { force: true }),
      apply: (candidate) => this.serialize(async () => {
        await fsp.rename(candidate, path.join(this.resources, "atom-api"));
        if (this.stopping || !this.host) throw new Error("Development session is stopping");
        await this.host.command("restart");
        this.notice("go-ready", { runtime: this.host.runtime, builds: this.builds, pid: this.host.child.pid });
      }) });
    this.shellQueue = new RebuildQueue({ build: async ({ signal }) => {
      for (const file of ["main.cjs", "preload.cjs", ...[...HOST_LIBRARIES].map((name) => `lib/${name}`)]) {
        await this.run(process.execPath, ["--check", path.join(this.desktop, file)], { cwd: this.root, signal });
      }
      return true;
    }, discard: async () => {}, apply: () => this.serialize(async () => {
      await this.stopHost(); if (this.stopping) throw new Error("Development session is stopping");
      await this.launchHost(); this.notice("shell-ready", { pid: this.host.child.pid, launches: this.launches });
    }) });
    for (const [kind, queue] of [["Go", this.goQueue], ["shell", this.shellQueue]]) queue.on("build-failed", ({ error }) => this.notice("build-failed", { kind, message: error.message }));
    this.watch(path.join(this.root, "backend-go"), backendSource, this.goQueue);
    this.watch(this.desktop, (file) => ["main.cjs", "preload.cjs"].includes(file) || (file.startsWith("lib/") && HOST_LIBRARIES.has(file.slice(4))), this.shellQueue);
    await new Promise((resolve) => setImmediate(resolve)); bootstrapWatch.close();
    if (bootstrapChanged) { this.goQueue.request(); await this.goQueue.idle(); }
    this.abort.signal.throwIfAborted();
    this.notice("ready", { pid: this.host.child.pid, builds: this.builds, launches: this.launches });
    return this;
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true; this.abort.abort();
    for (const watcher of this.watchers) watcher.close();
    this.stopPromise = (async () => {
      await Promise.allSettled([this.goQueue?.close(), this.shellQueue?.close(), this.stopHost(), stopOwned(this.vite)]);
      await Promise.allSettled([...this.commands, this.starting]);
      await this.operations;
      if (this.workspace) await fsp.rm(this.workspace, { recursive: true, force: true });
      this.notice("stopped");
    })();
    return this.stopPromise;
  }
}

module.exports = { DevSession, defaultDevProfile };
