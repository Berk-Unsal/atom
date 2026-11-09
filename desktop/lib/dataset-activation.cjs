"use strict";
const { APP_ORIGIN } = require("./policy.cjs");
const { validPrivateTarget } = require("./routes.cjs");
const { DatasetError } = require("./dataset-source.cjs");
async function activateDataset(backend, entry, fetchAPI = fetch) {
  const previous = backend.datasetDir;
  if (backend.snapshot().state === "failed" || backend.snapshot().state === "stopped") {
    backend.datasetDir = entry.path;
    try { await backend.restart(); return { status: "active", dataset: { id: entry.id, name: entry.name, version: entry.version }, recovered: true }; }
    catch { backend.datasetDir = previous; throw new DatasetError("dataset_activation_failed", "The selected pack could not start the planning service. Existing project and dataset files were preserved. Check the pack and use Data or Help to recover explicitly."); }
  }
  const target = await backend.ready();
  if (!validPrivateTarget(target, target.generation) || backend.current !== target) throw new DatasetError("dataset_runtime_changed", "The planning service changed. Choose Activate again after it is ready.");
  const headers = { "content-type": "application/json", "x-atom-desktop-token": target.token, origin: APP_ORIGIN };
  let response;
  try {
    response = await fetchAPI(`http://${target.address}/api/datasets/switch`, { method: "POST", headers, body: JSON.stringify({ id: entry.id }), redirect: "error", signal: AbortSignal.timeout(5 * 60_000) });
    if (backend.current !== target) throw new Error("generation changed");
    if (!response.ok) throw new DatasetError("dataset_activation_failed", "The pack failed canonical runtime validation. The active in-memory dataset was preserved; check its layers and hashes.");
    const result = await response.json();
    if (result.status !== "active" || result.dataset?.id !== entry.id) throw new Error("unexpected response");
    backend.datasetDir = entry.path;
    return result;
  } catch (error) {
    if (error instanceof DatasetError) throw error;
    // A lost response can occur after the runtime commit. Never report a
    // rollback or repeat the switch automatically. Read back current identity.
    if (backend.current === target) {
      try {
        const meta = await fetchAPI(`http://${target.address}/api/meta`, { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
        const value = await meta.json();
        if (meta.ok && backend.current === target && value.dataset?.id === entry.id) {
          backend.datasetDir = entry.path;
          return { status: "active", dataset: value.dataset, warning: "The activation response was interrupted; the active dataset was confirmed from the planning service." };
        }
      } catch { /* No automatic activation or calculation retry. */ }
    }
    throw new DatasetError("dataset_activation_unknown", "Activation could not be confirmed. Refresh the workspace or recover the planning service explicitly before running a calculation; no calculation was replayed.");
  }
}
module.exports = { activateDataset };
