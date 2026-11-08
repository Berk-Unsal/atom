"use strict";

// Desktop is a closed proxy vocabulary, not an HTTP forwarding service. New
// backend routes require an explicit native-boundary decision here.
const ROUTES = {
  GET: new Set(["/healthz", "/readyz", "/api/meta", "/api/towers", "/api/buildings", "/api/buildings/summary",
    "/api/datasets", "/api/core/status", "/api/core/topology", "/api/core/sessions", "/api/core/events",
    "/api/processes/batch-experiment", "/api/conformance", "/api/collections", "/api/collections/buildings",
    "/api/collections/buildings/items", "/api/spatial-evidence"]),
  POST: new Set(["/api/analyze-sector", "/api/simulate", "/api/optimize-azimuth", "/api/explain-network-cell",
    "/api/evaluate-network", "/api/building-entry-analysis", "/api/coverage-gaps", "/api/recommend-sites",
    "/api/measurements/evaluate", "/api/interference", "/api/path-profile", "/api/core/scenario",
    "/api/datasets/switch", "/api/coverage-surface", "/api/compare-network", "/api/optimize-network", "/api/spatial-evidence/path-profile",
    "/api/processes/batch-experiment/execution", "/api/sub-thz-reflection-reference", "/api/sub-thz-validation",
    "/api/sub-thz-reference", "/api/sub-thz-p1411-reference", "/api/sub-thz-material-reference"]),
  DELETE: new Set(["/api/rf-workflows"]),
};

function allowedAPIPath(method, pathname) {
  if (ROUTES[method]?.has(pathname)) return true;
  if (["GET", "DELETE"].includes(method) && /^\/api\/jobs\/job-[a-f0-9]{24}$/.test(pathname)) return true;
  // Preserve opaque dataset identifiers, including Unicode and punctuation,
  // while keeping them one path segment rather than a route/destination.
  const building = /^\/api\/spatial-evidence\/buildings\/([^/]+)$/.exec(pathname);
  if (method !== "GET" || !building) return false;
  try {
    const id = decodeURIComponent(building[1]);
    return id.length > 0 && id.length <= 1024 && ![".", ".."].includes(id) && !/[\/\\\x00-\x1f\x7f]/.test(id);
  } catch { return false; }
}

function validPrivateTarget(target, generation) {
  const port = /^127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(target?.address || "");
  return Boolean(port && +port[1] <= 65535 && /^[a-f0-9]{64}$/.test(target.token || "") &&
    /^[a-f0-9]{32}$/.test(generation || "") && target.generation === generation);
}

module.exports = { allowedAPIPath, validPrivateTarget };
