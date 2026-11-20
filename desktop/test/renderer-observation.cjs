"use strict";
const { createHash } = require("node:crypto");
const { isAppURL } = require("../lib/policy.cjs");
const { allowedAPIPath } = require("../lib/routes.cjs");

// Test-side observation only. Never retains request bodies, credentials,
// query strings, arbitrary exception text or copied workspace/source rows.
function observeRenderer(page) {
  const records = { page_errors: [], failed_requests: [], failed_responses: [], console_errors: [], crashes: [] };
  const append = (kind, value) => { if (records[kind].length < 20) records[kind].push(value); };
  function requestIdentity(request) {
    try {
      if (!isAppURL(request.url())) return null;
      const parsed = new URL(request.url()), method = request.method();
      const asset = ["GET", "HEAD"].includes(method) && /^\/(?:index\.html|assets\/[A-Za-z0-9_./-]+\.(?:js|css|json|svg|png|ico|woff2|txt|webmanifest))$/.test(parsed.pathname);
      if (!asset && !allowedAPIPath(method, parsed.pathname) && !(method === "GET" && parsed.pathname === "/")) return null;
      const route = parsed.pathname.replace(/^\/api\/jobs\/job-[a-f0-9]{24}$/, "/api/jobs/:id")
        .replace(/^\/api\/spatial-evidence\/buildings\/[^/]+$/, "/api/spatial-evidence/buildings/:id");
      return { method, path: route.slice(0, 200) };
    } catch { return null; }
  }
  const error = (value) => {
    const name = ["Error", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError", "AggregateError"].includes(value?.name) ? value.name : "Error";
    const message = String(value?.message || "");
    const frames = (String(value?.stack || "").match(/app:\/\/atom\/assets\/[A-Za-z0-9_./-]+\.js:\d+:\d+/g) || []).slice(0, 10);
    append("page_errors", { name, message_sha256: createHash("sha256").update(message).digest("hex"), frames });
  };
  const failed = (request) => { const identity = requestIdentity(request); if (!identity) return; const reason = request.failure()?.errorText;
    append("failed_requests", { ...identity, reason: /^net::[A-Z0-9_]+$/.test(reason || "") ? reason : "unavailable" }); };
  const response = (reply) => { const identity = requestIdentity(reply.request()); if (identity && reply.status() >= 400) append("failed_responses", { ...identity, status: reply.status() }); };
  const consoleError = (message) => { if (message.type() === "error") append("console_errors", { message_sha256: createHash("sha256").update(message.text()).digest("hex") }); };
  const crash = () => append("crashes", { observed: true });
  page.on("pageerror", error); page.on("requestfailed", failed); page.on("response", response);
  page.on("console", consoleError); page.on("crash", crash);
  return { records, stop() { page.off("pageerror", error); page.off("requestfailed", failed); page.off("response", response); page.off("console", consoleError); page.off("crash", crash); } };
}
module.exports = { observeRenderer };
