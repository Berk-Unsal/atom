import { postJSON, requestJSON } from "./apiClient.js";

export const RF_BUDGET_POLICY = "bounded-followups-v1";
export function supportsRFWorkflow(meta) { return meta?.rf_budget_policy === RF_BUDGET_POLICY; }

// One action owns one capability. It never enters project/scientific state.
export function createRFWorkflow(meta, signal) {
  const enabled = supportsRFWorkflow(meta);
  let id = null;
  let count = 0;
  let completed = 0;
  let cleaned = false;
  const cleanup = async () => {
    if (!id || cleaned || completed === count) return;
    cleaned = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await requestJSON("/api/rf-workflows", { method: "DELETE", headers: { "RF-Workflow-ID": id }, signal: controller.signal });
    } catch { /* Server expiry is the correctness fallback; never retry RF. */ }
    finally { clearTimeout(timeout); }
  };
  const abort = () => { void cleanup(); };
  signal?.addEventListener("abort", abort, { once: true });
  return {
    async root(path, payload, fallbackMessage, expectedCount) {
      count = expectedCount;
      if (!enabled) return postJSON(path, payload, fallbackMessage, signal);
      const protocol = path === "/api/optimize-azimuth" ? "azimuth-sector-v1" : "network-maps-v1";
      return postJSON(path, payload, fallbackMessage, signal, {
        headers: { "RF-Workflow": protocol },
        onResponse(headers) {
          const candidate = headers.get("RF-Workflow-ID");
          if (/^[a-f0-9]{32}$/.test(candidate ?? "")) id = candidate;
          const remaining = headers.get("RF-Workflow-Remaining");
          const expires = headers.get("RF-Workflow-Expires");
          if (!id || remaining !== String(count) || !/^[1-9]\d*$/.test(expires ?? "")
            || Number(expires) > (count + 1) * 60 || headers.get("RF-Budget-Policy") !== RF_BUDGET_POLICY) {
            throw new Error("RF workflow authorization metadata is missing or invalid");
          }
        },
      });
    },
    async child(path, payload, fallbackMessage, index) {
      if (enabled && (!id || cleaned || !Number.isInteger(index) || index !== completed || index >= count)) {
        throw new Error("RF workflow child authorization is unavailable");
      }
      const result = enabled ? await postJSON(path, payload, fallbackMessage, signal, {
        headers: { "RF-Workflow-ID": id, "RF-Workflow-Index": String(index) },
      }) : await postJSON(path, payload, fallbackMessage, signal);
      completed += 1;
      return result;
    },
    async close() { signal?.removeEventListener("abort", abort); await cleanup(); },
  };
}
