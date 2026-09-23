import { PlayCircle, Server } from "lucide-react";
import ResearchReferenceBadge from "../../components/ResearchReferenceBadge.jsx";
import { formatCoreLabState, formatScenario, UNAVAILABLE_VALUE } from "../../utils/appWorkspace.js";

export default function CoreLabTool({ applicable, coreLab, enabled, scenarios, startCommand, towerIDs, onRunScenario, onToggle, onUse5G }) {
  return (
    <section className="core-tool" aria-label="5G Core Lab controls">
      <label className="core-toggle-row">
        <span>
          <strong>Core Lab overlay</strong>
          <small>{enabled ? "Path monitoring enabled" : "Optional local Open5GS integration"}</small>
        </span>
        <ResearchReferenceBadge label="Lab overlay" />
        <input
          type="checkbox"
          checked={enabled}
          disabled={!applicable}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </label>
      {!applicable ? (
        <div className="tool-readiness-state compact" role="note">
          <Server size={20} aria-hidden="true" />
          <div>
            <strong>5G mode required</strong>
            <p>Xn, N2, and N3 communication paths apply only to the 28 GHz 5G planning mode.</p>
          </div>
          <button type="button" onClick={onUse5G}>Use 5G mmWave</button>
        </div>
      ) : null}
      {applicable && !enabled ? (
        <div className="command-note">
          <span>Enable the overlay, then start the optional sidecar stack when live Core functions are needed.</span>
          <code>{startCommand}</code>
        </div>
      ) : null}
      <CoreLabPanel
        applicable={applicable}
        coreLab={coreLab}
        enabled={enabled}
        scenarios={scenarios}
        startCommand={startCommand}
        towerIDs={towerIDs}
        onRunScenario={onRunScenario}
      />
    </section>
  );
}

function CoreLabPanel({ applicable, coreLab, enabled, scenarios, startCommand, towerIDs, onRunScenario }) {
  if (!enabled && !coreLab?.status) {
    return null;
  }
  const status = coreLab?.status ?? {};
  const state = applicable ? status.state ?? "disabled" : "not_applicable";
  const functions = status.functions ?? [];
  const events = coreLab?.events?.events ?? [];
  const sessions = coreLab?.sessions?.sessions ?? [];
  const topology = coreLab?.topology ?? {};
  const routeDecisions = topology.route_decisions ?? [];
  const n3Edges = (topology.edges ?? []).filter((edge) => edge.interface === "N3");
  const activeScenario = coreLab?.scenario ?? status.scenario ?? "normal";
  const stateLabel = formatCoreLabState(state);

  return (
    <section className={`core-lab-card ${state}`} aria-label="5G Communication Path">
      <div className="panel-title">
        <Server size={16} />
        <span>5G Communication Path</span>
        <ResearchReferenceBadge label="Lab overlay" />
      </div>
      <div className="core-state-row">
        <span className={`core-state-pill ${state}`}>{stateLabel}</span>
        <span>{applicable ? status.source === "simulated_overlay" ? "Simulated overlay" : status.mode ?? "open5gs" : "4G/6G not applicable"}</span>
      </div>
      {!applicable ? (
        <div className="command-note">
          <span>5G Core AMF/SMF/UPF and Xn/N2/N3 paths apply only when 5G mmWave is selected.</span>
        </div>
      ) : null}
      {applicable && (state === "disabled" || state === "disconnected") ? (
        <div className="command-note">
          <span>{status.message ?? "Start the optional sidecar stack to connect Core Lab."}</span>
          <code>{startCommand}</code>
        </div>
      ) : null}
      {applicable && towerIDs.length > 0 ? (
        <div className="gnb-chip-list" aria-label="Virtual gNB mappings">
          {towerIDs.map((towerID) => (
            <span key={towerID}>gNB-{towerID}</span>
          ))}
        </div>
      ) : null}
      {applicable ? (
        <CommunicationPathSummary routeDecisions={routeDecisions} n3Edges={n3Edges} scenario={activeScenario} />
      ) : null}
      {functions.length > 0 ? (
        <div className="core-function-grid">
          {functions.map((fn) => (
            <div key={fn.name} className={`core-function ${fn.status}`}>
              <span>{fn.name}</span>
              <strong>{fn.status}</strong>
              <small>{fn.latency_ms ?? 0} ms · {fn.load_pct ?? 0}%</small>
            </div>
          ))}
        </div>
      ) : null}
      <div className="scenario-grid" aria-label="Core Lab scenarios">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={activeScenario === scenario.id ? "active" : ""}
            disabled={!applicable || !enabled || state === "disabled" || state === "disconnected" || coreLab?.isLoading}
            onClick={() => onRunScenario(scenario.id)}
          >
            <PlayCircle size={13} />
            <span>{scenario.label}</span>
          </button>
        ))}
      </div>
      <div className="core-session-strip">
        <MiniDatum label="Sessions" value={sessions.length.toLocaleString()} />
        <MiniDatum label="Scenario" value={formatScenario(activeScenario)} />
        <MiniDatum label="Events" value={events.length.toLocaleString()} />
      </div>
      {coreLab?.lastError ? <p className="core-error">{coreLab.lastError}</p> : null}
      {events.length > 0 ? (
        <div className="event-timeline">
          {events.slice(0, 5).map((event) => (
            <div key={event.id} className={`event-row ${event.severity}`}>
              <span>{event.stage}</span>
              <strong>{event.message}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CommunicationPathSummary({ routeDecisions, n3Edges, scenario }) {
  const hasRoutes = routeDecisions.length > 0;
  const fallbackCount = routeDecisions.filter((route) => route.route_type === "ng_fallback").length;
  const directCount = routeDecisions.filter((route) => route.route_type === "direct_xn").length;
  const n3Degraded = n3Edges.some((edge) => edge.status === "degraded" || edge.status === "down");
  return (
    <div className="communication-path-summary" aria-label="Communication path summary">
      <MiniDatum label="Xn paths" value={hasRoutes ? directCount.toLocaleString() : UNAVAILABLE_VALUE} />
      <MiniDatum label="N2 fallback" value={hasRoutes ? fallbackCount.toLocaleString() : UNAVAILABLE_VALUE} />
      <MiniDatum label="N3 user plane" value={n3Degraded ? "Degraded" : n3Edges.length > 0 ? "Active" : UNAVAILABLE_VALUE} />
      {routeDecisions.slice(0, 3).map((route) => (
        <div key={`${route.from}-${route.to}`} className={`path-route-row ${route.route_type}`}>
          <span>{route.interface ?? route.route_type}</span>
          <strong>{route.from} to {route.to}</strong>
          <small>{route.reason ?? formatScenario(scenario)}</small>
        </div>
      ))}
    </div>
  );
}

function MiniDatum({ label, value }) {
  return (
    <span className="mini-datum">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
