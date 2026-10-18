import { useState } from "react";
import { compareSources, defaultComparisonPair } from "../utils/comparisonSources.js";
import { ToolEmptyState } from "./ToolPrimitives.jsx";
import { COMPARISON_CLASSES, comparisonOutline } from "../utils/spatialComparison.js";

// Results → Compare: pick any two retained states. Selecting sources never starts RF work.

export default function ResultCompareView({ baselinePairView = null, onRunSpatialComparison, onShowSource, sources, spatialComparisonFor }) {
  const [selection, setSelection] = useState({ a: null, b: null });
  if (sources.length < 2) {
    return (
      <ToolEmptyState
        title="Two states needed to compare"
        description="Run an optimization, or save two Versions from the project menu, to compare reproducible KPI deltas and input differences."
      />
    );
  }
  const [defaultA, defaultB] = defaultComparisonPair(sources);
  const exists = (id) => sources.some((source) => source.id === id);
  const aID = exists(selection.a) ? selection.a : defaultA;
  const bID = exists(selection.b) ? selection.b : defaultB;
  const first = sources.find((source) => source.id === aID);
  const second = sources.find((source) => source.id === bID);
  const isBaselinePair = aID === "baseline" && bID === "recommended";
  const result = isBaselinePair ? null : compareSources(first, second);
  const groups = [...new Set(sources.map((source) => source.group))];

  return (
    <section className="scenario-comparison result-compare" aria-label="Compare two states">
      <div className="scenario-selectors result-compare-pickers">
        {[["a", "A", aID], ["b", "B", bID]].map(([key, label, value]) => (
          <label key={key}>
            <span>State {label}</span>
            <select aria-label={`Compare state ${label}`} value={value} onChange={(event) => setSelection((current) => ({ ...current, [key]: event.target.value }))}>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {sources.filter((source) => source.group === group).map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ))}
      </div>

      {isBaselinePair ? baselinePairView : null}

      {result && !result.compatible ? (
        <p className="result-compare-incompatible" role="status"><strong>Not comparable.</strong> {result.incompatibility}</p>
      ) : null}

      {result?.compatible ? (
        <>
          {aID === bID ? <p className="data-note">A and B are the same state; choose a different source to see differences.</p> : null}
          {result.metrics.length ? (
            <div className="scenario-delta-table" role="table" aria-label="KPI deltas">
              <div role="row" className="result-compare-head"><span role="columnheader">KPI</span><strong role="columnheader">A</strong><strong role="columnheader">B</strong><em role="columnheader">B − A</em></div>
              {result.metrics.map((metric) => (
                <div role="row" key={metric.key}>
                  <span role="rowheader">{metric.label}</span>
                  <strong role="cell">{formatValue(metric.a, metric.unit)}</strong>
                  <strong role="cell">{formatValue(metric.b, metric.unit)}</strong>
                  <em role="cell">{metric.delta === null ? "—" : `${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(1)}${metric.unit ? ` ${metric.unit}` : ""}`}</em>
                </div>
              ))}
            </div>
          ) : <p className="data-note">Neither state retained KPI summaries. Run the plan, then save a Version, to retain them.</p>}
          {[first, second].filter((source) => !source.summary).map((source) => (
            <p className="data-note" key={source.id}>KPIs were not retained for {source.label}.</p>
          ))}
        </>
      ) : null}

      {!isBaselinePair ? (
        <section className="scenario-compare-result" aria-label="Input differences">
          {result?.diff ? (
            <>
              <strong>{result.diff.changed ? `${result.diff.changed_fields.length} input difference${result.diff.changed_fields.length === 1 ? "" : "s"}` : "Identical input state"}</strong>
              {result.diff.changed ? (
                <ul className="scenario-compare-list">
                  {result.diff.sections.filter((section) => section.changed).map((section) => (
                    <li key={section.id}>{section.label}: {section.items.map((item) => item.label).join(", ")}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : <p className="data-note">Input differences are shown between saved Versions and the current plan.</p>}
        </section>
      ) : null}

      {spatialComparisonFor && result?.compatible !== false ? (
        <SpatialComparisonSection first={first} second={second} pair={spatialComparisonFor(first, second)} onRun={() => onRunSpatialComparison?.(first, second)} />
      ) : null}

      <div className="scenario-map-switch">
        {[["A", first], ["B", second]].map(([label, source]) => (
          <button key={label} type="button" onClick={() => onShowSource?.(source)} disabled={!canShow(source)} title={canShow(source) ? undefined : "This state has no map layers to show"}>
            Show {label}
          </button>
        ))}
      </div>
      <p className="data-note">Show restores a saved Version or the selected Pareto solution on the map; it never starts an RF request.</p>
    </section>
  );
}

function canShow(source) {
  return ["version", "recommended", "alternative"].includes(source?.kind);
}

function formatValue(value, unit) {
  return value === null ? "—" : `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function ClassSwatch({ item }) {
  return (
    <svg className="spatial-swatch" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill={item.color} fillOpacity={item.fillOpacity} stroke={item.fillOpacity < 0.5 ? item.color : "currentColor"} strokeWidth={comparisonOutline(item).width} strokeDasharray={item.dashArray ?? undefined} />
    </svg>
  );
}

function SpatialComparisonSection({ first, second, onRun, pair }) {
  const result = pair.result;
  const aggregates = result?.aggregates;
  return (
    <section className="spatial-comparison" aria-label="Where the plans differ">
      <strong>Where the plans differ</strong>
      {!pair.available ? <p className="data-note">{pair.reason}</p> : (
        <>
          <button type="button" className="selection-map-action" onClick={onRun} disabled={pair.loading}>
            {pair.loading ? "Comparing on the server…" : result ? "Compare again" : "Show where they differ"}
          </button>
          <p className="data-note">Evaluates both plans once on the active dataset and model (one RF request) and marks demand buildings newly served or lost and buildings whose overlap changed. The map layer shows while Compare is open.</p>
        </>
      )}
      {pair.error ? <p className="spatial-comparison-error" role="alert">{pair.error}</p> : null}
      {result ? (
        <>
          <table className="spatial-comparison-counts" aria-label="Changed buildings by class">
            <thead><tr><th scope="col">Change (A → B)</th><th scope="col">Buildings</th></tr></thead>
            <tbody>
              {COMPARISON_CLASSES.map((item) => (
                <tr key={item.id}><th scope="row"><ClassSwatch item={item} /> {item.label}</th><td>{result.counts?.[item.id] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
          {aggregates ? (
            <p className="data-note">
              Demand buildings served: {aggregates.unique_demand_buildings_a} in A ({first.label}), {aggregates.unique_demand_buildings_b} in B ({second.label}).
              {" "}Overlap buildings: {aggregates.overlap_buildings_a} → {aggregates.overlap_buildings_b}. These differences equal newly served − newly lost and overlap gained − overlap removed.
            </p>
          ) : null}
          {result.buildings_truncated ? <p className="data-note">The map shows the first {result.buildings.length} changed buildings by ID; the counts above are complete.</p> : null}
        </>
      ) : null}
    </section>
  );
}
