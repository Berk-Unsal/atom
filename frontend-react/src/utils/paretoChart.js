// Geometry for the network Pareto trade-off scatter. Values come only from retained solution metrics.

export const PARETO_CHART_AXES = Object.freeze([
  { id: "demand", label: "Demand", unit: "%", better: "higher" },
  { id: "residential", label: "Residential", unit: "%", better: "higher" },
  { id: "propagation_reach", label: "Propagation reach", unit: "%", better: "higher" },
  { id: "overlap", label: "Overlap", unit: "%", better: "lower" },
  { id: "radio_quality", label: "Radio quality", unit: "%", better: "higher" },
  { id: "score", label: "Optimization score", unit: "/ 100", better: "higher" },
]);

export function readOptimizationRawMetric(raw, ...keys) {
  for (const key of keys) {
    const value = raw?.[key];
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** An objective as a 0–1 fraction (overlap as the overlap ratio), or null when unavailable. */
export function paretoObjectiveValue(stats, id) {
  const objectiveID = id === "propagation_reach" ? "coverage" : id;
  const objectiveStatus = stats?.objective_status ?? stats?.objectiveStatus ?? {};
  if (objectiveStatus?.[objectiveID]?.available === false) return null;
  const utilities = stats?.objectives ?? stats?.objectives_normalized ?? {};
  const raw = stats?.raw_metrics ?? stats?.rawMetrics ?? {};
  if (id === "overlap") {
    const rawRatio = readOptimizationRawMetric(raw, "overlap_ratio", "overlapRatio");
    if (rawRatio !== undefined) return rawRatio;
    const utility = finite(utilities.overlap);
    return utility === null ? null : 1 - utility;
  }
  if (id === "radio_quality") {
    const rawFraction = readOptimizationRawMetric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
    if (rawFraction !== undefined) return rawFraction;
  }
  return finite(utilities[objectiveID]);
}

/** The value plotted on an axis: percentages for objectives, 0–100 for the optimization score. */
export function paretoAxisValue(solution, axisID) {
  if (axisID === "score") {
    const score = finite(solution?.stats?.score ?? solution?.score);
    if (score !== null) return score;
    const composite = finite(solution?.stats?.composite_score);
    return composite === null ? null : composite * 100;
  }
  const fraction = paretoObjectiveValue(solution?.stats, axisID);
  return fraction === null ? null : fraction * 100;
}

/** Axes with at least one plotted value; radio quality only when every solution evaluated it. */
export function availableParetoAxes(solutions, radioQualityEvaluated = false) {
  return PARETO_CHART_AXES.filter((axis) => (axis.id !== "radio_quality" || radioQualityEvaluated)
    && solutions.some((solution) => paretoAxisValue(solution, axis.id) !== null));
}

/** Default axes: the two objectives with the widest spread, so near-identical metrics do not collapse the chart. */
export function defaultParetoAxes(solutions, axes) {
  const objectives = axes.filter((axis) => axis.id !== "score");
  const spread = (axis) => {
    const values = solutions.map((solution) => paretoAxisValue(solution, axis.id)).filter((value) => value !== null);
    return values.length ? Math.max(...values) - Math.min(...values) : -1;
  };
  const ranked = [...objectives].sort((left, right) => spread(right) - spread(left) || axes.indexOf(left) - axes.indexOf(right));
  const x = ranked[0]?.id ?? axes[0]?.id ?? "score";
  const y = ranked[1]?.id ?? axes.find((axis) => axis.id !== x)?.id ?? x;
  return { x, y };
}

function niceStep(range, count) {
  const raw = range / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Domain padded and snapped to round tick steps, so ticks read 50, 55, 60 rather than 48.1, 54.9. */
function niceDomain(values, count = 4) {
  if (!values.length) return { domain: [0, 1], step: 0.25 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = max - min < 1e-9 ? Math.max(Math.abs(max) * 0.05, 0.5) : (max - min) * 0.08;
  min -= pad;
  max += pad;
  const step = niceStep(max - min, count);
  return { domain: [Math.floor(min / step) * step, Math.ceil(max / step) * step], step };
}

function ticks({ domain: [min, max], step }) {
  const values = [];
  for (let value = min; value <= max + step / 2; value += step) values.push(Number(value.toFixed(6)));
  return values;
}

/** Points in SVG space plus the solutions that could not be plotted on these axes. */
export function paretoScatterGeometry(solutions, xAxis, yAxis, { width = 320, height = 220, padding = { top: 14, right: 14, bottom: 40, left: 46 } } = {}) {
  const plotted = [];
  const unplotted = [];
  solutions.forEach((solution, index) => {
    const x = paretoAxisValue(solution, xAxis);
    const y = paretoAxisValue(solution, yAxis);
    if (x === null || y === null) unplotted.push({ id: String(solution.id), rank: index + 1 });
    else plotted.push({ id: String(solution.id), rank: index + 1, xValue: x, yValue: y });
  });
  const xScale = niceDomain(plotted.map((point) => point.xValue));
  const yScale = niceDomain(plotted.map((point) => point.yValue));
  const xDomain = xScale.domain;
  const yDomain = yScale.domain;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const scaleX = (value) => padding.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth;
  const scaleY = (value) => padding.top + innerHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;
  return {
    width,
    height,
    padding,
    points: plotted.map((point) => ({ ...point, x: scaleX(point.xValue), y: scaleY(point.yValue) })),
    unplotted,
    xTicks: ticks(xScale).map((value) => ({ value, position: scaleX(value) })),
    yTicks: ticks(yScale).map((value) => ({ value, position: scaleY(value) })),
  };
}

/** Keyboard order for the scatter: left to right, then top to bottom. */
export function paretoKeyboardOrder(points) {
  return [...points].sort((left, right) => left.x - right.x || left.y - right.y || left.rank - right.rank);
}
