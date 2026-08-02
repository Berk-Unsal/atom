import { Activity } from "lucide-react";
import { formatCompactNumber, formatMetric } from "../utils/appWorkspace.js";

export default function InterferenceResultsPanel({ analysis }) {
  const stats = analysis?.stats;
  if (!stats) {
    return (
      <section className="interference-card" aria-label="Interference and radio quality">
        <PanelTitle />
        <p className="empty-note">Select at least two 4G or 5G cells, then run Analyze Interference.</p>
      </section>
    );
  }
  return (
    <section className="interference-card" aria-label="Interference and radio quality">
      <PanelTitle />
      <div className="radio-quality-strip">
        <Datum label="Avg SINR" value={formatMetric(stats.avg_sinr_db, "dB")} />
        <Datum label="P10 SINR" value={formatMetric(stats.p10_sinr_db, "dB")} />
        <Datum label="Avg RSRP" value={formatMetric(stats.avg_rsrp_dbm, "dBm")} />
        <Datum label="Avg RSRQ" value={formatMetric(stats.avg_rsrq_db, "dB")} />
      </div>
      <div className="metric-list compact">
        <Metric label="Serviceable surface" value={formatMetric(stats.serviceable_pct, "%")} />
        <Metric label="Interference-limited" value={formatMetric(stats.interference_limited_pct, "%")} />
        <Metric label="No-signal samples" value={(stats.no_signal_count ?? 0).toLocaleString()} />
        <Metric label="Affected demand" value={formatCompactNumber(stats.affected_demand)} />
      </div>
      {(stats.per_serving_cell ?? []).length > 0 ? (
        <div className="radio-cell-list">
          {stats.per_serving_cell.map((cell) => (
            <span key={cell.cell_id}>
              <strong>{cell.cell_id}</strong>
              {cell.channel_id} · {formatMetric(cell.avg_sinr_db, "dB")} avg SINR
            </span>
          ))}
        </div>
      ) : null}
      <p className="data-note">Deterministic planning estimate, not a UE or protocol measurement.</p>
    </section>
  );
}

function PanelTitle() {
  return (
    <div className="panel-title">
      <Activity size={16} />
      <span>Interference &amp; Radio Quality</span>
    </div>
  );
}

function Datum({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function Metric({ label, value }) {
  return <div className="metric-row"><span>{label}</span><strong>{value}</strong></div>;
}
