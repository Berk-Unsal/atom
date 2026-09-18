import { Activity } from "lucide-react";
import { formatCompactNumber, formatMetric } from "../utils/appWorkspace.js";

export default function InterferenceResultsPanel({ analysis }) {
  const stats = analysis?.stats;
  const serviceableFraction = Number.isFinite(stats?.serviceable_fraction) ? formatMetric(stats.serviceable_fraction * 100, "%") : "—";
  const receiverThresholds = analysis?.model?.effective_cell_profiles ?? [];
  const receiverModes = [...new Set(receiverThresholds.map((profile) => profile.receiver_threshold?.mode).filter(Boolean))];
  const firstReceiverThreshold = receiverThresholds[0]?.receiver_threshold;
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
        <Datum label="Median SINR" value={formatMetric(stats.median_sinr_db, "dB")} />
        <Datum label="Avg RSRP" value={formatMetric(stats.avg_rsrp_dbm, "dBm")} />
        <Datum label="Avg RSRQ" value={formatMetric(stats.avg_rsrq_db, "dB")} />
      </div>
      <div className="metric-list compact">
        <Metric label="Serviceable surface" value={formatMetric(stats.serviceable_pct, "%")} />
        <Metric label="Serviceable of signal" value={serviceableFraction} />
        <Metric label="Interference-limited" value={formatMetric(stats.interference_limited_pct, "%")} />
        <Metric label="No-signal samples" value={(stats.no_signal_count ?? 0).toLocaleString()} />
        <Metric label="Affected demand" value={formatCompactNumber(stats.affected_demand)} />
        <Metric label="Receiver threshold" value={firstReceiverThreshold ? `${receiverModes.join(" / ")} · ${formatMetric(firstReceiverThreshold.sensitivity_dbm, "dBm")}` : "Per-cell"} />
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
      <p className="data-note">Serviceability is evaluated independently as RSRP ≥ {formatMetric(analysis.model?.rsrp_threshold_dbm, "dBm")}, SINR ≥ {formatMetric(analysis.model?.sinr_threshold_db, "dB")}, and RSRQ ≥ {formatMetric(analysis.model?.rsrq_threshold_db, "dB")}; these are not receiver sensitivity or building-service thresholds.</p>
      <p className="data-note">Carrier admission uses strict received power &gt; each cell&apos;s effective receiver threshold. The displayed per-RE thermal noise and interference terms remain separate from receiver sensitivity.</p>
      <p className="data-note">Power ledger basis: {analysis.model?.resource_basis ?? "one occupied frequency resource element"}; co-channel rule: {analysis.model?.co_channel_eligibility_rule ?? "exact configured channel"}. RSRP is a labeled planning conversion, not a UE measurement.</p>
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
