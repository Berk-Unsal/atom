"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { APP_ORIGIN, API_HEADER, GENERATION_HEADER, RELEASE_CSP, isAppURL } = require("./policy.cjs");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
const isAPIPath = (pathname) => pathname.startsWith("/api/") || ["/healthz", "/readyz"].includes(pathname);
const errorResponse = (status, error, generation) => Response.json({ error }, { status, headers: generation ? { [GENERATION_HEADER]: generation } : {} });

function createRouter({ distDir, sidecar, fetchAPI = fetch, devServer = "", fetchUI = fetch }) {
  if (devServer && devServer !== "http://127.0.0.1:5173") throw new Error("Desktop development UI must use the fixed loopback Vite origin");
  return async (request) => {
    if (!isAppURL(request.url)) return errorResponse(404, "Unknown application origin");
    const url = new URL(request.url);
    if (isAPIPath(url.pathname)) {
      const origin = request.headers.get("origin");
      const site = request.headers.get("sec-fetch-site");
      if ((origin && origin !== APP_ORIGIN) || (site && !["same-origin", "none"].includes(site)) ||
          request.headers.get(API_HEADER) !== "1") return errorResponse(403, "Desktop request rejected");
      const generation = request.headers.get(GENERATION_HEADER);
      const status = sidecar.snapshot();
      if (!generation || generation !== status.generation || ["restarting", "stopping", "stopped"].includes(status.state)) return errorResponse(409, "Planning service changed; run the action again", status.generation);
      let target;
      try { target = await sidecar.ready(); } catch { return errorResponse(503, "Planning service unavailable; use Help → Restart planning service, or rebuild the local resources", generation); }
      if (target.generation !== generation || sidecar.current !== target) return errorResponse(409, "Planning service changed; run the action again", target.generation);
      const controller = new AbortController();
      const abort = () => controller.abort();
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) controller.abort();
      target.controllers.add(controller);
      const cleanup = () => { target.controllers.delete(controller); request.signal.removeEventListener("abort", abort); };
      try {
        // Forward a small HTTP vocabulary. Never forward renderer credentials,
        // cookies, arbitrary Host/Origin, redirects or a destination URL.
        const headers = { "x-atom-desktop-token": target.token, origin: APP_ORIGIN };
        for (const name of ["accept", "content-type", "rf-workflow", "rf-workflow-id", "rf-workflow-index"]) if (request.headers.has(name)) headers[name] = request.headers.get(name);
        const hasBody = !["GET", "HEAD"].includes(request.method);
        const upstream = await fetchAPI(`http://${target.address}${url.pathname}${url.search}`, {
          method: request.method, headers, body: hasBody ? request.body : undefined, duplex: hasBody ? "half" : undefined,
          redirect: "manual", signal: controller.signal,
        });
        if (sidecar.current !== target) { await upstream.body?.cancel(); cleanup(); return errorResponse(409, "Backend generation changed; run the action again", sidecar.snapshot().generation); }
        if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); cleanup(); return errorResponse(502, "Backend redirects are not supported", generation); }
        const outputHeaders = new Headers();
        for (const name of ["content-type", "content-disposition", "retry-after", "rf-workflow-id", "rf-workflow-remaining", "rf-workflow-expires", "rf-budget-policy", "rf-followup-limit", "rf-followup-remaining", "rf-followup-reset", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) if (upstream.headers.has(name)) outputHeaders.set(name, upstream.headers.get(name));
        outputHeaders.set("cache-control", "no-store");
        outputHeaders.set(GENERATION_HEADER, target.generation);
        outputHeaders.set("x-content-type-options", "nosniff");
        if (!upstream.body) { cleanup(); return new Response(null, { status: upstream.status, headers: outputHeaders }); }
        const reader = upstream.body.getReader();
        const body = new ReadableStream({
          async pull(stream) {
            try {
              const { done, value } = await reader.read();
              if (sidecar.current !== target) throw new Error("Backend generation changed");
              if (done) { cleanup(); stream.close(); } else stream.enqueue(value);
            } catch (error) { cleanup(); controller.abort(); stream.error(error); }
          },
          async cancel(reason) { controller.abort(); cleanup(); await reader.cancel(reason); },
        });
        return new Response(body, { status: upstream.status, headers: outputHeaders });
      } catch {
        cleanup();
        return errorResponse(502, "Desktop backend stopped; work was not replayed", generation);
      }
    }
    if (!["GET", "HEAD"].includes(request.method)) return errorResponse(405, "Method not allowed");
    if (devServer) {
      try {
        const response = await fetchUI(`${devServer}${url.pathname}${url.search}`, { method: request.method, redirect: "manual", signal: request.signal });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return errorResponse(502, "Development UI redirected outside its route"); }
        const csp = RELEASE_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173");
        return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/octet-stream",
          "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": csp } });
      } catch { return errorResponse(503, "Development UI unavailable; start Vite on 127.0.0.1:5173"); }
    }
    try {
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes("\0") || pathname.includes("\\")) return errorResponse(400, "Invalid asset path");
      const root = await fs.realpath(distDir);
      const relative = pathname === "/" ? "/index.html" : pathname;
      const file = await fs.realpath(path.resolve(root, `.${relative}`));
      if (!file.startsWith(root + path.sep)) return errorResponse(404, "Asset not found");
      const headers = { "content-type": MIME[path.extname(file)] || "application/octet-stream", "x-content-type-options": "nosniff", "content-security-policy": RELEASE_CSP };
      return new Response(request.method === "HEAD" ? null : await fs.readFile(file), { headers });
    } catch { return errorResponse(404, "Asset not found; rebuild the local desktop"); }
  };
}

module.exports = { createRouter, isAPIPath };
