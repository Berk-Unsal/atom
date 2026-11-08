"use strict";
const { spawn } = require("node:child_process");

function signalOwnedGroup(child, signal) {
  if (!Number.isInteger(child?.pid) || child.pid <= 0) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => { child.once("close", resolve); child.once("error", resolve); });
}

async function stopOwned(child, graceful = () => child.kill("SIGTERM"), timeout = 2000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = exited(child);
  const timer = setTimeout(() => signalOwnedGroup(child, "SIGKILL"), timeout);
  try { graceful(); await done; } finally { clearTimeout(timer); }
}

/** All command descendants stay in this newly-created process group. */
function runOwned(command, args, { cwd, signal, timeout = 300_000, onOutput = () => {}, onSpawn = () => {} } = {}) {
  signal?.throwIfAborted();
  const child = spawn(command, args, { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  onSpawn(child);
  return new Promise((resolve, reject) => {
    let output = ""; let timer; let force; let aborted = false;
    const terminate = () => { if (aborted) return; aborted = true; signalOwnedGroup(child, "SIGTERM"); force = setTimeout(() => signalOwnedGroup(child, "SIGKILL"), 1000); };
    const append = (chunk) => { output = (output + chunk.toString()).slice(-16_384); onOutput(chunk.toString()); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    signal?.addEventListener("abort", terminate, { once: true });
    if (signal?.aborted) terminate();
    timer = setTimeout(terminate, timeout);
    let error;
    child.once("error", (failure) => { error = failure; });
    child.once("close", (code) => {
      clearTimeout(timer); clearTimeout(force); signal?.removeEventListener("abort", terminate);
      if (aborted) reject(new Error("Owned development command cancelled or timed out"));
      else if (error || code !== 0) reject(new Error(output.trim() || error?.message || `${command} exited with ${code}`));
      else resolve(output);
    });
  });
}

module.exports = { signalOwnedGroup, stopOwned, runOwned };
