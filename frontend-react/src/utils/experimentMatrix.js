import { buildSimulationPayload } from "./requestPayloads.js";
import { formatNumber } from "./appWorkspace.js";

export const EXPERIMENT_MATRIX_FIELDS = [
  ["frequencies_ghz", "Frequency", "GHz"],
  ["tx_powers_dbm", "Power", "dBm"],
  ["beam_widths_deg", "Beam width", "°"],
  ["azimuths_deg", "Azimuth", "°"],
  ["calibration_offsets_db", "Calibration", "dB"],
];

export function buildExperimentDefinition(name, selectedTower, settings, matrixText) {
  const base = buildSimulationPayload(selectedTower, settings);
  const matrix = Object.fromEntries(EXPERIMENT_MATRIX_FIELDS.map(([key]) => [key, parseNumberList(matrixText[key], key)]).filter(([, values]) => values.length));
  return { name: String(name || "Planning matrix").trim(), base, matrix };
}

export function paretoGeometry(runs) {
  if (!runs.length) return { points: [] };
  const gaps = runs.map((run) => Number(run.gap_pct));
  const powers = runs.map((run) => Number(run.avg_rx_dbm));
  const minGap = Math.min(...gaps), maxGap = Math.max(...gaps);
  const minPower = Math.min(...powers), maxPower = Math.max(...powers);
  return { points: runs.map((run) => ({
    key: run.fingerprint,
    x: 46 + ((Number(run.gap_pct) - minGap) / Math.max(maxGap - minGap, 1)) * 556,
    y: 210 - ((Number(run.avg_rx_dbm) - minPower) / Math.max(maxPower - minPower, 1)) * 194,
    nonDominated: Boolean(run.non_dominated),
    label: `${formatNumber(run.parameters?.frequency_ghz, 1)} GHz · ${formatNumber(run.avg_rx_dbm, 1)} dBm · ${formatNumber(run.gap_pct, 1)}% gaps`,
  })) };
}

function parseNumberList(value, label) {
  if (!String(value ?? "").trim()) return [];
  const values = String(value).split(",").map((item) => Number(item.trim()));
  if (values.some((item) => !Number.isFinite(item))) throw new Error(`${label.replaceAll("_", " ")} contains an invalid number`);
  return [...new Set(values)];
}
