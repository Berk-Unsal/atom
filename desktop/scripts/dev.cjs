"use strict";
const { DevSession } = require("../lib/dev-session.cjs");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: scripts/desktop-dev.sh [--profile /absolute/private/directory]\nShared Vite UI + owned Go watcher; unsigned development only. Ctrl-C stops owned children.");
} else {
  if (args.length && (args.length !== 2 || args[0] !== "--profile")) throw new Error("Use --help for desktop development options");
  const session = new DevSession({ ...(args.length ? { profile: args[1] } : {}), inspect: Boolean(process.send && process.env.ATOM_DESKTOP_DEV_INSPECT === "1") });
  session.on("event", (event) => {
    if (process.connected) process.send(event, () => { if (event.event === "stopped" && process.connected) process.disconnect(); });
    if (event.event === "build-failed" || event.event === "fatal") console.error(`[desktop dev] ${event.message}`);
    else if (["ready", "go-ready", "shell-ready", "stopped"].includes(event.event)) console.log(`[desktop dev] ${event.event}`);
    if (event.event === "fatal") process.exitCode = 1;
  });
  process.once("SIGINT", () => { process.exitCode = 130; void session.stop(); });
  process.once("SIGTERM", () => { void session.stop(); });
  process.once("disconnect", () => { void session.stop(); });
  session.start().catch(async (error) => {
    if (!session.stopping) { console.error(`[desktop dev] ${error.message}`); process.exitCode = 1; }
    await session.stop();
  });
}
