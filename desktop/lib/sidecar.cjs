"use strict";

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { APP_ORIGIN } = require("./policy.cjs");

// Production host owns the pipes and process. It never discovers an arbitrary
// listener, exposes the token to the renderer or retries an RF request.
class Sidecar {
  constructor({ executable, datasetDir, distDir, version, commit, timeout = 30_000, shutdownTimeout = 30_000, spawnProcess = spawn }) {
    Object.assign(this, { executable, datasetDir, distDir, version, commit, timeout, shutdownTimeout, spawnProcess });
    this.state = "stopped";
    this.current = null;
    this.pending = null;
    this.stopping = false;
    this.lastError = null;
  }

  start() {
    if (this.stopping) return Promise.reject(new Error("Desktop is shutting down"));
    if (this.pending) return this.pending;
    if (this.current) return Promise.resolve(this.current);
    this.state = "starting";
    this.lastError = null;
    this.pending = this.launch().finally(() => { this.pending = null; });
    // Callers may await readiness later; early startup errors are still observed.
    this.pending.catch(() => {});
    return this.pending;
  }

  launch() {
    const token = crypto.randomBytes(32).toString("hex");
    const generation = crypto.randomBytes(16).toString("hex");
    const env = { GIN_MODE: "release", ATOM_DATASET_DIR: this.datasetDir, FRONTEND_DIST_PATH: this.distDir };
    for (const key of ["HOME", "TMPDIR", "LANG", "LC_ALL"]) if (process.env[key]) env[key] = process.env[key];
    const child = this.spawnProcess(this.executable, ["--desktop-control"], {
      cwd: this.datasetDir, env, stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
    });
    const state = { child, token, generation, address: null, dataset: null, closed: false, controllers: new Set() };
    this.owned = state;
    state.exited = new Promise((resolve) => child.once("close", () => { state.closed = true; resolve(); }));
    // Drain output immediately; retain bounded startup diagnostics in memory.
    let diagnostics = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-8192); });
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.state = "failed";
        this.lastError = message;
        child.kill("SIGKILL");
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail("Backend startup timed out"), this.timeout);
      child.once("error", (error) => fail(`Backend could not start (${error.code || "process error"})`));
      child.once("exit", () => {
        for (const controller of state.controllers) controller.abort();
        if (this.current === state) {
          this.current = null;
          this.state = this.stopping ? "stopped" : "failed";
          this.lastError = this.stopping ? null : "Backend stopped. Restart the application to recover; work was not replayed.";
        }
        fail("Backend exited before readiness");
      });
      const [control, events] = [child.stdio[3], child.stdio[4]];
      for (const stream of [control, events]) stream.on("error", () => fail("Backend control pipe failed"));
      control.write(`${JSON.stringify({ protocol: 1, token, generation, allowed_origins: [APP_ORIGIN] })}\n`);
      let buffer = "";
      events.on("data", (chunk) => {
        if (settled) return;
        buffer += chunk.toString("utf8");
        if (buffer.length > 16_384) return fail("Backend control event exceeded its limit");
        let end;
        while ((end = buffer.indexOf("\n")) !== -1 && !settled) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let event;
          try { event = JSON.parse(line); } catch { return fail("Backend sent an invalid control event"); }
          if (event.protocol !== 1 || event.generation !== generation) return fail("Backend identity did not match this launch");
          if (event.event === "listening") {
            const match = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(event.address || "");
            if (state.address || !match || +match[1] < 1 || +match[1] > 65535 || event.pid !== child.pid ||
                event.application_version !== this.version || event.build_commit !== this.commit) return fail("Backend binary identity mismatch; rebuild the local desktop");
            state.address = event.address;
          } else if (event.event === "dataset") {
            if (!event.dataset?.ready) return fail("Backend dataset is unavailable; verify the planning pack and rebuild");
            state.dataset = event.dataset;
          } else if (event.event === "ready") {
            if (!state.address || !state.dataset) return fail("Backend announced readiness out of order");
            settled = true;
            clearTimeout(timer);
            this.current = state;
            this.state = "ready";
            resolve(state);
          } else if (event.event === "failed" || event.event === "stopped") {
            fail("Backend stopped before readiness");
          }
        }
      });
    });
  }

  async ready() {
    if (this.current) return this.current;
    if (this.pending) return this.pending;
    throw new Error(this.lastError || "Backend unavailable");
  }

  async stop() {
    this.stopping = true;
    const state = this.owned;
    if (!state || state.closed) return;
    for (const controller of state.controllers) controller.abort();
    if (!state.child.stdio[3].destroyed) state.child.stdio[3].end('{"command":"shutdown"}\n');
    let timer;
    try {
      await Promise.race([state.exited, new Promise((resolve) => { timer = setTimeout(() => { state.child.kill("SIGKILL"); resolve(); }, this.shutdownTimeout); })]);
      await state.exited;
    } finally {
      clearTimeout(timer);
      this.current = null;
      this.state = "stopped";
    }
  }
}

module.exports = { Sidecar };
