import { useId, useMemo, useRef, useState } from "react";
import { availableParetoAxes, defaultParetoAxes, PARETO_CHART_AXES, paretoKeyboardOrder, paretoScatterGeometry } from "../utils/paretoChart.js";

// Two-objective scatter of the retained Pareto frontier. Choosing a point inspects that solution; it never
// requests RF work. Identity never relies on color: Recommended is a diamond, Selected carries a ring, and both
// are labeled.

const AXIS_BY_ID = Object.fromEntries(PARETO_CHART_AXES.map((axis) => [axis.id, axis]));

function formatAxisValue(axisID, value) {
  if (value === null || value === undefined) return "—";
  return AXIS_BY_ID[axisID]?.unit === "%" ? `${value.toFixed(1)}%` : `${value.toFixed(1)} / 100`;
}

function formatTick(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function axisTitle(axisID) {
  const axis = AXIS_BY_ID[axisID];
  return `${axis.label} (${axis.better} is better)`;
}

export default function ParetoTradeoffChart({ onSelectSolution, radioQualityEvaluated = false, recommendedSolutionId, selectedSolutionId, solutions }) {
  const chartID = useId();
  const axes = useMemo(() => availableParetoAxes(solutions, radioQualityEvaluated), [radioQualityEvaluated, solutions]);
  const defaults = useMemo(() => defaultParetoAxes(solutions, axes), [axes, solutions]);
  const [axisChoice, setAxisChoice] = useState({ x: null, y: null });
  const [focusedID, setFocusedID] = useState(null);
  const pointRefs = useRef(new Map());
  const xAxis = axes.some((axis) => axis.id === axisChoice.x) ? axisChoice.x : defaults.x;
  const yAxis = axes.some((axis) => axis.id === axisChoice.y) ? axisChoice.y : defaults.y;
  const geometry = useMemo(() => paretoScatterGeometry(solutions, xAxis, yAxis), [solutions, xAxis, yAxis]);
  const order = useMemo(() => paretoKeyboardOrder(geometry.points), [geometry.points]);
  if (axes.length < 2 || geometry.points.length === 0) return null;

  const selectedID = String(selectedSolutionId ?? "");
  const recommendedID = String(recommendedSolutionId ?? "");
  const tabStopID = order.some((point) => point.id === focusedID) ? focusedID : order.find((point) => point.id === selectedID)?.id ?? order[0].id;
  const readoutPoint = order.find((point) => point.id === (focusedID ?? selectedID)) ?? null;
  const describe = (point) => {
    const roles = [point.id === recommendedID ? "recommended" : "", point.id === selectedID ? "selected" : ""].filter(Boolean);
    return `Solution #${point.rank}: ${AXIS_BY_ID[xAxis].label} ${formatAxisValue(xAxis, point.xValue)}, ${AXIS_BY_ID[yAxis].label} ${formatAxisValue(yAxis, point.yValue)}${roles.length ? `, ${roles.join(", ")}` : ""}`;
  };
  const moveFocus = (point, step) => {
    const index = order.findIndex((candidate) => candidate.id === point.id);
    const next = order[(index + step + order.length) % order.length];
    setFocusedID(next.id);
    pointRefs.current.get(next.id)?.focus();
  };
  const onPointKeyDown = (event, point) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectSolution(point.id);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(point, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(point, -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveFocus(order[event.key === "Home" ? 0 : order.length - 1], 0);
    }
  };
  const { padding, width, height } = geometry;
  const plotBottom = height - padding.bottom;

  return (
    <figure className="pareto-tradeoff-chart" aria-labelledby={`${chartID}-title`}>
      <figcaption id={`${chartID}-title`} className="pareto-tradeoff-title">Trade-off between two objectives</figcaption>
      <div className="pareto-tradeoff-axes">
        {[["x", "Horizontal axis", xAxis], ["y", "Vertical axis", yAxis]].map(([key, label, value]) => (
          <label key={key}>
            <span>{label}</span>
            <select value={value} onChange={(event) => setAxisChoice((current) => ({ ...current, [key]: event.target.value }))}>
              {axes.map((axis) => <option key={axis.id} value={axis.id}>{axis.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="pareto-tradeoff-plot" role="group" aria-label={`Pareto solutions plotted by ${AXIS_BY_ID[xAxis].label} and ${AXIS_BY_ID[yAxis].label}. Use arrow keys to move between solutions and Enter to inspect one.`}>
        <g className="pareto-tradeoff-grid" aria-hidden="true">
          {geometry.yTicks.map((tick) => (
            <g key={`y-${tick.value}`}>
              <line x1={padding.left} x2={width - padding.right} y1={tick.position} y2={tick.position} />
              <text x={padding.left - 6} y={tick.position} dy="0.32em" textAnchor="end">{formatTick(tick.value)}</text>
            </g>
          ))}
          {geometry.xTicks.map((tick) => (
            <text key={`x-${tick.value}`} x={tick.position} y={plotBottom + 14} textAnchor="middle">{formatTick(tick.value)}</text>
          ))}
          <line className="pareto-tradeoff-baseline" x1={padding.left} x2={width - padding.right} y1={plotBottom} y2={plotBottom} />
          <text className="pareto-tradeoff-axis-title" x={padding.left + (width - padding.left - padding.right) / 2} y={height - 6} textAnchor="middle">{axisTitle(xAxis)}</text>
          <text className="pareto-tradeoff-axis-title" x={12} y={padding.top + (plotBottom - padding.top) / 2} textAnchor="middle" transform={`rotate(-90 12 ${padding.top + (plotBottom - padding.top) / 2})`}>{axisTitle(yAxis)}</text>
        </g>
        {order.map((point) => {
          const isRecommended = point.id === recommendedID;
          const isSelected = point.id === selectedID;
          return (
            <g
              key={point.id}
              ref={(node) => { if (node) pointRefs.current.set(point.id, node); else pointRefs.current.delete(point.id); }}
              className={`pareto-tradeoff-point${isRecommended ? " recommended" : ""}${isSelected ? " selected" : ""}${point.id === focusedID ? " focused" : ""}`}
              role="button"
              tabIndex={point.id === tabStopID ? 0 : -1}
              aria-label={describe(point)}
              aria-pressed={isSelected}
              onClick={() => { setFocusedID(point.id); onSelectSolution(point.id); }}
              onFocus={() => setFocusedID(point.id)}
              onMouseEnter={() => setFocusedID(point.id)}
              onKeyDown={(event) => onPointKeyDown(event, point)}
            >
              <title>{describe(point)}</title>
              <circle className="pareto-tradeoff-hit" cx={point.x} cy={point.y} r="12" />
              {isSelected ? <circle className="pareto-tradeoff-ring" cx={point.x} cy={point.y} r="9" /> : null}
              {isRecommended
                ? <path className="pareto-tradeoff-mark" d={`M ${point.x} ${point.y - 6.5} L ${point.x + 6.5} ${point.y} L ${point.x} ${point.y + 6.5} L ${point.x - 6.5} ${point.y} Z`} />
                : <circle className="pareto-tradeoff-mark" cx={point.x} cy={point.y} r="4.5" />}
              {isRecommended || isSelected ? (
                // Labels flip to the left of points in the right half so they never leave the plot.
                <text className="pareto-tradeoff-label" x={point.x > width / 2 ? point.x - 11 : point.x + 11} y={point.y - 9} textAnchor={point.x > width / 2 ? "end" : "start"} aria-hidden="true">{isRecommended ? `#${point.rank} Recommended` : `#${point.rank} Selected`}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="pareto-tradeoff-readout" aria-live="polite">{readoutPoint ? describe(readoutPoint) : "Hover or focus a solution to read its values."}</p>
      <ul className="pareto-tradeoff-legend" aria-label="Chart legend">
        <li><span className="legend-mark recommended" aria-hidden="true" />Recommended</li>
        <li><span className="legend-mark selected" aria-hidden="true" />Selected (inspected)</li>
        <li><span className="legend-mark pareto" aria-hidden="true" />Other Pareto solution</li>
      </ul>
      {geometry.unplotted.length ? <p className="data-note">Not plotted on these axes (metric unavailable): {geometry.unplotted.map((point) => `#${point.rank}`).join(", ")}.</p> : null}
      <details className="pareto-tradeoff-table">
        <summary>Plotted solutions as a table</summary>
        <table>
          <caption className="visually-hidden">Pareto solutions by {AXIS_BY_ID[xAxis].label} and {AXIS_BY_ID[yAxis].label}</caption>
          <thead><tr><th scope="col">Solution</th><th scope="col">{AXIS_BY_ID[xAxis].label}</th><th scope="col">{AXIS_BY_ID[yAxis].label}</th><th scope="col">Role</th></tr></thead>
          <tbody>
            {[...geometry.points].sort((left, right) => left.rank - right.rank).map((point) => (
              <tr key={point.id}>
                <th scope="row">#{point.rank}</th>
                <td>{formatAxisValue(xAxis, point.xValue)}</td>
                <td>{formatAxisValue(yAxis, point.yValue)}</td>
                <td>{[point.id === recommendedID ? "Recommended" : "", point.id === selectedID ? "Selected" : ""].filter(Boolean).join(", ") || "Pareto"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
