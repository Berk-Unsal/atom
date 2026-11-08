"use strict";
const fs = require("node:fs");
const net = require("node:net");
const scenario = process.argv[2];
if (scenario === "early-exit") process.exit(2);
const input = new net.Socket({ fd: 3, readable: true, writable: false });
const output = fs.createWriteStream(null, { fd: 4 });
let buffer = "";
input.on("data", (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf("\n")) >= 0) {
    const command = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (command.command === "shutdown") {
      if (scenario !== "ignore-shutdown") process.exit(0);
      continue;
    }
    if (scenario === "timeout") continue;
    const send = (event, extra) => output.write(JSON.stringify({ event, protocol: 1, generation: scenario === "foreign-generation" ? "wrong" : command.generation, ...extra }) + "\n");
    if (scenario === "invalid-json") { output.write("bad\n"); continue; }
    if (scenario === "oversized") { output.write("x".repeat(20_000)); continue; }
    if (scenario === "ready-first") { send("ready"); continue; }
    send("listening", { address: scenario === "foreign-address" ? "0.0.0.0:8080" : "127.0.0.1:54321",
      pid: scenario === "foreign-pid" ? process.pid + 1 : process.pid,
      application_version: scenario === "wrong-version" ? "bad" : "test", build_commit: scenario === "wrong-commit" ? "bad" : "test" });
    send("dataset", { dataset: { ready: scenario !== "missing-dataset" } });
    send("ready");
    if (scenario === "late-invalid") setTimeout(() => output.write(JSON.stringify({ event: "ready", protocol: 2, generation: command.generation }) + "\n"), 30);
    if (scenario === "closed-channel") setTimeout(() => output.end(), 30);
    if (scenario === "stderr") process.stderr.write("x".repeat(9000) + command.token);
  }
});
input.on("end", () => { if (scenario !== "ignore-shutdown") process.exit(0); });
// Also keep the fixture alive when it deliberately ignores control EOF.
if (scenario === "ignore-shutdown") setInterval(() => {}, 1000);
