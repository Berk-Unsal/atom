import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateCIContext, validateEnvironment } = require("../lib/signing-contract.cjs");
export const REPO = "Berk-Unsal/atom";
export async function api(suffix, options = {}) {
  if (!process.env.GH_TOKEN) throw new Error("GitHub authorization is unavailable");
  const response = await fetch(`https://api.github.com/repos/${REPO}/${suffix}`, { redirect: "error", signal: AbortSignal.timeout(120_000), ...options,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json", ...options.headers } });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${suffix}`);
  return response.json();
}
export async function protectedContext(environment) {
  validateCIContext(process.env);
  validateEnvironment(await api(`environments/${environment}`));
}
export async function resolveTag(tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag || "")) throw new Error("An existing canonical vVERSION tag is required");
  let object = (await api(`git/ref/tags/${encodeURIComponent(tag)}`)).object;
  for (let depth = 0; object?.type === "tag" && depth < 4; depth++) {
    if (!/^[a-f0-9]{40}$/.test(object.sha || "")) throw new Error("Invalid tag object");
    object = (await api(`git/tags/${object.sha}`)).object;
  }
  if (object?.type !== "commit" || !/^[a-f0-9]{40}$/.test(object.sha || "")) throw new Error("Tag must resolve to a commit");
  const file = await sourceJSONOrText(object.sha, "VERSION", false);
  const version = file.trim(); if (tag !== `v${version}`) throw new Error("Tag and source root VERSION differ");
  const comparison = await api(`compare/${object.sha}...main`);
  if (!["ahead", "identical"].includes(comparison.status)) throw new Error("Candidate source must already be part of main");
  return { version, source_commit: object.sha, tag };
}
export async function sourceJSONOrText(commit, file, json = true) {
  const result = await api(`contents/${file}?ref=${commit}`);
  if (result.encoding !== "base64" || result.type !== "file") throw new Error("Expected a source metadata file");
  const text = Buffer.from(result.content, "base64").toString("utf8"); return json ? JSON.parse(text) : text;
}
export async function outputs(result) {
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(""));
}
