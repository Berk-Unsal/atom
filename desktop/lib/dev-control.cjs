"use strict";
const { Socket } = require("node:net");

const DEV_SERVER = "http://127.0.0.1:5173";

/** Inherited supervisor pipes only. Never reachable through renderer IPC. */
class DevControl {
  constructor({ input, output, restart, snapshot, quit }) {
    Object.assign(this, { input, output, restart, snapshot, quit });
    this.buffer = "";
    this.lastID = 0;
    this.closed = false;
    this.pending = false;
    input.on("data", (chunk) => {
      if (this.closed) return;
      this.buffer += chunk.toString("utf8");
      let end;
      while ((end = this.buffer.indexOf("\n")) !== -1 && !this.closed) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (Buffer.byteLength(line) > 4096) { this.close(); return; }
        let message;
        try { message = JSON.parse(line); } catch { this.close(); return; }
        if (!message || Object.keys(message).sort().join(",") !== "command,id,protocol" || message.protocol !== 1 ||
            !Number.isSafeInteger(message.id) || message.id <= this.lastID || !["restart", "quit"].includes(message.command)) { this.close(); return; }
        this.lastID = message.id;
        if (message.command === "quit") { this.send({ event: "quitting", id: message.id }); this.close(); }
        else void this.replace(message.id);
      }
      if (Buffer.byteLength(this.buffer) > 4096) this.close();
    });
    input.once("end", () => this.close());
    input.once("error", () => this.close());
    output.once("error", () => this.close());
  }

  send(message) {
    if (!this.closed && !this.output.destroyed) this.output.write(`${JSON.stringify({ protocol: 1, ...message })}\n`);
  }

  publish(runtime) {
    this.send({ event: "status", runtime: { sequence: runtime.sequence, state: runtime.state, generation: runtime.generation,
      readiness: runtime.readiness, error: runtime.error } });
  }

  async replace(id) {
    if (this.pending) { this.send({ event: "rejected", id, error: "A rebuild is already being applied" }); return; }
    this.pending = true;
    try {
      await this.restart(); // Sidecar returns a private record; never serialize it.
      this.send({ event: "restarted", id }); this.publish(this.snapshot());
    } catch { this.send({ event: "rejected", id, error: "Planning service replacement failed; calculations were not replayed" }); }
    finally { this.pending = false; }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.quit();
  }
}

function createDevControl({ isPackaged, enabled, devServer, restart, snapshot, quit, openPipe = (fd, readable) => new Socket({ fd, readable, writable: !readable }) }) {
  if (isPackaged !== false || enabled !== "1" || devServer !== DEV_SERVER) return null;
  let input;
  try {
    input = openPipe(3, true);
    const output = openPipe(4, false);
    return new DevControl({ input, output, restart, snapshot, quit });
  } catch {
    input?.destroy();
    throw new Error("Development supervisor control descriptors are unavailable");
  }
}

module.exports = { DevControl, createDevControl };
