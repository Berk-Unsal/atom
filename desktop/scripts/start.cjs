"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [path.resolve(__dirname, "..")], { env, stdio: "inherit" });
child.once("error", () => { console.error("Could not launch Electron. Run npm ci in desktop first."); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
