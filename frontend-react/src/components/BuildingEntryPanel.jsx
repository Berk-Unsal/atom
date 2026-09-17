import { AlertTriangle, Building2, CheckCircle2, PlayCircle } from "lucide-react";

const EMPTY = "—";

function number(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : EMPTY;
}

function serviceCount(value, total) {
  return `${Number(value ?? 0).toLocaleString()} / ${Number(total ?? 0).toLocaleString()}`;
}

function serviceLabel(value) {
  if (value === true) return "Serviceable";
  if (value === false) return "Below threshold";
  return "Unavailable";
}

export default function BuildingEntryPanel({
  analysis,
  disabled = false,
  disabledReason = "Select a cell to run a building-entry estimate.",
  isCurrent = false,
  isLoading = false,
  onRun,
}) {
  const summary = analysis?.summary;
  const selected = analysis?.results?.[0] ?? null;
  const isUnsupported = analysis && !analysis.applicability?.applicable;
  const hasResults = Boolean(analysis?.results?.length);

  return (
    <section className="building-entry-panel" aria-label="Building entry analysis">
      <div className="panel-title">
        <Building2 size={16} />
        <span>Building entry</span>
      </div>
      <p className="empty-note">
        Estimate service just inside a representative facade point. This is an entry scenario, not indoor or whole-building coverage.
      </p>
      <button
        type="button"
        className="panel-primary-action"
        disabled={disabled || isLoading || isCurrent}
        onClick={onRun}
      >
        <PlayCircle size={15} />
        <span>{isLoading ? "Analyzing…" : isCurrent ? "Estimate is current" : analysis ? "Refresh estimate" : "Run building-entry estimate"}</span>
      </button>
      {disabled ? <p className="panel-help">{disabledReason}</p> : null}

      {isUnsupported ? (
        <div className="building-entry-status warning" role="status">
          <AlertTriangle size={16} />
          <div>
            <strong>Not available for this plan</strong>
            <span>{analysis.applicability?.detail ?? "Concept 4E supports 2.6 GHz and 28 GHz only."}</span>
          </div>
        </div>
      ) : null}

      {summary && analysis?.applicability?.applicable ? (
        <>
          <div className="building-entry-metrics" aria-label="Building entry summary">
            <div><span>Analyzed buildings</span><strong>{summary.relevant_buildings?.toLocaleString() ?? 0}</strong></div>
            <div><span>Residential buildings</span><strong>{summary.relevant_residential_buildings?.toLocaleString() ?? 0}</strong></div>
            <div><span>Valid facade estimates</span><strong>{serviceCount(summary.evaluated_buildings, summary.relevant_buildings)}</strong></div>
            <div><span>Outdoor service · all buildings</span><strong>{serviceCount(summary.outdoor_serviceable_buildings, summary.relevant_buildings)}</strong></div>
            <div><span>Low-loss entry · all buildings</span><strong>{serviceCount(summary.low_loss_serviceable_buildings, summary.relevant_buildings)}</strong></div>
            <div><span>High-loss entry · all buildings</span><strong>{serviceCount(summary.high_loss_serviceable_buildings, summary.relevant_buildings)}</strong></div>
          </div>
          <p className="building-entry-note">
            Service rows use the analyzed-building domain as their denominator; residential buildings are a subset. Buildings without a valid facade estimate remain outside the numerator. Low-loss / high-loss values are standardized planning scenarios. Material metadata is evidence only; it does not choose a profile.
          </p>
        </>
      ) : null}

      {!analysis ? (
        <div className="building-entry-empty">
          <Building2 size={18} />
          <span>Run once to evaluate all relevant buildings in one batched request.</span>
        </div>
      ) : null}

      {hasResults && selected ? (
        <div className="building-entry-detail">
          <div className="panel-title compact">
            <CheckCircle2 size={15} />
            <span>Representative building</span>
          </div>
          <dl className="building-entry-detail-grid">
            <div><dt>Building</dt><dd>{selected.building_id}</dd></div>
            <div><dt>Serving cell</dt><dd>{selected.serving_cell_id || EMPTY}</dd></div>
            <div><dt>Outdoor facade Rx</dt><dd>{selected.outdoor_rx_at_facade_dbm === undefined ? EMPTY : `${number(selected.outdoor_rx_at_facade_dbm)} dBm`}</dd></div>
            <div><dt>Low-loss entry</dt><dd>{selected.low_loss_rx_just_inside_dbm === undefined ? EMPTY : `${number(selected.low_loss_rx_just_inside_dbm)} dBm · ${serviceLabel(selected.low_loss_serviceable)}`}</dd></div>
            <div><dt>High-loss entry</dt><dd>{selected.high_loss_rx_just_inside_dbm === undefined ? EMPTY : `${number(selected.high_loss_rx_just_inside_dbm)} dBm · ${serviceLabel(selected.high_loss_serviceable)}`}</dd></div>
            <div><dt>Receiver threshold</dt><dd>{selected.receiver_sensitivity_dbm === undefined ? EMPTY : `${number(selected.receiver_sensitivity_dbm)} dBm`}</dd></div>
            <div><dt>Material evidence</dt><dd>{selected.material_evidence?.available ? `${selected.material_evidence.source}: ${selected.material_evidence.value}` : "Unavailable"}</dd></div>
            <div><dt>Entry point</dt><dd>{selected.facade_entry_point ? `${number(selected.facade_entry_point.lat, 5)}, ${number(selected.facade_entry_point.lon, 5)}` : EMPTY}</dd></div>
          </dl>
          <p className="building-entry-limitations">
            Estimated at the representative facade and configured receiver height; no room, floor, interior-wall, or whole-building claim is made.
          </p>
        </div>
      ) : null}

      {analysis?.diagnostics ? (
        <p className="building-entry-diagnostics">
          {summary?.relevant_buildings?.toLocaleString() ?? analysis.diagnostics.buildings_evaluated?.toLocaleString() ?? 0} relevant buildings · {summary?.evaluated_buildings?.toLocaleString() ?? 0} valid facade estimates · {analysis.diagnostics.candidate_cell_links?.toLocaleString() ?? 0} candidate cell links · {number(analysis.diagnostics.elapsed_ms, 0)} ms · one HTTP request
        </p>
      ) : null}
    </section>
  );
}
