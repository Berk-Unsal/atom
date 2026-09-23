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
import { WORKSPACE_STAGES, WORKSPACE_TOOLS } from "./workspaceTools.js";
import { MAX_PROJECT_FILE_BYTES } from "../utils/projectStore.js";
import ResultContextBadge from "./ResultContextBadge.jsx";

export function CommandBar({
  appIconUrl,
  contextLabel,
  error,
  frequencyGHz,
  lineageContext = null,
  networkTech,
  onDismissError,
  onOpenResults,
  onRun,
  persistenceState = "saved",
  projectControl,
  primaryActionLabel,
  primaryDisabled,
  resultContext = null,
  radiusMeters,
  runState,
  statusTone = "ready",
  txPowerDbm,
}) {
  return (
    <>
      <header className="command-bar">
        <div className="command-group command-workspace" role="group" aria-label="Workspace">
          <div className="command-brand" aria-label="A.T.O.M workspace">
            <img src={appIconUrl} alt="" />
            <span><strong>A.T.O.M</strong><small>Ankara Telecom Optimization Model</small></span>
          </div>
          <div className="workspace-group-content">
            {projectControl}
            {lineageContext ? <WorkspaceLineageContext context={lineageContext} persistenceState={persistenceState} /> : null}
          </div>
        </div>

        <div className="command-group command-rf-context" role="group" aria-label="RF context">
          <div className="rf-context-primary">
            <strong className="context-primary">{contextLabel}</strong>
            <span className="rf-context-tech">{networkTech}</span>
            <span className="rf-context-frequency">{frequencyGHz} GHz</span>
          </div>
          <details className="rf-context-details">
            <summary aria-label="More RF context"><ChevronDown size={14} /><span>RF details</span></summary>
            <div className="rf-context-popover">
              <span>TX power <strong>{txPowerDbm} dBm</strong></span>
              <span>Planning radius <strong>{radiusMeters} m</strong></span>
              <a
                className="planning-estimate-link"
                href="https://github.com/Berk-Unsal/atom/blob/main/docs/modeling-limits.md"
                target="_blank"
                rel="noreferrer"
                title="Open deterministic model limitations"
              >
                Planning estimate: model limitations
              </a>
            </div>
          </details>
        </div>

        <div className="command-group command-status" role="group" aria-label="Status">
          <span className={`run-state ${statusTone}`} role="status" aria-live="polite">
            {runState}
          </span>
          {resultContext ? <ResultContextBadge compact sourceRunOnly interactive context={resultContext} onPrimaryAction={onOpenResults} /> : null}
          {persistenceState === "saving" || persistenceState === "error" ? (
            <span className={`workspace-persistence-state ${persistenceState}`} role="status" aria-live="polite">
              {persistenceState === "saving" ? "Saving local draft…" : "Draft save failed"}
            </span>
          ) : null}
        </div>

        <div className="command-group command-primary-action" role="group" aria-label="Primary action">
          {primaryActionLabel ? (
            <button
              type="button"
              className="command-run-button"
              onClick={onRun}
              disabled={primaryDisabled}
            >
              <Play size={15} fill="currentColor" />
              <span>{primaryActionLabel}</span>
            </button>
          ) : null}
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

export function WorkspaceLineageContext({ context, persistenceState = "saved" }) {
  if (!context) return null;
  const draftState = context.unsaved
    ? "Unsaved changes"
    : context.draft_state === "No saved Version"
      ? "Draft saved locally"
      : context.draft_state;
  const compactDraftState = context.unsaved || context.draft_state === "No saved Version"
    ? "Local draft"
    : context.draft_state;
  const versionSummary = context.version_label === "No saved Version" ? "No Version" : context.version_label;
  return (
    <details className="workspace-lineage-context">
      <summary aria-label={`Workspace: ${context.project_name}, ${context.scenario_name}, ${context.version_label}, ${draftState}`}>
        <span className="workspace-lineage-primary">
          <strong className="workspace-lineage-project" title={context.project_name}>{context.project_name}</strong>
          <span className="workspace-lineage-scenario">{context.scenario_name}</span>
        </span>
        <span className="workspace-lineage-secondary">
          <span title={context.version_label}>{versionSummary}</span>
          <b className={context.unsaved ? "unsaved" : "saved"}>
            <span className="workspace-lineage-draft-full">{draftState}</span>
            <span className="workspace-lineage-draft-compact">{compactDraftState}</span>
          </b>
        </span>
      </summary>
      <div className="workspace-lineage-popover">
        <strong>Workspace lineage</strong>
        <dl>
          <div><dt>Project</dt><dd>{context.project_name}</dd></div>
          <div><dt>Scenario</dt><dd>{context.scenario_name}</dd></div>
          <div><dt>Version</dt><dd>{context.version_label}</dd></div>
          <div><dt>Draft</dt><dd>{draftState}</dd></div>
        </dl>
        <p className={`workspace-lineage-persistence ${persistenceState}`}>
          {persistenceState === "saving"
            ? "Saving the browser draft…"
            : persistenceState === "error"
              ? "The browser draft could not be saved."
              : context.unsaved
                ? "The draft is saved locally in this browser; it is not an immutable Version."
                : "Draft saved locally in this browser."}
        </p>
      </div>
    </details>
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
  staleResultRunLabel = "",
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(activeProject?.name ?? "");
  const [message, setMessage] = useState("");
  const [savingScenario, setSavingScenario] = useState(false);
  const [confirmProjectDelete, setConfirmProjectDelete] = useState(false);
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
      setMessage("Version saved");
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
            <button type="button" onClick={() => onRenameProject(name)} title="Rename project" aria-label="Save project name"><Save size={15} /></button>
          </div>
          {!compatible ? <p className="project-warning"><AlertTriangle size={14} /> Dataset differs from this project.</p> : null}
          <div className="project-menu-actions">
            <button type="button" onClick={onAddProject}><FilePlus2 size={14} /> New</button>
            <button type="button" onClick={onDuplicateProject}><Copy size={14} /> Duplicate</button>
            <button type="button" onClick={() => setConfirmProjectDelete(true)} disabled={projects.length < 2}><Trash2 size={14} /> Delete</button>
          </div>
          {confirmProjectDelete ? (
            <div className="project-delete-confirmation" role="group" aria-label="Confirm project deletion">
              <p>Delete “{activeProject?.name}”? Its draft and saved scenarios will be removed.</p>
              <div>
                <button type="button" onClick={() => { onDeleteProject(); setConfirmProjectDelete(false); }}>Delete project</button>
                <button type="button" onClick={() => setConfirmProjectDelete(false)}>Keep project</button>
              </div>
            </div>
          ) : null}
          <div className="project-menu-actions">
            <button type="button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</button>
            <button type="button" onClick={downloadProject}><Download size={14} /> Export</button>
            <input ref={fileRef} hidden type="file" accept=".json,.atom-project.json" onChange={importFile} />
          </div>
          <div className="scenario-menu-header">
            <strong>Scenarios / Versions</strong>
            <button type="button" onClick={saveScenario} disabled={savingScenario} aria-label="Save current">
              <Save size={14} /> {savingScenario ? "Saving…" : "Save version"}
            </button>
          </div>
          {staleResultRunLabel ? <p className="project-menu-save-note">Save Version records the current plan. {staleResultRunLabel} remains tied to the input that produced it.</p> : null}
          <div className="scenario-menu-list">
            {(activeProject?.scenarios ?? []).length ? activeProject.scenarios.map((scenario) => (
              <div key={scenario.id}>
                <button type="button" onClick={() => onOpenScenario(scenario)}>
                  <span>{scenario.name}</span>
                  <small>Version {scenario.domain?.revision ?? scenario.domain?.revisions?.[scenario.domain?.revisions?.length - 1]?.revision ?? 1} · {new Date(scenario.updatedAt).toLocaleString()}</small>
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

export function StageToolChoices({
  activeTool,
  autoFocusSelected = false,
  id,
  onSelectTool,
  stage,
  toolState,
}) {
  const choicesRef = useRef(null);
  const tools = WORKSPACE_TOOLS.filter((tool) => tool.stage === stage.id);

  useEffect(() => {
    if (!autoFocusSelected) return undefined;
    const timer = window.setTimeout(() => {
      const selected = choicesRef.current?.querySelector('[aria-current="page"]');
      const firstAvailable = choicesRef.current?.querySelector('button:not([aria-disabled="true"])');
      (selected ?? firstAvailable)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTool, autoFocusSelected, stage.id]);

  return (
    <div
      ref={choicesRef}
      id={id}
      className="stage-tool-choices"
      role="group"
      aria-label={`${stage.label} tools`}
      data-stage-chooser
    >
      {tools.map((tool) => {
        const Icon = tool.icon;
        const state = toolState?.[tool.id] ?? {};
        const isActive = tool.id === activeTool;
        const unavailable = Boolean(state.unavailable);
        const stateLabel = isActive
          ? "Current tool"
          : unavailable
            ? "Unavailable"
            : state.tone === "warning" && state.badge
              ? "Needs attention"
              : state.badge && state.tone === "success"
                ? tool.id === "history"
                  ? `${state.badge} ${state.badge === "1" ? "run" : "runs"}`
                  : "Result available"
                : state.badge === "…"
                  ? "Loading"
                  : state.badge && tool.id === "setup"
                    ? `${state.badge} cells selected`
                    : tool.description;

        return (
          <button
            key={tool.id}
            id={`stage-tool-${stage.id}-${tool.id}`}
            type="button"
            className={`stage-tool-choice${isActive ? " current" : ""}${unavailable ? " unavailable" : ""}`}
            onClick={() => { if (!unavailable) onSelectTool(tool.id); }}
            aria-label={tool.label}
            aria-current={isActive ? "page" : undefined}
            aria-disabled={unavailable || undefined}
            aria-describedby={`stage-tool-${stage.id}-${tool.id}-description${unavailable ? ` stage-tool-${stage.id}-${tool.id}-reason` : ""}`}
          >
            <Icon className="stage-tool-choice-icon" size={17} aria-hidden="true" />
            <span className="stage-tool-choice-copy">
              <span className="stage-tool-choice-name">{tool.label}</span>
              <span
                id={`stage-tool-${stage.id}-${tool.id}-description`}
                className={isActive ? "visually-hidden" : "stage-tool-choice-description"}
              >
                {stateLabel}
              </span>
              {unavailable ? (
                <span id={`stage-tool-${stage.id}-${tool.id}-reason`} className="stage-tool-choice-reason">{state.reason ?? "Unavailable in the current workspace."}</span>
              ) : null}
            </span>
            {isActive ? <span className="stage-tool-current-mark">Current</span> : null}
            {!isActive && state.tone === "warning" && state.badge ? <span className="stage-tool-attention-mark">!</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function WorkflowRail({
  activeTool,
  chooserStage,
  onToggleChooser,
  phoneLayout = false,
  toolState,
  onSelectTool,
}) {
  const activeButtonRef = useRef(null);
  const activeDefinition = WORKSPACE_TOOLS.find((tool) => tool.id === activeTool) ?? WORKSPACE_TOOLS[0];

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTool]);

  return (
    <nav className="workflow-rail" aria-label="Workspace stages">
      {WORKSPACE_STAGES.map((stage) => {
        const Icon = stage.icon;
        const tools = WORKSPACE_TOOLS.filter((tool) => tool.stage === stage.id);
        const isActive = activeDefinition.stage === stage.id;
        const isChooserOpen = chooserStage === stage.id;
        const hasResult = tools.some((tool) => toolState?.[tool.id]?.tone === "success" && toolState?.[tool.id]?.badge);
        const hasWarning = tools.some((tool) => toolState?.[tool.id]?.tone === "warning" && toolState?.[tool.id]?.badge);
        const tooltipID = `workspace-stage-${stage.id}-tip`;
        const attentionID = `workspace-stage-${stage.id}-attention`;
        const attentionDescription = hasWarning ? "Attention available in this stage." : hasResult ? "Results available in this stage." : "";
        return (
          <div className="rail-item rail-stage" key={stage.id}>
            <button
              ref={isActive ? activeButtonRef : null}
              id={`workspace-stage-${stage.id}`}
              type="button"
              className={`${isActive ? "active" : ""}${isChooserOpen ? " chooser-open" : ""}`.trim()}
              data-stage-trigger
              onClick={() => onToggleChooser(stage.id)}
              aria-label={`${stage.label} workspace`}
              aria-current={isActive ? "step" : undefined}
              aria-describedby={attentionDescription ? `${tooltipID} ${attentionID}` : tooltipID}
              aria-haspopup="dialog"
              aria-expanded={isChooserOpen}
              aria-controls={isChooserOpen ? `stage-chooser-${stage.id}` : undefined}
              title={stage.label}
            >
              <Icon size={19} />
              <span className="rail-label">{stage.label}</span>
              {hasResult || hasWarning ? <span className={`rail-badge ${hasWarning ? "warning" : "success"}`} aria-hidden="true">{hasWarning ? "!" : "•"}</span> : null}
              <span id={tooltipID} className="rail-tooltip" role="tooltip">{stage.label}</span>
              {attentionDescription ? <span id={attentionID} className="visually-hidden">{attentionDescription}</span> : null}
            </button>
            {isChooserOpen && !phoneLayout ? (
              <div
                id={`stage-chooser-${stage.id}`}
                className="stage-tool-chooser-flyout"
                role="dialog"
                aria-modal="false"
                aria-label={`${stage.label} tools`}
                data-stage-chooser
              >
                <StageToolChoices
                  activeTool={activeTool}
                  onSelectTool={onSelectTool}
                  stage={stage}
                  toolState={toolState}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function ToolDrawer({
  children,
  chooser = null,
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
      id={chooser ? `stage-chooser-${chooser.stage.id}` : undefined}
      className={`tool-drawer ${drawerMode === "inspector" ? "inspector-mode" : ""}`}
      aria-modal="false"
      aria-labelledby="tool-drawer-title"
      data-stage-chooser={chooser ? "true" : undefined}
    >
      {chooser ? (
        <>
          <header className="tool-drawer-header tool-drawer-chooser-header">
            <div>
              <h2 id="tool-drawer-title" ref={headingRef} tabIndex={-1}>{chooser.stage.label}</h2>
              <p>Choose a tool for this stage</p>
            </div>
            <button type="button" className="drawer-icon-button drawer-close" onClick={onClose} aria-label="Close tool chooser">
              <X size={18} />
            </button>
          </header>
          <div className="tool-drawer-body stage-tool-chooser-mobile">
            <StageToolChoices
              id={`stage-chooser-content-${chooser.stage.id}`}
              activeTool={chooser.activeTool}
              autoFocusSelected
              onSelectTool={chooser.onSelectTool}
              stage={chooser.stage}
              toolState={chooser.toolState}
            />
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </dialog>
  );
}

export function UndoToast({ message, onDismiss, onUndo }) {
  if (!message) return null;
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" className="undo-dismiss" onClick={onDismiss} aria-label="Dismiss notification"><X size={15} /></button>
    </div>
  );
}

export function MapToolbar({
  availableLayers,
  hasRays = false,
  hasSignalSurface = false,
  onSignalToggle,
  signalSurfaceState,
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
  onRayScopeChange,
  onSelectedMapCellChange,
  planningMode,
  rayCellOptions = [],
  rayScope = "all",
  selectionCanFinish,
  selectedMapCellId = null,
  selectedCount,
}) {
  const layerMenuRef = useRef(null);
  const layerTriggerRef = useRef(null);
  const resolvedSignalSurfaceState = signalSurfaceState ?? (hasSignalSurface ? "ready" : "unavailable");
  const handleSignalToggle = onSignalToggle ?? (() => onToggleLayer("surfaces"));
  const layers = [
    { id: "buildings", label: "Viewport buildings" },
    { id: "gaps", label: "Coverage gaps" },
    { id: "selectedCells", label: "Selected cells" },
    { id: "communicationPaths", label: "Communication paths" },
    { id: "interference", label: "Interference surface" },
    { id: "measurements", label: "Measurement residuals" },
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
        <div className="rf-display-tools" aria-label="RF map display">
          <span className="rf-display-label">RF</span>
          <button
            type="button"
            className={layerVisibility?.surfaces && hasSignalSurface && resolvedSignalSurfaceState === "ready" ? "active" : ""}
            aria-pressed={Boolean(layerVisibility?.surfaces && hasSignalSurface && resolvedSignalSurfaceState === "ready")}
            aria-busy={resolvedSignalSurfaceState === "loading" || undefined}
            aria-label="Toggle received signal surface"
            data-surface-state={resolvedSignalSurfaceState}
            disabled={resolvedSignalSurfaceState === "unavailable"}
            title={resolvedSignalSurfaceState === "ready"
              ? "Toggle received signal surface"
              : resolvedSignalSurfaceState === "available"
                ? "Load received signal surface"
                : resolvedSignalSurfaceState === "loading"
                  ? "Loading received signal surface"
                  : resolvedSignalSurfaceState === "error"
                    ? "Retry received signal surface"
                    : "Run a current RF or network analysis first"}
            onClick={handleSignalToggle}
          >
            Signal
          </button>
          <button
            type="button"
            className={layerVisibility?.rays && hasRays && rayScope !== "hidden" ? "active" : ""}
            aria-pressed={Boolean(layerVisibility?.rays && hasRays && rayScope !== "hidden")}
            aria-label="Toggle propagation rays"
            disabled={!hasRays}
            title={hasRays ? "Toggle propagation rays" : "Run a sector or network analysis first"}
            onClick={() => onToggleLayer("rays")}
          >
            Rays
          </button>
          <label className="rf-display-select">
            <span>Scope</span>
            <select
              aria-label="Ray scope"
              value={rayScope}
              disabled={!hasRays}
              onChange={(event) => onRayScopeChange?.(event.target.value)}
            >
              <option value="all">All cells</option>
              <option value="selected">Selected cell</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          <label className="rf-display-select">
            <span>Focus</span>
            <select
              aria-label="Map focus cell"
              value={selectedMapCellId ?? ""}
              disabled={rayCellOptions.length === 0}
              onChange={(event) => onSelectedMapCellChange?.(event.target.value)}
            >
              {rayCellOptions.length === 0 ? <option value="">No cell</option> : null}
              {rayCellOptions.map((cell) => <option key={cell.id} value={cell.id}>{cell.label}</option>)}
            </select>
          </label>
        </div>
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

export function MapLegend({ collapsed, hasGaps, hasInterferenceData, hasRays, hasSignalSurface, metric, onToggle, planningMode, receiverSensitivityDBm = -115, resultContext = null, surface, surfaceCellId, surfaceDisplayThresholdDBm = -110 }) {
  const legends = {
    sinr: ["< 0", "0–13", "13–20", "≥ 20 dB"],
    rsrp: ["< -100", "-100–-90", "-90–-80", "≥ -80 dBm"],
    rsrq: ["< -20", "-20–-15", "-15–-10", "≥ -10 dB"],
  };
  return (
    <div className={`focused-map-legend ${collapsed ? "collapsed" : ""}`} aria-label="Map legend">
      <button type="button" onClick={onToggle} aria-expanded={!collapsed}>
        <strong>Map key</strong>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {collapsed ? null : (
        <div>
          <section aria-label="Cell markers">
            <strong>Cells</strong>
            <span><i className="map-key-marker active-cell" aria-hidden="true" />Active cell</span>
            {planningMode === "network" ? <span><i className="map-key-marker cluster-cell" aria-hidden="true" />Selected cluster</span> : null}
            <span><i className="map-key-marker available-cell" aria-hidden="true" />Available cell</span>
          </section>
          {resultContext ? (
            <section aria-label="Result source">
              <strong>Result source</strong>
              <ResultContextBadge compact context={resultContext} />
            </section>
          ) : null}
          {hasRays ? (
            <section aria-label="Received power">
              <strong>Received power</strong>
              <span><i className="map-key-line strong-signal" aria-hidden="true" />Strong ≥ −85 dBm</span>
              <span><i className="map-key-line usable-signal" aria-hidden="true" />Usable {formatLegendPower(receiverSensitivityDBm)} to −85 dBm</span>
              <span><i className="map-key-line weak-signal" aria-hidden="true" />Below sensitivity &lt; {formatLegendPower(receiverSensitivityDBm)}</span>
            </section>
          ) : null}
          {hasSignalSurface ? (
            <section aria-label="Received signal surface">
              <strong>Received signal surface</strong>
              <div
                className="signal-surface-scale"
                role="img"
                aria-label={`Received power from ${formatLegendPower(surface?.stats?.min_dbm)} to ${formatLegendPower(surface?.stats?.max_dbm)}`}
              >
                <i className="surface-signal-weak" aria-hidden="true" />
                <i className="surface-signal-low" aria-hidden="true" />
                <i className="surface-signal-medium" aria-hidden="true" />
                <i className="surface-signal-good" aria-hidden="true" />
                <i className="surface-signal-strong" aria-hidden="true" />
              </div>
              <div className="signal-surface-scale-labels">
                <span>{formatLegendPower(surface?.stats?.min_dbm)}</span>
                <span>{formatLegendPower(surface?.stats?.max_dbm)}</span>
              </div>
              {Array.isArray(surface?.stats?.thresholds_dbm) && surface.stats.thresholds_dbm.length > 0 ? (
                <span>Contours {surface.stats.thresholds_dbm.map((threshold) => formatLegendPower(threshold)).join(" · ")}</span>
              ) : null}
              <span>Visible ≥ {formatLegendPower(surfaceDisplayThresholdDBm)} · Cell {surfaceCellId ?? "selected"}</span>
            </section>
          ) : null}
          {hasGaps ? (
            <section aria-label="Coverage gaps">
              <strong>Coverage gaps</strong>
              <span><i className="map-key-marker weak-gap" aria-hidden="true" />Weak service</span>
              <span><i className="map-key-marker outage-gap" aria-hidden="true" />Outage</span>
            </section>
          ) : null}
          {hasInterferenceData ? (
            <section aria-label={`${metric.toUpperCase()} quality`}>
              <strong>{metric.toUpperCase()} quality</strong>
              {(legends[metric] ?? legends.sinr).map((label, index) => (
                <span key={label}>
                  <i className={`quality-swatch quality-${index}`} aria-hidden="true" />
                  {label}
                </span>
              ))}
              <span><i className="quality-swatch no-signal" aria-hidden="true" />No signal</span>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatLegendPower(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric.toFixed(0).replace("-", "−")} dBm`;
}
