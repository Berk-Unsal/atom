function shortRunID(value) {
  const text = String(value ?? "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

function runTypeLabel(value) {
  return value === "optimization" ? "Optimization Run" : value === "simulation" ? "Simulation Run" : "Run";
}

/** "Simulation Run 1cfa19e7…5e048d, …" or "None"; unknown IDs keep a generic Run label. */
export function reportRunLabels(runIds = [], runs = []) {
  if (!runIds?.length) return "None";
  return runIds.map((runId) => {
    const run = runs.find((candidate) => candidate.run_id === runId);
    return `${runTypeLabel(run?.run_type)} ${shortRunID(runId)}`;
  }).join(", ");
}

/**
 * The one lineage line shown for a Report, before generation (source card) and after (stored Reports):
 * "<scenario> · <Version N | No saved Version> · Runs: <runs | None>".
 */
export function reportLineageLine({ scenarioName, versionLabel, runIds = [], runs = [] } = {}) {
  return `${scenarioName || "Scenario"} · ${versionLabel || "No saved Version"} · Runs: ${reportRunLabels(runIds, runs)}`;
}
