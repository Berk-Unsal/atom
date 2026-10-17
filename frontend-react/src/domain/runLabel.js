// Readable Run identity: "<type> · <N Cells> · <headline metric> · <time>". The Run ID stays in details.

function runRequest(run) {
  const snapshot = run?.canonical_input_snapshot;
  return snapshot?.request ?? snapshot ?? null;
}

/** "network" for multi-Cell requests, "single" for one-sector requests, null when the request was not retained. */
export function runPlanningMode(run) {
  const request = runRequest(run);
  if (Array.isArray(request?.towers)) return "network";
  if (request && (request.tower_lon !== undefined || request.tower_lat !== undefined)) return "single";
  return null;
}

export function planningModeLabel(mode) {
  return mode === "network" ? "Network" : mode === "single" ? "Single-sector" : "another";
}

export function runCellCount(run) {
  const request = runRequest(run);
  if (Array.isArray(request?.towers)) return request.towers.length;
  return runPlanningMode(run) === "single" ? 1 : null;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The one number that best summarizes a succeeded Run, or "" when the Run kept none. */
export function runHeadlineMetric(run) {
  const summary = run?.summary ?? {};
  if (run?.run_type === "optimization") {
    // Same precedence as the Results score: score (0–100), then composite_score (0–1), then network_score.
    const composite = finite(summary.stats?.composite_score);
    const score = finite(summary.stats?.score) ?? (composite !== null ? composite * 100 : null) ?? finite(summary.stats?.network_score);
    if (score !== null) return `score ${score.toFixed(1)}`;
    const azimuth = finite(run.details?.public_pareto_solutions?.[0]?.cell_configurations?.[0]?.optimal_azimuth);
    return azimuth !== null && runCellCount(run) === 1 ? `best azimuth ${Math.round(azimuth)}°` : "";
  }
  const averageRx = finite(summary.simulation?.avg_rx_dbm);
  return averageRx !== null ? `avg Rx ${averageRx.toFixed(1)} dBm` : "";
}

export function runTimeLabel(value) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function runTypeLabel(runType) {
  if (runType === "optimization") return "Optimization";
  if (runType === "simulation") return "Simulation";
  return runType ? String(runType).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Run";
}

export function readableRunLabel(run) {
  if (!run) return "";
  const cells = runCellCount(run);
  return [
    runTypeLabel(run.run_type),
    cells ? `${cells} ${cells === 1 ? "Cell" : "Cells"}` : "",
    run.status === "succeeded" || run.status === undefined ? runHeadlineMetric(run) : "",
    runTimeLabel(run.completed_at ?? run.created_at),
  ].filter(Boolean).join(" · ");
}
