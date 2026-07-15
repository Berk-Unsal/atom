import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Eraser,
  Layers3,
  LocateFixed,
  MousePointer2,
  Play,
  X,
} from "lucide-react";
import { WORKSPACE_TOOLS } from "./workspaceTools.js";

export function CommandBar({
  appIconUrl,
  contextLabel,
  error,
  isBusy,
  networkTech,
  onDismissError,
  onOpenResults,
  onRun,
  planSummary,
  primaryActionLabel,
  primaryDisabled,
  resultSummary,
  runState,
}) {
  return (
    <>
      <header className="command-bar">
        <div className="command-brand">
          <img src={appIconUrl} alt="" />
          <span>
            <strong>A.T.O.M</strong>
            <small>Ankara Telecom Optimization Model</small>
          </span>
        </div>

        <div className="command-context" aria-label="Active planning context">
          <span className="context-primary">{contextLabel}</span>
          <span className="context-divider" aria-hidden="true" />
          <span>{networkTech}</span>
          <span className="plan-summary">{planSummary}</span>
        </div>

        <div className="command-actions">
          {resultSummary ? (
            <button
              type="button"
              className="result-summary-button"
              onClick={onOpenResults}
              aria-label={`Open ${resultSummary.label} results`}
            >
              <span>{resultSummary.label}</span>
              <strong>{resultSummary.primary}</strong>
              <small>{resultSummary.secondary}</small>
            </button>
          ) : null}
          <span className={`run-state ${isBusy ? "busy" : "ready"}`}>
            <i aria-hidden="true" />
            {runState}
          </span>
          <button
            type="button"
            className="command-run-button"
            onClick={onRun}
            disabled={primaryDisabled}
          >
            <Play size={15} fill="currentColor" />
            <span>{primaryActionLabel}</span>
          </button>
        </div>
      </header>
      {error ? (
        <div className="global-error-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={onDismissError} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      ) : null}
    </>
  );
}

export function WorkflowRail({ activeTool, drawerMode, drawerOpen, onSelectTool, toolState }) {
  return (
    <nav className="workflow-rail" aria-label="Workspace tools">
      {WORKSPACE_TOOLS.map((tool, index) => {
        const Icon = tool.icon;
        const state = toolState?.[tool.id] ?? {};
        const isActive = drawerMode === "tool" && drawerOpen && activeTool === tool.id;
        const showDivider = index > 0 && WORKSPACE_TOOLS[index - 1].group !== tool.group;
        return (
          <div className={showDivider ? "rail-item rail-item-divider" : "rail-item"} key={tool.id}>
            <button
              id={`workspace-tool-${tool.id}`}
              type="button"
              className={isActive ? "active" : ""}
              disabled={state.disabled}
              onClick={() => onSelectTool(tool.id)}
              aria-label={tool.label}
              aria-current={isActive ? "page" : undefined}
              aria-expanded={isActive}
              title={state.reason ?? tool.label}
            >
              <Icon size={19} />
              {state.badge ? <span className={`rail-badge ${state.tone ?? "neutral"}`}>{state.badge}</span> : null}
              <span className="rail-tooltip" role="tooltip">{state.reason ?? tool.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export function ToolDrawer({
  children,
  drawerMode,
  error,
  footer,
  focusKey,
  icon: Icon,
  onBack,
  onClose,
  open,
  subtitle,
  title,
}) {
  const headingRef = useRef(null);

  useEffect(() => {
    if (open) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [focusKey, open]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      open
      className={`tool-drawer ${drawerMode === "inspector" ? "inspector-mode" : ""}`}
      aria-modal="false"
      aria-labelledby="tool-drawer-title"
    >
      <header className="tool-drawer-header">
        {drawerMode === "inspector" ? (
          <button type="button" className="drawer-icon-button" onClick={onBack} aria-label="Back to previous tool">
            <ChevronLeft size={18} />
          </button>
        ) : Icon ? (
          <span className="drawer-tool-icon" aria-hidden="true"><Icon size={18} /></span>
        ) : null}
        <div>
          <h2 id="tool-drawer-title" ref={headingRef} tabIndex={-1}>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="drawer-icon-button drawer-close" onClick={onClose} aria-label="Close tool drawer">
          <X size={18} />
        </button>
      </header>
      <div className="tool-drawer-body">
        {error ? <div className="drawer-error" role="alert">{error}</div> : null}
        {children}
      </div>
      {footer ? <footer className="tool-drawer-footer">{footer}</footer> : null}
    </dialog>
  );
}

export function MapToolbar({
  hasInterferenceData,
  interferenceMetric,
  isDrawingSelection,
  layerMenuOpen,
  layerVisibility,
  onCancelAreaSelection,
  onClearNetworkSelection,
  onDrawArea,
  onFinishAreaSelection,
  onFitSelectedCells,
  onInterferenceMetricChange,
  onLayerMenuToggle,
  onToggleLayer,
  planningMode,
  selectionCanFinish,
  selectedCount,
}) {
  const layerMenuRef = useRef(null);
  const layers = [
    { id: "rays", label: "Propagation rays" },
    { id: "gaps", label: "Coverage gaps" },
    { id: "selectedCells", label: "Selected cells" },
    { id: "communicationPaths", label: "Communication paths" },
    { id: "interference", label: "Interference surface" },
  ];

  useEffect(() => {
    if (!layerMenuOpen) {
      return undefined;
    }
    const handlePointerDown = (event) => {
      if (!layerMenuRef.current?.contains(event.target)) {
        onLayerMenuToggle(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [layerMenuOpen, onLayerMenuToggle]);

  return (
    <div className="focused-map-toolbar" aria-label="Map tools">
      <div className="spatial-tools">
        <button
          type="button"
          className={isDrawingSelection ? "active" : ""}
          onClick={onDrawArea}
          aria-label="Draw selection area"
          title="Draw selection area"
        >
          <MousePointer2 size={17} />
        </button>
        {isDrawingSelection ? (
          <>
            <button type="button" onClick={onFinishAreaSelection} disabled={!selectionCanFinish}>Finish</button>
            <button type="button" onClick={onCancelAreaSelection}>Cancel</button>
          </>
        ) : (
          <button
            type="button"
            onClick={onClearNetworkSelection}
            disabled={selectedCount === 0}
            aria-label="Clear selected cells"
            title="Clear selected cells"
          >
            <Eraser size={17} />
          </button>
        )}
        <button
          type="button"
          onClick={onFitSelectedCells}
          disabled={selectedCount === 0 && planningMode !== "single"}
          aria-label="Fit selected cells"
          title="Fit selected cells"
        >
          <LocateFixed size={17} />
        </button>
      </div>

      <div className="map-display-tools">
        {hasInterferenceData ? (
          <div className="metric-switch" aria-label="Interference metric">
            {["sinr", "rsrp", "rsrq"].map((metric) => (
              <button
                key={metric}
                type="button"
                className={interferenceMetric === metric ? "active" : ""}
                aria-pressed={interferenceMetric === metric}
                onClick={() => onInterferenceMetricChange(metric)}
              >
                {metric.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
        <div className="layer-menu-wrap" ref={layerMenuRef}>
          <button
            type="button"
            className={layerMenuOpen ? "active layers-trigger" : "layers-trigger"}
            aria-expanded={layerMenuOpen}
            aria-haspopup="menu"
            onClick={() => onLayerMenuToggle(!layerMenuOpen)}
          >
            <Layers3 size={17} />
            <span>Layers</span>
            <ChevronDown size={14} />
          </button>
          {layerMenuOpen ? (
            <div className="layer-menu" role="menu" aria-label="Map layer visibility">
              {layers.map((layer) => (
                <label key={layer.id}>
                  <input
                    type="checkbox"
                    checked={layerVisibility[layer.id]}
                    onChange={() => onToggleLayer(layer.id)}
                  />
                  <span>{layer.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function InterferenceLegend({ collapsed, metric, onToggle }) {
  const legends = {
    sinr: ["< 0", "0–13", "13–20", "≥ 20 dB"],
    rsrp: ["< -100", "-100–-90", "-90–-80", "≥ -80 dBm"],
    rsrq: ["< -20", "-20–-15", "-15–-10", "≥ -10 dB"],
  };
  return (
    <div className={`focused-interference-legend ${collapsed ? "collapsed" : ""}`} aria-label={`${metric.toUpperCase()} quality legend`}>
      <button type="button" onClick={onToggle} aria-expanded={!collapsed}>
        <strong>{metric.toUpperCase()}</strong>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {collapsed ? null : (
        <div>
          {(legends[metric] ?? legends.sinr).map((label, index) => (
            <span key={label}>
              <i className={`quality-swatch quality-${index}`} aria-hidden="true" />
              {label}
            </span>
          ))}
          <span><i className="quality-swatch no-signal" aria-hidden="true" />No signal</span>
        </div>
      )}
    </div>
  );
}
