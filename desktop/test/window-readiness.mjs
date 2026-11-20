import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { launchNative } from "./native-launch.mjs";
import { firstWindowAtSize } from "./qualification-support.mjs";

const require = createRequire(import.meta.url);
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "atom-window-readiness-"));
let application;
try {
  await fs.writeFile(path.join(scratch, "package.json"), JSON.stringify({ main: "main.cjs" }));
  await fs.writeFile(path.join(scratch, "main.cjs"), `
    const { app, BrowserWindow } = require("electron");
    app.setPath("userData", ${JSON.stringify(path.join(scratch, "profile"))});
    globalThis.createQualificationWindow = () => {
      const owner = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      void owner.loadURL("data:text/html,<title>Window readiness fixture</title>");
    };
    app.on("window-all-closed", () => app.quit());
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  application = await launchNative({ executablePath: require("electron"), args: [scratch], env, chromiumSandbox: true, timeout: 30_000 });
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 0);
  // Force the observed ordering without a sleep: the real window cannot exist
  // until the independent main-process control below explicitly creates it.
  const prepared = firstWindowAtSize(application, [900, 700]);
  // Attach a rejection observer while the main-process creation call is pending.
  prepared.catch(() => {});
  await application.evaluate(() => globalThis.createQualificationWindow());
  const page = await prepared;
  await page.waitForLoadState("domcontentloaded");
  const owner = await application.browserWindow(page);
  try { assert.deepEqual(await owner.evaluate((window) => window.getContentSize()), [900, 700]); }
  finally { await owner.dispose(); }
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process })), { node: "undefined", process: "undefined" });
  console.log("PASS: delayed real BrowserWindow reaches the requested content size without early resize or navigation retry");
} finally {
  try { await application?.close(); } finally { await fs.rm(scratch, { recursive: true, force: true }); }
}
