"use strict";

const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { StringDecoder } = require("node:string_decoder");
const crypto = require("node:crypto");
const path = require("node:path");
const { APP_ORIGIN } = require("./policy.cjs");

// Exactly one owned generation. Public snapshots intentionally omit its PID,
// address, credential and stderr; only the host can operate the process/pipes.
class Sidecar extends EventEmitter {
  constructor({ executable, datasetDir, datasetRegistry, distDir, version, commit, timeout = 30_000, shutdownTimeout = 30_000, spawnProcess = spawn }) {
    super();
    for (const value of [timeout, shutdownTimeout]) if (!Number.isFinite(value) || value <= 0 || value > 30_000) throw new Error("Desktop timeouts must be within 30 seconds");
    for (const value of [executable, datasetDir, distDir]) if (!path.isAbsolute(value)) throw new Error("Desktop resources must use absolute paths");
    if (datasetRegistry && !path.isAbsolute(datasetRegistry)) throw new Error("Desktop dataset registry must use an absolute path");
    Object.assign(this, { executable, datasetDir, datasetRegistry, distDir, version, commit, timeout, shutdownTimeout, spawnProcess });
    this.state = "stopped";
    this.sequence = 0;
    this.uiReady = false;
    this.current = null;
    this.owned = null;
    this.pending = null;
    this.restarting = null;
    this.stopping = false;
    this.lastError = null;
  }

  snapshot() {
    return { sequence: this.sequence, state: this.state, generation: this.owned?.generation || null,
      readiness: { listener: Boolean(this.owned?.listening && !this.owned?.closed), dataset: Boolean(this.owned?.dataset?.ready && !this.owned?.closed), ui: this.uiReady },
      error: this.lastError };
  }

  publish(state = this.state) {
    this.state = state;
    this.sequence++;
    this.emit("status", this.snapshot());
  }

  setUIReady(value) { this.uiReady = Boolean(value); this.publish(); }

  invalidate(record) {
    if (this.current === record) this.current = null;
    for (const controller of record?.controllers || []) controller.abort();
    record?.controllers.clear();
  }

  start() {
    if (this.stopping) return Promise.reject(new Error("Desktop is shutting down"));
    if (this.restarting) return this.restarting;
    if (this.pending) return this.pending;
    if (this.current) return Promise.resolve(this.current);
    if (this.owned && !this.owned.closed) return Promise.reject(new Error("Use explicit recovery to restart the backend"));
    return this.beginGeneration();
  }

  beginGeneration() {
    this.lastError = null;
    this.pending = this.launch().finally(() => { this.pending = null; });
    this.pending.catch(() => {});
    return this.pending;
  }

  launch() {
    const record = { token: crypto.randomBytes(32).toString("hex"), generation: crypto.randomBytes(16).toString("hex"),
      address: null, listening: false, dataset: null, closed: false, stopping: false, controllers: new Set(), stderr: "" };
    this.owned = record;
    this.publish("starting");
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const fail = (message) => {
        if (record.failed || record.stopping || this.owned !== record) return;
        record.failed = true;
        this.invalidate(record);
        this.lastError = message;
        this.publish("failed");
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(message)); }
        this.killOwned(record);
      };
      record.cancelStartup = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error("Backend startup cancelled")); }
      };
      const env = { GIN_MODE: "release", ATOM_DATASET_DIR: this.datasetDir, FRONTEND_DIST_PATH: this.distDir };
      if (this.datasetRegistry) env.ATOM_DESKTOP_DATASET_REGISTRY = this.datasetRegistry;
      for (const key of ["HOME", "TMPDIR", "LANG", "LC_ALL"]) if (process.env[key]) env[key] = process.env[key];
      let child;
      try { child = this.spawnProcess(this.executable, ["--desktop-control"], { cwd: this.datasetDir, env, stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] }); }
      catch { record.closed = true; record.exited = Promise.resolve(); fail("Backend could not start"); return; }
      record.child = child;
      record.exited = new Promise((done) => child.once("close", () => {
        record.closed = true;
        if (this.owned === record) this.publish();
        done();
      }));
      timer = setTimeout(() => fail("Backend startup timed out"), this.timeout);
      child.stdout.on("data", () => {});
      child.stderr.on("data", (chunk) => {
        record.stderr = Buffer.from((record.stderr + chunk.toString()).split(record.token).join("[redacted]")).subarray(-8192).toString();
      });
      child.once("error", (error) => fail(`Backend could not start (${error.code || "process error"})`));
      child.once("exit", () => {
        this.invalidate(record);
        if (!record.stopping) fail(settled ? "Planning service stopped. Choose Help → Restart planning service to recover; calculations were not replayed." : "Backend exited before readiness");
      });
      const [control, events] = [child.stdio[3], child.stdio[4]];
      for (const stream of [control, events]) stream.on("error", () => fail("Backend control pipe failed"));
      events.once("end", () => { if (!record.stopping && child.exitCode === null && child.signalCode === null) fail("Backend control channel closed"); });
      control.write(`${JSON.stringify({ protocol: 1, token: record.token, generation: record.generation, allowed_origins: [APP_ORIGIN] })}\n`);
      const decoder = new StringDecoder("utf8");
      let buffer = "";
      events.on("data", (chunk) => {
        if (record.stopping || this.owned !== record || this.state === "failed") return;
        buffer += decoder.write(chunk);
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          if (Buffer.byteLength(line) > 4096) return fail("Backend control event exceeded its limit");
          let event;
          try { event = JSON.parse(line); } catch { return fail("Backend sent an invalid control event"); }
          if (event.protocol !== 1 || event.generation !== record.generation) return fail("Backend identity did not match this launch");
          if (event.event === "listening") {
            const match = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(event.address || "");
            if (record.listening || !match || +match[1] < 1 || +match[1] > 65535 || event.pid !== child.pid || event.application_version !== this.version || event.build_commit !== this.commit) return fail("Backend binary identity mismatch; rebuild the local desktop");
            record.address = event.address; record.listening = true;
            this.publish("loading-dataset");
          } else if (event.event === "dataset") {
            if (!record.listening || record.dataset) return fail("Backend announced dataset readiness out of order");
            if (!event.dataset?.ready) return fail("Backend dataset is unavailable; verify the planning pack and rebuild");
            record.dataset = event.dataset;
            this.publish();
          } else if (event.event === "ready") {
            if (settled || !record.listening || !record.dataset) return fail("Backend announced readiness out of order");
            settled = true; clearTimeout(timer);
            this.current = record;
            this.publish("ready");
            resolve(record);
          } else return fail("Backend stopped or sent an unexpected control event");
        }
        if (Buffer.byteLength(buffer) > 4096) fail("Backend control event exceeded its limit");
      });
    });
  }

  async ready() {
    if (this.stopping) throw new Error("Desktop is shutting down");
    if (this.restarting) return this.restarting;
    if (this.current) return this.current;
    if (this.pending) return this.pending;
    throw new Error(this.lastError || "Backend unavailable");
  }

  killOwned(record) {
    if (record?.child && !record.closed && record.child.exitCode === null && record.child.signalCode === null) record.child.kill("SIGKILL");
  }

  async terminate(record) {
    if (!record || record.closed) return;
    record.stopping = true;
    record.cancelStartup?.();
    this.invalidate(record);
    if (!record.child.stdio[3].destroyed) record.child.stdio[3].end('{"command":"shutdown"}\n');
    // Reserve time to reap after SIGKILL within the existing 30-second ceiling.
    const timer = setTimeout(() => this.killOwned(record), Math.max(0, this.shutdownTimeout - 250));
    try { await record.exited; } finally { clearTimeout(timer); }
  }

  restart() {
    if (this.stopping) return Promise.reject(new Error("Desktop is shutting down"));
    if (this.restarting) return this.restarting;
    const previous = this.owned;
    this.invalidate(previous);
    this.publish("restarting");
    this.restarting = (async () => {
      await this.terminate(previous);
      await this.pending?.catch(() => {});
      if (this.stopping) throw new Error("Desktop is shutting down");
      return this.beginGeneration();
    })().finally(() => { this.restarting = null; });
    this.restarting.catch(() => {});
    return this.restarting;
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.invalidate(this.owned);
    this.publish("stopping");
    this.stopPromise = (async () => {
      await this.terminate(this.owned);
      await this.restarting?.catch(() => {});
      await this.pending?.catch(() => {});
      this.publish("stopped");
    })();
    return this.stopPromise;
  }
}

module.exports = { Sidecar };
