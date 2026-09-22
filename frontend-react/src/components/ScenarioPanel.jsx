import {
  GitBranch,
  History,
  Link2,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildScenarioRevisionDiff } from "../domain/scenarioDiff.js";
import { getScenarioRevisionRecords } from "../domain/scenario.js";

export default function ScenarioPanel({
  activeProject,
  activeScenario = null,
  draftSourceScenario = null,
  focusedRevisionId = null,
  onBranchScenario,
  onContinueFromVersion,
  onDeleteScenario,
  onDuplicateScenario,
  onFocusRevision,
  onOpenReport,
  onOpenReports,
  onOpenRun,
  onOpenScenario,
  onRenameScenario,
  onSaveVersion,
  staleResultRunLabel = "",
  persistenceState = "saved",
  planDirty = false,
  reportArtifacts = [],
  reportDefinitions = [],
  runs = [],
  scenarios = [],
}) {
  const sourceScenario = activeScenario ?? draftSourceScenario;
  const [selectedRevisionId, setSelectedRevisionId] = useState(focusedRevisionId);
  const [changeSummary, setChangeSummary] = useState("");
  const [scenarioNameDraft, setScenarioNameDraft] = useState("");
  const [scenarioNameSourceID, setScenarioNameSourceID] = useState(null);
  const [branchName, setBranchName] = useState("");
  const [duplicateName, setDuplicateName] = useState("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareRevisionA, setCompareRevisionA] = useState("");
  const [compareRevisionB, setCompareRevisionB] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const scenarioRecords = useMemo(
    () => sourceScenario ? getScenarioRevisionRecords(sourceScenario) : [],
    [sourceScenario],
  );
  const latestRevision = scenarioRecords[scenarioRecords.length - 1] ?? null;
  const selectedRevision = scenarioRecords.find((revision) => String(revision.scenario_revision_id) === String(focusedRevisionId ?? selectedRevisionId))
    ?? latestRevision;
  const scenarioID = sourceScenario?.domain?.scenario_id ?? sourceScenario?.id ?? null;
  const scenarioName = scenarioNameSourceID === sourceScenario?.id ? scenarioNameDraft : sourceScenario?.name ?? "";
  const hasUnsavedChanges = Boolean(activeProject?.activeScenarioId === null && activeProject?.draft && sourceScenario);
  const statusLabel = hasUnsavedChanges ? "Unsaved changes" : "Saved";

  const compareScenarioAID = compareA || scenarioListID(scenarios[0]);
  const compareScenarioBID = compareB || scenarioListID(scenarios[1]) || compareScenarioAID;
  const compareScenarioA = scenarios.find((scenario) => scenarioListID(scenario) === compareScenarioAID) ?? scenarios[0] ?? null;
  const compareScenarioB = scenarios.find((scenario) => scenarioListID(scenario) === compareScenarioBID) ?? scenarios[1] ?? scenarios[0] ?? null;
  const compareRecordsA = useMemo(() => getScenarioRevisionRecords(compareScenarioA), [compareScenarioA]);
  const compareRecordsB = useMemo(() => getScenarioRevisionRecords(compareScenarioB), [compareScenarioB]);
  const compareVersionA = compareRecordsA.find((revision) => String(revision.scenario_revision_id) === String(compareRevisionA)) ?? compareRecordsA[compareRecordsA.length - 1] ?? null;
  const compareVersionB = compareRecordsB.find((revision) => String(revision.scenario_revision_id) === String(compareRevisionB)) ?? compareRecordsB[compareRecordsB.length - 1] ?? null;
  const comparisonDiff = compareVersionA && compareVersionB
    ? buildScenarioRevisionDiff(compareVersionA, compareVersionB)
    : null;

  const revisionRuns = useMemo(() => runs.filter((run) => (
    String(run.scenario_id) === String(scenarioID)
      && String(run.scenario_revision_id) === String(selectedRevision?.scenario_revision_id)
  )), [runs, scenarioID, selectedRevision?.scenario_revision_id]);
  const revisionReports = useMemo(() => {
    const revisionID = selectedRevision?.scenario_revision_id;
    const artifacts = reportArtifacts.filter((artifact) => (
      String(artifact.scenario_revision_id) === String(revisionID)
        || (artifact.run_ids ?? []).some((runID) => revisionRuns.some((run) => run.run_id === runID))
    ));
    const artifactReportIDs = new Set(artifacts.map((artifact) => artifact.report_id));
    const definitions = reportDefinitions
      .filter((definition) => String(definition.scenario_revision_id) === String(revisionID) && !artifactReportIDs.has(definition.report_id))
      .map((definition) => ({ ...definition, artifact_id: `definition:${definition.report_id}`, generated_at: definition.updated_at, format: "metadata" }));
    return [...artifacts, ...definitions];
  }, [reportArtifacts, reportDefinitions, revisionRuns, selectedRevision?.scenario_revision_id]);
  const reportRecords = useMemo(() => [
    ...reportArtifacts,
    ...reportDefinitions.map((definition) => ({ ...definition, scenario_id: definition.scenario_id, generated_at: definition.updated_at })),
  ], [reportArtifacts, reportDefinitions]);
  const latestRun = useMemo(() => newestForScenario(runs, scenarioID), [runs, scenarioID]);
  const latestOptimization = useMemo(() => newestForScenario(runs.filter((run) => run.run_type === "optimization"), scenarioID), [runs, scenarioID]);
  const latestReport = useMemo(() => newestForScenario(reportRecords, scenarioID, "generated_at"), [reportRecords, scenarioID]);
  const parentScenario = scenarios.find((scenario) => String(scenarioListID(scenario)) === String(sourceScenario?.domain?.parent_scenario_id)) ?? null;
  const datasetLabel = sourceScenario?.datasetRef?.id
    ? `${sourceScenario.datasetRef.id} ${sourceScenario.datasetRef.version ?? ""}`.trim()
    : "Not recorded";
  const rfProfileLabel = sourceScenario?.plan?.settings?.propagationModelID
    ?? sourceScenario?.plan?.settings?.propagation_model
    ?? sourceScenario?.plan?.planningMode
    ?? "Default";

  const runAction = async (key, action, success) => {
    setBusy(key);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  };

  const saveVersion = () => runAction("save", () => onSaveVersion?.(changeSummary.trim()), "Version saved");
  const branchVersion = () => {
    if (!selectedRevision || !scenarioID) return;
    const name = branchName.trim() || `${sourceScenario?.name ?? "Scenario"} branch`;
    return runAction("branch", () => onBranchScenario?.({
      name,
      revisionId: selectedRevision.scenario_revision_id,
      scenarioId: scenarioID,
    }), "Branch created from the selected Version");
  };
  const duplicateCurrentScenario = () => {
    if (!scenarioID) return;
    const name = duplicateName.trim() || `${sourceScenario?.name ?? "Scenario"} copy`;
    return runAction("duplicate", () => onDuplicateScenario?.({ name, scenarioId: scenarioID }), "Independent Scenario duplicated");
  };
  const continueFromVersion = () => {
    if (!selectedRevision || !scenarioID) return;
    return runAction("continue", () => onContinueFromVersion?.({
      revisionId: selectedRevision.scenario_revision_id,
      scenarioId: scenarioID,
    }), "Draft opened from the selected Version");
  };

  if (!sourceScenario) {
    return (
      <section className="scenario-panel" aria-label="Scenario workspace">
        <div className="scenario-panel-heading">
          <div><span className="scenario-kicker">Scenario workspace</span><h3>Save a Version</h3></div>
          <span className="scenario-status unsaved">Unsaved changes</span>
        </div>
        <p className="empty-note">The current plan is a draft. Save it to create the first immutable Scenario and Version.</p>
        <div className="scenario-save-row">
          <input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} placeholder="Optional change summary" aria-label="Change summary" />
          <button type="button" className="panel-primary-action" onClick={saveVersion} disabled={busy === "save"}><Save size={14} /> {busy === "save" ? "Saving…" : "Save version"}</button>
        </div>
        {message ? <p className="scenario-message" role="status">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="scenario-panel" aria-label="Scenario workspace">
      <div className="scenario-panel-heading">
        <div>
          <span className="scenario-kicker">Scenario workspace</span>
          <h3>Scenario and Versions</h3>
          <p>RF compute reads the working draft; saved Versions are immutable input records.</p>
        </div>
        <span className={`scenario-status ${hasUnsavedChanges ? "unsaved" : "saved"}`} role="status" aria-label={statusLabel}>{statusLabel}</span>
      </div>

      <div className="scenario-switcher" aria-label="Scenario switcher">
        <div className="scenario-section-heading"><strong>Scenarios</strong><span>{scenarios.length} saved</span></div>
        {scenarios.map((scenario) => {
          const records = getScenarioRevisionRecords(scenario);
          const latest = records[records.length - 1];
          const isCurrent = String(scenarioListID(scenario)) === String(scenarioID);
          const isDraftSource = String(scenarioListID(scenario)) === String(scenarioID) && hasUnsavedChanges;
          const parent = scenarios.find((candidate) => String(scenarioListID(candidate)) === String(scenario.domain?.parent_scenario_id));
          const sourceRevision = findRevisionAcrossScenarios(latest?.parent_revision_id, scenarios);
          return (
            <button
              type="button"
              key={scenario.id}
              className={`scenario-switch-row ${isCurrent ? "active" : ""}`.trim()}
              onClick={() => onOpenScenario?.(scenario)}
              aria-current={isCurrent ? "true" : undefined}
            >
              <span className="scenario-switch-copy">
                <strong>{scenario.name}</strong>
                <small>Version {latest?.revision ?? 1} · {formatTimestamp(scenario.updatedAt)}</small>
                {parent ? <small><GitBranch size={11} /> Based on {parent.name}{sourceRevision ? ` · Version ${sourceRevision.revision}` : ""}</small> : null}
              </span>
              <span className="scenario-switch-state">{isDraftSource ? "Unsaved changes" : isCurrent ? "Open" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="scenario-overview">
        <div className="scenario-overview-heading">
          <div>
            <span className="scenario-kicker">Active Scenario</span>
            <div className="scenario-name-row">
              <input value={scenarioName} onChange={(event) => { setScenarioNameSourceID(sourceScenario.id); setScenarioNameDraft(event.target.value); }} aria-label="Scenario name" />
              <button type="button" className="icon-button" onClick={() => onRenameScenario?.(sourceScenario.id, scenarioName)} aria-label="Save scenario name" title="Save scenario name"><Save size={14} /></button>
            </div>
          </div>
          <div className="scenario-overview-actions">
            <button type="button" className="scenario-button" onClick={duplicateCurrentScenario} disabled={busy === "duplicate"}><Link2 size={13} /> Duplicate scenario</button>
            <button type="button" className="icon-button danger" onClick={() => onDeleteScenario?.(sourceScenario.id)} aria-label={`Delete scenario ${sourceScenario.name}`} title="Delete scenario"><Trash2 size={14} /></button>
          </div>
        </div>
        <p className="scenario-description">{sourceScenario.description || "No description"}</p>
        <div className="scenario-overview-grid">
          <Datum label="Versions" value={String(scenarioRecords.length)} />
          <Datum label="Parent" value={parentScenario?.name ?? "Independent"} />
          <Datum label="Last Run" value={latestRun ? `${capitalize(latestRun.run_type)} · ${formatTimestamp(latestRun.created_at)}` : "None"} />
          <Datum label="Last optimization" value={latestOptimization ? formatTimestamp(latestOptimization.created_at) : "None"} />
          <Datum label="Last Report" value={latestReport ? formatTimestamp(latestReport.generated_at) : "None"} />
          <Datum label="Dataset" value={datasetLabel} />
          <Datum label="RF mode" value={sourceScenario.plan?.planningMode ?? "single"} />
          <Datum label="RF profile" value={rfProfileLabel} />
        </div>
      </div>

      <div className="scenario-save-card">
        <div>
          <strong>Save a new Version</strong>
          <small>{staleResultRunLabel
            ? `Save Version saves the current plan. ${staleResultRunLabel} remains tied to the input that produced it.`
            : planDirty
              ? "The working plan needs a fresh RF run."
              : "Saved Versions never change."}</small>
        </div>
        <div className="scenario-save-row">
          <input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} placeholder="What changed? (optional)" aria-label="Version change summary" />
          <button type="button" className="panel-primary-action" onClick={saveVersion} disabled={busy === "save"}><Save size={14} /> {busy === "save" ? "Saving…" : "Save version"}</button>
        </div>
      </div>

      <div className="scenario-history" aria-label="Version history">
        <div className="scenario-section-heading"><strong><History size={14} /> Version history</strong><span>Input metadata only</span></div>
        <div className="scenario-version-list">
          {scenarioRecords.map((revision) => {
            const isSelected = String(selectedRevision?.scenario_revision_id) === String(revision.scenario_revision_id);
            const runsForRevision = runs.filter((run) => String(run.scenario_revision_id) === String(revision.scenario_revision_id));
            const reportsForRevision = [
              ...reportArtifacts.filter((artifact) => String(artifact.scenario_revision_id) === String(revision.scenario_revision_id)),
              ...reportDefinitions.filter((definition) => String(definition.scenario_revision_id) === String(revision.scenario_revision_id)),
            ];
            return (
              <button
                type="button"
                key={revision.scenario_revision_id}
                className={`scenario-version-row ${isSelected ? "active" : ""}`.trim()}
                onClick={() => { setSelectedRevisionId(revision.scenario_revision_id); onFocusRevision?.(revision.scenario_revision_id); }}
                aria-pressed={isSelected}
              >
                <span><strong>Version {revision.revision}</strong><small>{formatTimestamp(revision.created_at)}</small></span>
                <span><small>{revision.change_summary || "No change summary"}</small><small>{revision.provenance ?? "user_configured"}</small></span>
                <span className="scenario-version-counts"><small>{runsForRevision.length} Run{runsForRevision.length === 1 ? "" : "s"}</small><small>{reportsForRevision.length} Report{reportsForRevision.length === 1 ? "" : "s"}</small></span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedRevision ? <RevisionInspector
        onBranch={branchVersion}
        onContinue={continueFromVersion}
        onOpenReport={onOpenReport}
        onOpenReports={onOpenReports}
        onOpenRun={onOpenRun}
        branchName={branchName}
        busy={busy}
        revision={selectedRevision}
        revisionReports={revisionReports}
        revisionRuns={revisionRuns}
        setBranchName={setBranchName}
        previousRevision={previousRevisionFor(selectedRevision, scenarioRecords, scenarios)}
      /> : null}

      {scenarios.length > 1 ? <ScenarioCompare
        compareA={compareScenarioAID}
        compareB={compareScenarioBID}
        compareRecordsA={compareRecordsA}
        compareRecordsB={compareRecordsB}
        compareRevisionA={compareVersionA?.scenario_revision_id ?? compareRevisionA}
        compareRevisionB={compareVersionB?.scenario_revision_id ?? compareRevisionB}
        comparisonDiff={comparisonDiff}
        onOpenRun={onOpenRun}
        runs={runs}
        scenarios={scenarios}
        setCompareA={(value) => { setCompareA(value); setCompareRevisionA(""); }}
        setCompareB={(value) => { setCompareB(value); setCompareRevisionB(""); }}
        setCompareRevisionA={setCompareRevisionA}
        setCompareRevisionB={setCompareRevisionB}
      /> : null}

      <div className="scenario-duplicate-row">
        <label><span>Independent copy name</span><input value={duplicateName} onChange={(event) => setDuplicateName(event.target.value)} placeholder={`${sourceScenario.name} copy`} /></label>
        <span className="data-note">Duplicate Scenario starts a separate lineage. Branch keeps the parent link.</span>
      </div>
      {persistenceState === "saving" ? <p className="scenario-message" role="status">Saving workspace…</p> : null}
      {message ? <p className="scenario-message" role="status">{message}</p> : null}
      <p className="scenario-retention-note"><WandSparkles size={13} /> Runs and Reports link to exact Versions; inspecting them does not hydrate retained bytes or mutate the plan.</p>
    </section>
  );
}

function RevisionInspector({ branchName, busy, onBranch, onContinue, onOpenReport, onOpenReports, onOpenRun, previousRevision, revision, revisionReports, revisionRuns, setBranchName }) {
  const diff = previousRevision ? buildScenarioRevisionDiff(previousRevision, revision) : null;
  return (
    <section className="scenario-version-inspector" aria-label={`Version ${revision.revision} details`}>
      <div className="scenario-inspector-heading">
        <div><span className="scenario-kicker">Selected Version</span><h4>Version {revision.revision}</h4><small>{formatTimestamp(revision.created_at)} · {revision.change_summary || "No change summary"}</small></div>
        <div className="scenario-inspector-actions">
          <button type="button" className="scenario-button primary" onClick={onContinue} disabled={busy === "continue"}><History size={13} /> {busy === "continue" ? "Opening…" : "Continue from Version"}</button>
          <label className="scenario-inline-action"><span>Branch name</span><input value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="New branch" /></label>
          <button type="button" className="scenario-button" onClick={onBranch} disabled={busy === "branch"}><GitBranch size={13} /> {busy === "branch" ? "Branching…" : "Branch from here"}</button>
        </div>
      </div>
      <div className="scenario-lineage-facts">
        <Datum label="Source Version" value={revision.parent_revision_id ? `Version ${previousRevision?.revision ?? "?"}` : "Initial Version"} />
        <Datum label="Originating Run" value={revision.originating_run_id ?? "User configured"} />
        <Datum label="Originating solution" value={revision.originating_solution_id ?? "None"} />
        <Datum label="Fingerprint" value={revision.resolved_fingerprints?.scenario_fingerprint ?? "Not recorded"} />
      </div>
      <div className="scenario-diff-block">
        <div className="scenario-section-heading"><strong>Input changes</strong><span>{diff?.changed ? `${diff.changed_fields.length} changed field${diff.changed_fields.length === 1 ? "" : "s"}` : "No changes from parent"}</span></div>
        {diff?.changed ? <div className="scenario-diff-sections">{diff.sections.filter((section) => section.changed).map((section) => (
          <div className="scenario-diff-section" key={section.id}><strong>{section.label}</strong>{section.items.map((item) => <DiffItem item={item} key={item.path} />)}</div>
        ))}</div> : <p className="data-note">This Version is the first saved input state in its lineage.</p>}
      </div>
      <AssociatedRecords
        onOpenReport={onOpenReport}
        onOpenReports={onOpenReports}
        onOpenRun={onOpenRun}
        reports={revisionReports}
        runs={revisionRuns}
      />
    </section>
  );
}

function ScenarioCompare({ compareA, compareB, compareRecordsA, compareRecordsB, compareRevisionA, compareRevisionB, comparisonDiff, onOpenRun, runs, scenarios, setCompareA, setCompareB, setCompareRevisionA, setCompareRevisionB }) {
  const runA = compatibleRunFor(runs, compareA, compareRevisionA);
  const runB = compatibleRunFor(runs, compareB, compareRevisionB);
  const runsCompatible = runA && runB && semanticallyCompatibleRuns(runA, runB);
  return (
    <section className="scenario-compare" aria-label="Compare Scenario Versions">
      <div className="scenario-section-heading"><h4>Compare Scenario + Version</h4><span>Input state first</span></div>
      <div className="scenario-compare-selectors">
        <CompareSelector label="A" scenarios={scenarios} scenarioID={compareA} revisionID={compareRevisionA} revisions={compareRecordsA} onScenarioChange={setCompareA} onRevisionChange={setCompareRevisionA} />
        <CompareSelector label="B" scenarios={scenarios} scenarioID={compareB} revisionID={compareRevisionB} revisions={compareRecordsB} onScenarioChange={setCompareB} onRevisionChange={setCompareRevisionB} />
      </div>
      {comparisonDiff ? <div className="scenario-compare-result">
        <strong>{comparisonDiff.changed ? `${comparisonDiff.changed_fields.length} input difference${comparisonDiff.changed_fields.length === 1 ? "" : "s"}` : "Identical input state"}</strong>
        {comparisonDiff.changed ? <div className="scenario-compare-list">{comparisonDiff.sections.filter((section) => section.changed).map((section) => <span key={section.id}>{section.label}: {section.items.length}</span>)}</div> : null}
        <p className="data-note">RF results are not compared from input changes. Only semantically compatible retained Runs can be compared.</p>
        {runsCompatible ? <div className="scenario-compatible-runs"><span>Compatible {capitalize(runA.run_type)} Runs retained</span><button type="button" onClick={() => onOpenRun?.(runA)}>Open Run A</button><button type="button" onClick={() => onOpenRun?.(runB)}>Open Run B</button></div> : <p className="data-note">No compatible pair of retained Runs is available for this Version pair.</p>}
      </div> : <p className="data-note">Select two saved Versions to compare their input state.</p>}
    </section>
  );
}

function CompareSelector({ label, onRevisionChange, onScenarioChange, revisions, revisionID, scenarioID, scenarios }) {
  return (
    <div className="scenario-compare-selector">
      <strong>Scenario {label}</strong>
      <select aria-label={`Compare Scenario ${label}`} value={scenarioID} onChange={(event) => onScenarioChange(event.target.value)}>
        {scenarios.map((scenario) => <option key={scenario.id} value={scenarioListID(scenario)}>{scenario.name}</option>)}
      </select>
      <select aria-label={`Compare Version ${label}`} value={revisionID || revisions[revisions.length - 1]?.scenario_revision_id || ""} onChange={(event) => onRevisionChange(event.target.value)}>
        {revisions.map((revision) => <option key={revision.scenario_revision_id} value={revision.scenario_revision_id}>Version {revision.revision}</option>)}
      </select>
    </div>
  );
}

function AssociatedRecords({ onOpenReport, onOpenReports, onOpenRun, reports, runs }) {
  return (
    <div className="scenario-associated-records">
      <div><div className="scenario-section-heading"><strong>Associated Runs</strong><span>{runs.length}</span></div>{runs.length ? runs.map((run) => <button type="button" className="scenario-associated-row" key={run.run_id} onClick={() => onOpenRun?.(run)}><span>Open Run · {capitalize(run.run_type)} · {run.status}</span><small>{shortID(run.run_id)} · {formatTimestamp(run.created_at)}</small></button>) : <p className="data-note">No Runs recorded for this Version.</p>}</div>
      <div><div className="scenario-section-heading"><strong>Associated Reports</strong><span>{reports.length}</span></div>{reports.length ? reports.map((report) => <button type="button" className="scenario-associated-row" key={report.artifact_id} onClick={() => onOpenReport?.(report)}><span>Open Report · {report.title ?? "Planning report"}</span><small>{formatTimestamp(report.generated_at)}</small></button>) : <p className="data-note">No Reports for this Version.</p>}<button type="button" className="scenario-text-button" onClick={onOpenReports}>Open Reports</button></div>
    </div>
  );
}

function DiffItem({ item }) {
  if (item.changes?.length) {
    return <div className="scenario-diff-item"><span>{item.label}</span>{item.changes.map((change) => <small key={change.label}>{change.label}: {valueLabel(change.before)} → {valueLabel(change.after)}</small>)}</div>;
  }
  return <div className="scenario-diff-item"><span>{item.label}</span><small>{valueLabel(item.before)} → {valueLabel(item.after)}</small></div>;
}

function Datum({ label, value }) {
  return <div><dt>{label}</dt><dd title={String(value ?? "")}>{value ?? "Not recorded"}</dd></div>;
}

function scenarioListID(scenario) {
  return scenario?.domain?.scenario_id ?? scenario?.id ?? "";
}

function previousRevisionFor(revision, revisions, scenarios = []) {
  if (!revision) return null;
  return revisions.find((candidate) => String(candidate.scenario_revision_id) === String(revision.parent_revision_id))
    ?? findRevisionAcrossScenarios(revision.parent_revision_id, scenarios)
    ?? revisions.find((candidate) => Number(candidate.revision) === Number(revision.revision) - 1)
    ?? null;
}

function findRevisionAcrossScenarios(revisionID, scenarios = []) {
  if (!revisionID) return null;
  for (const scenario of scenarios) {
    const revision = getScenarioRevisionRecords(scenario).find((candidate) => String(candidate.scenario_revision_id) === String(revisionID));
    if (revision) return revision;
  }
  return null;
}

function newestForScenario(records, scenarioID, timeField = "created_at") {
  return records.filter((record) => String(record.scenario_id) === String(scenarioID)).sort((left, right) => String(right[timeField] ?? "").localeCompare(String(left[timeField] ?? "")))[0] ?? null;
}

function compatibleRunFor(runs, scenarioID, revisionID) {
  return runs.find((run) => String(run.scenario_id) === String(scenarioID) && String(run.scenario_revision_id) === String(revisionID) && run.status === "succeeded") ?? null;
}

function semanticallyCompatibleRuns(left, right) {
  if (!left || !right || left.run_type !== right.run_type) return false;
  const leftDataset = left.dataset_references?.[0];
  const rightDataset = right.dataset_references?.[0];
  if (!leftDataset?.dataset_id || !rightDataset?.dataset_id
    || leftDataset.dataset_id !== rightDataset.dataset_id
    || leftDataset.version !== rightDataset.version) return false;
  const leftModel = left.rf_contract?.model_id ?? left.rf_contract?.model ?? left.rf_contract?.model_version ?? null;
  const rightModel = right.rf_contract?.model_id ?? right.rf_contract?.model ?? right.rf_contract?.model_version ?? null;
  const leftEngine = left.engine?.name || left.engine?.version ? `${left.engine?.name ?? ""}@${left.engine?.version ?? ""}` : null;
  const rightEngine = right.engine?.name || right.engine?.version ? `${right.engine?.name ?? ""}@${right.engine?.version ?? ""}` : null;
  if (!leftModel && !leftEngine) return false;
  return leftModel === rightModel && leftEngine === rightEngine;
}

function valueLabel(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }
  return String(value);
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function shortID(value) {
  const text = String(value ?? "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text || "—";
}

function capitalize(value) {
  const text = String(value ?? "record");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
