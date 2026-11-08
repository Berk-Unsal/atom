import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildRunExecutionContext,
  captureOptimizationRun,
  captureSimulationRun,
  identitiesFromResult,
} from "../domain/runCapture.js";
import { createOptimizationRun, createSimulationRun, transitionRun } from "../domain/run.js";
import { datasetReference } from "../utils/projectStore.js";
import { platform } from "../platform/index.js";

/**
 * Owns durable Run capture and the association from a successful live Run to
 * the result currently shown by App. Compute requests and result semantics stay
 * with their named simulation/optimization workflows.
 */
export default function useRunExecution({
  activeProject,
  activeScenario,
  appMeta,
  runHistory,
  settings,
  runtime = platform,
} = {}) {
  const { saveRun, updateRunLifecycle } = runHistory;
  const [currentResultRun, setCurrentResultRun] = useState(null);
  const [runHistoryWarning, setRunHistoryWarning] = useState("");
  const latestOptimizationRunRef = useRef(null);
  const scopesRef = useRef(new Map());
  const sequenceRef = useRef(0);
  useEffect(() => { sequenceRef.current++; }, [activeProject?.id, activeScenario?.id]);

  const persistRun = useCallback(async (run) => {
    const saved = await saveRun(run);
    if (!saved) {
      setRunHistoryWarning("This computation completed, but its local run history record could not be saved.");
    } else {
      setRunHistoryWarning("");
    }
    return saved;
  }, [saveRun]);

  const beginRun = useCallback(async ({ request: requestPayload, runType, optimizerContract = null } = {}) => {
    const scope = { sequence: ++sequenceRef.current, isCurrent: runtime.captureOperation() };
    const rfContract = {
      model_version: appMeta?.model_version ?? null,
      receiver: {
        sensitivity_dbm: settings.receiverSensitivityDbm ?? null,
        noise_figure_db: settings.noiseFigureDb ?? null,
        required_snr_db: settings.requiredSnrDb ?? null,
      },
      interference: {
        bandwidth_mhz: settings.interferenceBandwidthMHz ?? null,
        load_pct: settings.cellLoadPct ?? null,
      },
      applied_defaults: {
        frequency_ghz: settings.frequencyGHz,
        tx_power_dbm: settings.txPowerDbm,
        radius_m: settings.radiusMeters,
        beam_width_deg: settings.beamWidthDeg,
      },
    };
    const context = buildRunExecutionContext({
      appMeta,
      datasetRef: activeProject?.datasetRef ?? datasetReference(appMeta),
      optimizerContract,
      project: activeProject,
      request: requestPayload,
      rfContract,
      scenario: activeScenario,
      runType,
      source: activeScenario ? "scenario_draft" : "draft",
    });
    const queued = runType === "optimization"
      ? createOptimizationRun({ ...context, status: "queued" })
      : createSimulationRun({ ...context, status: "queued" });
    await persistRun(queued);
    const running = transitionRun(queued, "running");
    await persistRun(running);
    scopesRef.current.set(running.run_id, scope);
    return { context, running };
  }, [activeProject, activeScenario, appMeta, persistRun, runtime, settings]);

  const finishRun = useCallback(async ({
    details = null,
    error: runError = null,
    request: requestPayload,
    response = null,
    result = null,
    running,
    status = null,
    warnings = [],
  } = {}) => {
    if (!running) return null;
    const identity = identitiesFromResult(response ?? result);
    const context = { ...running, ...identity };
    const finalRun = running.run_type === "optimization"
      ? captureOptimizationRun({
        context,
        request: requestPayload,
        response,
        details,
        error: runError,
        status,
        warnings,
      })
      : captureSimulationRun({
        context,
        request: requestPayload,
        result,
        error: runError,
        status,
        warnings,
      });
    await persistRun(finalRun);
    const scope = scopesRef.current.get(finalRun.run_id);
    scopesRef.current.delete(finalRun.run_id);
    // Retain the truthful historical Run, but never associate an old database
    // completion with a newer action/workspace or replacement desktop runtime.
    const current = scope && scope.sequence === sequenceRef.current && scope.isCurrent();
    if (current && finalRun.run_type === "optimization") latestOptimizationRunRef.current = finalRun;
    if (current && finalRun.status === "succeeded" && ["simulation", "optimization"].includes(finalRun.run_type)) {
      setCurrentResultRun(finalRun);
    }
    return finalRun;
  }, [persistRun]);

  const selectParetoSolution = useCallback((solutionId) => {
    const run = latestOptimizationRunRef.current;
    if (!run || run.status !== "succeeded" || run.details?.selected_solution_id === solutionId) return;
    const nextRun = {
      ...run,
      details: { ...(run.details ?? {}), selected_solution_id: solutionId },
    };
    updateRunLifecycle(run.run_id, { details: nextRun.details }).then((updated) => {
      if (updated) latestOptimizationRunRef.current = updated;
    });
  }, [updateRunLifecycle]);

  const clearCurrentResult = useCallback(() => setCurrentResultRun(null), []);
  const clearRunHistoryWarning = useCallback(() => setRunHistoryWarning(""), []);

  return {
    state: { currentResultRun, runHistoryWarning },
    actions: {
      beginRun,
      clearCurrentResult,
      clearRunHistoryWarning,
      finishRun,
      persistRun,
      selectParetoSolution,
      setHistoryWarning: setRunHistoryWarning,
    },
  };
}
