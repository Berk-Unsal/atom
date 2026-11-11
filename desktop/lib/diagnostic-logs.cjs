"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { privateDirectory } = require("./native-paths.cjs");

const EVENTS = new Set(["host-start", "build", "startup-failed", "renderer-gone", "renderer-load-failed", "renderer-reload", "open-logs", "open-logs-failed", "layout-write-failed", "log-fallback", "runtime", "backend-stderr", "backend-exit", "host-stop"]);
const STATES = new Set(["starting", "loading-dataset", "ready", "failed", "restarting", "stopping", "stopped"]);
const REASONS = new Set(["unknown", "ENOENT", "EACCES", "EPERM", "ENOSPC", "EDQUOT", "EIO", "EMFILE", "ENFILE", "EROFS", "ELOOP", "EADDRINUSE", "storage", "resources", "launch", "listener", "timeout", "exit", "control", "identity", "dataset", "crashed", "oom", "killed", "integrity-failure", "launch-failed", "abnormal-exit", "clean-exit"]);
const safeReason = (value) => REASONS.has(value) ? value : "unknown";
const safeBuild = (value, commit) => typeof value === "string" && (commit ? /^[a-f0-9]{7,40}$/ : /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]{1,80})?$/).test(value) ? value : "unknown";

// Never persist arbitrary messages, stderr text, paths, URLs or nested objects.
// Debug level changes event volume, never the data-disclosure boundary.
function diagnosticRecord(component, event, fields, metadata, debug, now) {
  if (!["host", "backend"].includes(component) || !EVENTS.has(event)) return null;
  if (event === "backend-stderr" && !debug) return null;
  const record = { time: now().toISOString(), level: ["startup-failed", "renderer-gone", "renderer-load-failed", "open-logs-failed", "layout-write-failed", "backend-exit"].includes(event) || fields.state === "failed" ? "error" : event === "backend-stderr" ? "debug" : "info",
    component, event, version: safeBuild(metadata.version), commit: safeBuild(metadata.commit, true),
    platform: ["darwin", "linux"].includes(metadata.platform) ? metadata.platform : "unknown",
    arch: ["arm64", "x64"].includes(metadata.arch) ? metadata.arch : "unknown" };
  if (typeof fields.generation === "string" && /^[a-f0-9]{32}$/.test(fields.generation)) record.generation = fields.generation;
  if (STATES.has(fields.state)) record.state = fields.state;
  if (fields.reason !== undefined) record.reason = safeReason(fields.reason);
  for (const key of ["listener", "dataset", "ui", "fallback", "truncated"]) if (typeof fields[key] === "boolean") record[key] = fields[key];
  for (const key of ["sequence", "bytes"]) if (Number.isSafeInteger(fields[key]) && fields[key] >= 0) record[key] = Math.min(fields[key], 1_000_000_000);
  return record;
}

class DiagnosticLogs {
  constructor({ directory, temporary = os.tmpdir(), debug = false, metadata = {}, io = fs, limit = 5 * 1024 * 1024, count = 5, now = () => new Date() } = {}) {
    if (!Number.isInteger(limit) || limit < 1024 || limit > 5 * 1024 * 1024 || !Number.isInteger(count) || count < 1 || count > 5) throw new Error("Invalid diagnostic log bounds");
    Object.assign(this, { temporary, debug, metadata: { platform: process.platform, arch: process.arch, ...metadata }, io, limit, count, now });
    this.directory = null; this.fallback = false; this.disabled = false;
    try { if (!directory || !path.isAbsolute(directory)) throw new Error("No native log directory"); privateDirectory(directory, io); this.directory = directory; this.probe(); }
    catch { this.useFallback(); }
  }
  setBuild(metadata) { this.metadata = { ...this.metadata, version: metadata.version, commit: metadata.commit }; }
  status() { return Object.freeze({ directory: this.directory, fallback: this.fallback, disabled: this.disabled }); }
  file(component, index = 0) { return path.join(this.directory, `${component}${index ? `.${index}` : ""}.log`); }
  check(file) {
    try {
      const stat = this.io.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > this.limit) throw new Error("Unsafe log file");
      return stat;
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  append(component, bytes) {
    privateDirectory(this.directory, this.io);
    const file = this.file(component); const stat = this.check(file);
    if (stat && stat.size + bytes.length > this.limit) {
      // Validate the entire bounded rotation set before deleting or renaming.
      for (let index = 1; index < this.count; index++) this.check(this.file(component, index));
      if (this.count === 1) this.io.unlinkSync(file);
      else {
        try { this.io.unlinkSync(this.file(component, this.count - 1)); } catch (error) { if (error.code !== "ENOENT") throw error; }
        for (let index = this.count - 2; index >= 0; index--) {
          try { this.io.renameSync(this.file(component, index), this.file(component, index + 1)); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
      }
    }
    const descriptor = this.io.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
    try {
      const opened = this.io.fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== process.getuid() || (opened.mode & 0o777) !== 0o600 || opened.size + bytes.length > this.limit) throw new Error("Unsafe log descriptor");
      this.io.writeFileSync(descriptor, bytes);
    } finally { this.io.closeSync(descriptor); }
  }
  probe() { this.append("host", Buffer.alloc(0)); this.append("backend", Buffer.alloc(0)); }
  useFallback() {
    if (this.fallback) { this.directory = null; this.disabled = true; return; }
    this.fallback = true;
    try {
      if (!path.isAbsolute(this.temporary)) throw new Error("Invalid temporary directory");
      this.directory = this.io.mkdtempSync(path.join(this.temporary, "atom-support-logs-"));
      privateDirectory(this.directory, this.io); this.probe();
    } catch { this.directory = null; this.disabled = true; }
  }
  record(component, event, fields = {}) {
    const record = diagnosticRecord(component, event, fields, this.metadata, this.debug, this.now);
    if (!record || this.disabled) return false;
    const bytes = Buffer.from(JSON.stringify(record) + "\n");
    if (bytes.length > this.limit) return false;
    try { this.append(component, bytes); return true; }
    catch {
      this.useFallback();
      if (this.disabled) return false;
      try {
        const switched = diagnosticRecord("host", "log-fallback", { fallback: true }, this.metadata, this.debug, this.now);
        this.append("host", Buffer.from(JSON.stringify(switched) + "\n"));
        this.append(component, bytes); return true;
      } catch { this.directory = null; this.disabled = true; return false; }
    }
  }
}

module.exports = { DiagnosticLogs, diagnosticRecord, safeReason };
