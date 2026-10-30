// D01 (#148): SIGKILL the Electron main process and confirm the sidecar sees
// control-pipe EOF, drains and exits without leaving a loopback listener.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sidecarPid = () => { try { return Number(execFileSync("pgrep", ["-f", "atom-api --desktop-control"], { encoding: "utf8" }).trim().split("\n")[0]) || null; } catch { return null; } };
const listener = (pid) => { try { return execFileSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" }).trim(); } catch { return ""; } };

const { ELECTRON_RUN_AS_NODE: _ignored, ...inherited } = process.env;
const main = spawn(process.env.ATOM_SPIKE_ELECTRON || (await import("electron")).default, [here, ...(process.env.ATOM_SPIKE_ELECTRON_ARGS || "").split(" ").filter(Boolean)], {
  stdio: "ignore",
  env: { ...inherited, ATOM_SPIKE_DIST: process.env.ATOM_SPIKE_DIST || resolve(root, "frontend-react/dist"), ATOM_SPIKE_SIDECAR: resolve(here, "build/atom-api"),
    ATOM_SPIKE_DATASET_DIR: resolve(root, "data-pipeline"), ATOM_SPIKE_PROFILE: resolve(here, "build/profile-parent-death"), ATOM_SPIKE_NO_EXTERNAL: "1" },
});
let child = null;
for (let i = 0; i < 240 && !(child && listener(child)); i += 1) { await sleep(250); child = sidecarPid(); }
const result = { sidecar_pid: child, listening_before: Boolean(child && listener(child)) };
const killedAt = Date.now();
process.kill(main.pid, "SIGKILL");
while (child && alive(child) && Date.now() - killedAt < 35_000) await sleep(50);
Object.assign(result, { sidecar_exited: !(child && alive(child)), exit_after_ms: Date.now() - killedAt, listener_after: child ? listener(child) : "" });
mkdirSync(resolve(here, "build/evidence"), { recursive: true });
writeFileSync(resolve(here, "build/evidence/parent-death.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exitCode = result.listening_before && result.sidecar_exited && !result.listener_after ? 0 : 1;
