"use strict";
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { stopOwned } = require("./dev-process.cjs");

class DevHost extends EventEmitter {
  constructor({ executable, desktop, env, inspect = false }) {
    super();
    const args = [...(inspect ? ["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0"] : []), desktop];
    this.child = spawn(executable, args, { env, detached: true, stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] });
    this.id = 0; this.pending = new Map(); this.buffer = ""; this.log = "";
    const capture = (chunk) => {
      this.log = (this.log + chunk.toString()).slice(-8192);
      const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/.exec(this.log);
      if (match) { this.debugURL = match[1]; this.emit("change"); }
    };
    this.child.stdout.on("data", capture); this.child.stderr.on("data", capture);
    this.child.stdio[3].on("error", () => {});
    this.child.stdio[4].on("error", () => {});
    this.child.stdio[4].on("data", (chunk) => {
      this.buffer += chunk.toString(); let end;
      while ((end = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (Buffer.byteLength(line) > 4096) { this.fail(new Error("Invalid host control record")); return; }
        let record; try { record = JSON.parse(line); } catch { this.fail(new Error("Invalid host control record")); return; }
        if (record.protocol !== 1) { this.fail(new Error("Incompatible host control protocol")); return; }
        if (record.event === "status") { this.runtime = record.runtime; this.emit("status", record.runtime); }
        if (record.id && this.pending.has(record.id)) {
          const pending = this.pending.get(record.id); this.pending.delete(record.id); clearTimeout(pending.timer);
          record.event === "rejected" ? pending.reject(new Error(record.error)) : pending.resolve(record);
        }
        this.emit("change");
      }
      if (Buffer.byteLength(this.buffer) > 4096) this.fail(new Error("Invalid host control record"));
    });
    this.child.once("error", (error) => this.fail(error));
    this.child.once("close", () => { this.fail(new Error(`Development host exited${this.log ? `: ${this.log}` : ""}`)); this.emit("exit"); });
  }

  fail(error) {
    this.error = error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear(); this.emit("change");
  }

  waitReady(inspect = false, timeout = 35_000) {
    return new Promise((resolve, reject) => {
      const done = (error) => { clearTimeout(timer); this.off("change", check); error ? reject(error) : resolve(this.runtime); };
      const check = () => {
        if (this.error) done(this.error);
        else if (this.runtime?.state === "ready" && this.runtime.readiness.ui && (!inspect || this.debugURL)) done();
      };
      const timer = setTimeout(() => done(new Error("Development host readiness timed out")), timeout);
      this.on("change", check); check();
    });
  }

  command(command) {
    if (this.error) return Promise.reject(this.error);
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Development host command timed out")); }, 35_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdio[3].write(`${JSON.stringify({ protocol: 1, id, command })}\n`);
    });
  }

  async stop() {
    this.expectedExit = true;
    await stopOwned(this.child, () => this.child.stdio[3].end(), 31_000);
  }
}

module.exports = { DevHost };
