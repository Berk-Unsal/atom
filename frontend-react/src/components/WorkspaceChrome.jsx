import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Eraser,
  Eye,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Save,
  Trash2,
  Upload,
  Layers3,
  LassoSelect,
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
              <strong className="rf-context-popover-title">RF configuration</strong>
              <dl>
                <div><dt>TX power</dt><dd>{txPowerDbm} dBm</dd></div>
                <div><dt>Planning radius</dt><dd>{radiusMeters} m</dd></div>
              </dl>
              <a
                className="planning-estimate-link"
                href="https://github.com/Berk-Unsal/atom/blob/main/docs/modeling-limits.md"
                target="_blank"
                rel="noreferrer"
                title="Open deterministic model limitations"
              >
                Model limitations
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
        const unavailableReason = state.reason ?? "Unavailable in the current workspace.";
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
                  : "";
        const visibleState = unavailable
          ? tool.id === "interference" && unavailableReason.startsWith("Interference requires Network")
            ? "Requires Network mode"
            : tool.id === "interference" && unavailableReason.includes("6G research profile")
              ? "Not supported for 6G research"
            : tool.id === "core" && unavailableReason.startsWith("5G Core requires")
              ? "Requires 5G defaults and active 5G cells"
                : unavailableReason
          : state.tone === "warning" && state.badge
            ? "Attention"
            : isActive
              ? ""
              : state.badge && state.tone === "success"
              ? tool.id === "history"
                ? stateLabel
                : "Result"
              : state.badge === "…"
                ? "Loading"
                : "";
        const stateID = `stage-tool-${stage.id}-${tool.id}-description`;
        const reasonID = `stage-tool-${stage.id}-${tool.id}-reason`;
        const visibleStateIsDescription = Boolean(!unavailable && stateLabel && visibleState === stateLabel);
        const visibleReasonIsDescription = Boolean(unavailable && visibleState === unavailableReason);

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
            aria-describedby={[stateLabel ? stateID : null, unavailable ? reasonID : null].filter(Boolean).join(" ") || undefined}
          >
            <Icon className="stage-tool-choice-icon" size={17} aria-hidden="true" />
            <span className="stage-tool-choice-copy">
              <span className="stage-tool-choice-name">{tool.label}</span>
              {unavailable ? (
                <span id={visibleReasonIsDescription ? reasonID : undefined} className="stage-tool-choice-reason">
                  {visibleState}
                </span>
              ) : null}
              {!unavailable && visibleState ? (
                <span
                  id={visibleStateIsDescription ? stateID : undefined}
                  className={`stage-tool-choice-state${state.tone === "warning" ? " warning" : ""}`}
                >
                  {visibleState}
                </span>
              ) : null}
              {stateLabel && !visibleStateIsDescription ? <span id={stateID} className="visually-hidden">{stateLabel}</span> : null}
              {unavailable && !visibleReasonIsDescription ? <span id={reasonID} className="visually-hidden">{unavailableReason}</span> : null}
            </span>
            {isActive ? <span className="stage-tool-current-mark" aria-hidden="true">Current</span> : null}
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
  concealed = false,
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
      className={`tool-drawer ${drawerMode === "inspector" ? "inspector-mode" : ""} ${concealed ? "concealed" : ""}`.trim()}
      aria-modal="false"
      aria-labelledby="tool-drawer-title"
      data-stage-chooser={chooser ? "true" : undefined}
    >
      {chooser ? (
        <>
          <header className="tool-drawer-header tool-drawer-chooser-header">
            <div>
              <h2 id="tool-drawer-title" ref={headingRef} tabIndex={-1}>{chooser.stage.label}</h2>
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
  interactionMode = "inspect",
  canInspectMapFocus = false,
  mapFocusIsInspected = false,
  isDrawingSelection,
  isPlacingCell = false,
  isSelectingPathEndpoint = false,
  layerMenuOpen,
  layerVisibility,
  onCancelAreaSelection,
  onCancelPlacement,
  onCancelPathEndpoint,
  onClearNetworkSelection,
  onDrawArea,
  onFinishAreaSelection,
  onFitSelectedCells,
  onInterferenceMetricChange,
  onInspectMapFocus,
  onLayerMenuToggle,
  onInteractionModeChange,
  onToggleLayer,
  onRayScopeChange,
  onSelectedMapCellChange,
  planningMode,
  focusCellOptions = [],
  rayScope = "all",
  selectionCanFinish,
  selectedMapCellId = null,
  selectedCount,
}) {
  const toolbarRef = useRef(null);
  const layerMenuRef = useRef(null);
  const layerTriggerRef = useRef(null);
  const viewMenuRef = useRef(null);
  const viewTriggerRef = useRef(null);
  const interactionMenuRef = useRef(null);
  const interactionTriggerRef = useRef(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [interactionMenuOpen, setInteractionMenuOpen] = useState(false);
  const resolvedSignalSurfaceState = signalSurfaceState ?? (hasSignalSurface ? "ready" : "unavailable");
  const handleSignalToggle = onSignalToggle ?? (() => onToggleLayer("surfaces"));
  const specialMode = isDrawingSelection
    ? "draw-area"
    : isPlacingCell
      ? "place-cell"
      : isSelectingPathEndpoint
        ? "pick-receiver"
        : null;
  const canDrawArea = planningMode === "network" && interactionMode === "select-cells";
  const canClearSelection = planningMode === "network" && selectedCount > 0;
  const canFitSelection = selectedCount > 0 || planningMode === "single";
  const signalActive = Boolean(layerVisibility?.surfaces && hasSignalSurface && resolvedSignalSurfaceState === "ready");
  const raysActive = Boolean(layerVisibility?.rays && hasRays && rayScope !== "hidden");
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

  useEffect(() => {
    if (!viewMenuOpen && !interactionMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (toolbarRef.current?.contains(event.target)) return;
      setViewMenuOpen(false);
      setInteractionMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [interactionMenuOpen, viewMenuOpen]);

  const handleMenuEscape = (event) => {
    if (event.key !== "Escape" || specialMode) return;
    if (layerMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      onLayerMenuToggle(false);
      layerTriggerRef.current?.focus();
      return;
    }
    if (viewMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      setViewMenuOpen(false);
      viewTriggerRef.current?.focus();
      return;
    }
    if (interactionMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      setInteractionMenuOpen(false);
      interactionTriggerRef.current?.focus();
    }
  };

  const handleInteractionModeChange = (mode) => {
    setInteractionMenuOpen(false);
    onInteractionModeChange?.(mode);
  };

  const renderMetricSelect = () => (
    <label className="map-control-select">
      <span>Metric</span>
      <select
        aria-label="Radio-quality metric"
        value={interferenceMetric}
        onChange={(event) => onInterferenceMetricChange?.(event.target.value)}
      >
        <option value="sinr">SINR</option>
        <option value="rsrp">RSRP</option>
        <option value="rsrq">RSRQ</option>
      </select>
    </label>
  );

  const renderSignalToggle = () => (
    <button
      type="button"
      className={signalActive ? "active" : ""}
      aria-pressed={signalActive}
      aria-label="Signal layer"
      aria-busy={resolvedSignalSurfaceState === "loading" || undefined}
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
      {signalActive ? <Check size={12} aria-hidden="true" /> : null}
      <span>Signal</span>
    </button>
  );

  const renderRaysToggle = () => (
    <button
      type="button"
      className={raysActive ? "active" : ""}
      aria-pressed={raysActive}
      aria-label="Propagation rays layer"
      disabled={!hasRays}
      title={hasRays ? "Toggle propagation rays" : "Run a sector or network analysis first"}
      onClick={() => onToggleLayer("rays")}
    >
      {raysActive ? <Check size={12} aria-hidden="true" /> : null}
      <span>Rays</span>
    </button>
  );

  const renderViewContext = () => (
    <div className="map-view-section" role="group" aria-label="View context">
      <label className="map-control-select">
        <span>Scope</span>
        <select
          aria-label="Ray scope"
          value={rayScope}
          disabled={!hasRays}
          onChange={(event) => onRayScopeChange?.(event.target.value)}
        >
          <option value="all">All cells</option>
          <option value="selected">Map Focus cell</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>
      <label className="map-control-select map-focus-select">
        <span>Map Focus</span>
        <select
          aria-label="Map focus cell"
          value={selectedMapCellId ?? ""}
          disabled={focusCellOptions.length === 0}
          onChange={(event) => onSelectedMapCellChange?.(event.target.value)}
        >
          {focusCellOptions.length === 0 ? <option value="">No cell</option> : null}
          {focusCellOptions.map((cell) => <option key={cell.id} value={cell.id}>{cell.label}</option>)}
        </select>
      </label>
      {canInspectMapFocus && !mapFocusIsInspected ? (
        <button
          type="button"
          className="map-focus-inspect"
          aria-label="Inspect focused cell"
          title="Inspect the current Map Focus Cell"
          onClick={() => {
            setViewMenuOpen(false);
            viewTriggerRef.current?.focus();
            onInspectMapFocus?.();
          }}
        >
          <Eye size={15} aria-hidden="true" />
          <span>Inspect focused cell</span>
        </button>
      ) : null}
    </div>
  );

  const currentInteractionLabel = specialMode === "draw-area"
    ? "Draw area"
    : specialMode === "place-cell"
      ? "Place cell"
      : specialMode === "pick-receiver"
        ? "Pick receiver"
        : interactionMode === "select-cells"
          ? "Select cells"
          : "Inspect";

  return (
    <div ref={toolbarRef} className={`focused-map-toolbar${specialMode ? " special-map-mode-active" : ""}`} role="group" aria-label="Map controls" onKeyDown={handleMenuEscape}>
      <div className="spatial-tools" aria-label="Map interaction and navigation">
        {specialMode ? (
          <div className="map-special-mode" role="status" aria-live="polite">
            <span className="map-special-mode-label">
              {specialMode === "draw-area" ? <LassoSelect size={15} aria-hidden="true" /> : null}
              {specialMode === "place-cell" ? <LocateFixed size={15} aria-hidden="true" /> : null}
              {specialMode === "pick-receiver" ? <MousePointer2 size={15} aria-hidden="true" /> : null}
              <strong>{currentInteractionLabel}</strong>
              <small>{specialMode === "draw-area" ? "Click map points" : specialMode === "place-cell" ? "Click a position on the map" : "Click a receiver position"}</small>
            </span>
            {specialMode === "draw-area" ? (
              <button type="button" onClick={onFinishAreaSelection} disabled={!selectionCanFinish}>Finish</button>
            ) : null}
            <button
              type="button"
              className="map-mode-cancel"
              onClick={specialMode === "draw-area" ? onCancelAreaSelection : specialMode === "place-cell" ? onCancelPlacement : onCancelPathEndpoint}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="map-inspection-modes map-desktop-interaction" role="group" aria-label="Map interaction mode">
              <button type="button" className={interactionMode === "inspect" ? "active" : ""} aria-pressed={interactionMode === "inspect"} onClick={() => handleInteractionModeChange("inspect")}>
                <Eye size={15} aria-hidden="true" /><span>Inspect</span>{interactionMode === "inspect" ? <Check size={12} aria-hidden="true" /> : null}
              </button>
              <button type="button" className={interactionMode === "select-cells" ? "active" : ""} aria-pressed={interactionMode === "select-cells"} onClick={() => handleInteractionModeChange("select-cells")}>
                <MousePointer2 size={15} aria-hidden="true" /><span>Select cells</span>{interactionMode === "select-cells" ? <Check size={12} aria-hidden="true" /> : null}
              </button>
            </div>
            <div className="map-interaction-menu map-mobile-interaction" ref={interactionMenuRef}>
              <button
                ref={interactionTriggerRef}
                type="button"
                className="map-interaction-trigger"
                aria-label={"Map interaction: " + currentInteractionLabel}
                aria-expanded={interactionMenuOpen}
                aria-controls="map-interaction-menu"
                onClick={() => {
                  setViewMenuOpen(false);
                  onLayerMenuToggle(false);
                  setInteractionMenuOpen((current) => !current);
                }}
              >
                {interactionMode === "inspect" ? <Eye size={15} aria-hidden="true" /> : <MousePointer2 size={15} aria-hidden="true" />}
                <span>{currentInteractionLabel}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {interactionMenuOpen ? (
                <div id="map-interaction-menu" className="map-interaction-popover" role="group" aria-label="Map interaction mode">
                  <button type="button" className={interactionMode === "inspect" ? "active" : ""} aria-pressed={interactionMode === "inspect"} onClick={() => handleInteractionModeChange("inspect")}>
                    <Eye size={15} aria-hidden="true" /><span>Inspect</span>{interactionMode === "inspect" ? <Check size={12} aria-hidden="true" /> : null}
                  </button>
                  <button type="button" className={interactionMode === "select-cells" ? "active" : ""} aria-pressed={interactionMode === "select-cells"} onClick={() => handleInteractionModeChange("select-cells")}>
                    <MousePointer2 size={15} aria-hidden="true" /><span>Select cells</span>{interactionMode === "select-cells" ? <Check size={12} aria-hidden="true" /> : null}
                  </button>
                  {canDrawArea ? <button type="button" onClick={() => { setInteractionMenuOpen(false); onDrawArea?.(); }}><LassoSelect size={15} aria-hidden="true" /><span>Draw area</span></button> : null}
                  {canClearSelection ? <button type="button" onClick={() => { setInteractionMenuOpen(false); onClearNetworkSelection?.(); }}><Eraser size={15} aria-hidden="true" /><span>Clear selected cluster</span></button> : null}
                  {canFitSelection ? <button type="button" onClick={() => { setInteractionMenuOpen(false); onFitSelectedCells?.(); }}><LocateFixed size={15} aria-hidden="true" /><span>Fit selected cells</span></button> : null}
                </div>
              ) : null}
            </div>
            {canDrawArea ? (
              <button type="button" className="map-icon-tool map-area-action" onClick={onDrawArea} aria-label="Draw selection area" title="Draw area selection">
                <LassoSelect size={16} aria-hidden="true" />
              </button>
            ) : null}
            {canClearSelection ? (
              <button type="button" className="map-icon-tool map-clear-selection" onClick={onClearNetworkSelection} aria-label="Clear selected cluster" title="Clear selected cluster">
                <Eraser size={16} aria-hidden="true" />
              </button>
            ) : null}
            {canFitSelection ? (
              <button type="button" className="map-icon-tool map-fit-selection" onClick={onFitSelectedCells} aria-label="Fit selected cells" title="Fit selected cells in view">
                <LocateFixed size={16} aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className="map-display-tools" aria-label="Map visualization and view context">
        <div className="map-visualization-quick-controls" role="group" aria-label="Result visualization">
          {hasInterferenceData ? renderMetricSelect() : null}
          {renderSignalToggle()}
          {renderRaysToggle()}
        </div>
        <div className="view-menu-wrap" ref={viewMenuRef}>
          <button
            ref={viewTriggerRef}
            type="button"
            className={viewMenuOpen ? "active view-trigger" : "view-trigger"}
            aria-label="Map view options"
            aria-expanded={viewMenuOpen}
            aria-controls="map-view-menu"
            onClick={() => {
              setInteractionMenuOpen(false);
              onLayerMenuToggle(false);
              setViewMenuOpen((current) => !current);
            }}
          >
            <Eye size={15} aria-hidden="true" />
            <span>View</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {viewMenuOpen ? (
            <div id="map-view-menu" className="map-view-menu" role="group" aria-label="Map view controls">
              <section className="map-view-section map-mobile-result-controls" role="group" aria-label="Result visualization">
                {hasInterferenceData ? renderMetricSelect() : null}
                {renderSignalToggle()}
                {renderRaysToggle()}
              </section>
              {renderViewContext()}
            </div>
          ) : null}
        </div>
        <div className="layer-menu-wrap" ref={layerMenuRef}>
          <button
            ref={layerTriggerRef}
            type="button"
            className={layerMenuOpen ? "active layers-trigger" : "layers-trigger"}
            aria-label="Map layers"
            aria-expanded={layerMenuOpen}
            aria-controls="map-layer-menu"
            onClick={() => {
              setInteractionMenuOpen(false);
              setViewMenuOpen(false);
              onLayerMenuToggle(!layerMenuOpen);
            }}
          >
            <Layers3 size={16} aria-hidden="true" />
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
    <aside className={`focused-map-legend ${collapsed ? "collapsed" : ""}`} role="region" aria-label="Map key">
      <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls="map-legend-content">
        <strong>Map key</strong>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <div id="map-legend-content" hidden={collapsed}>
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
    </aside>
  );
}

function formatLegendPower(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric.toFixed(0).replace("-", "−")} dBm`;
}
