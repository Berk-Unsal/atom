import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const distribution = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, median: sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) };
};
export function sourceIdentity(root) {
  return { source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    source_dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
    reference: { platform: process.platform, architecture: process.arch, kernel: os.release(), cpu: os.cpus()[0].model,
      logical_cpus: os.cpus().length, memory_bytes: os.totalmem(), node: process.version } };
}
export async function processTree(parentPID) {
  const rows = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,rss=,comm="], { encoding: "utf8" }).split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(Boolean)
    .map((match) => ({ pid: +match[1], parent_pid: +match[2], rss_bytes: +match[3] * 1024, executable: path.basename(match[4]) }));
  const owned = new Set([parentPID]);
  let added;
  do { added = false; for (const row of rows) if (owned.has(row.parent_pid) && !owned.has(row.pid)) { owned.add(row.pid); added = true; } } while (added);
  const processes = rows.filter((row) => owned.has(row.pid));
  for (const row of processes) {
    row.pss_bytes = null;
    if (process.platform === "linux") {
      const contents = await fs.readFile(`/proc/${row.pid}/smaps_rollup`, "utf8").catch(() => "");
      const match = /^Pss:\s+(\d+)/m.exec(contents);
      if (match) row.pss_bytes = +match[1] * 1024;
    }
  }
  return { processes, rss_bytes: processes.reduce((total, row) => total + row.rss_bytes, 0),
    pss_bytes: processes.every((row) => row.pss_bytes !== null) ? processes.reduce((total, row) => total + row.pss_bytes, 0) : null };
}
export async function assertExited(pids) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (pids.every((pid) => { try { process.kill(pid, 0); return false; } catch { return true; } })) return;
    await sleep(50);
  }
  throw new Error("Qualification-owned processes survived shutdown");
}
