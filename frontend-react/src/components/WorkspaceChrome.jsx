import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Eraser,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Save,
  Trash2,
  Upload,
  Layers3,
  LocateFixed,
  MousePointer2,
  Play,
  X,
} from "lucide-react";
import { WORKSPACE_TOOLS } from "./workspaceTools.js";
import { MAX_PROJECT_FILE_BYTES } from "../utils/projectStore.js";

export function CommandBar({
  appIconUrl,
  contextLabel,
  error,
  networkTech,
  onDismissError,
  onOpenResults,
  onRun,
  planSummary,
  projectControl,
  primaryActionLabel,
  primaryDisabled,
  resultSummary,
  runState,
  statusTone = "ready",
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
          {projectControl}
          <span className="context-primary">{contextLabel}</span>
          <span className="context-divider" aria-hidden="true" />
          <span>{networkTech}</span>
          <span className="plan-summary">{planSummary}</span>
        </div>

        <div className="command-actions">
          <a
            className="planning-estimate-link"
            href="https://github.com/Berk-Unsal/urban-ray-tracer/blob/main/docs/modeling-limits.md"
            target="_blank"
            rel="noreferrer"
            title="Open deterministic model limitations"
          >
            Planning estimate
          </a>
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
          <span className={`run-state ${statusTone}`}>
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

export function ProjectMenu({
  activeProject,
  compatible,
  exportContent,
  onAddProject,
  onDeleteProject,
  onDeleteScenario,
  onDuplicateProject,
  onImportProject,
  onOpenScenario,
  onRenameProject,
  onSaveScenario,
  onSelectProject,
  projects,
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(activeProject?.name ?? "");
  const [message, setMessage] = useState("");
  const [savingScenario, setSavingScenario] = useState(false);
  const rootRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) {
        throw new Error(`Project file must be no larger than ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)} MiB`);
      }
      onImportProject(await file.text());
      setMessage("Project imported");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const downloadProject = () => {
    try {
      const blob = new Blob([exportContent()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slug(activeProject?.name ?? "atom-project")}.atom-project.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Project exported");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveScenario = async () => {
    setSavingScenario(true);
    setMessage("Saving scenario…");
    try {
      await onSaveScenario();
      setMessage("Scenario saved");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingScenario(false);
    }
  };

  return (
    <div className="project-menu-wrap" ref={rootRef}>
      <button
        type="button"
        className="project-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Open project menu"
      >
        <FolderOpen size={15} />
        <span>{activeProject?.name ?? "Project"}</span>
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div className="project-menu" role="dialog" aria-label="Project and scenarios">
          <label>
            <span>Project</span>
            <select value={activeProject?.id ?? ""} onChange={(event) => onSelectProject(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <div className="project-rename-row">
            <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Project name" />
            <button type="button" onClick={() => onRenameProject(name)} title="Rename project"><Save size={15} /></button>
          </div>
          {!compatible ? <p className="project-warning"><AlertTriangle size={14} /> Dataset differs from this project.</p> : null}
          <div className="project-menu-actions">
            <button type="button" onClick={onAddProject}><FilePlus2 size={14} /> New</button>
            <button type="button" onClick={onDuplicateProject}><Copy size={14} /> Duplicate</button>
            <button type="button" onClick={onDeleteProject} disabled={projects.length < 2}><Trash2 size={14} /> Delete</button>
          </div>
          <div className="project-menu-actions">
            <button type="button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</button>
            <button type="button" onClick={downloadProject}><Download size={14} /> Export</button>
            <input ref={fileRef} hidden type="file" accept=".json,.atom-project.json" onChange={importFile} />
          </div>
          <div className="scenario-menu-header">
            <strong>Scenarios</strong>
            <button type="button" onClick={saveScenario} disabled={savingScenario}>
              <Save size={14} /> {savingScenario ? "Saving…" : "Save current"}
            </button>
          </div>
          <div className="scenario-menu-list">
            {(activeProject?.scenarios ?? []).length ? activeProject.scenarios.map((scenario) => (
              <div key={scenario.id}>
                <button type="button" onClick={() => onOpenScenario(scenario)}>
                  <span>{scenario.name}</span>
                  <small>{new Date(scenario.updatedAt).toLocaleString()}</small>
                </button>
                <button type="button" onClick={() => onDeleteScenario(scenario.id)} aria-label={`Delete ${scenario.name}`}><Trash2 size={13} /></button>
              </div>
            )) : <p className="project-menu-empty">Save the current plan to create a comparison baseline.</p>}
          </div>
          {message ? <p className="project-menu-message" role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "atom-project";
}

export function WorkflowRail({ activeTool, drawerMode, drawerOpen, onSelectTool, toolState }) {
  return (
    <nav className="workflow-rail" aria-label="Workspace tools">
      {WORKSPACE_TOOLS.map((tool, index) => {
        const Icon = tool.icon;
        const state = toolState?.[tool.id] ?? {};
        const isActive = drawerMode === "tool" && drawerOpen && activeTool === tool.id;
        const tooltipID = `workspace-tool-${tool.id}-tip`;
        const showDivider = index > 0 && WORKSPACE_TOOLS[index - 1].group !== tool.group;
        return (
          <div className={showDivider ? "rail-item rail-item-divider" : "rail-item"} key={tool.id}>
            <button
              id={`workspace-tool-${tool.id}`}
              type="button"
              className={`${isActive ? "active" : ""} ${state.unavailable ? "unavailable" : ""}`.trim()}
              onClick={() => { if (!state.unavailable) onSelectTool(tool.id); }}
              aria-label={tool.label}
              aria-disabled={state.unavailable || undefined}
              aria-current={isActive ? "page" : undefined}
              aria-describedby={tooltipID}
              aria-expanded={isActive}
              title={state.reason ?? tool.label}
            >
              <Icon size={19} />
              {state.badge ? <span className={`rail-badge ${state.tone ?? "neutral"}`}>{state.badge}</span> : null}
              <span id={tooltipID} className="rail-tooltip" role="tooltip">{state.reason ?? tool.label}</span>
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
  availableLayers,
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
  const layerTriggerRef = useRef(null);
  const layers = [
    { id: "buildings", label: "Viewport buildings" },
    { id: "rays", label: "Propagation rays" },
    { id: "gaps", label: "Coverage gaps" },
    { id: "selectedCells", label: "Selected cells" },
    { id: "communicationPaths", label: "Communication paths" },
    { id: "interference", label: "Interference surface" },
    { id: "measurements", label: "Measurement residuals" },
    { id: "surfaces", label: "Coverage raster + contours" },
  ].filter((layer) => availableLayers?.[layer.id] !== false);

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

  const handleLayerMenuKeyDown = (event) => {
    if (event.key !== "Escape" || !layerMenuOpen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onLayerMenuToggle(false);
    layerTriggerRef.current?.focus();
  };

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
        <div className="layer-menu-wrap" ref={layerMenuRef} onKeyDown={handleLayerMenuKeyDown}>
          <button
            ref={layerTriggerRef}
            type="button"
            className={layerMenuOpen ? "active layers-trigger" : "layers-trigger"}
            aria-label="Map layers"
            aria-expanded={layerMenuOpen}
            aria-controls="map-layer-menu"
            onClick={() => onLayerMenuToggle(!layerMenuOpen)}
          >
            <Layers3 size={17} />
            <span>Layers</span>
            <ChevronDown size={14} />
          </button>
          {layerMenuOpen ? (
            <div id="map-layer-menu" className="layer-menu" role="group" aria-label="Map layer visibility">
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
