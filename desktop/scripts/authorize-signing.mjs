import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateAuthorization, validateCIContext, validateEnvironment } = require("../lib/signing-contract.cjs");
const desktop = path.resolve(import.meta.dirname, ".."); const root = path.dirname(desktop);
export async function environmentProtection() {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("GitHub environment protection could not be verified");
  const response = await fetch("https://api.github.com/repos/Berk-Unsal/atom/environments/desktop-signing", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!response.ok) throw new Error("GitHub environment protection could not be verified");
  validateEnvironment(await response.json());
}
export async function authorize(tag) {
  validateCIContext(process.env);
  const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
  const record = JSON.parse(await fs.readFile(path.join(desktop, "signing-authorization.json"), "utf8"));
  validateAuthorization(record, { version, source_commit: record.source_commit });
  const data = JSON.parse(await fs.readFile(path.join(desktop, "data-redistribution.json"), "utf8"));
  if (data.status !== "approved" || !data.approval?.reviewer || !data.approval?.record_url) throw new Error("Default-data approval is pending; signing jobs and credentials remain unavailable");
  if (tag !== `v${version}`) throw new Error("Signing tag must match the single root VERSION");
  await environmentProtection();
  const get = async (suffix) => {
    const response = await fetch(`https://api.github.com/repos/Berk-Unsal/atom/git/${suffix}`, {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (!response.ok) throw new Error("Approved release tag could not be resolved"); return response.json();
  };
  let object = (await get(`ref/tags/${encodeURIComponent(tag)}`)).object;
  for (let depth = 0; object?.type === "tag" && depth < 4; depth++) {
    if (!/^[a-f0-9]{40}$/.test(object.sha || "")) throw new Error("Invalid tag object");
    object = (await get(`tags/${object.sha}`)).object;
  }
  if (object?.type !== "commit" || object.sha !== record.source_commit) throw new Error("Release tag does not identify the exact approved source");
  return { version, source_commit: object.sha };
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    const result = await authorize(process.env.ATOM_SIGN_TAG);
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `source_commit=${result.source_commit}\nversion=${result.version}\n`);
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
