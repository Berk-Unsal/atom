import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  FileText,
  MapPin,
  PlayCircle,
  RadioTower,
  Server,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import ControlPanel from "./components/ControlPanel.jsx";
import DisclosureSection from "./components/DisclosureSection.jsx";
import ExperimentPanel from "./components/ExperimentPanel.jsx";
import InterferenceResultsPanel from "./components/InterferenceResultsPanel.jsx";
import MeasurementValidationPanel from "./components/MeasurementValidationPanel.jsx";
import MaterialReferencePanel from "./components/MaterialReferencePanel.jsx";
import BuildingEntryPanel from "./components/BuildingEntryPanel.jsx";
import InventoryPanel from "./components/InventoryPanel.jsx";
import RunHistoryPanel from "./components/RunHistoryPanel.jsx";
import ReportArtifactsPanel from "./components/ReportArtifactsPanel.jsx";
import ScenarioPanel from "./components/ScenarioPanel.jsx";
import ApplySolutionDialog from "./components/ApplySolutionDialog.jsx";
import ResultContextBadge from "./components/ResultContextBadge.jsx";
import ResearchReferenceBadge from "./components/ResearchReferenceBadge.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import OptimizationGoalsPanel from "./components/OptimizationGoalsPanel.jsx";
import PathProfilePanel from "./components/PathProfilePanel.jsx";
import P1411CandidatePanel from "./components/P1411CandidatePanel.jsx";
import SpecularReflectionReferencePanel from "./components/SpecularReflectionReferencePanel.jsx";
import SubTHZReferencePanel from "./components/SubTHZReferencePanel.jsx";
import SurfacePanel from "./components/SurfacePanel.jsx";
import {
  CommandBar,
  MapLegend,
  MapToolbar,
  ProjectMenu,
  ToolDrawer,
  ToolSubnav,
  UndoToast,
  WorkflowRail,
} from "./components/WorkspaceChrome.jsx";
import { WORKSPACE_TOOLS } from "./components/workspaceTools.js";
import useRequestCoordinator from "./hooks/useRequestCoordinator.js";
import useProjectWorkspace from "./hooks/useProjectWorkspace.js";
import useRunHistory from "./hooks/useRunHistory.js";
import useReportArtifacts from "./hooks/useReportArtifacts.js";
import {
  buildRunExecutionContext,
  captureOptimizationRun,
  captureSimulationRun,
  identitiesFromResult,
} from "./domain/runCapture.js";
import { createOptimizationRun, createSimulationRun, transitionRun } from "./domain/run.js";
import { createReportDefinition } from "./domain/report.js";
import { buildResultContext, buildWorkspaceLineage } from "./domain/resultContext.js";
import { selectScenarioArtifacts } from "./utils/scenarioSnapshot.js";
import { getJSON, isAbortError, postBlob, postJSON } from "./utils/apiClient.js";
import { is5GCoreFrequency, networkTechLabelForFrequency } from "./utils/networkTech.js";
import { runNetworkSimulationQueue } from "./utils/networkSimulationQueue.js";
import { pointInPolygon, selectNearestTowers } from "./utils/polygonSelection.js";
import { MAX_NETWORK_CELLS, normalizeNetworkSelection, toggleNetworkSelection } from "./utils/networkSelection.js";
import { readMeasurementCsvFile } from "./utils/measurementCsv.js";
import { duplicateInventoryCell } from "./utils/inventoryImport.js";
import {
  buildCellExplanationCacheKey,
  buildCellMarginalEffectView,
  buildNetworkOptimizationComparison,
  buildParetoCellConfigurations,
  buildParetoSolutionComparison,
  createDefaultOptimizationConfig,
  getOptimizationRunKey,
  isRadioQualityEvaluated,
  normalizeOptimizationConfig,
  optimizationConfigValidationMessage,
  rankOptimizationResponse,
  resolveSelectedParetoSolutionId,
  OPTIMIZATION_OBJECTIVES,
} from "./utils/optimizationConfig.js";
import { effectiveReceiverSensitivityDbm, resolveRFProfile, rfProfileOverrideFromProperties, validateRFProfile } from "./utils/rfProfile.js";
import { datasetReference, isDatasetCompatible } from "./utils/projectStore.js";
import { compactRecommendationResponse } from "./utils/recommendations.js";
import {
  buildComparisonSnapshot,
  combineNetworkSimulations,
  formatCompactNumber,
  formatCoreLabState,
  formatMetric,
  formatNumber,
  formatScenario,
  isCalibrationProfileCompatible,
  networkAzimuthFor,
  networkAzimuthMap,
  normalizedNetworkScore,
  UNAVAILABLE_VALUE,
} from "./utils/appWorkspace.js";
import { cellIDForTower, filterRayFeatures, RAY_SCOPE_ALL, RAY_SCOPE_HIDDEN, RAY_SCOPE_SELECTED } from "./utils/rfVisualization.js";
import { CORE_LAB_SCENARIOS, DEFAULT_SIMULATION, NETWORK_TECH_OPTIONS, networkTechnologyForFrequency } from "./generated/policy.js";
import {
  buildInterferencePayload,
  buildCoverageSurfacePayload,
  buildMeasurementPayload,
  buildNetworkCellExplanationPayload,
  buildNetworkOptimizationPayload,
  buildPathProfilePayload,
  buildP1411ReferencePayload,
  buildSpecularReflectionReferencePayload,
  buildSubTHZReferencePayload,
  buildRecommendationPayload,
  buildSimulationPayload,
  buildCoverageSurfaceSourceKey,
  buildBuildingEntryAnalysisPayload,
  buildBuildingEntryAnalysisSourceKey,
} from "./utils/requestPayloads.js";
import {
  buildHistoricalPlanningReport,
  buildPlanningReport,
  buildComparisonBarChartSvg,
  buildComparisonSlopeChartSvg,
  getComparisonMetrics,
  downloadMarkdownReport,
  openPdfReport,
} from "./utils/reportExport.js";
import { buildReportArtifactOutput, downloadReportBytes, openStoredHtmlReport } from "./utils/reportArtifact.js";

const APP_ICON_URL = "/icon/icon.svg";
const CORE_LAB_START_COMMAND =
  "docker compose -f docker-compose.yml -f docker-compose.core-lab.yml --profile core-lab up";
const EMPTY_INTERFERENCE_ANALYSIS = {
  geojson: { type: "FeatureCollection", features: [] },
  demand_geojson: { type: "FeatureCollection", features: [] },
  stats: null,
  model: null,
};

const EMPTY_SIMULATION = {
  geojson: { type: "FeatureCollection", features: [] },
  stats: null,
};

const EMPTY_COVERAGE_GAPS = {
  geojson: { type: "FeatureCollection", features: [] },
  stats: null,
};

const EMPTY_CELL_EXPLANATION_STATE = {
  key: null,
  solutionID: null,
  cellID: null,
  loading: false,
  result: null,
  error: "",
};

const DEFAULT_LAYER_VISIBILITY = {
  rays: true,
  gaps: true,
  selectedCells: true,
  communicationPaths: true,
  interference: true,
  measurements: true,
  surfaces: true,
  buildings: false,
};

const COVERAGE_SURFACE_STATUS = {
  AVAILABLE: "available",
  ERROR: "error",
  LOADING: "loading",
  READY: "ready",
  UNAVAILABLE: "unavailable",
};

function coverageSurfaceSettingsFor(tower, settings, planningMode, networkAzimuths) {
  if (planningMode !== "network") return settings;
  return {
    ...settings,
    azimuthDeg: networkAzimuthFor(tower, networkAzimuths, settings.azimuthDeg),
  };
}

function coverageSurfaceProfileIndexFor(tower, planningMode, selectedNetworkTowerIds) {
  if (planningMode !== "network") return 0;
  const index = selectedNetworkTowerIds.findIndex((towerID) => String(towerID) === String(tower.id));
  return index >= 0 ? index : 0;
}

export default function App() {
  const [activeTool, setActiveTool] = useState("setup");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerMode, setDrawerMode] = useState("tool");
  const [previousTool, setPreviousTool] = useState("setup");
  const [openPropagationAdvancedRequest, setOpenPropagationAdvancedRequest] = useState(0);
  const [openScenarioWorkspaceRequest, setOpenScenarioWorkspaceRequest] = useState(0);
  const [researchActivity, setResearchActivity] = useState(false);
  const [activeResultsView, setActiveResultsView] = useState("rf");
  const [lastAnalysisKind, setLastAnalysisKind] = useState("rf");
  const [networkResultKind, setNetworkResultKind] = useState(null);
  const [planningMode, setPlanningMode] = useState("single");
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [selectionPolygon, setSelectionPolygon] = useState([]);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [layerVisibility, setLayerVisibility] = useState(DEFAULT_LAYER_VISIBILITY);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [selectedMapObject, setSelectedMapObject] = useState(null);
  const [selectedMapCellId, setSelectedMapCellId] = useState(null);
  const [rayScope, setRayScope] = useState(RAY_SCOPE_ALL);
  const [fitRequestVersion, setFitRequestVersion] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SIMULATION);
  const [planDirty, setPlanDirty] = useState(false);
  const [towers, setTowers] = useState([]);
	const [isPlacingCell, setIsPlacingCell] = useState(false);
  const [isSelectingPathEndpoint, setIsSelectingPathEndpoint] = useState(false);
  const [pathProfileEndpoint, setPathProfileEndpoint] = useState(null);
  const [pathProfile, setPathProfile] = useState(null);
  const [subTHZReference, setSubTHZReference] = useState(null);
  const [p1411Reference, setP1411Reference] = useState(null);
  const [specularReflectionReference, setSpecularReflectionReference] = useState(null);
  const [measurementValidation, setMeasurementValidation] = useState(null);
  const [materialReference, setMaterialReference] = useState(null);
  const [coverageSurface, setCoverageSurface] = useState(null);
  const [coverageSurfaceRequest, setCoverageSurfaceRequest] = useState(null);
  const [coverageSurfaceCellId, setCoverageSurfaceCellId] = useState(null);
  const [coverageSurfaceSourceKey, setCoverageSurfaceSourceKey] = useState(null);
  const [coverageSurfaceStatus, setCoverageSurfaceStatus] = useState(COVERAGE_SURFACE_STATUS.UNAVAILABLE);
  const [coverageSurfaceError, setCoverageSurfaceError] = useState("");
  const [surfaceOptions, setSurfaceOptions] = useState({ cellSizeMeters: 25, thresholdsDBm: [-110, -100, -90, -80], opacity: 0.62, displayThresholdDBm: -110 });
  const [selectedTower, setSelectedTower] = useState(null);
  const [selectedNetworkTowerIds, setSelectedNetworkTowerIds] = useState([]);
  const [networkAzimuths, setNetworkAzimuths] = useState({});
  const [optimizationConfig, setOptimizationConfig] = useState(createDefaultOptimizationConfig);
  const [simulation, setSimulation] = useState(EMPTY_SIMULATION);
  const [simulationRevision, setSimulationRevision] = useState(0);
  const [coverageGaps, setCoverageGaps] = useState(EMPTY_COVERAGE_GAPS);
  const [coverageGapRevision, setCoverageGapRevision] = useState(0);
  const [interferenceAnalysis, setInterferenceAnalysis] = useState(EMPTY_INTERFERENCE_ANALYSIS);
  const [interferenceRevision, setInterferenceRevision] = useState(0);
  const [interferenceMetric, setInterferenceMetric] = useState("sinr");
  const [buildingSummary, setBuildingSummary] = useState(null);
  const [buildingEntryAnalysis, setBuildingEntryAnalysis] = useState(null);
  const [buildingEntrySourceKey, setBuildingEntrySourceKey] = useState(null);
  const [appMeta, setAppMeta] = useState(null);
	const [datasetRevision, setDatasetRevision] = useState(0);
	const [hydratedDatasetRevision, setHydratedDatasetRevision] = useState(0);
	const [workspaceRestored, setWorkspaceRestored] = useState(false);
	const [installedDatasets, setInstalledDatasets] = useState({ active_id: "", datasets: [], warnings: [] });
	const [isSwitchingDataset, setIsSwitchingDataset] = useState(false);
	const [datasetMessage, setDatasetMessage] = useState("");
  const [siteRecommendations, setSiteRecommendations] = useState(null);
  const [measurementSamples, setMeasurementSamples] = useState([]);
  const [measurementProvenance, setMeasurementProvenance] = useState(null);
  const [measurementAnalysis, setMeasurementAnalysis] = useState(null);
  const [calibrationProfile, setCalibrationProfile] = useState(null);
  const [activeRFTask, setActiveRFTask] = useState(null);
  const [optimizationDiagnostics, setOptimizationDiagnostics] = useState(null);
  const [networkOptimization, setNetworkOptimization] = useState(null);
  const [selectedParetoSolutionId, setSelectedParetoSolutionId] = useState(null);
  const [focusedRevisionId, setFocusedRevisionId] = useState(null);
  const [focusedRunId, setFocusedRunId] = useState(null);
  const [currentResultRun, setCurrentResultRun] = useState(null);
  const [cellExplanationState, setCellExplanationState] = useState(EMPTY_CELL_EXPLANATION_STATE);
  const [comparison, setComparison] = useState({ before: null, after: null });
  const [coreLabEnabled, setCoreLabEnabled] = useState(false);
  const [coreLab, setCoreLab] = useState({
    events: null,
    isLoading: false,
    lastError: "",
    scenario: "normal",
    sessions: null,
    status: null,
    topology: null,
  });
  const [error, setError] = useState("");
  const [navigationNotice, setNavigationNotice] = useState("");
  const [runHistoryWarning, setRunHistoryWarning] = useState("");
  const [reportWarning, setReportWarning] = useState("");
  const [undoNotice, setUndoNotice] = useState(null);
  const restoredProjectRef = useRef(null);
  const lastScenarioSourceRef = useRef(null);
  const cellExplanationCacheRef = useRef(new Map());
  const latestOptimizationRunRef = useRef(null);
  const coverageSurfaceSourceKeyRef = useRef(null);
  const buildingEntrySourceKeyRef = useRef(null);
  const clearCellExplanation = useCallback(() => {
    cellExplanationCacheRef.current.clear();
    setCellExplanationState(EMPTY_CELL_EXPLANATION_STATE);
  }, []);
  const requests = useRequestCoordinator();
  const projectWorkspace = useProjectWorkspace(appMeta);
  const activeProject = projectWorkspace.activeProject;
  const activeScenario = useMemo(
    () => activeProject?.scenarios?.find((scenario) => scenario.id === activeProject.activeScenarioId) ?? null,
    [activeProject],
  );
  useEffect(() => {
    if (activeScenario && activeProject?.id) {
      lastScenarioSourceRef.current = { projectId: activeProject.id, scenario: activeScenario };
    }
  }, [activeProject?.id, activeScenario]);
  const scenarioSource = useMemo(
    () => activeScenario
      ?? activeProject?.scenarios?.find((scenario) => (
        String(scenario.id) === String(activeProject?.draft?.sourceScenarioId)
          || String(scenario.domain?.scenario_id) === String(activeProject?.draft?.sourceScenarioId)
      ))
      ?? (lastScenarioSourceRef.current?.projectId === activeProject?.id ? lastScenarioSourceRef.current.scenario : null)
      ?? null,
    [activeProject, activeScenario],
  );
  const draftSourceScenario = activeScenario ? null : scenarioSource;
  const runHistory = useRunHistory({
    projectId: activeProject?.domain?.project_id ?? activeProject?.id ?? null,
  });
  const reportArtifacts = useReportArtifacts({
    projectId: activeProject?.domain?.project_id ?? activeProject?.id ?? null,
  });
  const [selectedArtifactId, setSelectedArtifactId] = useState(null);
  const workspaceLoaded = projectWorkspace.loaded;
  const visibleError = projectWorkspace.error || error;
  const saveProjectDraft = projectWorkspace.saveDraft;
  const saveProjectScenario = projectWorkspace.saveScenario;
  const saveProjectScenarioVersion = projectWorkspace.saveScenarioVersion;

  const persistRunHistoryRecord = useCallback(async (run) => {
    const saved = await runHistory.saveRun(run);
    if (!saved) {
      setRunHistoryWarning("This computation completed, but its local run history record could not be saved.");
    } else {
      setRunHistoryWarning("");
    }
    return saved;
  }, [runHistory]);

  const beginDurableRun = useCallback(async ({ request: requestPayload, runType, optimizerContract = null } = {}) => {
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
    await persistRunHistoryRecord(queued);
    const running = transitionRun(queued, "running");
    await persistRunHistoryRecord(running);
    return { context, running };
  }, [activeProject, activeScenario, appMeta, persistRunHistoryRecord, settings]);

  const finishDurableRun = useCallback(async ({ details = null, error: runError = null, request: requestPayload, response = null, result = null, running, status = null, warnings = [] } = {}) => {
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
    await persistRunHistoryRecord(finalRun);
    if (finalRun.run_type === "optimization") latestOptimizationRunRef.current = finalRun;
    if (finalRun.status === "succeeded" && ["simulation", "optimization"].includes(finalRun.run_type)) {
      setCurrentResultRun(finalRun);
    }
    return finalRun;
  }, [persistRunHistoryRecord]);

  const selectParetoSolution = useCallback((solutionId) => {
    setSelectedParetoSolutionId(solutionId);
    const run = latestOptimizationRunRef.current;
    if (!run || run.status !== "succeeded" || run.details?.selected_solution_id === solutionId) return;
    const nextRun = {
      ...run,
      details: { ...(run.details ?? {}), selected_solution_id: solutionId },
    };
    runHistory.updateRunLifecycle(run.run_id, { details: nextRun.details }).then((updated) => {
      if (updated) latestOptimizationRunRef.current = updated;
    });
  }, [runHistory]);

  const isLoading = activeRFTask === "simulation" || activeRFTask === "network_evaluation";
  const isEvaluatingNetwork = activeRFTask === "network_evaluation";
  const isOptimizing = activeRFTask === "optimization";
  const isAnalyzingInterference = activeRFTask === "interference";
  const displayedNetworkOptimization = useMemo(
    () => rankOptimizationResponse(networkOptimization, optimizationConfig),
    [networkOptimization, optimizationConfig],
  );
  const optimizationRunKey = useMemo(
    () => getOptimizationRunKey(displayedNetworkOptimization),
    [displayedNetworkOptimization],
  );
  const cellExplanationView = useMemo(
    () => buildCellMarginalEffectView(cellExplanationState.result, optimizationConfig),
    [cellExplanationState.result, optimizationConfig],
  );
  const cellExplanation = useMemo(
    () => ({ ...cellExplanationState, view: cellExplanationView }),
    [cellExplanationState, cellExplanationView],
  );
  const networkComparison = useMemo(
    () => buildNetworkOptimizationComparison(displayedNetworkOptimization, optimizationConfig),
    [displayedNetworkOptimization, optimizationConfig],
  );
  const rankedParetoSolutions = useMemo(
    () => displayedNetworkOptimization?.pareto_frontier ?? [],
    [displayedNetworkOptimization],
  );
  const recommendedSolutionId = useMemo(() => {
    const responseID = displayedNetworkOptimization?.optimization?.recommended_solution_id;
    return rankedParetoSolutions.find((solution) => String(solution.id) === String(responseID))?.id
      ?? rankedParetoSolutions[0]?.id
      ?? null;
  }, [displayedNetworkOptimization, rankedParetoSolutions]);
  const selectedSolutionId = useMemo(
    () => resolveSelectedParetoSolutionId(rankedParetoSolutions, recommendedSolutionId, selectedParetoSolutionId),
    [rankedParetoSolutions, recommendedSolutionId, selectedParetoSolutionId],
  );
  const selectedParetoSolution = rankedParetoSolutions.find((solution) => String(solution.id) === String(selectedSolutionId)) ?? null;
  const recommendedParetoSolution = rankedParetoSolutions.find((solution) => String(solution.id) === String(recommendedSolutionId)) ?? null;
  const selectedParetoComparison = useMemo(
    () => buildParetoSolutionComparison(selectedParetoSolution, recommendedParetoSolution, optimizationConfig),
    [optimizationConfig, recommendedParetoSolution, selectedParetoSolution],
  );
  const isParetoOptimizationResult = Boolean(
    rankedParetoSolutions.length > 0
      && displayedNetworkOptimization?.optimization?.recommended !== false
      && rankedParetoSolutions.every(hasParetoSolutionData)
      && (networkResultKind === "optimization" || displayedNetworkOptimization?.optimization?.recommended === true || displayedNetworkOptimization?.baseline),
  );
  const activeComparison = lastAnalysisKind === "network" ? networkComparison : comparison;
  const isRecommendingSites = activeRFTask === "recommendation";
  const isEvaluatingMeasurements = activeRFTask === "measurements";
  const isAnalyzingPathProfile = activeRFTask === "path_profile";
  const isAnalyzingSubTHZReference = activeRFTask === "sub_thz_reference";
  const isAnalyzingP1411Reference = activeRFTask === "p1411_reference";
  const isAnalyzingSpecularReflectionReference = activeRFTask === "specular_reflection_reference";
  const isAnalyzingMeasurementValidation = activeRFTask === "sub_thz_validation";
  const isAnalyzingMaterialReference = activeRFTask === "sub_thz_material";
  const isGeneratingSurface = activeRFTask === "coverage_surface";

  const showUndoNotice = useCallback((message, onUndo) => {
    setUndoNotice({ id: `${Date.now()}-${Math.random()}`, message, onUndo });
  }, []);

  useEffect(() => {
    if (!undoNotice) return undefined;
    const timeout = window.setTimeout(() => setUndoNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [undoNotice]);

  useEffect(() => {
    let isMounted = true;
    getJSON("/api/meta", "Application metadata could not be loaded")
      .then((meta) => { if (isMounted) setAppMeta(meta); })
      .catch(() => { if (isMounted) setAppMeta(null); });
    return () => { isMounted = false; };
	}, [datasetRevision]);

	useEffect(() => {
		let isMounted = true;
		getJSON("/api/datasets", "Installed datasets could not be loaded")
			.then((catalog) => { if (isMounted) setInstalledDatasets(catalog); })
			.catch((requestError) => { if (isMounted) setDatasetMessage(requestError.message); });
		return () => { isMounted = false; };
	}, [datasetRevision]);

  useEffect(() => {
    let isMounted = true;
    getJSON("/api/towers", "Tower GeoJSON could not be loaded")
      .then((geojson) => {
        if (!isMounted) {
          return;
        }
        if (!geojson || typeof geojson !== "object" || !Array.isArray(geojson.features)) {
          throw new Error("Tower endpoint returned invalid GeoJSON");
        }
        const loadedTowers = (geojson.features ?? [])
          .filter((feature) => feature.geometry?.type === "Point")
          .map((feature) => {
            const rfProfile = rfProfileOverrideFromProperties(feature.properties);
            return {
              id: String(feature.id ?? `${feature.properties?.radio_type}-${feature.properties?.cell_id}`),
              cellId: feature.properties?.cell_id,
              radioType: feature.properties?.radio_type,
              isSimulated: Boolean(feature.properties?.is_simulated),
              coordinates: feature.geometry.coordinates,
					inventorySource: "dataset",
					editable: true,
              ...(Object.keys(rfProfile).length ? { rfProfile } : {}),
            };
          });
        setTowers(loadedTowers);
				setSelectedTower((current) => loadedTowers.find((tower) => tower.id === current?.id) ?? loadedTowers[0] ?? null);
				setHydratedDatasetRevision(datasetRevision);
				setIsSwitchingDataset(false);
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.message);
					setIsSwitchingDataset(false);
        }
      });
    return () => {
      isMounted = false;
    };
	}, [datasetRevision]);

  useEffect(() => {
    let isMounted = true;
    getJSON("/api/buildings/summary", "Building summary could not be loaded")
      .then((summary) => {
        if (isMounted && summary) {
          setBuildingSummary(summary);
        }
      })
      .catch(() => {
        if (isMounted) {
          setBuildingSummary(null);
        }
      });
    return () => {
      isMounted = false;
    };
	}, [datasetRevision]);

  useEffect(() => {
    if (towers.length === 0) {
      return;
    }
    setSelectedNetworkTowerIds((current) => {
      const normalized = normalizeNetworkSelection(current, towers);
      const isCanonical = normalized.length === current.length
        && normalized.every((id, index) => id === current[index]);
      return isCanonical ? current : normalized;
    });
  }, [towers]);

  const clearInterferenceAnalysis = useCallback(() => {
    setInterferenceAnalysis(EMPTY_INTERFERENCE_ANALYSIS);
    setInterferenceRevision((current) => current + 1);
    setSelectedMapObject((current) =>
      current?.type === "interference_sample" ? null : current,
    );
  }, []);

  const restorePlanningSnapshot = useCallback((snapshot) => {
    const plan = snapshot?.plan ?? snapshot;
    if (!plan) return;
    clearCellExplanation();
    const restoredSettings = { ...DEFAULT_SIMULATION, ...plan.settings };
    const calibrationCompatible = isCalibrationProfileCompatible(snapshot?.calibrationProfile, restoredSettings, appMeta);
    if (!calibrationCompatible) restoredSettings.calibrationOffsetDb = 0;
		const restoredInventory = Array.isArray(plan.inventory)
			? plan.inventory.filter((tower) => tower && typeof tower.id === "string" && Array.isArray(tower.coordinates) && tower.coordinates.length >= 2)
			: towers;
		if (restoredInventory !== towers) setTowers(restoredInventory);
		setSettings(restoredSettings);
    if (plan.planningMode) setPlanningMode(plan.planningMode);
    if (Array.isArray(plan.selectionPolygon)) setSelectionPolygon(plan.selectionPolygon);
		const restoredNetworkTowerIds = normalizeNetworkSelection(plan.selectedNetworkTowerIds, restoredInventory);
		setSelectedNetworkTowerIds(restoredNetworkTowerIds);
		setNetworkAzimuths(Object.fromEntries(
			Object.entries(plan.networkAzimuths ?? {})
				.filter(([towerID]) => restoredNetworkTowerIds.includes(String(towerID))),
		));
    setOptimizationConfig(normalizeOptimizationConfig(plan.optimizationConfig));
    if ([RAY_SCOPE_ALL, RAY_SCOPE_SELECTED, RAY_SCOPE_HIDDEN].includes(plan.rayScope)) setRayScope(plan.rayScope);
    else if (plan.layerVisibility?.rays === false) setRayScope(RAY_SCOPE_HIDDEN);
    setSelectedTower(
														restoredInventory.find((tower) => tower.id === String(plan.selectedTowerId))
														?? restoredInventory.find((tower) => restoredNetworkTowerIds.includes(tower.id))
														?? restoredInventory[0]
														?? null,
												);
    if (plan.selectedMapCellId !== null && plan.selectedMapCellId !== undefined) {
      setSelectedMapCellId(String(plan.selectedMapCellId));
    }
    if (plan.layerVisibility) setLayerVisibility((current) => ({ ...current, ...plan.layerVisibility }));
    const artifacts = snapshot?.artifacts;
    setSimulation(artifacts?.simulation ?? EMPTY_SIMULATION);
    setCoverageGaps(artifacts?.coverageGaps ?? EMPTY_COVERAGE_GAPS);
    setInterferenceAnalysis(artifacts?.interferenceAnalysis ?? EMPTY_INTERFERENCE_ANALYSIS);
    setNetworkOptimization(artifacts?.networkOptimization ?? null);
    setBuildingEntryAnalysis(artifacts?.buildingEntryAnalysis ?? null);
    setBuildingEntrySourceKey(artifacts?.buildingEntrySourceKey ?? null);
    setCoverageSurface(null);
    setCoverageSurfaceRequest(null);
    setCoverageSurfaceCellId(null);
    setCoverageSurfaceSourceKey(null);
    setCoverageSurfaceError("");
    setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.UNAVAILABLE);
    setSelectedParetoSolutionId(null);
    setOptimizationDiagnostics(artifacts?.optimizationDiagnostics ?? null);
    setSiteRecommendations(compactRecommendationResponse(artifacts?.siteRecommendations) ?? null);
    setMeasurementAnalysis(artifacts?.measurementAnalysis ?? null);
    setCalibrationProfile(calibrationCompatible ? snapshot?.calibrationProfile ?? null : null);
    setLastAnalysisKind(snapshot?.summary?.kind ?? "rf");
    setActiveResultsView(snapshot?.summary?.resultsView ?? "rf");
    const datasetStale = Boolean(appMeta && snapshot?.datasetRef && !isDatasetCompatible({ datasetRef: snapshot.datasetRef }, appMeta));
    const modelStale = Boolean(appMeta?.model_version && snapshot?.meta?.model_version && appMeta.model_version !== snapshot.meta.model_version);
    const restoredPlanDirty = Boolean(snapshot?.requiresRerun || datasetStale || modelStale || !calibrationCompatible);
    setPlanDirty(restoredPlanDirty);
    setCoverageSurfaceStatus(
      !restoredPlanDirty && Boolean(artifacts?.simulation?.stats || artifacts?.networkOptimization?.stats)
        ? COVERAGE_SURFACE_STATUS.AVAILABLE
        : COVERAGE_SURFACE_STATUS.UNAVAILABLE,
    );
    setSimulationRevision((current) => current + 1);
    setCoverageGapRevision((current) => current + 1);
    setInterferenceRevision((current) => current + 1);
  }, [appMeta, clearCellExplanation, towers]);

  useEffect(() => {
    if (!appMeta) return;
    const activeSnapshot = activeProject?.scenarios?.find((scenario) => scenario.id === activeProject.activeScenarioId) ?? activeProject?.draft;
    const datasetStale = activeProject && !isDatasetCompatible(activeProject, appMeta);
    const modelStale = Boolean(activeSnapshot?.meta?.model_version && activeSnapshot.meta.model_version !== appMeta.model_version);
    if (datasetStale || modelStale) setPlanDirty(true);
    if (calibrationProfile && !isCalibrationProfileCompatible(calibrationProfile, settings, appMeta)) {
      setCalibrationProfile(null);
      setSettings((current) => ({ ...current, calibrationOffsetDb: 0 }));
      setPlanDirty(true);
    }
  }, [activeProject, appMeta, calibrationProfile, settings]);

  useEffect(() => {
    const project = activeProject;
    if (!workspaceLoaded || !project || towers.length === 0 || restoredProjectRef.current === project.id) {
      return;
    }
    const activeScenario = project.scenarios.find((scenario) => scenario.id === project.activeScenarioId);
    restorePlanningSnapshot(activeScenario ?? project.draft);
    restoredProjectRef.current = project.id;
    setWorkspaceRestored(true);
  }, [activeProject, restorePlanningSnapshot, towers.length, workspaceLoaded]);

  useEffect(() => {
    if (!workspaceLoaded || restoredProjectRef.current !== activeProject?.id || hydratedDatasetRevision !== datasetRevision) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      saveProjectDraft({
        plan: {
          layerVisibility,
          planningMode,
          selectedNetworkTowerIds: normalizeNetworkSelection(selectedNetworkTowerIds, towers),
          networkAzimuths,
          optimizationConfig,
          selectedTowerId: selectedTower?.id ?? null,
          selectionPolygon,
          settings,
			inventory: towers,
        },
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [
    layerVisibility,
    planningMode,
    activeProject?.id,
    saveProjectDraft,
    selectedNetworkTowerIds,
    networkAzimuths,
    optimizationConfig,
    selectedTower?.id,
    selectionPolygon,
    settings,
		towers,
		datasetRevision,
		hydratedDatasetRevision,
    workspaceLoaded,
  ]);

  const simulateForSettings = useCallback(async (tower, nextSettings, signal) => {
    const requestPayload = buildSimulationPayload(tower, nextSettings);
    const payload = await postJSON(
      "/api/analyze-sector",
      requestPayload,
      "Sector analysis failed",
      signal,
    );
    return { coverageGaps: payload.coverage_gaps, simulation: payload.simulation };
  }, []);

  const simulateRaysForSettings = useCallback(async (tower, nextSettings, signal, profileIndex = 0) => {
    return postJSON(
      "/api/simulate",
      buildSimulationPayload(tower, nextSettings, profileIndex),
      "Simulation request failed",
      signal,
    );
  }, []);

  const analyzePathProfile = useCallback(async (options) => {
    if (!selectedTower || !pathProfileEndpoint) {
      setError("Select a transmitter cell and receiver point first");
      return;
    }
    const request = requests.begin("path-profile");
    setActiveRFTask("path_profile");
    setError("");
    try {
      const payload = await postJSON(
        "/api/path-profile",
        buildPathProfilePayload(selectedTower, pathProfileEndpoint, settings, options),
        "Path profile analysis failed",
        request.signal,
      );
      if (request.isCurrent()) setPathProfile(payload);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [pathProfileEndpoint, requests, selectedTower, settings]);

  const analyzeSubTHZReference = useCallback(async (options) => {
    if (!selectedTower || !pathProfileEndpoint) {
      setError("Select a transmitter cell and receiver point first");
      return;
    }
    const request = requests.begin("sub-thz-reference");
    setActiveRFTask("sub_thz_reference");
    setError("");
    try {
      const payload = await postJSON(
        "/api/sub-thz-reference",
        buildSubTHZReferencePayload(selectedTower, pathProfileEndpoint, settings, options),
        "Sub-THz atmospheric reference failed",
        request.signal,
      );
      if (request.isCurrent()) setSubTHZReference(payload);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [pathProfileEndpoint, requests, selectedTower, settings]);

  const analyzeP1411Reference = useCallback(async (options) => {
    if (!selectedTower || !pathProfileEndpoint) {
      setError("Select a transmitter cell and receiver point first");
      return;
    }
    const request = requests.begin("p1411-reference");
    setActiveRFTask("p1411_reference");
    setError("");
    try {
      const payload = await postJSON(
        "/api/sub-thz-p1411-reference",
        buildP1411ReferencePayload(selectedTower, pathProfileEndpoint, settings, options),
        "P.1411 candidate reference failed",
        request.signal,
      );
      if (request.isCurrent()) setP1411Reference(payload);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [pathProfileEndpoint, requests, selectedTower, settings]);

  const analyzeMeasurementValidation = useCallback(async ({ campaigns, operation, modelIDs, strategy, include_predictions }) => {
    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      setError("Load at least one measurement campaign first");
      return;
    }
    const request = requests.begin("sub-thz-validation");
    setActiveRFTask("sub_thz_validation");
    setError("");
    try {
      const payload = await postJSON(
        "/api/sub-thz-validation",
        { schema_version: 1, operation, model_ids: modelIDs, campaigns, strategy, include_predictions },
        "Measurement validation failed",
        request.signal,
      );
      if (request.isCurrent()) setMeasurementValidation(payload);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [requests]);

  const analyzeMaterialReference = useCallback(async (options) => {
    const request = requests.begin("sub-thz-material-reference");
    setActiveRFTask("sub_thz_material");
    setError("");
    try {
      const payload = await postJSON(
        "/api/sub-thz-material-reference",
        options,
        "Material reference failed",
        request.signal,
      );
      if (request.isCurrent()) setMaterialReference(payload);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [requests]);

  const analyzeSpecularReflectionReference = useCallback(async (options) => {
    const request = requests.begin("specular-reflection-reference");
    setActiveRFTask("specular_reflection_reference");
    setError("");
    try {
      const payload = await postJSON(
        "/api/sub-thz-reflection-reference",
        buildSpecularReflectionReferencePayload(options),
        "Specular reflection reference failed",
        request.signal,
      );
      if (request.isCurrent()) setSpecularReflectionReference(payload);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [requests]);

  const clearCoverageSurface = useCallback(() => {
    requests.cancel("coverage-surface");
    setCoverageSurface(null);
    setCoverageSurfaceRequest(null);
    setCoverageSurfaceCellId(null);
    setCoverageSurfaceSourceKey(null);
    setCoverageSurfaceError("");
    setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.UNAVAILABLE);
  }, [requests]);

  const markCoverageSurfaceAvailable = useCallback(() => {
    setCoverageSurfaceError("");
    setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.AVAILABLE);
  }, []);

  const analyzeCoverageSurface = useCallback(async (options = surfaceOptions) => {
    if (!selectedTower) {
      setError("Select a transmitter cell first");
      return;
    }
    const request = requests.begin("coverage-surface");
    const surfaceSettings = coverageSurfaceSettingsFor(selectedTower, settings, planningMode, networkAzimuths);
    const profileIndex = coverageSurfaceProfileIndexFor(selectedTower, planningMode, selectedNetworkTowerIds);
    const surfaceCellID = cellIDForTower(selectedTower);
    const requestPayload = buildCoverageSurfacePayload(selectedTower, surfaceSettings, options, profileIndex);
    const sourceKey = buildCoverageSurfaceSourceKey(requestPayload, surfaceCellID);
    setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.LOADING);
    setCoverageSurfaceError("");
    setCoverageSurfaceSourceKey(null);
    setActiveRFTask("coverage_surface");
    setError("");
    try {
      const payload = await postJSON("/api/coverage-surface", requestPayload, "Coverage surface generation failed", request.signal);
      if (!request.isCurrent()) return;
      if (sourceKey !== coverageSurfaceSourceKeyRef.current) {
        setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.UNAVAILABLE);
        return;
      }
      setCoverageSurface(payload);
      setCoverageSurfaceRequest(requestPayload);
      setCoverageSurfaceCellId(surfaceCellID);
      setCoverageSurfaceSourceKey(sourceKey);
      setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.READY);
      setLayerVisibility((current) => ({ ...current, rays: false, surfaces: true }));
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setCoverageSurfaceError(requestError.message);
        setCoverageSurfaceStatus(COVERAGE_SURFACE_STATUS.ERROR);
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [networkAzimuths, planningMode, requests, selectedNetworkTowerIds, selectedTower, settings, surfaceOptions]);

  const exportCoverageSurface = useCallback(async (format) => {
    if (!coverageSurfaceRequest) return;
    try {
      const blob = await postBlob(`/api/coverage-surface?f=${format}`, coverageSurfaceRequest, "Coverage surface export failed");
      const extension = format === "geotiff" ? "tif" : format === "geojson" ? "geojson" : "csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `coverage-surface.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message);
    }
  }, [coverageSurfaceRequest]);

  const runSimulation = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    clearCoverageSurface();
    const request = requests.begin("rf");
    setActiveRFTask("simulation");
    setError("");
    const simulationRequest = buildSimulationPayload(selectedTower, settings);
    let durableRun = null;
    try {
      durableRun = (await beginDurableRun({ request: simulationRequest, runType: "simulation" })).running;
      const { simulation: simulationPayload, coverageGaps: gapPayload } = await simulateForSettings(
        selectedTower,
        settings,
        request.signal,
      );
      if (!request.isCurrent()) {
        await finishDurableRun({
          error: { code: "run_cancelled", message: "Simulation was superseded or cancelled before completion." },
          request: simulationRequest,
          running: durableRun,
          status: "cancelled",
        });
        return;
      }
      setSimulation(simulationPayload);
      setCoverageGaps(gapPayload);
      setNetworkOptimization(null);
      setSelectedParetoSolutionId(null);
      setNetworkResultKind(null);
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("rf");
      setActiveResultsView("rf");
      setPlanDirty(false);
      markCoverageSurfaceAvailable();
      await finishDurableRun({
        request: simulationRequest,
        result: { simulation: simulationPayload, coverage_gaps: gapPayload },
        running: durableRun,
      });
    } catch (requestError) {
      await finishDurableRun({
        error: isAbortError(requestError)
          ? { code: "run_cancelled", message: "Simulation was cancelled." }
          : requestError,
        request: simulationRequest,
        running: durableRun,
        status: isAbortError(requestError) ? "cancelled" : null,
      });
      if (!isAbortError(requestError) && request.isCurrent()) {
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [beginDurableRun, clearCoverageSurface, finishDurableRun, markCoverageSurfaceAvailable, requests, selectedTower, settings, simulateForSettings]);

  const optimizeAzimuth = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    const request = requests.begin("rf");
    clearCoverageSurface();
    setActiveRFTask("optimization");
    setError("");
    const optimizationRequest = buildSimulationPayload(selectedTower, settings);
    let durableRun = null;
    try {
      durableRun = (await beginDurableRun({
        optimizerContract: { kind: "single_cell_azimuth", settings: { azimuth_deg: settings.azimuthDeg } },
        request: optimizationRequest,
        runType: "optimization",
      })).running;
      const beforeSnapshot = buildComparisonSnapshot({
        coverageGaps,
        diagnostics: optimizationDiagnostics,
        label: "Before",
        settings,
        simulation,
        tower: selectedTower,
      });
      const payload = await postJSON(
        "/api/optimize-azimuth",
        optimizationRequest,
        "Optimization request failed",
        request.signal,
      );
      const optimizedSettings = {
        ...settings,
        azimuthDeg: Number(payload.optimal_azimuth),
      };
      const { simulation: optimizedSimulation, coverageGaps: optimizedGaps } =
        await simulateForSettings(selectedTower, optimizedSettings, request.signal);
      if (!request.isCurrent()) {
        await finishDurableRun({
          error: { code: "run_cancelled", message: "Optimization was superseded or cancelled before completion." },
          request: optimizationRequest,
          running: durableRun,
          status: "cancelled",
        });
        return;
      }
      const afterSnapshot = buildComparisonSnapshot({
        coverageGaps: optimizedGaps,
        diagnostics: payload,
        label: "After",
        settings: optimizedSettings,
        simulation: optimizedSimulation,
        tower: selectedTower,
      });

      setBuildingEntryAnalysis(null);
      setBuildingEntrySourceKey(null);
      setOptimizationDiagnostics(payload);
      setSettings(optimizedSettings);
      setSimulation(optimizedSimulation);
      setCoverageGaps(optimizedGaps);
      setComparison({ before: beforeSnapshot, after: afterSnapshot });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("optimization");
      setActiveResultsView("optimization");
      setPlanDirty(false);
      markCoverageSurfaceAvailable();
      await finishDurableRun({
        request: optimizationRequest,
        response: {
          ...payload,
          summary: {
            before: beforeSnapshot,
            after: afterSnapshot,
            simulation: optimizedSimulation?.stats ?? null,
            coverage_gaps: optimizedGaps?.stats ?? null,
          },
          pareto_frontier: [{
            id: "optimal-azimuth",
            towers: [{ id: selectedTower.cellId ?? selectedTower.id, optimal_azimuth: Number(payload.optimal_azimuth) }],
            stats: optimizedSimulation?.stats ?? {},
          }],
        },
        running: durableRun,
      });
    } catch (requestError) {
      await finishDurableRun({
        error: isAbortError(requestError)
          ? { code: "run_cancelled", message: "Optimization was cancelled." }
          : requestError,
        request: optimizationRequest,
        running: durableRun,
        status: isAbortError(requestError) ? "cancelled" : null,
      });
      if (!isAbortError(requestError) && request.isCurrent()) {
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [
    beginDurableRun,
    clearCoverageSurface,
    coverageGaps,
    finishDurableRun,
    markCoverageSurfaceAvailable,
    optimizationDiagnostics,
    selectedTower,
    requests,
    settings,
    simulateForSettings,
    simulation,
  ]);

  const optimizeNetwork = useCallback(async () => {
    const priorityError = optimizationConfigValidationMessage(optimizationConfig);
    if (priorityError) {
      setError(priorityError);
      return;
    }
    const selectedNetworkTowers = normalizeNetworkSelection(selectedNetworkTowerIds, towers)
      .map((towerID) => towers.find((tower) => tower.id === towerID))
      .filter(Boolean);
    if (selectedNetworkTowers.length < 2) {
      setError("Select at least 2 towers for network optimization");
      return;
    }

    const request = requests.begin("rf");
    clearCoverageSurface();
    setActiveRFTask("optimization");
    setError("");
    clearCellExplanation();
    clearInterferenceAnalysis();
    const networkRequest = buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths, optimizationConfig);
    let durableRun = null;
    try {
      durableRun = (await beginDurableRun({
        optimizerContract: optimizationConfig,
        request: networkRequest,
        runType: "optimization",
      })).running;
      const payload = await postJSON(
        "/api/optimize-network",
        networkRequest,
        "Network optimization request failed",
        request.signal,
      );
      const optimizedByID = new Map(
        (payload.optimized_towers ?? []).map((tower) => [String(tower.id), tower]),
      );
      const simulations = await runNetworkSimulationQueue(
        selectedNetworkTowers,
        (tower, index) => {
          const optimizedTower = optimizedByID.get(String(tower.cellId ?? tower.id));
          return simulateRaysForSettings(
            tower,
            {
              ...settings,
              azimuthDeg: Number(optimizedTower?.optimal_azimuth ?? settings.azimuthDeg),
            },
            request.signal,
            index,
          );
        },
      );
      if (!request.isCurrent()) {
        await finishDurableRun({
          error: { code: "run_cancelled", message: "Network optimization was superseded or cancelled before completion." },
          request: networkRequest,
          running: durableRun,
          status: "cancelled",
        });
        return;
      }
      setBuildingEntryAnalysis(null);
      setBuildingEntrySourceKey(null);
      setNetworkOptimization(payload);
      setSelectedParetoSolutionId(null);
      setNetworkAzimuths(networkAzimuthMap(selectedNetworkTowers, payload, networkAzimuths));
      setNetworkResultKind("optimization");
      setOptimizationDiagnostics(null);
      setComparison({ before: null, after: null });
      setSimulation(combineNetworkSimulations(simulations, selectedNetworkTowers));
      setCoverageGaps({ geojson: { type: "FeatureCollection", features: [] }, stats: null });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("network");
      setActiveResultsView("optimization");
      setPlanDirty(false);
      markCoverageSurfaceAvailable();
      await finishDurableRun({
        request: networkRequest,
        response: {
          ...payload,
          summary: {
            simulation_count: simulations.length,
            simulation_stats: simulations.map((candidate) => candidate?.stats ?? null),
          },
        },
        running: durableRun,
      });
    } catch (requestError) {
      await finishDurableRun({
        error: isAbortError(requestError)
          ? { code: "run_cancelled", message: "Network optimization was cancelled." }
          : requestError,
        request: networkRequest,
        running: durableRun,
        status: isAbortError(requestError) ? "cancelled" : null,
      });
      if (!isAbortError(requestError) && request.isCurrent()) {
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [beginDurableRun, clearCellExplanation, clearCoverageSurface, clearInterferenceAnalysis, finishDurableRun, markCoverageSurfaceAvailable, networkAzimuths, optimizationConfig, requests, selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

  const evaluateNetwork = useCallback(async () => {
    const priorityError = optimizationConfigValidationMessage(optimizationConfig);
    if (priorityError) {
      setError(priorityError);
      return;
    }
    const selected = normalizeNetworkSelection(selectedNetworkTowerIds, towers)
      .map((towerID) => towers.find((tower) => tower.id === towerID))
      .filter(Boolean);
    if (selected.length < 2) {
      setError("Select at least 2 towers to evaluate the network");
      return;
    }

    const request = requests.begin("rf");
    clearCoverageSurface();
    setActiveRFTask("network_evaluation");
    setError("");
    clearCellExplanation();
    clearInterferenceAnalysis();
    try {
      const networkRequest = buildNetworkOptimizationPayload(selected, settings, networkAzimuths, optimizationConfig);
      const payload = await postJSON(
        "/api/evaluate-network",
        networkRequest,
        "Network evaluation request failed",
        request.signal,
      );
      const simulations = await runNetworkSimulationQueue(selected, (tower, index) =>
        simulateRaysForSettings(tower, {
          ...settings,
          azimuthDeg: networkAzimuthFor(tower, networkAzimuths, settings.azimuthDeg),
        }, request.signal, index));
      if (!request.isCurrent()) {
        return;
      }
      setNetworkOptimization(payload);
      setSelectedParetoSolutionId(null);
      setNetworkResultKind("evaluation");
      setOptimizationDiagnostics(null);
      setComparison({ before: null, after: null });
      setSimulation(combineNetworkSimulations(simulations, selected));
      setCoverageGaps({ geojson: { type: "FeatureCollection", features: [] }, stats: null });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("network");
      setActiveResultsView("optimization");
      setPlanDirty(false);
      markCoverageSurfaceAvailable();
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [clearCellExplanation, clearCoverageSurface, clearInterferenceAnalysis, markCoverageSurfaceAvailable, networkAzimuths, optimizationConfig, requests, selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

  const explainNetworkCell = useCallback(async (solutionID, cellID) => {
    const response = displayedNetworkOptimization;
    const baseline = response?.baseline;
    const solution = rankedParetoSolutions.find((candidate) => String(candidate.id) === String(solutionID));
    const key = optimizationRunKey
      ? buildCellExplanationCacheKey(response, solutionID, cellID)
      : null;
    if (!baseline || !solution || !key) {
      setCellExplanationState({
        ...EMPTY_CELL_EXPLANATION_STATE,
        solutionID: solutionID ?? null,
        cellID: cellID ?? null,
        error: "Per-cell explanation is unavailable for this saved result because baseline metadata was not retained.",
      });
      return;
    }
    const cellConfiguration = buildParetoCellConfigurations(baseline, solution)
      .find((configuration) => String(configuration.id) === String(cellID));
    if (!cellConfiguration?.available || !cellConfiguration.changed) {
      return;
    }
    const cached = cellExplanationCacheRef.current.get(key);
    if (cached) {
      setCellExplanationState({ key, solutionID: String(solutionID), cellID: String(cellID), loading: false, result: cached, error: "" });
      return;
    }

    const request = requests.begin("rf");
    setCellExplanationState({ key, solutionID: String(solutionID), cellID: String(cellID), loading: true, result: null, error: "" });
    try {
      const payload = await postJSON(
        "/api/explain-network-cell",
        buildNetworkCellExplanationPayload({
          baseline,
          cellID,
          optimization: optimizationConfig,
          optimizationDomain: response.optimization_domain,
          runID: optimizationRunKey,
          solution,
          solutionID,
        }),
        "Cell explanation request failed",
        request.signal,
      );
      if (!request.isCurrent()) {
        return;
      }
      cellExplanationCacheRef.current.set(key, payload);
      setCellExplanationState({ key, solutionID: String(solutionID), cellID: String(cellID), loading: false, result: payload, error: "" });
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setCellExplanationState({ key, solutionID: String(solutionID), cellID: String(cellID), loading: false, result: null, error: requestError.message });
      }
    } finally {
      if (request.isCurrent()) {
        request.finish();
      }
    }
  }, [displayedNetworkOptimization, optimizationConfig, optimizationRunKey, rankedParetoSolutions, requests]);

  const selectedNetworkTowers = useMemo(
    () => normalizeNetworkSelection(selectedNetworkTowerIds, towers)
      .map((towerID) => towers.find((tower) => tower.id === towerID))
      .filter(Boolean),
    [selectedNetworkTowerIds, towers],
  );
  const selectedNetworkSelectionIDs = useMemo(
    () => selectedNetworkTowers.map((tower) => tower.id),
    [selectedNetworkTowers],
  );
  const buildingEntryPayload = useMemo(
    () => buildBuildingEntryAnalysisPayload(
      planningMode === "network" ? selectedNetworkTowers : [],
      selectedTower,
      settings,
      networkAzimuths,
    ),
    [networkAzimuths, planningMode, selectedNetworkTowers, selectedTower, settings],
  );
  const currentBuildingEntrySourceKey = useMemo(
    () => buildBuildingEntryAnalysisSourceKey(buildingEntryPayload, datasetRevision),
    [buildingEntryPayload, datasetRevision],
  );
  buildingEntrySourceKeyRef.current = currentBuildingEntrySourceKey;
  const buildingEntryIsCurrent = Boolean(
    buildingEntryAnalysis && buildingEntrySourceKey && buildingEntrySourceKey === currentBuildingEntrySourceKey,
  );
  const selectedTowerOrder = useMemo(() => {
    return new Map(selectedNetworkSelectionIDs.map((towerID, index) => [towerID, index + 1]));
  }, [selectedNetworkSelectionIDs]);
  const rayCellIDs = useMemo(() => {
    const candidates = planningMode === "network" ? selectedNetworkTowers : [selectedTower].filter(Boolean);
    return candidates.map(cellIDForTower).filter(Boolean);
  }, [planningMode, selectedNetworkTowers, selectedTower]);
  const rayCellOptions = useMemo(
    () => rayCellIDs.map((cellID) => ({ id: cellID, label: `Cell ${cellID}` })),
    [rayCellIDs],
  );
  const currentCoverageSurfaceRequest = useMemo(() => {
    if (!selectedTower) return null;
    const surfaceSettings = coverageSurfaceSettingsFor(selectedTower, settings, planningMode, networkAzimuths);
    const profileIndex = coverageSurfaceProfileIndexFor(selectedTower, planningMode, selectedNetworkTowerIds);
    return buildCoverageSurfacePayload(selectedTower, surfaceSettings, surfaceOptions, profileIndex);
  }, [networkAzimuths, planningMode, selectedNetworkTowerIds, selectedTower, settings, surfaceOptions]);
  const currentCoverageSurfaceSourceKey = useMemo(
    () => currentCoverageSurfaceRequest
      ? buildCoverageSurfaceSourceKey(currentCoverageSurfaceRequest, cellIDForTower(selectedTower))
      : null,
    [currentCoverageSurfaceRequest, selectedTower],
  );
  coverageSurfaceSourceKeyRef.current = currentCoverageSurfaceSourceKey;
  const coverageSurfaceIsCurrent = Boolean(
    coverageSurface
      && coverageSurfaceSourceKey
      && coverageSurfaceSourceKey === currentCoverageSurfaceSourceKey,
  );
  const renderedCoverageSurface = coverageSurfaceIsCurrent ? coverageSurface : null;
  const signalSurfaceState = coverageSurfaceStatus === COVERAGE_SURFACE_STATUS.READY && !coverageSurfaceIsCurrent
    ? (planDirty ? COVERAGE_SURFACE_STATUS.UNAVAILABLE : COVERAGE_SURFACE_STATUS.AVAILABLE)
    : coverageSurfaceStatus;
  const selectedMapReceiverSensitivityDBm = useMemo(() => {
    const selectedFeature = (simulation.geojson?.features ?? []).find((feature) => {
      const properties = feature.properties ?? {};
      return selectedMapCellId === null || selectedMapCellId === undefined
        ? false
        : String(properties.cell_id ?? properties.network_tower_id ?? "") === String(selectedMapCellId);
    });
    const featureThreshold = Number(selectedFeature?.properties?.link_budget?.effective_receiver_sensitivity_dbm);
    if (Number.isFinite(featureThreshold)) return featureThreshold;
    const surfaceThreshold = Number(renderedCoverageSurface?.receiver_threshold?.sensitivity_dbm);
    if (Number.isFinite(surfaceThreshold)) return surfaceThreshold;
    const responseThreshold = Number(simulation.receiver_threshold?.sensitivity_dbm);
    if (Number.isFinite(responseThreshold)) return responseThreshold;
    const candidateTowers = planningMode === "network" ? selectedNetworkTowers : [selectedTower].filter(Boolean);
    const index = candidateTowers.findIndex((tower) => String(cellIDForTower(tower)) === String(selectedMapCellId));
    const tower = candidateTowers[index >= 0 ? index : 0];
    return tower ? effectiveReceiverSensitivityDbm(resolveRFProfile(tower, settings, index >= 0 ? index : 0)) : -115;
  }, [planningMode, renderedCoverageSurface, selectedMapCellId, selectedNetworkTowers, selectedTower, settings, simulation]);
  useEffect(() => {
    setSelectedMapCellId((current) => rayCellIDs.includes(String(current)) ? current : rayCellIDs[0] ?? null);
  }, [rayCellIDs]);
  const visibleRayFeatures = useMemo(
    () => filterRayFeatures(simulation.geojson?.features ?? [], {
      cellIDsByIndex: rayCellIDs,
      defaultCellId: planningMode === "single" ? rayCellIDs[0] ?? null : null,
      scope: rayScope,
      selectedCellId: selectedMapCellId,
    }),
    [planningMode, rayCellIDs, rayScope, selectedMapCellId, simulation.geojson],
  );
  const selectedNetworkProfileTechs = selectedNetworkTowers.map((tower, index) => resolveRFProfile(tower, settings, index).networkTech);
  const coreContextTowers = planningMode === "network" ? selectedNetworkTowers : [selectedTower].filter(Boolean);
  const coreLabApplicable = is5GCoreFrequency(settings.frequencyGHz)
    && coreContextTowers.every((tower, index) => resolveRFProfile(tower, settings, index).networkTech === "5g");
  const interferenceApplicable = networkTechnologyForFrequency(settings.frequencyGHz) !== "6g"
    && selectedNetworkProfileTechs.every((technology) => technology !== "6g");

  const analyzeInterference = useCallback(async () => {
    if (!interferenceApplicable) {
      setError("Interference KPIs are not applicable to the 6G research profile");
      return;
    }
    if (selectedNetworkTowers.length < 2) {
      setError("Select at least 2 towers for interference analysis");
      return;
    }

    const request = requests.begin("rf");
    setActiveRFTask("interference");
    setError("");
    try {
      const payload = await postJSON(
        "/api/interference",
        buildInterferencePayload(selectedNetworkTowers, settings, networkOptimization, networkAzimuths),
        "Interference analysis failed",
        request.signal,
      );
      if (!request.isCurrent()) {
        return;
      }
      setInterferenceAnalysis(payload);
      setInterferenceRevision((current) => current + 1);
      setLayerVisibility((current) => ({ ...current, interference: true }));
      setLastAnalysisKind("interference");
      setActiveResultsView("interference");
      setPlanDirty(false);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [interferenceApplicable, networkAzimuths, networkOptimization, requests, selectedNetworkTowers, settings]);

  const analyzeBuildingEntry = useCallback(async () => {
    const hasTargetCell = planningMode === "network" ? selectedNetworkTowers.length > 0 : Boolean(selectedTower);
    if (!hasTargetCell) {
      setError("Select at least one cell before running building-entry analysis");
      return;
    }
    if (buildingEntryIsCurrent) {
      setError("");
      return;
    }
    const request = requests.begin("building-entry");
    setActiveRFTask("building_entry");
    setError("");
    try {
      const payload = await postJSON(
        "/api/building-entry-analysis",
        buildingEntryPayload,
        "Building-entry analysis failed",
        request.signal,
      );
      if (!request.isCurrent() || currentBuildingEntrySourceKey !== buildingEntrySourceKeyRef.current) {
        return;
      }
      setBuildingEntryAnalysis(payload);
      setBuildingEntrySourceKey(currentBuildingEntrySourceKey);
      setLastAnalysisKind("building-entry");
      setPlanDirty(false);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setError(requestError.message);
      }
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [buildingEntryIsCurrent, buildingEntryPayload, currentBuildingEntrySourceKey, planningMode, requests, selectedNetworkTowers.length, selectedTower]);

  const coreLabTowerIDs = useMemo(() => {
    if (planningMode === "network" && selectedNetworkTowers.length > 0) {
      return selectedNetworkTowers.map((tower) => String(tower.cellId ?? tower.id));
    }
    return selectedTower ? [String(selectedTower.cellId ?? selectedTower.id)] : [];
  }, [planningMode, selectedNetworkTowers, selectedTower]);

  const refreshCoreLab = useCallback(async () => {
    if (!coreLabEnabled || !coreLabApplicable) {
      return;
    }
    const request = requests.begin("core-lab");
    setCoreLab((current) => ({ ...current, isLoading: true, lastError: "" }));
    try {
      const query = buildCoreLabQuery(coreLabTowerIDs, selectedNetworkTowers, selectedTower);
      const [status, topology, sessions, events] = await Promise.all([
        getJSON("/api/core/status", "Core Lab status request failed", request.signal),
        getJSON(`/api/core/topology${query}`, "Core Lab topology request failed", request.signal),
        getJSON(`/api/core/sessions${query}`, "Core Lab sessions request failed", request.signal),
        getJSON("/api/core/events", "Core Lab events request failed", request.signal),
      ]);
      if (!request.isCurrent()) {
        return;
      }
      setCoreLab((current) => ({
        ...current,
        events,
        isLoading: false,
        lastError: "",
        scenario: status?.scenario ?? current.scenario,
        sessions,
        status,
        topology,
      }));
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setCoreLab((current) => ({
          ...current,
          isLoading: false,
          lastError: requestError.message,
          status: {
            mode: "open5gs",
            state: "disconnected",
            functions: [],
            message: requestError.message,
            updated_at: new Date().toISOString(),
          },
        }));
      }
    } finally {
      request.finish();
    }
  }, [coreLabApplicable, coreLabEnabled, coreLabTowerIDs, requests, selectedNetworkTowers, selectedTower]);

  const toggleCoreLab = useCallback((enabled) => {
    if (enabled && !coreLabApplicable) {
      setCoreLab((current) => ({
        ...current,
        events: null,
        isLoading: false,
        lastError: "",
        sessions: null,
        status: {
          mode: "not_applicable",
          state: "not_applicable",
          functions: [],
          message: "5G Communication Path applies only to 5G mmWave.",
        },
        topology: null,
      }));
      return;
    }
    setCoreLabEnabled(enabled);
    if (!enabled) {
      requests.cancel("core-lab");
      setCoreLab((current) => ({
        ...current,
        events: null,
        isLoading: false,
        lastError: "",
        sessions: null,
        status: null,
        topology: null,
      }));
    }
  }, [coreLabApplicable, requests]);

  const runCoreLabScenario = useCallback(async (scenario) => {
    if (!coreLabApplicable) {
      return;
    }
    const request = requests.begin("core-lab");
    setCoreLab((current) => ({ ...current, isLoading: true, lastError: "" }));
    try {
      await postJSON(
        "/api/core/scenario",
        {
          scenario,
          cluster_tower_ids: coreLabTowerIDs,
          network_tech: "5g",
        },
        "Core Lab scenario request failed",
        request.signal,
      );
      if (!request.isCurrent()) {
        return;
      }
      setCoreLab((current) => ({ ...current, scenario }));
      request.finish();
      await refreshCoreLab();
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) {
        setCoreLab((current) => ({
          ...current,
          isLoading: false,
          lastError: requestError.message,
        }));
      }
      request.finish();
    }
  }, [coreLabApplicable, coreLabTowerIDs, refreshCoreLab, requests]);

  const resetNetworkArtifacts = useCallback(() => {
    setNetworkOptimization(null);
    setSelectedParetoSolutionId(null);
    clearCellExplanation();
    setNetworkResultKind(null);
    setComparison({ before: null, after: null });
    clearInterferenceAnalysis();
    setSiteRecommendations(null);
    setMeasurementAnalysis(null);
    setBuildingEntryAnalysis(null);
    setBuildingEntrySourceKey(null);
  }, [clearCellExplanation, clearInterferenceAnalysis]);

  const clearRenderedAnalysis = useCallback(() => {
    setSimulation(EMPTY_SIMULATION);
    setCoverageGaps(EMPTY_COVERAGE_GAPS);
    setSimulationRevision((current) => current + 1);
    setCoverageGapRevision((current) => current + 1);
    setSelectedMapObject((current) => current?.type === "tower" ? current : null);
    clearCoverageSurface();
  }, [clearCoverageSurface]);

  const invalidatePlanResults = useCallback(() => {
    requests.cancel("rf");
    requests.cancel("sub-thz-validation");
    requests.cancel("sub-thz-material-reference");
    requests.cancel("specular-reflection-reference");
    requests.cancel("path-profile");
    requests.cancel("sub-thz-reference");
    requests.cancel("p1411-reference");
    requests.cancel("coverage-surface");
    requests.cancel("building-entry");
    setActiveRFTask(null);
    setPathProfile(null);
    setSubTHZReference(null);
    setP1411Reference(null);
    setMaterialReference(null);
    setSpecularReflectionReference(null);
    setOptimizationDiagnostics(null);
    resetNetworkArtifacts();
    clearRenderedAnalysis();
    setPlanDirty(true);
  }, [clearRenderedAnalysis, requests, resetNetworkArtifacts]);

	const switchDataset = useCallback(async (datasetID) => {
		if (!datasetID || datasetID === installedDatasets.active_id || isSwitchingDataset) return;
		setIsSwitchingDataset(true);
		setDatasetMessage("Validating and loading dataset…");
		try {
			const response = await postJSON("/api/datasets/switch", { id: datasetID }, "Dataset switch failed");
			restoredProjectRef.current = null;
			setWorkspaceRestored(false);
			requests.cancel("rf");
			requests.cancel("sub-thz-validation");
			requests.cancel("sub-thz-material-reference");
			requests.cancel("specular-reflection-reference");
			requests.cancel("path-profile");
			requests.cancel("sub-thz-reference");
			requests.cancel("p1411-reference");
			requests.cancel("coverage-surface");
			setActiveRFTask(null);
			setPathProfile(null);
			setSubTHZReference(null);
			setP1411Reference(null);
			setMaterialReference(null);
			setSpecularReflectionReference(null);
			setPathProfileEndpoint(null);
			setTowers([]);
			setSelectedTower(null);
			setSelectedNetworkTowerIds([]);
			setNetworkAzimuths({});
			setSelectionPolygon([]);
			setOptimizationDiagnostics(null);
			resetNetworkArtifacts();
			clearRenderedAnalysis();
			setCalibrationProfile(null);
			setPlanDirty(true);
			setDatasetMessage(`${response.dataset?.name ?? datasetID} is active. Existing project scenarios remain bound to their original dataset.`);
			setDatasetRevision((current) => current + 1);
		} catch (requestError) {
			setDatasetMessage(requestError.message);
			setIsSwitchingDataset(false);
		}
	}, [clearRenderedAnalysis, installedDatasets.active_id, isSwitchingDataset, requests, resetNetworkArtifacts]);

  const updateSettings = useCallback((nextSettings) => {
    invalidatePlanResults();
    setSettings((current) => {
      const resolved = typeof nextSettings === "function" ? nextSettings(current) : nextSettings;
      if (Number(resolved.azimuthDeg) !== Number(current.azimuthDeg)) {
        setNetworkAzimuths({});
      }
      if (resolved.frequencyGHz !== current.frequencyGHz) {
        setCalibrationProfile(null);
        return { ...resolved, calibrationOffsetDb: 0 };
      }
      return resolved;
    });
  }, [invalidatePlanResults]);

  const updateOptimizationConfig = useCallback((nextConfig) => {
    const normalized = normalizeOptimizationConfig(nextConfig);
    const constraintsChanged = JSON.stringify(optimizationConfig.constraints ?? {}) !== JSON.stringify(normalized.constraints ?? {});
    if (constraintsChanged) invalidatePlanResults();
    const priorityError = optimizationConfigValidationMessage(normalized);
    setError((current) => current.startsWith("Set at least one optimization priority") ? priorityError : current);
    setOptimizationConfig(normalized);
  }, [invalidatePlanResults, optimizationConfig]);

  const selectTower = useCallback((tower) => {
    setSelectedMapCellId(cellIDForTower(tower));
    if (planningMode === "network") {
      const currentSelection = normalizeNetworkSelection(selectedNetworkTowerIds, towers);
      const isSelected = currentSelection.includes(tower.id);
      if (!isSelected && currentSelection.length >= MAX_NETWORK_CELLS) {
        setError(`Network planning supports up to ${MAX_NETWORK_CELLS} selected cells`);
        return;
      }
      const nextSelection = toggleNetworkSelection(currentSelection, tower.id, MAX_NETWORK_CELLS);
      invalidatePlanResults();
      setSelectionNotice("");
      setSelectedNetworkTowerIds(nextSelection);
      if (nextSelection.includes(tower.id)) {
        setError("");
        setSelectedTower(tower);
      } else {
        setNetworkAzimuths((current) => {
          const next = { ...current };
          delete next[tower.id];
          return next;
        });
        setSelectedTower((current) => current?.id === tower.id
          ? towers.find((candidate) => nextSelection.includes(candidate.id)) ?? null
          : current);
      }
      return;
    }
    invalidatePlanResults();
    setSelectedTower(tower);
  }, [invalidatePlanResults, planningMode, selectedNetworkTowerIds, towers]);

	const selectInventoryCell = useCallback((tower) => {
		if (selectedTower?.id !== tower.id) invalidatePlanResults();
		setSelectedTower(tower);
		setSelectedMapCellId(cellIDForTower(tower));
		setSelectedMapObject(null);
	}, [invalidatePlanResults, selectedTower]);

	const updateInventoryTower = useCallback((towerID, updater) => {
		invalidatePlanResults();
		setTowers((current) => current.map((tower) => tower.id === towerID ? updater(tower) : tower));
		setSelectedTower((current) => current?.id === towerID ? updater(current) : current);
	}, [invalidatePlanResults]);

	const updateInventoryProfile = useCallback((towerID, rfProfile) => {
		updateInventoryTower(towerID, (tower) => ({ ...tower, rfProfile, editable: true, inventorySource: tower.inventorySource === "dataset" ? "project override" : tower.inventorySource }));
	}, [updateInventoryTower]);

	const resetInventoryProfile = useCallback((towerID) => {
		updateInventoryTower(towerID, (tower) => {
			const next = { ...tower };
			delete next.rfProfile;
			return next;
		});
	}, [updateInventoryTower]);

	const moveInventoryCell = useCallback((towerID, coordinates) => {
		if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return;
		if (coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90) return;
		updateInventoryTower(towerID, (tower) => ({ ...tower, coordinates, editable: true, inventorySource: tower.inventorySource === "dataset" ? "project override" : tower.inventorySource }));
	}, [updateInventoryTower]);

  const startPathEndpointSelection = useCallback(() => {
    if (!selectedTower) {
      setError("Select a transmitter cell first");
      return;
    }
    setIsPlacingCell(false);
    setIsDrawingSelection(false);
    setIsSelectingPathEndpoint(true);
    setSelectionNotice("Click the map to place the path receiver.");
    setError("");
  }, [selectedTower]);

  const selectPathEndpoint = useCallback((coordinates) => {
    if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return;
    requests.cancel("p1411-reference");
    setPathProfileEndpoint(coordinates);
    setPathProfile(null);
    setSubTHZReference(null);
    setP1411Reference(null);
    setIsSelectingPathEndpoint(false);
    setSelectionNotice("Receiver selected. Analyze the path to build its vertical profile.");
  }, [requests]);

	const placeInventoryCell = useCallback((coordinates) => {
		const used = new Set(towers.map((tower) => tower.id));
		let counter = towers.length + 1;
		let id = `manual-${counter}`;
		while (used.has(id)) {
			counter += 1;
			id = `manual-${counter}`;
		}
		const tower = {
			id,
			cellId: id,
			radioType: networkTechnologyForFrequency(settings.frequencyGHz),
			isSimulated: true,
			coordinates,
			rfProfile: resolveRFProfile({}, settings, towers.length),
			inventorySource: "manual",
			editable: true,
		};
		invalidatePlanResults();
		setTowers((current) => [...current, tower]);
		setSelectedTower(tower);
		setIsPlacingCell(false);
		setSelectionNotice(`Placed ${id}. Drag its selected marker to refine the position.`);
	}, [invalidatePlanResults, settings, towers]);

	const duplicateInventoryTower = useCallback((tower) => {
		const duplicate = duplicateInventoryCell(tower, towers.map((candidate) => candidate.id));
		invalidatePlanResults();
		setTowers((current) => [...current, duplicate]);
		setSelectedTower(duplicate);
	}, [invalidatePlanResults, towers]);

	const deleteInventoryTower = useCallback((towerID) => {
		const deletedTower = towers.find((tower) => tower.id === towerID);
		if (!deletedTower) return;
		const deletedIndex = towers.findIndex((tower) => tower.id === towerID);
		const wasSelected = selectedTower?.id === towerID;
		const wasInNetwork = selectedNetworkTowerIds.includes(towerID);
		const deletedAzimuth = networkAzimuths[towerID];
		invalidatePlanResults();
		setTowers((current) => {
			const next = current.filter((tower) => tower.id !== towerID);
			setSelectedTower((selected) => selected?.id === towerID ? next[0] ?? null : selected);
			return next;
		});
		setSelectedNetworkTowerIds((current) => current.filter((id) => id !== towerID));
		setNetworkAzimuths((current) => {
			const next = { ...current };
			delete next[towerID];
			return next;
		});
		showUndoNotice(`Deleted cell ${deletedTower.cellId ?? deletedTower.id}.`, () => {
			invalidatePlanResults();
			setTowers((current) => {
				if (current.some((tower) => tower.id === deletedTower.id)) return current;
				const next = [...current];
				next.splice(Math.max(0, Math.min(deletedIndex, next.length)), 0, deletedTower);
				return next;
			});
			if (wasSelected) setSelectedTower(deletedTower);
				if (wasInNetwork) setSelectedNetworkTowerIds((current) => toggleNetworkSelection(current, towerID, MAX_NETWORK_CELLS));
			if (deletedAzimuth !== undefined) setNetworkAzimuths((current) => ({ ...current, [towerID]: deletedAzimuth }));
		});
	}, [invalidatePlanResults, networkAzimuths, selectedNetworkTowerIds, selectedTower, showUndoNotice, towers]);

	const importInventoryCells = useCallback((imported) => {
		if (!imported.length) return;
		invalidatePlanResults();
		setTowers((current) => [...current, ...imported]);
		setSelectedTower(imported[0]);
	}, [invalidatePlanResults]);

  const changePlanningMode = useCallback((mode) => {
    if (mode === planningMode) {
      return;
    }
    invalidatePlanResults();
    setPlanningMode(mode);
    setIsDrawingSelection(false);
    setSelectionPolygon([]);
    setSelectionNotice("");
    if (mode === "network") {
      const currentSelection = normalizeNetworkSelection(selectedNetworkTowerIds, towers);
      setSelectedNetworkTowerIds(
        currentSelection.length > 0
          ? currentSelection
          : selectedTower && towers.some((tower) => tower.id === selectedTower.id)
            ? [selectedTower.id]
            : [],
      );
    }
  }, [invalidatePlanResults, planningMode, selectedNetworkTowerIds, selectedTower, towers]);

  const startAreaSelection = useCallback(() => {
    if (planningMode !== "network") {
      changePlanningMode("network");
    }
    setSelectedMapObject(null);
    setIsDrawingSelection(true);
    setSelectionPolygon([]);
    setSelectionNotice("Click map vertices, then double-click or press Enter to finish.");
  }, [changePlanningMode, planningMode]);

  const cancelAreaSelection = useCallback(() => {
    setIsDrawingSelection(false);
    setSelectionPolygon([]);
    setSelectionNotice("");
  }, []);

  const clearNetworkSelection = useCallback(() => {
    invalidatePlanResults();
    setSelectedNetworkTowerIds([]);
    setNetworkAzimuths({});
    setSelectionPolygon([]);
    setSelectedMapObject(null);
    setSelectionNotice("");
  }, [invalidatePlanResults]);

  const finishAreaSelection = useCallback((polygon) => {
    const finalPolygon = polygon ?? selectionPolygon;
    if (!Array.isArray(finalPolygon) || finalPolygon.length < 3) {
      setSelectionNotice("Add at least 3 points to finish an area.");
      return;
    }

    const inside = towers.filter((tower) => pointInPolygon(tower.coordinates, finalPolygon));
    if (inside.length < 2) {
      setSelectionNotice(`${inside.length} tower${inside.length === 1 ? "" : "s"} found. Draw an area with at least 2 towers.`);
      setIsDrawingSelection(false);
      setSelectionPolygon(finalPolygon);
      return;
    }

    const selected = selectNearestTowers(inside, finalPolygon, MAX_NETWORK_CELLS);
    const selectedIDs = selected.map((tower) => tower.id);
    invalidatePlanResults();
    setSelectedNetworkTowerIds(selectedIDs);
    setNetworkAzimuths((current) => Object.fromEntries(
      selectedIDs
        .filter((towerID) => current[towerID] !== undefined)
        .map((towerID) => [towerID, current[towerID]]),
    ));
    setSelectedTower((current) => selected[0] ?? current);
    setIsDrawingSelection(false);
    setSelectionPolygon(finalPolygon);
    setSelectionNotice(
      inside.length > MAX_NETWORK_CELLS
        ? `${inside.length} towers found, nearest ${MAX_NETWORK_CELLS} selected.`
        : `${selected.length} towers selected from drawn area.`,
    );
  }, [invalidatePlanResults, selectionPolygon, towers]);

  const addSelectionPolygonPoint = useCallback((coordinate) => {
    setSelectionPolygon((current) => [...current, coordinate]);
  }, []);

  const recommendSites = useCallback(async () => {
    if (!interferenceApplicable) {
      setError("Candidate recommendations are available for 4G and 5G plans");
      return;
    }
    if (selectedNetworkTowers.length < 2 || selectedNetworkTowers.length >= MAX_NETWORK_CELLS) {
      setError(`Select between 2 and ${MAX_NETWORK_CELLS - 1} cells before adding one candidate`);
      return;
    }
    if (selectionPolygon.length < 3) {
      setError("Draw a search area before requesting candidate cells");
      return;
    }
    const request = requests.begin("rf");
    setActiveRFTask("recommendation");
    setError("");
    try {
      const payload = await postJSON(
        "/api/recommend-sites",
        buildRecommendationPayload(selectedNetworkTowers, settings, selectionPolygon, networkOptimization, networkAzimuths),
        "Candidate recommendation failed",
        request.signal,
      );
      if (!request.isCurrent()) return;
      setSiteRecommendations(compactRecommendationResponse(payload));
      setActiveResultsView("recommendations");
      setLastAnalysisKind("recommendation");
      setPlanDirty(false);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [interferenceApplicable, networkAzimuths, networkOptimization, requests, selectedNetworkTowers, selectionPolygon, settings]);

  const loadMeasurementFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const samples = await readMeasurementCsvFile(file);
      const expectedTechnology = networkTechnologyForFrequency(settings.frequencyGHz);
      if (expectedTechnology === "6g" || samples.some((sample) => sample.technology !== expectedTechnology)) {
        throw new Error(`Measurement technology must match the active ${expectedTechnology.toUpperCase()} plan`);
      }
      setMeasurementSamples(samples);
      setMeasurementProvenance({
        source: file.name || "measurement_csv",
        ...(Number.isFinite(file.lastModified) && file.lastModified > 0
          ? { collected_at: new Date(file.lastModified).toISOString() }
          : {}),
      });
      setMeasurementAnalysis(null);
      setError("");
    } catch (fileError) {
      setMeasurementSamples([]);
      setMeasurementProvenance(null);
      setMeasurementAnalysis(null);
      setError(fileError.message);
    }
  }, [settings.frequencyGHz]);

  const evaluateMeasurements = useCallback(async () => {
    const measurementTowers = planningMode === "network" ? selectedNetworkTowers : [selectedTower].filter(Boolean);
    if (measurementSamples.length === 0) {
      setError("Import a measurement CSV before evaluating residuals");
      return;
    }
    if (measurementTowers.length === 0 || !interferenceApplicable) {
      setError("Measurement validation requires at least one selected 4G or 5G cell");
      return;
    }
    const request = requests.begin("rf");
    setActiveRFTask("measurements");
    setError("");
    try {
      const payload = await postJSON(
        "/api/measurements/evaluate",
        buildMeasurementPayload(measurementTowers, settings, measurementSamples, networkOptimization, networkAzimuths, measurementProvenance),
        "Measurement evaluation failed",
        request.signal,
      );
      if (!request.isCurrent()) return;
      setMeasurementAnalysis(payload);
      setLayerVisibility((current) => ({ ...current, measurements: true }));
      setPlanDirty(false);
    } catch (requestError) {
      if (!isAbortError(requestError) && request.isCurrent()) setError(requestError.message);
    } finally {
      if (request.isCurrent()) {
        setActiveRFTask(null);
        request.finish();
      }
    }
  }, [interferenceApplicable, measurementProvenance, measurementSamples, networkAzimuths, networkOptimization, planningMode, requests, selectedNetworkTowers, selectedTower, settings]);

  const applyCalibration = useCallback(() => {
    const offset = measurementAnalysis?.calibration?.recommended_total_offset_db;
    if (!Number.isFinite(Number(offset))) {
      setError("No eligible calibration correction is available");
      return;
    }
    invalidatePlanResults();
    setSettings((current) => ({ ...current, calibrationOffsetDb: Number(offset) }));
    setCalibrationProfile({
      kind: "spatially_validated_robust_global_path_loss_bias",
      offsetDb: Number(offset),
      technology: networkTechnologyForFrequency(settings.frequencyGHz),
      frequencyGHz: settings.frequencyGHz,
      modelVersion: appMeta?.model_version ?? "unknown",
      dataset: datasetReference(appMeta),
      provenance: measurementAnalysis.calibration?.provenance ?? {},
      expiresAt: measurementAnalysis.calibration?.provenance?.expires_at || undefined,
      validation: measurementAnalysis.calibration,
    });
  }, [appMeta, invalidatePlanResults, measurementAnalysis, settings.frequencyGHz]);

  const toggleLayerVisibility = useCallback((layer) => {
    if (layer === "rays") {
      const nextVisible = !layerVisibility.rays;
      setLayerVisibility((current) => ({ ...current, rays: nextVisible }));
      setRayScope(nextVisible ? (rayScope === RAY_SCOPE_HIDDEN ? RAY_SCOPE_ALL : rayScope) : RAY_SCOPE_HIDDEN);
      return;
    }
    setLayerVisibility((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }, [layerVisibility.rays, rayScope]);

  const toggleSignalLayer = useCallback(() => {
    if (signalSurfaceState === COVERAGE_SURFACE_STATUS.UNAVAILABLE || signalSurfaceState === COVERAGE_SURFACE_STATUS.LOADING) {
      return;
    }
    if (coverageSurfaceIsCurrent) {
      toggleLayerVisibility("surfaces");
      return;
    }
    analyzeCoverageSurface(surfaceOptions);
  }, [analyzeCoverageSurface, coverageSurfaceIsCurrent, signalSurfaceState, surfaceOptions, toggleLayerVisibility]);

  const selectMapCell = useCallback((tower) => {
    const cellID = cellIDForTower(tower);
    if (!cellID) return;
    if (planningMode === "network"
      && !selectedNetworkSelectionIDs.includes(tower.id)
      && selectedNetworkSelectionIDs.length >= MAX_NETWORK_CELLS) {
      return;
    }
    setSelectedMapCellId(cellID);
  }, [planningMode, selectedNetworkSelectionIDs]);

  const changeRayScope = useCallback((scope) => {
    const nextScope = [RAY_SCOPE_ALL, RAY_SCOPE_SELECTED, RAY_SCOPE_HIDDEN].includes(scope) ? scope : RAY_SCOPE_ALL;
    setRayScope(nextScope);
    setLayerVisibility((current) => ({ ...current, rays: nextScope !== RAY_SCOPE_HIDDEN }));
  }, []);

  const changeMapCellFocus = useCallback((cellID) => {
    if (rayCellIDs.includes(String(cellID))) setSelectedMapCellId(String(cellID));
  }, [rayCellIDs]);

  const fitSelectedCells = useCallback(() => {
    setFitRequestVersion((current) => current + 1);
  }, []);

  const closeDrawer = useCallback((focusTarget = "tool") => {
    setDrawerOpen(false);
    setDrawerMode("tool");
    window.setTimeout(() => {
      if (focusTarget === "map") {
        document.querySelector(".leaflet-container")?.focus();
        return;
      }
      document.getElementById(`workspace-tool-${activeTool}`)?.focus();
    }, 0);
  }, [activeTool]);

  const selectWorkspaceTool = useCallback((tool) => {
		if (tool !== "inventory") setIsPlacingCell(false);
    if (tool !== "propagation") setIsSelectingPathEndpoint(false);
    if (tool !== activeTool) setResearchActivity(false);
    if (drawerOpen && drawerMode === "tool" && activeTool === tool) {
      closeDrawer();
      return;
    }
    setPreviousTool(activeTool);
    setActiveTool(tool);
    setDrawerMode("tool");
    setDrawerOpen(true);
    setSelectedMapObject(null);
  }, [activeTool, closeDrawer, drawerMode, drawerOpen]);

  const openPathProfileDiagnostics = useCallback(() => {
    setOpenPropagationAdvancedRequest((current) => current + 1);
    selectWorkspaceTool("propagation");
  }, [selectWorkspaceTool]);

  const openResults = useCallback((view = activeResultsView) => {
    setActiveResultsView(view);
    setPreviousTool(activeTool);
    setActiveTool("results");
    setDrawerMode("tool");
    setDrawerOpen(true);
    setSelectedMapObject(null);
  }, [activeResultsView, activeTool]);

  const selectMapObject = useCallback((mapObject) => {
    if (!mapObject) {
      return;
    }
    setPreviousTool(activeTool);
    setSelectedMapObject(mapObject);
    setDrawerMode("inspector");
    setDrawerOpen(true);
  }, [activeTool]);

  const returnFromInspector = useCallback(() => {
    setSelectedMapObject(null);
    setActiveTool(previousTool);
    setDrawerMode("tool");
    setDrawerOpen(true);
  }, [previousTool]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (layerMenuOpen) {
        setLayerMenuOpen(false);
        return;
      }
      if (isSelectingPathEndpoint) {
        setIsSelectingPathEndpoint(false);
        return;
      }
      if (isDrawingSelection) {
        cancelAreaSelection();
        return;
      }
      if (drawerOpen) {
        closeDrawer(drawerMode === "inspector" ? "map" : "tool");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelAreaSelection, closeDrawer, drawerMode, drawerOpen, isDrawingSelection, isSelectingPathEndpoint, layerMenuOpen]);

  useEffect(() => {
    if (!coreLabEnabled || !coreLabApplicable) {
      return undefined;
    }
    refreshCoreLab();
    const timerID = window.setInterval(refreshCoreLab, 7000);
    return () => window.clearInterval(timerID);
  }, [coreLabApplicable, coreLabEnabled, refreshCoreLab]);

  useEffect(() => {
    if (coreLabApplicable) {
      return;
    }
    setCoreLab((current) => ({
      ...current,
      events: null,
      isLoading: false,
      lastError: "",
      sessions: null,
      status: coreLabEnabled
        ? {
            mode: "not_applicable",
            state: "not_applicable",
            functions: [],
            message: "5G Communication Path applies only to 5G mmWave.",
          }
        : null,
      topology: null,
    }));
  }, [coreLabApplicable, coreLabEnabled]);

  const stats = useMemo(() => {
    return {
      towerCount: towers.length,
      rayCount: simulation?.geojson?.features?.length ?? 0,
      blockedRatio: simulation?.stats?.blocked_pct ?? 0,
      avgPower: simulation?.stats?.avg_rx_dbm ?? null,
      minRange: simulation?.stats?.min_range_m ?? null,
      maxRange: simulation?.stats?.max_range_m ?? null,
    };
  }, [simulation, towers]);
  const gapStats = coverageGaps?.stats ?? null;
  const activeNetworkTech = networkTechLabelForFrequency(settings.frequencyGHz);
  const selectedTowerLabel = selectedTower?.cellId ?? "No tower";
  const runState = error
    ? "Action needed"
    : isGeneratingSurface
      ? "Loading surface"
    : isEvaluatingNetwork
      ? "Evaluating"
      : activeRFTask === "simulation"
        ? "Simulating"
        : isOptimizing
          ? "Optimizing"
          : isAnalyzingInterference
            ? "Analyzing"
            : isRecommendingSites
              ? "Recommending"
              : isEvaluatingMeasurements
                ? "Validating"
                : isAnalyzingMaterialReference
                  ? "Evaluating reference"
                : activeRFTask === "building_entry"
                  ? "Estimating entry"
    : planDirty
              ? currentResultRun ? "Result out of date" : "Run needed"
              : "Ready";
  const resultSummary = useMemo(() => {
    if (lastAnalysisKind === "building-entry" && buildingEntryAnalysis?.summary) {
      return {
        label: "Building entry",
        primary: `${buildingEntryAnalysis.summary.low_loss_serviceable_buildings ?? 0} low-loss served`,
        secondary: `${buildingEntryAnalysis.summary.high_loss_serviceable_buildings ?? 0} high-loss served`,
        view: "building-entry",
      };
    }
    if (lastAnalysisKind === "interference" && interferenceAnalysis.stats) {
      return {
        label: "Interference",
        primary: formatMetric(interferenceAnalysis.stats.avg_sinr_db, "dB"),
        secondary: `${formatNumber(interferenceAnalysis.stats.serviceable_pct, 0)}% serviceable`,
        view: "interference",
      };
    }
    if (lastAnalysisKind === "recommendation" && siteRecommendations?.recommendations?.length) {
      return {
        label: "Candidates",
        primary: String(siteRecommendations.recommendations.length),
        secondary: "ranked sites",
        view: "recommendations",
      };
    }
    if ((lastAnalysisKind === "network" || lastAnalysisKind === "optimization") && displayedNetworkOptimization?.stats) {
      return {
        label: networkResultKind === "evaluation" ? "Network plan" : "Optimization",
        primary: `${formatNumber(displayedNetworkOptimization.stats.score, 1)} / 100`,
        secondary: `${(displayedNetworkOptimization.stats.overlap_buildings ?? 0).toLocaleString()} overlap`,
        view: "optimization",
      };
    }
    if (lastAnalysisKind === "rf" && simulation?.stats) {
      return {
        label: "Sector result",
        primary: stats.avgPower === null ? UNAVAILABLE_VALUE : `${stats.avgPower.toFixed(1)} dBm`,
        secondary: `${gapStats?.gap_buildings?.toLocaleString() ?? UNAVAILABLE_VALUE} gaps`,
        view: "rf",
      };
    }
    return null;
  }, [buildingEntryAnalysis, displayedNetworkOptimization, gapStats, interferenceAnalysis.stats, lastAnalysisKind, networkResultKind, simulation?.stats, siteRecommendations, stats.avgPower]);
  const selectedCellCount = selectedNetworkSelectionIDs.length;
	const activeProfileTowers = planningMode === "network" ? selectedNetworkTowers : [selectedTower].filter(Boolean);
	const invalidProfileCount = activeProfileTowers.filter((tower, index) => (
		Object.keys(validateRFProfile(resolveRFProfile(tower, settings, index))).length > 0
	)).length;
  const contextLabel = planningMode === "network"
    ? `Network · ${selectedCellCount} ${selectedCellCount === 1 ? "cell" : "cells"}`
    : `Single · Cell ${selectedTowerLabel}`;
  const planSummary = `${formatNumber(settings.frequencyGHz, 1)} GHz · ${formatNumber(settings.txPowerDbm, 0)} dBm · ${formatNumber(settings.radiusMeters, 0)} m`;
  const hasInterferenceData = (interferenceAnalysis.geojson?.features ?? []).length > 0;
  const currentBuildingEntryAnalysis = buildingEntryIsCurrent ? buildingEntryAnalysis : null;
  const hasResults = Boolean(simulation?.stats || networkOptimization?.stats || interferenceAnalysis.stats || siteRecommendations || measurementAnalysis || currentBuildingEntryAnalysis);
  const workspaceLineage = useMemo(() => buildWorkspaceLineage({
    project: activeProject,
    activeScenario,
    sourceScenario: scenarioSource,
    draft: activeProject?.draft,
    scenarios: activeProject?.scenarios ?? [],
  }), [activeProject, activeScenario, scenarioSource]);
  const activeRevisionId = activeScenario?.domain?.current_revision_id
    ?? activeProject?.draft?.sourceRevisionId
    ?? activeProject?.draft?.source_revision_id
    ?? scenarioSource?.domain?.current_revision_id
    ?? null;
  const currentRevision = scenarioSource?.domain?.revisions?.find((revision) => (
    String(revision.scenario_revision_id) === String(activeRevisionId)
  )) ?? null;
  const resultRunType = lastAnalysisKind === "rf"
    ? "simulation"
    : ["network", "optimization"].includes(lastAnalysisKind)
      ? "optimization"
      : null;
  const matchingResultRun = currentResultRun?.run_type === resultRunType ? currentResultRun : null;
  const resultContext = resultRunType && (hasResults || Boolean(matchingResultRun))
    ? buildResultContext({
      activeProjectId: activeProject?.domain?.project_id ?? activeProject?.id ?? null,
      activeScenarioId: workspaceLineage.scenario_id,
      activeRevisionId,
      currentInputFingerprint: workspaceLineage.unsaved ? null : currentRevision?.resolved_fingerprints?.input_fingerprint ?? null,
      currentScenarioFingerprint: workspaceLineage.unsaved ? null : currentRevision?.resolved_fingerprints?.scenario_fingerprint ?? null,
      draftChangedSinceRun: planDirty,
      project: activeProject,
      run: matchingResultRun,
      resultType: resultRunType,
      scenarios: activeProject?.scenarios ?? [],
      unavailableReason: matchingResultRun ? "" : "The restored result has no unambiguous retained Run.",
    })
    : null;
  const rerunCurrentResult = useCallback(() => {
    if (resultContext?.run_type === "optimization") {
      if (planningMode === "network") return optimizeNetwork();
      return optimizeAzimuth();
    }
    if (planningMode === "network") return evaluateNetwork();
    return runSimulation();
  }, [evaluateNetwork, optimizeAzimuth, optimizeNetwork, planningMode, resultContext?.run_type, runSimulation]);
  const interferenceUnavailableReason = planningMode !== "network"
    ? "Interference requires Network planning mode"
    : !interferenceApplicable
      ? "Interference is not applicable when the plan or a selected cell uses the 6G research profile"
      : selectedCellCount < 2
        ? "Select at least two cells"
        : null;
  const coreUnavailableReason = coreLabApplicable ? null : "5G Core requires 5G mmWave plan defaults and 5G profiles on the active cells";
  const toolState = {
    setup: { badge: planningMode === "network" ? String(selectedCellCount) : null },
		inventory: { badge: invalidProfileCount ? "!" : null, tone: invalidProfileCount ? "warning" : "success" },
    propagation: {},
    experiments: {},
    surfaces: {
      badge: coverageSurfaceStatus === COVERAGE_SURFACE_STATUS.READY
        ? "•"
        : coverageSurfaceStatus === COVERAGE_SURFACE_STATUS.LOADING
          ? "…"
          : coverageSurfaceStatus === COVERAGE_SURFACE_STATUS.ERROR
            ? "!"
            : null,
      tone: coverageSurfaceStatus === COVERAGE_SURFACE_STATUS.ERROR
        ? "warning"
        : coverageSurfaceStatus === COVERAGE_SURFACE_STATUS.READY
          ? "success"
          : undefined,
    },
    interference: {
      unavailable: Boolean(interferenceUnavailableReason),
      reason: interferenceUnavailableReason,
      badge: hasInterferenceData ? "•" : interferenceUnavailableReason ? "!" : null,
      tone: hasInterferenceData ? "success" : "warning",
    },
    validation: {
      badge: measurementValidation || materialReference || specularReflectionReference ? "•" : null,
      tone: measurementValidation || materialReference || specularReflectionReference ? "success" : undefined,
    },
    "building-entry": {
      badge: currentBuildingEntryAnalysis ? "•" : null,
      tone: currentBuildingEntryAnalysis ? "success" : undefined,
    },
    core: {
      unavailable: Boolean(coreUnavailableReason),
      reason: coreUnavailableReason,
      badge: coreLabEnabled ? "•" : coreUnavailableReason ? "!" : null,
      tone: coreLab.status?.state === "connected" ? "success" : "warning",
    },
    results: { badge: hasResults ? "•" : null, tone: "success" },
    history: {
      badge: runHistory.runs.length > 99 ? "99+" : runHistory.runs.length ? String(runHistory.runs.length) : null,
      tone: runHistory.error ? "warning" : runHistory.runs.length ? "success" : undefined,
    },
    data: {},
    report: {},
  };
  const activeToolDefinition = WORKSPACE_TOOLS.find((tool) => tool.id === activeTool) ?? WORKSPACE_TOOLS[0];
  const cellsNeeded = Math.max(0, 2 - selectedCellCount);
  const runPlanActionLabel = isEvaluatingNetwork
    ? "Evaluating..."
    : planningMode === "network"
      ? cellsNeeded > 0
        ? `Add ${cellsNeeded} ${cellsNeeded === 1 ? "cell" : "cells"}`
        : "Evaluate Network"
      : isLoading
        ? "Running..."
        : "Run Sector";
  const primaryActionLabel = ["setup", "inventory", "propagation"].includes(activeTool)
    ? runPlanActionLabel
    : null;
  const mapPlanPrompt = planDirty
		? invalidProfileCount > 0
			? {
				title: "RF profile needs attention",
				detail: `Fix ${invalidProfileCount} invalid selected cell profile${invalidProfileCount === 1 ? "" : "s"} in Inventory.`,
			}
			: planningMode === "network" && cellsNeeded > 0
      ? {
          title: `Add ${cellsNeeded} more ${cellsNeeded === 1 ? "cell" : "cells"}`,
          detail: "Select towers on the map or draw an area to build the cluster.",
        }
              : {
          title: currentResultRun ? "Result out of date" : "Plan changed",
          detail: currentResultRun
            ? `${currentResultRun.run_type === "optimization" ? "Optimization" : "Simulation"} ${shortRunLabel(currentResultRun.run_id)} came from its original input. Run again for this plan.`
            : planningMode === "network"
              ? "Evaluate the network to refresh the map and KPIs."
              : "Run the sector to refresh the map and KPIs.",
        }
    : null;

  const buildCurrentScenarioSnapshot = useCallback((overrides = {}) => ({
    datasetRef: appMeta?.dataset ? {
      id: appMeta.dataset.id,
      version: appMeta.dataset.version,
      hashes: appMeta.dataset.sha256 ?? {},
    } : null,
    meta: appMeta,
    calibrationProfile,
    plan: {
      settings,
		inventory: towers,
      planningMode,
      selectedTowerId: selectedTower?.id ?? null,
        selectedMapCellId,
        rayScope,
        selectedNetworkTowerIds: selectedNetworkSelectionIDs,
        networkAzimuths,
        optimizationConfig,
      selectionPolygon,
      layerVisibility,
      ...overrides.plan,
    },
    request: planningMode === "network"
      ? buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths, optimizationConfig)
      : selectedTower ? buildSimulationPayload(selectedTower, settings) : null,
    summary: {
      kind: lastAnalysisKind,
      resultsView: activeResultsView,
      avgRxDBm: simulation?.stats?.avg_rx_dbm ?? null,
      gapPct: coverageGaps?.stats?.gap_pct ?? null,
      networkScore: displayedNetworkOptimization?.stats?.score ?? null,
      overlapBuildings: displayedNetworkOptimization?.stats?.overlap_buildings ?? null,
      avgSINRDB: interferenceAnalysis?.stats?.avg_sinr_db ?? null,
      serviceablePct: interferenceAnalysis?.stats?.serviceable_pct ?? null,
      affectedDemand: interferenceAnalysis?.stats?.affected_demand ?? null,
      calibrationOffsetDB: settings.calibrationOffsetDb ?? 0,
      ...overrides.summary,
    },
    artifacts: selectScenarioArtifacts(planDirty, overrides, {
      simulation,
      coverageGaps,
      interferenceAnalysis,
      networkOptimization: displayedNetworkOptimization,
      optimizationDiagnostics,
      siteRecommendations,
      measurementAnalysis,
      buildingEntryAnalysis: currentBuildingEntryAnalysis,
      buildingEntrySourceKey: currentBuildingEntryAnalysis ? buildingEntrySourceKey : null,
    }),
    requiresRerun: Boolean(planDirty),
  }), [
    activeResultsView,
	    appMeta,
	    buildingEntrySourceKey,
	    currentBuildingEntryAnalysis,
	    calibrationProfile,
    coverageGaps,
    interferenceAnalysis,
    lastAnalysisKind,
    layerVisibility,
    networkAzimuths,
    optimizationConfig,
    measurementAnalysis,
    displayedNetworkOptimization,
    optimizationDiagnostics,
    planDirty,
    planningMode,
    rayScope,
    selectedNetworkSelectionIDs,
    selectedNetworkTowers,
    selectedMapCellId,
    selectedTower,
    selectionPolygon,
    settings,
    simulation,
    siteRecommendations,
		towers,
  ]);

  const saveCurrentScenario = useCallback((changeSummary = "") => {
    const count = activeProject?.scenarios?.length ?? 0;
    const label = lastAnalysisKind === "recommendation" ? "Candidate search" : lastAnalysisKind === "interference" ? "Interference" : planningMode === "network" ? "Network plan" : "Sector plan";
    const snapshot = buildCurrentScenarioSnapshot();
    if (scenarioSource) {
      return saveProjectScenarioVersion({
        changeSummary: changeSummary || `Saved Version ${Number(scenarioSource.domain?.revision ?? 0) + 1}`,
        scenarioId: scenarioSource.domain?.scenario_id ?? scenarioSource.id,
        snapshot,
      }).then((saved) => {
        const nextProject = saved.workspace?.projects?.find((project) => project.id === saved.workspace.activeProjectId);
        const nextScenario = nextProject?.scenarios?.find((scenario) => scenario.id === nextProject.activeScenarioId) ?? saved.scenario;
        if (nextScenario) restorePlanningSnapshot(nextScenario);
        setError("");
        return saved;
      });
    }
    return saveProjectScenario(`${label} ${count + 1}`, snapshot);
  }, [activeProject?.scenarios?.length, buildCurrentScenarioSnapshot, lastAnalysisKind, planningMode, restorePlanningSnapshot, saveProjectScenario, saveProjectScenarioVersion, scenarioSource]);

  const deleteScenarioWithUndo = useCallback((scenarioID) => {
    const scenarios = activeProject?.scenarios ?? [];
    const index = scenarios.findIndex((scenario) => scenario.id === scenarioID);
    if (index < 0) return;
    const scenario = scenarios[index];
    const wasActive = activeProject?.activeScenarioId === scenarioID;
    projectWorkspace.deleteScenario(scenarioID);
    showUndoNotice(`Deleted scenario “${scenario.name}”.`, () => {
      projectWorkspace.restoreScenario(scenario, index, wasActive);
    });
  }, [activeProject, projectWorkspace, showUndoNotice]);

  const openSavedScenario = useCallback((scenario) => {
    if (!scenario) return false;
    if (activeProject?.draft && activeProject.activeScenarioId === null) {
      setNavigationNotice("Save the current draft as a Version before opening another Scenario. Your draft has been kept.");
      return false;
    }
    setNavigationNotice("");
    setCurrentResultRun(null);
    setFocusedRunId(null);
    projectWorkspace.activateScenario(scenario.id);
    setFocusedRevisionId(scenario.domain?.current_revision_id ?? null);
    restorePlanningSnapshot(scenario);
    setError(scenario.requiresRerun ? "This scenario retains its inputs and summary; rerun it to restore uncached map layers." : "");
    return true;
  }, [activeProject, projectWorkspace, restorePlanningSnapshot]);

  const openScenarioRevision = useCallback((scenarioID, revisionID) => {
    const scenario = (activeProject?.scenarios ?? []).find((candidate) => (
      String(candidate.id) === String(scenarioID)
        || String(candidate.domain?.scenario_id) === String(scenarioID)
    ));
    const revisionRetained = scenario?.domain?.revisions?.some((revision) => (
      String(revision.scenario_revision_id) === String(revisionID)
    ));
    if (!scenario || !revisionRetained) {
      setNavigationNotice("UNAVAILABLE · The exact source Scenario Version is not retained, so it could not be opened.");
      return;
    }
    const sourceScenarioID = scenario.domain?.scenario_id ?? scenario.id;
    const sameCurrentScenario = String(workspaceLineage.scenario_id ?? "") === String(sourceScenarioID);
    if (activeProject?.draft && activeProject.activeScenarioId === null && !sameCurrentScenario) {
      setNavigationNotice("Save the current draft as a Version before opening another Scenario. Your draft has been kept.");
      return;
    }
    setNavigationNotice("");
    setFocusedRunId(null);
    if (!sameCurrentScenario && !openSavedScenario(scenario)) return;
    setFocusedRevisionId(revisionID);
    setOpenScenarioWorkspaceRequest((current) => current + 1);
    setActiveTool("setup");
    setDrawerMode("tool");
    setDrawerOpen(true);
  }, [activeProject, openSavedScenario, workspaceLineage.scenario_id]);

  const handleBranchScenario = useCallback(async ({ name, revisionId, scenarioId }) => {
    try {
      const saved = await projectWorkspace.branchScenario({ name, revisionId, scenarioId });
      const nextProject = saved.workspace?.projects?.find((project) => project.id === saved.workspace.activeProjectId);
      const nextScenario = nextProject?.scenarios?.find((scenario) => scenario.id === nextProject.activeScenarioId);
      setFocusedRevisionId(saved.revision?.scenario_revision_id ?? null);
      if (nextScenario) restorePlanningSnapshot(nextScenario);
      setPlanDirty(true);
      setError("");
      return saved;
    } catch (branchError) {
      setError(branchError.message);
      throw branchError;
    }
  }, [projectWorkspace, restorePlanningSnapshot]);

  const handleDuplicateScenario = useCallback(async ({ name, scenarioId }) => {
    try {
      const saved = await projectWorkspace.duplicateScenario({ name, scenarioId });
      const nextProject = saved.workspace?.projects?.find((project) => project.id === saved.workspace.activeProjectId);
      const nextScenario = nextProject?.scenarios?.find((scenario) => scenario.id === nextProject.activeScenarioId);
      setFocusedRevisionId(saved.revision?.scenario_revision_id ?? null);
      if (nextScenario) restorePlanningSnapshot(nextScenario);
      setPlanDirty(true);
      setError("");
      return saved;
    } catch (duplicateError) {
      setError(duplicateError.message);
      throw duplicateError;
    }
  }, [projectWorkspace, restorePlanningSnapshot]);

  const handleContinueFromVersion = useCallback(async ({ scenarioId, revisionId }) => {
    try {
      const saved = await projectWorkspace.continueFromScenarioRevision({ scenarioId, revisionId });
      const nextProject = saved.workspace?.projects?.find((project) => project.id === saved.workspace.activeProjectId);
      if (nextProject?.draft) restorePlanningSnapshot(nextProject.draft);
      setFocusedRevisionId(revisionId);
      setPlanDirty(true);
      setError("");
      return saved;
    } catch (continueError) {
      setError(continueError.message);
      throw continueError;
    }
  }, [projectWorkspace, restorePlanningSnapshot]);

  const openRunSource = useCallback((run) => {
    if (!run?.scenario_id || !run?.scenario_revision_id) {
      setActiveTool("history");
      setDrawerMode("tool");
      setDrawerOpen(true);
      return;
    }
    openScenarioRevision(run.scenario_id, run.scenario_revision_id);
  }, [openScenarioRevision]);

  const openRunHistory = useCallback((run) => {
    setFocusedRunId(run?.run_id ?? null);
    setActiveTool("history");
    setDrawerMode("tool");
    setDrawerOpen(true);
  }, []);

  const openReportSource = useCallback((artifact) => {
    if (artifact?.scenario_id && artifact?.scenario_revision_id) {
      openScenarioRevision(artifact.scenario_id, artifact.scenario_revision_id);
      return;
    }
    setSelectedArtifactId(artifact?.artifact_id ?? null);
    setActiveTool("report");
    setDrawerMode("tool");
    setDrawerOpen(true);
  }, [openScenarioRevision]);

  const inspectReport = useCallback((artifact) => {
    setSelectedArtifactId(artifact?.artifact_id ?? null);
    setActiveTool("report");
    setDrawerMode("tool");
    setDrawerOpen(true);
  }, []);

  const openReports = useCallback(() => {
    setActiveTool("report");
    setDrawerMode("tool");
    setDrawerOpen(true);
  }, []);

  const historyDatasetUnavailable = useMemo(
    () => Boolean(appMeta && runHistory.runs.some((run) => !runDatasetMatches(run, appMeta))),
    [appMeta, runHistory.runs],
  );

  const historyReferencesForRun = useCallback((run) => {
    const references = [];
    for (const scenario of activeProject?.scenarios ?? []) {
      for (const revision of scenario.domain?.revisions ?? []) {
        if (revision.originating_run_id === run.run_id) {
          references.push({ type: "scenario_revision", id: revision.scenario_revision_id });
        }
      }
    }
    for (const report of activeProject?.domain?.report_definitions ?? []) {
      if ((report.run_ids ?? []).includes(run.run_id)) references.push({ type: "report", id: report.report_id });
    }
    return references;
  }, [activeProject]);

  const deleteHistoryRun = useCallback(async (run) => {
    await runHistory.deleteRun(run.run_id, historyReferencesForRun(run));
  }, [historyReferencesForRun, runHistory]);

  const clearUnreferencedHistory = useCallback(async () => {
    if (!globalThis.confirm?.("Clear every unreferenced local run-history record?")) return;
    const referencedRunIds = (projectWorkspace.workspace.projects ?? []).flatMap((project) => (
      (project.scenarios ?? []).flatMap((scenario) => (
        (scenario.domain?.revisions ?? []).map((revision) => revision.originating_run_id).filter(Boolean)
      ))
    ));
    await runHistory.clearAllUnreferenced(referencedRunIds);
  }, [projectWorkspace.workspace.projects, runHistory]);

  const deleteProjectWithHistory = useCallback(async () => {
    const projectID = activeProject?.domain?.project_id ?? activeProject?.id;
    const referencedRunIds = [
      ...(activeProject?.scenarios ?? []).flatMap((scenario) => (
        (scenario.domain?.revisions ?? []).map((revision) => revision.originating_run_id).filter(Boolean)
      )),
      ...(activeProject?.domain?.report_definitions ?? []).flatMap((report) => report.run_ids ?? []),
    ];
    await runHistory.clearUnreferenced(referencedRunIds);
    try {
      await reportArtifacts.repository.deleteProjectArtifacts(projectID);
      await reportArtifacts.refresh();
    } catch (artifactError) {
      setError(`Project artifacts could not be cleaned up: ${artifactError.message}`);
      return;
    }
    restoredProjectRef.current = null;
    setWorkspaceRestored(false);
    setCurrentResultRun(null);
    setFocusedRunId(null);
    projectWorkspace.deleteProject();
    return projectID;
  }, [activeProject, projectWorkspace, reportArtifacts, runHistory]);

  const applyHistoricalSolution = useCallback(async (run, solution, mode = "version") => {
    if (!runDatasetMatches(run, appMeta)) {
      setError("The historical run dataset is unavailable; the solution cannot be applied safely.");
      return;
    }
    if (!run?.scenario_id || !run?.scenario_revision_id) {
      setError("This Run is not bound to a saved Scenario Version; the solution cannot be applied safely.");
      return;
    }
    try {
      const saved = await projectWorkspace.applyHistoricalOptimization({
        branchName: mode === "branch" ? `${scenarioSourceForRun(run, activeProject?.scenarios)?.name ?? "Scenario"} optimized` : "",
        mode,
        revisionId: run.scenario_revision_id,
        run,
        scenarioId: run.scenario_id,
        solution,
      });
      const nextProject = saved.workspace?.projects?.find((project) => project.id === saved.workspace.activeProjectId);
      const nextScenario = nextProject?.scenarios?.find((scenario) => scenario.id === nextProject.activeScenarioId);
      invalidatePlanResults();
      if (nextScenario) {
        setFocusedRevisionId(saved.revision?.scenario_revision_id ?? null);
        restorePlanningSnapshot({ ...nextScenario, requiresRerun: true, artifacts: null });
      }
      setPlanDirty(true);
      setError(mode === "branch"
        ? "Historical solution applied to a new branched Version. Run the plan to compute fresh visualization."
        : "Historical solution applied to a new Version. Run the plan to compute fresh visualization.");
    } catch (applyError) {
      setError(applyError.message);
    }
  }, [activeProject?.scenarios, appMeta, invalidatePlanResults, projectWorkspace, restorePlanningSnapshot]);

  const applyCurrentOptimizationSolution = useCallback((solution, mode = "version") => {
    const run = currentResultRun;
    if (!run?.scenario_id || !run?.scenario_revision_id) {
      setError("Save a Scenario Version before applying an optimization solution to lineage.");
      return;
    }
    if (run.run_type !== "optimization" || run.status !== "succeeded") {
      setError("This solution is not bound to the current successful Optimization Run.");
      return;
    }
    return applyHistoricalSolution(run, solution, mode);
  }, [applyHistoricalSolution, currentResultRun]);

  const runAgainFromHistory = useCallback(async (run) => {
    if (!runDatasetMatches(run, appMeta)) {
      setError("UNAVAILABLE · The dataset recorded for this Run is not active; rerun was not started.");
      return;
    }
    const requestPayload = run?.canonical_input_snapshot?.request;
    if (!requestPayload) {
      setError("UNAVAILABLE · The exact input for this Run was not retained; rerun was not started.");
      return;
    }
    if (!["simulation", "optimization"].includes(run.run_type)) {
      setError("UNSUPPORTED · This Run type cannot be recomputed from its retained input.");
      return;
    }

    const sourceContext = { ...run };
    delete sourceContext.run_id;
    const newRunContext = {
      ...sourceContext,
      status: "queued",
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      summary: {},
      details: null,
      error: null,
      warnings: [],
      metadata: { ...(run.metadata ?? {}) },
    };
    const queued = run.run_type === "optimization"
      ? createOptimizationRun({ ...newRunContext, request: requestPayload })
      : createSimulationRun({ ...newRunContext, request: requestPayload });
    await persistRunHistoryRecord(queued);
    const running = transitionRun(queued, "running");
    await persistRunHistoryRecord(running);

    try {
      let finalRun;
      if (run.run_type === "simulation") {
        const result = await postJSON("/api/analyze-sector", requestPayload, "Historical simulation rerun failed");
        finalRun = captureSimulationRun({ context: running, request: requestPayload, result });
      } else {
        const networkRequest = Array.isArray(requestPayload.towers);
        const endpoint = networkRequest ? "/api/optimize-network" : "/api/optimize-azimuth";
        const response = await postJSON(endpoint, requestPayload, "Historical optimization rerun failed");
        finalRun = captureOptimizationRun({ context: running, request: requestPayload, response });
      }
      await persistRunHistoryRecord(finalRun);
      setFocusedRunId(finalRun.run_id);
      setActiveTool("history");
      setDrawerMode("tool");
      setDrawerOpen(true);
      setError("");
    } catch (rerunError) {
      const finalRun = run.run_type === "optimization"
        ? captureOptimizationRun({ context: running, request: requestPayload, error: rerunError })
        : captureSimulationRun({ context: running, request: requestPayload, error: rerunError });
      await persistRunHistoryRecord(finalRun);
      setError(rerunError.message);
    }
  }, [appMeta, persistRunHistoryRecord]);

  const applyRecommendation = useCallback((recommendation) => {
    const candidate = towers.find((tower) => String(tower.cellId) === String(recommendation.cell_id) || tower.id === recommendation.id);
    if (!candidate) {
      setError("The recommended candidate is not present in the active dataset");
      return;
    }
    if (!selectedNetworkSelectionIDs.includes(candidate.id) && selectedNetworkSelectionIDs.length >= MAX_NETWORK_CELLS) {
      setError(`Network planning supports up to ${MAX_NETWORK_CELLS} selected cells`);
      return;
    }
    const nextIDs = [...new Set([...selectedNetworkSelectionIDs, candidate.id])];
    const nextAzimuths = {
      ...networkAzimuths,
      ...networkAzimuthMap(selectedNetworkTowers, networkOptimization, networkAzimuths),
      [candidate.id]: Number(recommendation.optimal_azimuth),
    };
    const snapshot = buildCurrentScenarioSnapshot({
      plan: {
        planningMode: "network",
        selectedTowerId: candidate.id,
        selectedNetworkTowerIds: nextIDs,
        networkAzimuths: nextAzimuths,
        settings,
      },
      summary: { kind: "recommendation", resultsView: "recommendations", networkScore: normalizedNetworkScore(recommendation.stats) },
      artifacts: null,
    });
    snapshot.requiresRerun = true;
    saveProjectScenario(`Candidate ${recommendation.cell_id}`, snapshot);
    restorePlanningSnapshot(snapshot);
    setSelectedTower(candidate);
    setError("");
  }, [
    buildCurrentScenarioSnapshot,
    networkAzimuths,
    networkOptimization,
    restorePlanningSnapshot,
    saveProjectScenario,
    selectedNetworkSelectionIDs,
    selectedNetworkTowers,
    settings,
    towers,
  ]);
  const createPlanningReport = useCallback(
    () =>
      buildPlanningReport({
        activeNetworkTech,
        appMeta,
        buildingEntryAnalysis: currentBuildingEntryAnalysis,
        buildingSummary,
        calibrationProfile,
        cellExplanations: [
          ...cellExplanationCacheRef.current.values(),
          ...(cellExplanationState.result ? [cellExplanationState.result] : []),
        ],
        coreLab,
        coreLabApplicable,
        coreLabEnabled,
        coverageGaps,
        diagnostics: optimizationDiagnostics,
        interferenceAnalysis,
        measurementAnalysis,
        comparison: activeComparison,
        networkOptimization: displayedNetworkOptimization,
        networkResultKind,
        optimizationConfig,
        planningMode,
        project: activeProject,
        recommendations: siteRecommendations,
        selectedTower,
				selectedNetworkTowers: planningMode === "network" ? selectedNetworkTowers : [],
        settings,
        simulation,
        stats,
      }),
    [
      activeNetworkTech,
      activeProject,
      appMeta,
      currentBuildingEntryAnalysis,
      buildingSummary,
      calibrationProfile,
      activeComparison,
      coreLab,
      coreLabApplicable,
      coreLabEnabled,
      cellExplanationState.result,
      interferenceAnalysis,
      measurementAnalysis,
      displayedNetworkOptimization,
      networkResultKind,
      optimizationConfig,
      coverageGaps,
      optimizationDiagnostics,
			planningMode,
			selectedNetworkTowers,
      selectedTower,
      settings,
      simulation,
      siteRecommendations,
      stats,
    ],
  );

  const reportDefinitions = useMemo(() => activeProject?.domain?.report_definitions ?? [], [activeProject?.domain?.report_definitions]);
  const currentReportRuns = useMemo(() => {
    const revisionID = activeScenario?.domain?.current_revision_id;
    if (planDirty || !revisionID) return [];
    const compatible = runHistory.runs.filter((run) => String(run.scenario_revision_id) === String(revisionID) && run.status === "succeeded");
    const type = planningMode === "network" ? "optimization" : "simulation";
    return compatible.filter((run) => run.run_type === type).slice(0, 1);
  }, [activeScenario?.domain?.current_revision_id, planDirty, planningMode, runHistory.runs]);

  const createCurrentReportDefinition = useCallback((report) => {
    const projectID = activeProject?.domain?.project_id ?? activeProject?.id ?? null;
    const scenarioID = activeScenario?.domain?.scenario_id ?? activeScenario?.id ?? null;
    const revisionID = planDirty ? null : activeScenario?.domain?.current_revision_id ?? null;
    return createReportDefinition({
      project_id: projectID,
      scenario_id: scenarioID,
      scenario_revision_id: revisionID,
      run_ids: planDirty ? [] : currentReportRuns.map((run) => run.run_id),
      title: report?.view?.title ?? (planningMode === "network" ? "Network planning report" : "Single-cell RF planning report"),
      sections: ["executive_summary", "evidence", "result", "configuration", "methodology"],
      presentation_options: { formats: ["markdown", "html"] },
      source_kind: revisionID ? "scenario_revision" : "live_compatibility",
      source_binding: {
        ...(report?.domainBinding ?? {}),
        project_id: projectID,
        scenario_id: scenarioID,
        scenario_revision_id: revisionID,
        run_ids: planDirty ? [] : currentReportRuns.map((run) => run.run_id),
        source_kind: revisionID ? "scenario_revision" : "live_compatibility",
      },
    });
  }, [activeProject, activeScenario, currentReportRuns, planDirty, planningMode]);

  const persistReportArtifact = useCallback(async ({ report, definition, format, download = true } = {}) => {
    const output = buildReportArtifactOutput({ report, reportDefinition: definition, format });
    const saved = await reportArtifacts.saveArtifact(output.artifact, output.bytes);
    if (!saved) {
      setReportWarning("Report generated, but its artifact was not retained locally. The current output is still available for download.");
      if (download && format === "markdown") downloadReportBytes(output.artifact, output.bytes);
      if (download && format === "html") openPdfReport(report);
      return null;
    }
    setReportWarning("");
    setSelectedArtifactId(saved.artifact_id);
    if (download && format === "markdown") downloadReportBytes(saved, output.bytes);
    if (download && format === "html") openStoredHtmlReport(saved, output.bytes);
    return saved;
  }, [reportArtifacts]);

  const exportMarkdownReport = useCallback(async () => {
    try {
      const report = createPlanningReport();
      const definition = createCurrentReportDefinition(report);
      await projectWorkspace.saveReportDefinition(definition);
      await persistReportArtifact({ report, definition, format: "markdown" });
    } catch (exportError) {
      setError(exportError.message);
      try { downloadMarkdownReport(createPlanningReport()); } catch { /* Keep the original persistence error visible. */ }
    }
  }, [createCurrentReportDefinition, createPlanningReport, persistReportArtifact, projectWorkspace]);

  const exportPdfReport = useCallback(async () => {
    try {
      const report = createPlanningReport();
      const definition = createCurrentReportDefinition(report);
      await projectWorkspace.saveReportDefinition(definition);
      await persistReportArtifact({ report, definition, format: "html" });
    } catch (exportError) {
      setError(exportError.message);
      try { openPdfReport(createPlanningReport()); } catch { /* Keep the original persistence error visible. */ }
    }
  }, [createCurrentReportDefinition, createPlanningReport, persistReportArtifact, projectWorkspace]);

  const historicalReportContext = useCallback((run) => {
    const scenario = (activeProject?.scenarios ?? []).find((candidate) => (
      String(candidate.domain?.scenario_id ?? candidate.id) === String(run?.scenario_id)
    )) ?? activeScenario;
    const revision = scenario?.domain?.revisions?.find((candidate) => (
      String(candidate.scenario_revision_id) === String(run?.scenario_revision_id)
    )) ?? null;
    return { revision, scenario };
  }, [activeProject?.scenarios, activeScenario]);

  const generateHistoricalReport = useCallback(async (run) => {
    if (!run || run.status !== "succeeded") return;
    const { revision, scenario } = historicalReportContext(run);
    if (!revision || !scenario) {
      setError("The exact Scenario Version for this Run is unavailable; no report was generated.");
      return;
    }
    try {
      const report = buildHistoricalPlanningReport({
        appMeta,
        project: activeProject,
        scenario,
        scenarioRevision: revision,
        runs: [run],
      });
      const definition = createReportDefinition({
        project_id: activeProject?.domain?.project_id ?? activeProject?.id,
        scenario_id: run.scenario_id,
        scenario_revision_id: run.scenario_revision_id,
        run_ids: [run.run_id],
        title: report.view?.title ?? "Historical planning report",
        sections: ["executive_summary", "evidence", "result", "configuration", "methodology"],
        presentation_options: { formats: ["markdown", "html"] },
        source_kind: "historical_run",
        source_binding: report.domainBinding,
      });
      await projectWorkspace.saveReportDefinition(definition);
      const saved = await persistReportArtifact({ report, definition, format: "markdown", download: false });
      if (saved) {
        setReportWarning("Historical report retained locally. Its source Run and Version are shown in Reports.");
        setActiveTool("report");
        setDrawerOpen(true);
      }
    } catch (reportError) {
      setError(reportError.message);
    }
  }, [activeProject, appMeta, historicalReportContext, persistReportArtifact, projectWorkspace]);

  const regenerateReportArtifact = useCallback(async (artifact) => {
    const definition = reportDefinitions.find((candidate) => candidate.report_id === artifact.report_id);
    if (!definition) {
      setError("The Report definition for this artifact is no longer available; the historical bytes remain inspectable.");
      return;
    }
    try {
      let report;
      if (definition.run_ids?.length > 0) {
        const runs = runHistory.runs.filter((run) => definition.run_ids.includes(run.run_id));
        const run = runs[0];
        const { revision, scenario } = historicalReportContext(run);
        if (!run || !revision || !scenario) throw new Error("The exact historical source Version for this report is unavailable; regeneration was not performed.");
        report = buildHistoricalPlanningReport({ appMeta, project: activeProject, scenario, scenarioRevision: revision, runs });
      } else {
        report = createPlanningReport();
      }
      const saved = await persistReportArtifact({ report, definition, format: artifact.format, download: false });
      if (saved) setReportWarning("A new artifact was generated. The previous artifact remains available.");
    } catch (regenerateError) {
      setError(regenerateError.message);
    }
  }, [activeProject, appMeta, createPlanningReport, historicalReportContext, persistReportArtifact, reportDefinitions, runHistory.runs]);

  const downloadStoredReportArtifact = useCallback(async (artifact) => {
    const stored = await reportArtifacts.getArtifact(artifact.artifact_id);
    if (!stored) return;
    downloadReportBytes(stored.metadata, stored.bytes);
  }, [reportArtifacts]);

  const deleteReportArtifact = useCallback(async (artifact) => {
    if (!globalThis.confirm?.("Delete this retained report artifact? Its source Run and Version will remain.")) return;
    const deleted = await reportArtifacts.deleteArtifact(artifact.artifact_id);
    if (deleted && selectedArtifactId === artifact.artifact_id) setSelectedArtifactId(null);
  }, [reportArtifacts, selectedArtifactId]);

  const drawerSubtitles = {
    setup: "Mode, technology, power, and cell selection",
		inventory: "Local cells, map placement, imports, and per-cell RF profiles",
    propagation: "Ray geometry, coverage radius, and optimization",
    experiments: "Queued parameter sweeps, fingerprints, and Pareto comparison",
	    surfaces: "Received signal surface, contours, and GIS exports",
	    interference: "Co-channel load and radio-quality assumptions",
	    validation: "Measurement, material, and facade reference diagnostics",
	    "building-entry": "Estimated service just inside representative building facades",
	    core: "Xn, N2, N3, sessions, and lab scenarios",
    results: "Focused analysis from the latest RF operation",
    history: "Durable local simulation and optimization records",
    data: "Dataset confidence and model assumptions",
    report: "Export the current planning state",
  };

  const controlPanel = (
    <ControlPanel
      activeTool={activeTool}
      settings={settings}
      onChange={updateSettings}
      onOptimizeAzimuth={optimizeAzimuth}
      isLoading={isLoading}
      isOptimizing={isOptimizing}
      networkSelectionCount={selectedCellCount}
      onOptimizeNetwork={optimizeNetwork}
      onAnalyzeInterference={analyzeInterference}
      onFocusMap={() => closeDrawer("map")}
      onPlanningModeChange={changePlanningMode}
      optimizationConfigValid={!optimizationConfigValidationMessage(optimizationConfig)}
      selectionNotice={selectionNotice}
      planningMode={planningMode}
      interferenceApplicable={interferenceApplicable}
      isAnalyzingInterference={isAnalyzingInterference}
    />
  );
  const researchProfileActive = Number(settings.frequencyGHz) >= 100 || settings.propagationModelID === "research_sub_thz";
  const researchResultsAvailable = Boolean(subTHZReference || p1411Reference || measurementValidation || materialReference || specularReflectionReference);
  const researchDisclosureStatus = researchResultsAvailable
    ? "Results available"
    : researchActivity ? "Research activity available" : "Available for this profile";
  const defaultOptimizationConfig = createDefaultOptimizationConfig();
  const advancedOptimizationCount = (optimizationConfig.objectives ?? []).filter((objective) => (
    Number(objective.weight) !== Number(defaultOptimizationConfig.objectives.find((item) => item.id === objective.id)?.weight ?? 0)
  )).length + Object.keys(optimizationConfig.constraints ?? {}).length;
  const advancedPropagationCount = advancedOptimizationCount;

  return (
    <main className="focused-app-shell">
      <a className="skip-link" href="#planning-map">Skip to planning map</a>
      <CommandBar
        appIconUrl={APP_ICON_URL}
        contextLabel={contextLabel}
        error={drawerOpen && !projectWorkspace.error ? navigationNotice : visibleError}
        lineageContext={workspaceLineage}
        networkTech={activeNetworkTech}
        onDismissError={() => {
          setError("");
          setNavigationNotice("");
          projectWorkspace.clearError();
        }}
        onOpenResults={() => openResults(resultSummary?.view)}
        onRun={planningMode === "network" ? evaluateNetwork : runSimulation}
        planSummary={planSummary}
        projectControl={(
          <ProjectMenu
            key={projectWorkspace.activeProject?.id}
            activeProject={projectWorkspace.activeProject}
            compatible={isDatasetCompatible(projectWorkspace.activeProject, appMeta)}
            exportContent={projectWorkspace.exportActiveProject}
            onAddProject={() => { setCurrentResultRun(null); setFocusedRunId(null); restoredProjectRef.current = null; setWorkspaceRestored(false); projectWorkspace.addProject(); }}
            onDeleteProject={deleteProjectWithHistory}
            onDeleteScenario={deleteScenarioWithUndo}
            onDuplicateProject={() => { setCurrentResultRun(null); setFocusedRunId(null); restoredProjectRef.current = null; setWorkspaceRestored(false); projectWorkspace.duplicateProject(); }}
            onImportProject={(text) => { setCurrentResultRun(null); setFocusedRunId(null); restoredProjectRef.current = null; setWorkspaceRestored(false); return projectWorkspace.importProject(text); }}
            onOpenScenario={openSavedScenario}
            onRenameProject={projectWorkspace.renameProject}
            onSaveScenario={saveCurrentScenario}
            onSelectProject={(id) => { setCurrentResultRun(null); setFocusedRunId(null); restoredProjectRef.current = null; setWorkspaceRestored(false); projectWorkspace.selectProject(id); }}
            projects={projectWorkspace.workspace.projects}
            staleResultRunLabel={resultContext?.freshness === "stale" ? resultContext.run_label : ""}
          />
        )}
        persistenceState={projectWorkspace.persistenceState}
        draftUnsaved={workspaceLineage.unsaved}
        primaryActionLabel={primaryActionLabel}
		primaryDisabled={!workspaceLoaded || !workspaceRestored || hydratedDatasetRevision !== datasetRevision || activeRFTask !== null || invalidProfileCount > 0 || (planningMode === "network" ? selectedCellCount < 2 : !selectedTower)}
        resultSummary={resultSummary}
        resultContext={resultContext}
        runState={runState}
        statusTone={visibleError ? "error" : activeRFTask !== null ? "busy" : planDirty ? "pending" : "ready"}
      />

      <section className={`workspace-frame ${drawerOpen ? "drawer-open" : ""}`}>
        <WorkflowRail
          activeTool={activeTool}
          drawerMode={drawerMode}
          drawerOpen={drawerOpen}
          onSelectTool={selectWorkspaceTool}
          toolState={toolState}
        />

        <section id="planning-map" className="map-stage" aria-label="Ankara propagation map" tabIndex={-1}>
          <MapToolbar
            availableLayers={{
              communicationPaths: Boolean(coreLabApplicable && coreLabEnabled && coreLab.topology),
              buildings: Boolean(buildingSummary?.total_buildings),
              gaps: Boolean(coverageGaps?.geojson?.features?.length),
              interference: hasInterferenceData,
              measurements: Boolean(measurementAnalysis?.geojson?.features?.length),
              surfaces: Boolean(renderedCoverageSurface?.grid?.values?.length),
              rays: Boolean(simulation?.geojson?.features?.length),
              selectedCells: selectedCellCount > 0,
            }}
            hasRays={Boolean(simulation?.geojson?.features?.length)}
            hasSignalSurface={Boolean(renderedCoverageSurface?.grid?.values?.length)}
            signalSurfaceState={signalSurfaceState}
            isDrawingSelection={isDrawingSelection}
            layerMenuOpen={layerMenuOpen}
            layerVisibility={layerVisibility}
            onCancelAreaSelection={cancelAreaSelection}
            onClearNetworkSelection={clearNetworkSelection}
            onDrawArea={startAreaSelection}
            onFinishAreaSelection={() => finishAreaSelection()}
            onFitSelectedCells={fitSelectedCells}
            onLayerMenuToggle={setLayerMenuOpen}
            onSignalToggle={toggleSignalLayer}
            onToggleLayer={toggleLayerVisibility}
            onRayScopeChange={changeRayScope}
            onSelectedMapCellChange={changeMapCellFocus}
            interferenceMetric={interferenceMetric}
            onInterferenceMetricChange={setInterferenceMetric}
            hasInterferenceData={hasInterferenceData}
            planningMode={planningMode}
            rayCellOptions={rayCellOptions}
            rayScope={rayScope}
            selectionCanFinish={selectionPolygon.length >= 3}
            selectedMapCellId={selectedMapCellId}
            selectedCount={selectedCellCount}
          />
          <MapCanvas
            towers={towers}
            selectedTower={selectedTower}
            selectedNetworkTowerIds={selectedNetworkSelectionIDs}
            selectedTowerOrder={selectedTowerOrder}
            selectedMapCellId={selectedMapCellId}
            onSelectTower={selectTower}
            onSelectMapCell={selectMapCell}
            simulation={simulation.geojson}
            rayLayerKey={simulationRevision}
            coverageGaps={coverageGaps.geojson}
            coverageGapLayerKey={coverageGapRevision}
            activeNetworkTech={activeNetworkTech}
            isDrawingSelection={isDrawingSelection}
            onAddSelectionPolygonPoint={addSelectionPolygonPoint}
            onCancelAreaSelection={cancelAreaSelection}
            onFinishAreaSelection={finishAreaSelection}
            planningMode={planningMode}
            selectionPolygon={selectionPolygon}
            coreLabTopology={coreLabApplicable && coreLabEnabled ? coreLab.topology : null}
            layerVisibility={layerVisibility}
            selectedMapObject={selectedMapObject}
            onSelectMapObject={selectMapObject}
            fitRequestVersion={fitRequestVersion}
            interference={interferenceAnalysis.geojson}
            interferenceDemand={interferenceAnalysis.demand_geojson}
            interferenceModel={interferenceAnalysis.model}
            interferenceMetric={interferenceMetric}
            interferenceLayerKey={interferenceRevision}
            measurements={measurementAnalysis?.geojson}
            recommendations={siteRecommendations}
			isPlacingCell={isPlacingCell}
			onPlaceCell={placeInventoryCell}
			onMoveTower={moveInventoryCell}
            isSelectingPathEndpoint={isSelectingPathEndpoint}
            onSelectPathEndpoint={selectPathEndpoint}
            pathProfile={pathProfile}
            coverageSurface={renderedCoverageSurface}
            surfaceOpacity={surfaceOptions.opacity}
            surfaceDisplayThresholdDBm={surfaceOptions.displayThresholdDBm}
            rayCellIDs={rayCellIDs}
            rayScope={rayScope}
          />
          {mapPlanPrompt && activeRFTask === null ? (
            <div className="map-plan-prompt" role="status">
              <strong>{mapPlanPrompt.title}</strong>
              <span>{mapPlanPrompt.detail}</span>
            </div>
          ) : null}
          <MapLegend
            collapsed={legendCollapsed}
            hasGaps={layerVisibility.gaps && Boolean(coverageGaps.geojson?.features?.length)}
            hasInterferenceData={layerVisibility.interference && hasInterferenceData}
            hasRays={layerVisibility.rays && visibleRayFeatures.length > 0}
            hasSignalSurface={layerVisibility.surfaces && Boolean(renderedCoverageSurface?.grid?.values?.length)}
            receiverSensitivityDBm={selectedMapReceiverSensitivityDBm}
            surface={renderedCoverageSurface}
            surfaceCellId={coverageSurfaceCellId}
            surfaceDisplayThresholdDBm={surfaceOptions.displayThresholdDBm}
            resultContext={resultContext && (layerVisibility.rays && visibleRayFeatures.length > 0
              || layerVisibility.surfaces && Boolean(renderedCoverageSurface?.grid?.values?.length)
              || layerVisibility.gaps && Boolean(coverageGaps.geojson?.features?.length)
              || layerVisibility.interference && hasInterferenceData) ? resultContext : null}
            metric={interferenceMetric}
            onToggle={() => setLegendCollapsed((current) => !current)}
            planningMode={planningMode}
          />
        </section>

        <ToolDrawer
          drawerMode={drawerMode}
          error={error}
          focusKey={`${drawerMode}-${activeTool}-${selectedMapObject?.type ?? "none"}`}
          icon={drawerMode === "tool" ? activeToolDefinition.icon : MapPin}
          onBack={returnFromInspector}
          onClose={() => closeDrawer(drawerMode === "inspector" ? "map" : "tool")}
          open={drawerOpen}
          subtitle={drawerMode === "inspector" ? formatScenario(selectedMapObject?.type ?? "selection") : drawerSubtitles[activeTool]}
          subnav={drawerMode === "tool" ? (
            <ToolSubnav activeTool={activeTool} onSelectTool={selectWorkspaceTool} toolState={toolState} />
          ) : null}
          title={drawerMode === "inspector" ? "Map Inspector" : activeToolDefinition.label}
        >
          {drawerMode === "inspector" ? <MapInspector selectedMapObject={selectedMapObject} /> : null}

          {drawerMode === "tool" && ["setup", "propagation", "interference"].includes(activeTool) ? (
            ["setup", "propagation"].includes(activeTool) ? (
              <DisclosureSection
                title="Planning"
                description="Controls used for normal RF planning. Run Sector remains available in the global command bar."
                defaultOpen
                research={activeTool === "setup" && researchProfileActive}
              >
                {activeTool === "setup" && researchProfileActive ? (
                  <p className="research-profile-boundary"><ResearchReferenceBadge />140 GHz is not canonical validation or production-calibrated. Radio-quality output is UNSUPPORTED for this research profile.</p>
                ) : null}
                {controlPanel}
              </DisclosureSection>
            ) : controlPanel
          ) : null}

          {drawerMode === "tool" && activeTool === "setup" ? (
            <>
              <DisclosureSection
                title="Advanced model details"
                description="Model applicability and link-budget assumptions for the selected profile."
              >
                <ModelApplicabilityDetails appMeta={appMeta} settings={settings} />
              </DisclosureSection>
              <DisclosureSection
                title="Scenario workspace"
                description="Manage saved scenarios, Versions, Runs, and reports."
                openRequest={openScenarioWorkspaceRequest}
                status={activeScenario?.name ?? "Working draft"}
              >
                <ScenarioPanel
                  activeProject={activeProject}
                  activeScenario={activeScenario}
                  draftSourceScenario={draftSourceScenario}
                  focusedRevisionId={focusedRevisionId}
                  staleResultRunLabel={resultContext?.freshness === "stale" ? resultContext.run_label : ""}
                  onBranchScenario={handleBranchScenario}
                  onContinueFromVersion={handleContinueFromVersion}
                  onDeleteScenario={deleteScenarioWithUndo}
                  onDuplicateScenario={handleDuplicateScenario}
                  onFocusRevision={setFocusedRevisionId}
                  onOpenReport={inspectReport}
                  onOpenReports={openReports}
                  onOpenRun={openRunHistory}
                  onOpenScenario={openSavedScenario}
                  onRenameScenario={projectWorkspace.renameScenario}
                  onSaveVersion={saveCurrentScenario}
                  persistenceState={projectWorkspace.persistenceState}
                  planDirty={planDirty}
                  reportArtifacts={reportArtifacts.artifacts}
                  reportDefinitions={reportDefinitions}
                  runs={runHistory.runs}
                  scenarios={activeProject?.scenarios ?? []}
                />
              </DisclosureSection>
            </>
          ) : null}

          {drawerMode === "tool" && activeTool === "propagation" ? (
            <>
              {researchProfileActive ? (
                <p className="research-profile-boundary"><ResearchReferenceBadge />140 GHz propagation is a research/reference profile. It is not canonical validation or production-calibrated; radio-quality output is UNSUPPORTED.</p>
              ) : null}
              <DisclosureSection
                title="Advanced analysis"
                description="Additional analysis and model configuration. P.526/path-profile diffraction is diagnostic evidence and does not add loss to canonical UMa."
                count={advancedPropagationCount}
                status={advancedPropagationCount === 0 ? "No additional configuration" : ""}
                openRequest={openPropagationAdvancedRequest}
                attention={planningMode === "network" && selectedCellCount >= 2 && Boolean(optimizationConfigValidationMessage(optimizationConfig))}
                attentionMessage="Advanced settings need attention"
                focusInvalid
              >
                {planningMode === "network" ? (
                  <OptimizationGoalsPanel config={optimizationConfig} onChange={updateOptimizationConfig} radioQualitySupported={!researchProfileActive} />
                ) : null}
                <PathProfilePanel
                  endpoint={pathProfileEndpoint}
                  isAnalyzing={isAnalyzingPathProfile}
                  isSelectingEndpoint={isSelectingPathEndpoint}
                  onAnalyze={analyzePathProfile}
                  onCancelSelection={() => setIsSelectingPathEndpoint(false)}
                  onEndpointChange={selectPathEndpoint}
                  onStartSelection={startPathEndpointSelection}
                  profile={pathProfile}
                  selectedTower={selectedTower}
                  settings={settings}
                />
              </DisclosureSection>
              <DisclosureSection
                title="Research / reference"
                description="Isolated experimental and candidate tools; applicability varies by reference and none automatically changes canonical network RF."
                research
                status={researchDisclosureStatus}
              >
                <SubTHZReferencePanel
                  endpoint={pathProfileEndpoint}
                  isAnalyzing={isAnalyzingSubTHZReference}
                  onAnalyze={analyzeSubTHZReference}
                  onActivityChange={() => setResearchActivity(true)}
                  reference={subTHZReference}
                  selectedTower={selectedTower}
                  settings={settings}
                />
                <P1411CandidatePanel
                  endpoint={pathProfileEndpoint}
                  isAnalyzing={isAnalyzingP1411Reference}
                  onAnalyze={analyzeP1411Reference}
                  onActivityChange={() => setResearchActivity(true)}
                  reference={p1411Reference}
                  selectedTower={selectedTower}
                  settings={settings}
                />
              </DisclosureSection>
            </>
          ) : null}

          {drawerMode === "tool" && activeTool === "experiments" ? (
            <ExperimentPanel selectedTower={selectedTower} settings={settings} />
          ) : null}

          {drawerMode === "tool" && activeTool === "surfaces" ? (
            <SurfacePanel
              disabled={!selectedTower}
              isLoading={isGeneratingSurface}
              onExport={exportCoverageSurface}
              onOptionsChange={setSurfaceOptions}
              onRun={analyzeCoverageSurface}
              options={surfaceOptions}
              surface={renderedCoverageSurface}
              surfaceCellId={coverageSurfaceCellId}
              surfaceError={coverageSurfaceError}
              surfaceState={signalSurfaceState}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "validation" ? (
            <>
              <section className="diagnostic-entry-actions" aria-label="Canonical diagnostic actions">
                <p className="data-note">Start with a canonical RF result, then inspect a vertical path or building-entry estimate. The evidence tools below remain isolated from network RF.</p>
                <div>
                  <button type="button" onClick={() => openResults("rf")} disabled={!simulation?.stats}>Open current RF result</button>
                  <button type="button" onClick={openPathProfileDiagnostics}>Open vertical path profile</button>
                </div>
              </section>
              <DisclosureSection
                title="Research / reference"
                description="Campaign validation and declared material/facade references. Results retain their own evidence context and do not imply canonical status."
                research
                status={researchDisclosureStatus}
              >
                <MeasurementValidationPanel
                  analysis={measurementValidation}
                  isAnalyzing={isAnalyzingMeasurementValidation}
                  onRun={analyzeMeasurementValidation}
                />
                <MaterialReferencePanel
                  analysis={materialReference}
                  isAnalyzing={isAnalyzingMaterialReference}
                  onActivityChange={() => setResearchActivity(true)}
                  onRun={analyzeMaterialReference}
                />
                <SpecularReflectionReferencePanel
                  analysis={specularReflectionReference}
                  isAnalyzing={isAnalyzingSpecularReflectionReference}
                  onActivityChange={() => setResearchActivity(true)}
                  onRun={analyzeSpecularReflectionReference}
                />
              </DisclosureSection>
            </>
          ) : null}

			{drawerMode === "tool" && activeTool === "inventory" ? (
				<InventoryPanel
					isPlacingCell={isPlacingCell}
					onCancelPlacement={() => setIsPlacingCell(false)}
					onDeleteCell={deleteInventoryTower}
					onDuplicateCell={duplicateInventoryTower}
					onImportCells={importInventoryCells}
					onMoveCell={moveInventoryCell}
					onResetProfile={resetInventoryProfile}
					onSelectCell={selectInventoryCell}
					onStartPlacement={() => {
						setIsPlacingCell(true);
						setSelectionNotice("Click the map to place a new cell.");
					}}
					onUpdateProfile={updateInventoryProfile}
					selectedTower={selectedTower}
					settings={settings}
					towers={towers}
				/>
			) : null}

          {drawerMode === "tool" && activeTool === "core" ? (
            <CoreLabTool
              applicable={coreLabApplicable}
              coreLab={coreLab}
              enabled={coreLabEnabled}
              onRunScenario={runCoreLabScenario}
              onUse5G={() => {
                const technology = NETWORK_TECH_OPTIONS.find((option) => option.id === "5g");
                updateSettings((current) => ({
                  ...current,
                  frequencyGHz: technology.frequencyGHz,
                  interferenceBandwidthMHz: technology.defaultBandwidthMHz,
                }));
              }}
              onToggle={toggleCoreLab}
              scenarios={CORE_LAB_SCENARIOS}
              startCommand={CORE_LAB_START_COMMAND}
              towerIDs={coreLabTowerIDs}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "building-entry" ? (
            <DisclosureSection title="Advanced analysis" description="Estimate entry at representative facades; indoor or whole-building coverage is outside scope." defaultOpen>
              <BuildingEntryPanel
                analysis={buildingEntryAnalysis}
                disabled={activeRFTask !== null || (planningMode === "network" ? selectedNetworkTowers.length === 0 : !selectedTower)}
                disabledReason={planningMode === "network" ? "Select at least one network cell first." : "Select a transmitter cell first."}
                isCurrent={buildingEntryIsCurrent}
                isLoading={activeRFTask === "building_entry"}
                onRun={analyzeBuildingEntry}
              />
            </DisclosureSection>
          ) : null}

          {drawerMode === "tool" && activeTool === "results" ? (
            <ResultsPanel
              activeView={activeResultsView}
              resultContext={resultContext}
              currentWorkspace={workspaceLineage}
              comparison={activeComparison}
              diagnostics={optimizationDiagnostics}
              isNetworkResult={lastAnalysisKind === "network"}
              isParetoOptimizationResult={isParetoOptimizationResult}
	              networkOptimization={displayedNetworkOptimization}
	              networkResultKind={networkResultKind}
	              cellExplanation={cellExplanation}
	              onExplainCell={explainNetworkCell}
	              paretoComparison={selectedParetoComparison}
              paretoSolutions={rankedParetoSolutions}
              recommendedSolutionId={recommendedSolutionId}
              selectedSolutionId={selectedSolutionId}
              interferenceAnalysis={interferenceAnalysis}
              gapStats={gapStats}
              hasRFResults={Boolean(simulation?.stats)}
              constraintsConfigured={Object.keys(optimizationConfig.constraints ?? {}).length > 0}
              onViewChange={setActiveResultsView}
              onApplySolution={applyCurrentOptimizationSolution}
              onApplyRecommendation={applyRecommendation}
              unsupportedInterferenceReason={Number(settings.frequencyGHz) >= 100 ? "Radio-quality output is not defined for the 6G research profile." : ""}
              onOpenScenario={openSavedScenario}
              onRecommendSites={recommendSites}
              onRerunCurrent={rerunCurrentResult}
              onOpenRun={openRunHistory}
              onSelectParetoSolution={selectParetoSolution}
              recommendations={siteRecommendations}
              recommending={isRecommendingSites}
              savedScenarios={projectWorkspace.activeProject?.scenarios ?? []}
              recommendationDisabled={selectedNetworkTowers.length < 2 || selectedNetworkTowers.length >= MAX_NETWORK_CELLS || selectionPolygon.length < 3 || !interferenceApplicable}
              stats={stats}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "history" ? (
            <RunHistoryPanel
              key={focusedRunId ?? "history"}
              currentScenarioId={activeScenario?.domain?.scenario_id ?? activeScenario?.id ?? null}
              currentWorkspace={workspaceLineage}
              datasetUnavailable={historyDatasetUnavailable}
              isRunDatasetUnavailable={(run) => !runDatasetMatches(run, appMeta)}
              error={runHistory.error}
              focusedRunId={focusedRunId}
              issues={runHistory.issues}
              loading={runHistory.loading}
              onApplySolution={applyHistoricalSolution}
              onClearUnreferenced={clearUnreferencedHistory}
              onDeleteRun={deleteHistoryRun}
              onGenerateReport={generateHistoricalReport}
              onOpenSource={openRunSource}
              onRefresh={runHistory.refresh}
              onRunAgain={runAgainFromHistory}
              runs={runHistory.runs}
              scenarios={activeProject?.scenarios ?? []}
              warning={runHistoryWarning}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "data" ? (
            <DataPanel
              summary={buildingSummary}
              diagnostics={optimizationDiagnostics}
              interferenceModel={interferenceAnalysis.model}
              networkTech={activeNetworkTech}
              settings={settings}
              appMeta={appMeta}
              calibrationProfile={calibrationProfile}
              measurementAnalysis={measurementAnalysis}
              measurementCount={measurementSamples.length}
              onApplyCalibration={applyCalibration}
              onEvaluateMeasurements={evaluateMeasurements}
              onMeasurementFile={loadMeasurementFile}
              evaluatingMeasurements={isEvaluatingMeasurements}
				installedDatasets={installedDatasets}
				datasetMessage={datasetMessage}
				isSwitchingDataset={isSwitchingDataset}
				onSwitchDataset={switchDataset}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "report" ? (
            <ReportExportPanel
              artifacts={reportArtifacts.artifacts}
              definitions={reportDefinitions}
              error={reportArtifacts.error}
              issues={reportArtifacts.issues}
              loading={reportArtifacts.loading}
              onDeleteArtifact={deleteReportArtifact}
              onDownloadArtifact={downloadStoredReportArtifact}
              onInspectArtifact={(artifact) => setSelectedArtifactId(artifact.artifact_id)}
              onOpenSource={openReportSource}
              onRegenerateArtifact={regenerateReportArtifact}
              onExportMarkdown={exportMarkdownReport}
              onExportPdf={exportPdfReport}
              reportWarning={reportWarning}
              currentWorkspace={workspaceLineage}
              currentResultContext={resultContext}
              runs={runHistory.runs}
              scenarios={activeProject?.scenarios ?? []}
              selectedArtifactId={selectedArtifactId}
            />
          ) : null}
        </ToolDrawer>
      </section>
      <UndoToast
        message={undoNotice?.message}
        onDismiss={() => setUndoNotice(null)}
        onUndo={() => {
          undoNotice?.onUndo?.();
          setUndoNotice(null);
        }}
      />
    </main>
  );
}

function runDatasetMatches(run, appMeta) {
  const current = datasetReference(appMeta);
  const recorded = run?.dataset_references?.[0];
  if (!current || !recorded) return true;
  return recorded.dataset_id === current.id
    && recorded.version === current.version
    && Object.entries(current.hashes ?? {}).every(([key, value]) => recorded.content_hashes?.[key] === value);
}

function scenarioSourceForRun(run, scenarios = []) {
  return scenarios.find((scenario) => (
    String(scenario.domain?.scenario_id ?? scenario.id) === String(run?.scenario_id)
  )) ?? null;
}

function shortRunLabel(value) {
  const text = String(value ?? "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text || "Run unavailable";
}

function MapInspector({ selectedMapObject }) {
  if (!selectedMapObject) {
    return null;
  }
  const { type, payload } = selectedMapObject;

  return (
    <section className="map-inspector-card" aria-label="Map selection inspector">
      {type === "tower" ? <TowerInspector payload={payload} /> : null}
      {type === "building" ? <BuildingInspector payload={payload} /> : null}
      {type === "coverage_gap" ? <GapInspector payload={payload} /> : null}
      {type === "communication_path" ? <PathInspector payload={payload} /> : null}
      {type === "interference_sample" ? <InterferenceInspector payload={payload} /> : null}
      {type === "measurement_sample" ? <MeasurementInspector payload={payload} /> : null}
      {type === "site_recommendation" ? <RecommendationInspector payload={payload} /> : null}
    </section>
  );
}

function BuildingInspector({ payload }) {
  const feature = payload?.feature ?? {};
  const properties = feature.properties ?? {};
  const buildingID = String(feature.id ?? "").trim();
  const [state, setState] = useState({ buildingID: "", loading: false, data: null, error: null });

  useEffect(() => {
    if (!buildingID) {
      return undefined;
    }
    const controller = new AbortController();
    getJSON(`/api/spatial-evidence/buildings/${encodeURIComponent(buildingID)}`, "Building spatial evidence could not be loaded", controller.signal)
      .then((data) => setState({ buildingID, loading: false, data, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) {
          setState({ buildingID, loading: false, data: null, error: error?.message ?? "Building spatial evidence is unavailable." });
        }
      });
    return () => controller.abort();
  }, [buildingID]);

  const evidenceState = state.buildingID === buildingID ? state : { loading: Boolean(buildingID), data: null, error: null };
  const ledger = evidenceState.data?.height_ledger ?? {};
  const roof = ledger.selected_roof_elevation ?? {};
  const base = ledger.base_elevation ?? {};
  const selectedProvenance = ledger.selected_provenance ?? {};
  return (
    <div className="inspector-grid">
      <MiniDatum label="Building" value={feature.id ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Planning AGL" value={formatMetric(properties.height_m, "m")} />
      <MiniDatum label="Selected AGL" value={formatMetric(ledger.selected_height_agl_m, "m")} />
      <MiniDatum label="Evidence class" value={ledger.selected_confidence ?? properties.height_source ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Source" value={selectedProvenance.source ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Source version" value={selectedProvenance.source_version ?? evidenceState.data?.dataset_version ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Ground base" value={formatMetric(base.ground_elevation_m, "m")} />
      <MiniDatum label="Ground spread" value={formatMetric(base.ground_spread_m, "m")} />
      <MiniDatum label="Roof elevation" value={formatMetric(roof.roof_elevation_amsl_m, "m")} />
      <MiniDatum label="Terrain" value={evidenceState.data?.terrain?.kind ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Datum compatibility" value={roof.compatibility ?? evidenceState.data?.terrain?.compatibility ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Conflict" value={ledger.conflict?.status ?? UNAVAILABLE_VALUE} />
      {!buildingID ? <p className="data-note">Selected building has no stable ID.</p> : null}
      {evidenceState.loading ? <p className="data-note">Loading spatial-evidence provenance…</p> : null}
      {evidenceState.error ? <p className="data-note">{evidenceState.error}</p> : null}
      {roof.reason || base.reason ? <p className="data-note">{roof.reason ?? base.reason}</p> : null}
      <p className="result-explanation">Spatial evidence is diagnostic only. AGL, terrain, and absolute roof values are not used to change canonical RF behavior from this inspector.</p>
    </div>
  );
}

function TowerInspector({ payload }) {
  const tower = payload?.tower ?? {};
  const coordinates = tower.coordinates ?? [];
  return (
    <div className="inspector-grid">
      <MiniDatum label="Cell" value={tower.cellId ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Network" value={payload?.activeNetworkTech ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Cluster" value={payload?.order ? `#${payload.order}` : payload?.isNetworkSelected ? "Selected" : "Not selected"} />
      <MiniDatum label="Longitude" value={formatNumber(coordinates[0], 5)} />
      <MiniDatum label="Latitude" value={formatNumber(coordinates[1], 5)} />
    </div>
  );
}

function GapInspector({ payload }) {
  const properties = payload?.properties ?? {};
  const coordinates = payload?.coordinates ?? [];
  return (
    <div className="inspector-grid">
      <MiniDatum label="Severity" value={properties.severity ?? "weak"} />
      <MiniDatum label="Rx" value={`${formatNumber(properties.rx_dbm, 1)} dBm`} />
      <MiniDatum label="Building service threshold" value={formatMetric(properties.building_service_threshold_dbm, "dBm")} />
      <MiniDatum label="Demand" value={formatNumber(properties.total_demand, 1)} />
      <MiniDatum label="Reason" value={properties.reason ?? "demand"} />
      <MiniDatum label="Coordinate" value={`${formatNumber(coordinates[0], 5)}, ${formatNumber(coordinates[1], 5)}`} />
    </div>
  );
}

function PathInspector({ payload }) {
  const route = payload?.route ?? {};
  return (
    <div className="inspector-grid">
      <MiniDatum label="Route" value={formatScenario(route.route_type ?? "direct_xn")} />
      <MiniDatum label="Status" value={route.status ?? "active"} />
      <MiniDatum label="From" value={route.from ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="To" value={route.to ?? UNAVAILABLE_VALUE} />
      <p className="data-note">{route.reason ?? "Selected 5G neighbor path."}</p>
    </div>
  );
}

function InterferenceInspector({ payload }) {
  const properties = payload?.properties ?? {};
  const model = payload?.model ?? {};
  return (
    <div className="inspector-grid">
      <MiniDatum label="Serving cell" value={properties.serving_cell_id ?? "No signal"} />
      <MiniDatum label="Channel" value={properties.channel_id ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Serving carrier power" value={formatMetric(properties.serving_received_carrier_power_dbm, "dBm")} />
      <MiniDatum label="RSRP" value={formatMetric(properties.rsrp_dbm, "dBm")} />
      <MiniDatum label="SINR" value={formatMetric(properties.sinr_db, "dB")} />
      <MiniDatum label="RSRQ" value={formatMetric(properties.rsrq_db, "dB")} />
      <MiniDatum label="RSSI" value={formatMetric(properties.rssi_dbm, "dBm")} />
      <MiniDatum label="Thermal noise" value={formatMetric(properties.thermal_noise_dbm, "dBm")} />
      <MiniDatum label="Desired power" value={formatMetric(properties.desired_signal_power_mw, "mW")} />
      <MiniDatum label="Interference power" value={formatMetric(properties.interference_power_mw, "mW")} />
      <MiniDatum label="Noise power" value={formatMetric(properties.thermal_noise_power_mw, "mW")} />
      <MiniDatum label="Receiver threshold" value={properties.receiver_threshold ? `${properties.receiver_threshold.mode ?? "manual"} · ${formatMetric(properties.receiver_threshold.sensitivity_dbm, "dBm")}` : UNAVAILABLE_VALUE} />
      <MiniDatum label="Receiver margin" value={formatMetric(properties.receiver_link_margin_db, "dB")} />
      <MiniDatum label="Strongest interferer" value={properties.strongest_interferer_id ?? "Noise-limited"} />
      <MiniDatum label="Interference" value={formatMetric(properties.interference_dbm, "dBm")} />
      <MiniDatum label="Interferers" value={(properties.interferer_count ?? 0).toLocaleString()} />
      <MiniDatum label="Selection" value={properties.serving_selection_mode ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Serviceability" value={properties.serviceability_status ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Walls" value={(properties.wall_count ?? 0).toLocaleString()} />
      <MiniDatum label="Quality" value={formatScenario(properties.quality_class ?? "no_signal")} />
      {properties.building_id ? (
        <MiniDatum label="Affected demand" value={formatNumber(properties.total_demand, 1)} />
      ) : null}
      <p className="data-note">
        {model.measurement_family === "nr_ss" ? "Modeled SS-RSRP / SS-RSRQ" : "Modeled LTE CRS RSRP / RSRQ"}
        {` · ${formatNumber(model.bandwidth_mhz, 0)} MHz · ${formatNumber(model.load_factor * 100, 0)}% load`}
      </p>
      <p className="result-explanation">{explainInterferenceSample(properties)}</p>
    </div>
  );
}

function MeasurementInspector({ payload }) {
  const properties = payload?.properties ?? {};
  return (
    <div className="inspector-grid">
      <MiniDatum label="Sample" value={properties.id ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Serving cell" value={properties.serving_cell_id ?? "No signal"} />
      <MiniDatum label="Measured RSRP" value={formatMetric(properties.measured_rsrp_dbm, "dBm")} />
      <MiniDatum label="Predicted RSRP" value={formatMetric(properties.predicted_rsrp_dbm, "dBm")} />
      <MiniDatum label="Residual" value={formatMetric(properties.residual_db, "dB")} />
      <MiniDatum label="Corrected residual" value={formatMetric(properties.corrected_residual_db, "dB")} />
      <p className="result-explanation">Residual is measured minus modeled RSRP. Positive values mean the model under-predicted this sample.</p>
    </div>
  );
}

function RecommendationInspector({ payload }) {
  const properties = payload?.properties ?? {};
  return (
    <div className="inspector-grid">
      <MiniDatum label="Candidate cell" value={properties.cell_id ?? properties.id ?? UNAVAILABLE_VALUE} />
      <MiniDatum label="Raw score delta" value={formatCompactNumber(properties.marginal_network_score)} />
      <MiniDatum label="Azimuth" value={`${formatNumber(properties.optimal_azimuth, 0)}°`} />
      <MiniDatum label="Overlap" value={(properties.stats?.overlap_buildings ?? 0).toLocaleString()} />
      <p className="result-explanation">{properties.reason ?? "Candidate scored from known planning records."}</p>
    </div>
  );
}

function explainInterferenceSample(properties) {
  if (properties.rsrp_dbm === null || properties.rsrp_dbm === undefined) {
    return "No modeled carrier passed the active radius, beam-sector, wall-loss, and receiver-sensitivity checks at this point.";
  }
  const sinr = Number(properties.sinr_db);
  if (Number.isFinite(sinr) && Math.abs(sinr) <= 1 && properties.strongest_interferer_id) {
    return "SINR is near 0 dB because the serving carrier and strongest co-channel interferer have approximately equal received power.";
  }
  if (Number.isFinite(sinr) && sinr < 0) {
    return "Co-channel interference is stronger than the serving signal at this sample. Review cell azimuths, load, or frequency reuse.";
  }
  if (Number(properties.wall_count) > 0) {
    return `The serving path crosses ${properties.wall_count} modeled wall${properties.wall_count === 1 ? "" : "s"}; frequency-dependent penetration loss is included.`;
  }
  return properties.strongest_interferer_id
    ? "The sample is interference-limited by another cell on the serving channel."
    : "The sample is primarily noise-limited under the current deterministic assumptions.";
}

function buildCoreLabQuery(towerIDs, selectedNetworkTowers, selectedTower) {
  const params = new URLSearchParams();
  params.set("network_tech", "5g");
  if (towerIDs.length > 0) {
    params.set("cluster_tower_ids", towerIDs.join(","));
  }
  const towerIDSet = new Set(towerIDs.map(String));
  const seenTowerIDs = new Set();
  const locationTowers = [...selectedNetworkTowers, selectedTower]
    .filter(Boolean)
    .filter((tower) => {
      const towerID = String(tower.cellId ?? tower.id);
      if (!towerIDSet.has(towerID) || seenTowerIDs.has(towerID)) {
        return false;
      }
      seenTowerIDs.add(towerID);
      return true;
    });
  const locations = locationTowers
    .map((tower) => {
      const towerID = String(tower.cellId ?? tower.id);
      const [lon, lat] = tower.coordinates ?? [];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
      }
      return `${towerID}:${lon}:${lat}`;
    })
    .filter(Boolean);
  if (locations.length > 0) {
    params.set("cluster_tower_locations", locations.join(";"));
  }
  return `?${params.toString()}`;
}

function ResultsPanel({
  activeView,
  cellExplanation,
  comparison,
  constraintsConfigured,
  diagnostics,
  gapStats,
  hasRFResults,
  interferenceAnalysis,
  isNetworkResult,
  isParetoOptimizationResult,
  networkOptimization,
  networkResultKind,
  onExplainCell,
  onApplySolution,
  onApplyRecommendation,
  onOpenScenario,
  onRecommendSites,
  onSelectParetoSolution,
  onViewChange,
  paretoComparison,
  paretoSolutions,
  recommendedSolutionId,
  recommendationDisabled,
  recommendations,
  recommending,
  resultContext,
  currentWorkspace,
  onRerunCurrent,
  onOpenRun,
  unsupportedInterferenceReason = "",
  savedScenarios,
  selectedSolutionId,
  stats,
}) {
  const views = [
    { id: "rf", label: "RF" },
    { id: "optimization", label: "Optimization" },
    { id: "interference", label: "Interference" },
    { id: "compare", label: "Compare" },
    { id: "recommendations", label: isParetoOptimizationResult ? "Solutions" : "Candidates" },
  ];
  const hasOptimizationResults = Boolean(
    networkOptimization || diagnostics || getComparisonMetrics(comparison).length > 0,
  );

  return (
    <section className="results-panel" aria-label="Simulation results">
      {resultContext ? (
        <ResultContextBadge
          context={resultContext}
          currentWorkspace={currentWorkspace}
          primaryLabel={resultContext.freshness === "stale" ? "Run again" : resultContext.freshness === "unavailable" ? "Run current plan" : ""}
          onPrimaryAction={onRerunCurrent}
          secondaryLabel={resultContext.run_id ? `View ${resultContext.run_label}` : ""}
          onSecondaryAction={resultContext.run ? () => onOpenRun?.(resultContext.run) : undefined}
        />
      ) : null}
      <div className="result-view-tabs" role="tablist" aria-label="Result views">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={activeView === view.id}
            className={activeView === view.id ? "active" : ""}
            onClick={() => onViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === "rf" ? (
        hasRFResults ? (
          <>
            <div className="metric-list">
              <MetricRow label="Blocked" value={`${stats.blockedRatio}%`} />
              <MetricRow
                label="Average Rx"
                value={stats.avgPower === null ? UNAVAILABLE_VALUE : `${stats.avgPower.toFixed(1)} dBm`}
              />
              <MetricRow
                label="Max range"
                value={stats.maxRange === null ? UNAVAILABLE_VALUE : `${stats.maxRange.toFixed(1)} m`}
              />
              <MetricRow
                label="Min range"
                value={stats.minRange === null ? UNAVAILABLE_VALUE : `${stats.minRange.toFixed(1)} m`}
              />
            </div>
            <CoverageGapPanel stats={gapStats} />
          </>
        ) : (
          <AnalysisEmptyState
            icon={RadioTower}
            title="No current RF result"
            description="Run the selected sector or evaluate a network cluster to populate map rays and RF metrics."
          />
        )
      ) : null}

      {activeView === "optimization" ? (
        hasOptimizationResults ? (
          <>
            <NetworkOptimizationPanel
              comparison={comparison}
              kind={networkResultKind}
              onViewComparison={() => onViewChange("compare")}
              onViewSolutions={() => onViewChange("recommendations")}
              optimization={networkOptimization}
            />
            {!networkOptimization ? <OptimizerBreakdown diagnostics={diagnostics} /> : null}
            {!networkOptimization ? <ComparisonPanel comparison={comparison} /> : null}
          </>
        ) : (
          <AnalysisEmptyState
            icon={BarChart3}
            title="No optimization result"
            description="Open Propagation and optimize the current sector or network to capture a before-and-after comparison."
          />
        )
      ) : null}

      {activeView === "interference" ? (
        unsupportedInterferenceReason ? (
          <div className="result-unsupported-note" role="status">
            <strong>UNSUPPORTED</strong>
            <span>{unsupportedInterferenceReason}</span>
          </div>
        ) : interferenceAnalysis?.stats ? (
          <InterferenceResultsPanel analysis={interferenceAnalysis} />
        ) : (
          <AnalysisEmptyState
            icon={Activity}
            title="No interference result"
            description="Select two or more 4G or 5G cells, then analyze interference to compare SINR, RSRP, and RSRQ."
          />
        )
      ) : null}

      {activeView === "compare" ? (
        isNetworkResult
          ? <NetworkOptimizationComparisonPanel comparison={comparison} />
          : <ScenarioComparisonPanel onOpenScenario={onOpenScenario} scenarios={savedScenarios} />
      ) : null}

      {activeView === "recommendations" ? (
        isParetoOptimizationResult ? (
          <ParetoSolutionsPanel
            baseline={networkOptimization?.baseline}
            cellExplanation={cellExplanation}
            constraintsConfigured={constraintsConfigured}
            onExplainCell={onExplainCell}
            onApplySolution={onApplySolution}
            onSelectSolution={onSelectParetoSolution}
            resultContext={resultContext}
            paretoComparison={paretoComparison}
            recommendedSolutionId={recommendedSolutionId}
            selectedSolutionId={selectedSolutionId}
            solutions={paretoSolutions}
          />
        ) : (
          <RecommendationPanel
            disabled={recommendationDisabled}
            loading={recommending}
            onApply={onApplyRecommendation}
            onRun={onRecommendSites}
            response={recommendations}
          />
        )
      ) : null}
    </section>
  );
}

function ScenarioComparisonPanel({ onOpenScenario, scenarios }) {
  const [firstID, setFirstID] = useState("");
  const [secondID, setSecondID] = useState("");
  if (scenarios.length < 2) {
    return <AnalysisEmptyState icon={BarChart3} title="Two scenarios needed" description="Save two planning states from the project menu to compare reproducible KPI deltas." />;
  }
  const first = scenarios.find((scenario) => scenario.id === firstID) ?? scenarios[scenarios.length - 2];
  const second = scenarios.find((scenario) => scenario.id === secondID) ?? scenarios[scenarios.length - 1];
  const metrics = [
    ["Average Rx", "avgRxDBm", "dBm"],
    ["Gap area", "gapPct", "%"],
    ["Optimization score", "networkScore", "/ 100"],
    ["Overlap", "overlapBuildings", "buildings"],
    ["Average SINR", "avgSINRDB", "dB"],
    ["Serviceable", "serviceablePct", "%"],
    ["Affected demand", "affectedDemand", ""],
  ];
  return (
    <section className="scenario-comparison" aria-label="Saved scenario comparison">
      <div className="scenario-selectors">
        <label><span>Scenario A</span><select value={first.id} onChange={(event) => setFirstID(event.target.value)}>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
        <label><span>Scenario B</span><select value={second.id} onChange={(event) => setSecondID(event.target.value)}>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
      </div>
      <div className="scenario-delta-table">
        {metrics.map(([label, key, unit]) => {
          const before = Number(first.summary?.[key]);
          const after = Number(second.summary?.[key]);
          if (!Number.isFinite(before) && !Number.isFinite(after)) return null;
          const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
          return <div key={key}><span>{label}</span><strong>{formatScenarioMetric(before, unit)}</strong><strong>{formatScenarioMetric(after, unit)}</strong><em>{delta === null ? UNAVAILABLE_VALUE : `${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)} ${unit}`}</em></div>;
        })}
      </div>
      <div className="scenario-map-switch"><button type="button" onClick={() => onOpenScenario(first)}>Show A</button><button type="button" onClick={() => onOpenScenario(second)}>Show B</button></div>
      <p className="data-note">Map switching restores cached layers when available. Compact older scenarios retain exact requests and require a rerun.</p>
    </section>
  );
}

function RecommendationPanel({ disabled, loading, onApply, onRun, response }) {
  const recommendations = response?.recommendations ?? [];
  return (
    <section className="recommendation-panel" aria-label="Candidate cell recommendations">
      <button type="button" className="panel-primary-action" onClick={onRun} disabled={disabled || loading}>
        <MapPin size={15} /> {loading ? "Scoring candidates..." : "Recommend candidate cells"}
      </button>
      {disabled ? <p className="data-note">Select 2–5 cells and draw a search area in a 4G or 5G plan.</p> : null}
      {recommendations.map((recommendation, index) => (
        <article key={recommendation.id} className="recommendation-row">
          <div><span>#{index + 1} · Cell {recommendation.cell_id}</span><strong>Raw Δ {formatCompactNumber(recommendation.marginal_network_score)}</strong></div>
          <p>{recommendation.reason}</p>
          <dl><div><dt>Azimuth</dt><dd>{formatNumber(recommendation.optimal_azimuth, 0)}°</dd></div><div><dt>Overlap</dt><dd>{recommendation.stats?.overlap_buildings ?? 0}</dd></div></dl>
          <button type="button" onClick={() => onApply(recommendation)}>Apply as scenario</button>
        </article>
      ))}
      {response?.notes?.map((note) => <p className="data-note" key={note}>{note}</p>)}
    </section>
  );
}

function formatScenarioMetric(value, unit) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)}${unit ? ` ${unit}` : ""}` : UNAVAILABLE_VALUE;
}

function AnalysisEmptyState({ description, icon: Icon, title }) {
  return (
    <div className="analysis-empty-state" role="status">
      <Icon size={20} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function OptimizationImpact({ comparison, onViewComparison }) {
  const items = [
    { key: "demand", label: "Demand served" },
    { key: "residential", label: "Residential" },
    { key: "propagation_reach", label: "Propagation reach" },
    { key: "overlap", label: "Overlap" },
  ];
  return (
    <section className="optimization-impact" aria-label="Optimization impact">
      <div className="optimization-impact-heading">
        <strong>Optimization impact</strong>
        <button type="button" onClick={onViewComparison}>View comparison</button>
      </div>
      <div className="optimization-impact-grid">
        {items.map(({ key, label }) => {
          const metric = comparison.metrics?.[key];
          return (
            <div className={`optimization-impact-item ${metric?.outcome ?? "informational"}`} key={key}>
              <span>{label}</span>
              <strong>{formatImpactDelta(metric, key)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NetworkOptimizationComparisonPanel({ comparison }) {
  if (!comparison) {
    return (
      <section className="comparison-card" aria-label="Baseline versus optimized comparison">
        <div className="panel-title">
          <BarChart3 size={16} />
          <span>Baseline vs Recommended</span>
        </div>
        <p className="empty-note">
          Detailed comparison is unavailable for this saved result because it predates retained baseline metadata,
          or no feasible recommendation was returned.
        </p>
      </section>
    );
  }

  const rows = [
    { key: "demand", label: "Demand served" },
    { key: "residential", label: "Residential" },
    { key: "propagation_reach", label: "Propagation reach" },
    { key: "overlap", label: "Overlap ratio" },
    { key: "overlap_buildings", label: "Overlap buildings" },
    { key: "covered_units", label: "Covered units" },
    { key: "score", label: "Optimization score" },
    { key: "constraints", label: "Constraints" },
  ];
  return (
    <section className="comparison-card network-comparison-card" aria-label="Baseline versus optimized comparison">
      <div className="panel-title">
        <BarChart3 size={16} />
        <span>Baseline vs Recommended</span>
      </div>
      <p className="data-note">
        Baseline is the selected network entering this optimization run. Recommended is the current feasible Pareto
        recommendation. Domain denominators and propagation maximum are shared.
      </p>
      <div className="network-comparison-list">
        {rows.map(({ key, label }) => {
          const metric = comparison.metrics?.[key];
          return (
            <article className={`network-comparison-row ${metric?.outcome ?? "informational"}`} key={key}>
              <div className="network-comparison-label">
                <strong>{label}</strong>
                <span>{formatOutcomeLabel(metric?.outcome)}</span>
              </div>
              <div className="network-comparison-values">
                <div>
                  <span>Baseline</span>
                  <strong>{formatNetworkComparisonValue(metric, key, "baseline")}</strong>
                </div>
                <div>
                  <span>Optimized</span>
                  <strong>{formatNetworkComparisonValue(metric, key, "optimized")}</strong>
                </div>
                <div>
                  <span>Change</span>
                  <strong>{formatNetworkComparisonChange(metric, key)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="data-note">Both scores use the active effective weights; unavailable objectives remain excluded.</p>
    </section>
  );
}

function formatImpactDelta(metric, key) {
  if (!metric?.available || !Number.isFinite(Number(metric.absolute_delta))) return UNAVAILABLE_VALUE;
  if (key === "propagation_reach" || key === "overlap") {
    return `${formatSignedNumber(Number(metric.absolute_delta) * 100, 1)} pp`;
  }
  return formatSignedNumber(Number(metric.absolute_delta), key === "demand" ? 0 : 0);
}

function formatNetworkComparisonValue(metric, key, side) {
  if (!metric?.available) return UNAVAILABLE_VALUE;
  if (key === "constraints") {
    if (metric.configured === false) return "Not configured";
    return metric[side] === true ? "Satisfied" : metric[side] === false ? "Not satisfied" : UNAVAILABLE_VALUE;
  }
  const value = Number(metric[side]);
  if (!Number.isFinite(value)) return UNAVAILABLE_VALUE;
  if (key === "demand") return `${formatNumber(value, 1)} / ${formatNumber(metric.denominator, 1)}`;
  if (key === "residential") return `${formatCount(value)} / ${formatCount(metric.denominator)}`;
  if (key === "propagation_reach" || key === "overlap") return `${formatNumber(value * 100, 1)}%`;
  if (key === "score") return formatNumber(value, 1);
  return formatCount(value);
}

function formatNetworkComparisonChange(metric, key) {
  if (!metric?.available) return UNAVAILABLE_VALUE;
  if (key === "constraints") return metric.configured === false ? "Not configured" : formatOutcomeLabel(metric.outcome);
  if (!Number.isFinite(Number(metric.absolute_delta))) return UNAVAILABLE_VALUE;
  if (key === "propagation_reach" || key === "overlap") {
    return `${formatSignedNumber(Number(metric.absolute_delta) * 100, 1)} pp`;
  }
  if (key === "score") return `${formatSignedNumber(Number(metric.absolute_delta), 1)} points`;
  const digits = key === "demand" ? 1 : 0;
  const absolute = formatSignedNumber(Number(metric.absolute_delta), digits);
  if (key === "demand" && Number.isFinite(Number(metric.relative_delta))) {
    return `${absolute} (${formatSignedNumber(Number(metric.relative_delta) * 100, 1)}%)`;
  }
  return absolute;
}

function formatOutcomeLabel(outcome) {
  return ({
    improved: "Improved",
    worsened: "Worsened",
    unchanged: "Unchanged",
    informational: "Informational",
  })[outcome] ?? "Unavailable";
}

function formatSignedNumber(value, digits = 0) {
  if (!Number.isFinite(Number(value))) return UNAVAILABLE_VALUE;
  const numeric = Number(value);
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${formatNumber(numeric, digits)}`;
}

function ParetoSolutionsPanel({ baseline, cellExplanation, constraintsConfigured, onApplySolution, onExplainCell, onSelectSolution, paretoComparison, recommendedSolutionId, resultContext, selectedSolutionId, solutions }) {
  const [applyTarget, setApplyTarget] = useState(null);
  if (!solutions?.length) {
    return (
      <AnalysisEmptyState
        icon={BarChart3}
        title="No Pareto solutions"
        description="Run a network optimization with at least one available priority to retain feasible non-dominated alternatives."
      />
    );
  }

  const selectedIndex = Math.max(
    0,
    solutions.findIndex((solution) => String(solution.id) === String(selectedSolutionId)),
  );
  const selectedSolution = solutions[selectedIndex];
  const showRadioQuality = solutions.every((solution) => isRadioQualityEvaluated(solution.stats));
  return (
    <section className="pareto-explorer" aria-label="Pareto alternative solutions">
      <div className="pareto-explorer-heading">
        <div>
          <div className="panel-title">
            <BarChart3 size={16} />
            <span>Alternative solutions</span>
          </div>
          <p className="pareto-explorer-count">
            {solutions.length} feasible · non-dominated solution{solutions.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="pareto-explorer-priority-note">Ranked by current priorities</span>
      </div>
      <p className="data-note">
        Non-dominated solutions represent different valid trade-offs. The highest score for the current priorities is recommended.
      </p>
      <div className="pareto-role-legend" aria-label="Optimization solution roles">
        <p><strong>Recommended</strong><span>Highest-ranked feasible solution under current priorities.</span></p>
        <p><strong>Selected</strong><span>Solution currently being inspected.</span></p>
        <p><strong>Pareto</strong><span>Non-dominated alternatives.</span></p>
      </div>
      <ParetoSolutionDetail
        baseline={baseline}
        cellExplanation={cellExplanation}
        comparison={paretoComparison}
        constraintsConfigured={constraintsConfigured}
        isRecommended={String(selectedSolution.id) === String(recommendedSolutionId)}
        onApplySolution={(solution) => setApplyTarget(solution)}
        onExplainCell={onExplainCell}
        rank={selectedIndex + 1}
        solution={selectedSolution}
      />
      <div className="pareto-solution-list" aria-label="Retained Pareto solutions">
        {solutions.map((solution, index) => {
          const solutionID = String(solution.id);
          const isSelected = solutionID === String(selectedSolutionId);
          const isRecommended = solutionID === String(recommendedSolutionId);
          return (
            <article
              className={`pareto-solution-card${isSelected ? " selected" : ""}${isRecommended ? " recommended" : ""}`}
              key={solutionID || `solution-${index}`}
            >
              <button
                type="button"
                className="pareto-solution-button"
                aria-label={`Inspect Pareto solution ${index + 1}${isRecommended ? ", recommended" : ""}`}
                aria-pressed={isSelected}
                onClick={() => onSelectSolution(solutionID)}
              >
                <span className="pareto-solution-header">
                  <span className="pareto-solution-rank-group">
                    <strong>#{index + 1}</strong>
                    {isRecommended ? <span className="pareto-badge recommended">Recommended</span> : null}
                    {isSelected ? <span className="pareto-badge selected">Selected</span> : null}
                  </span>
                  <span className="pareto-solution-score">{formatParetoScore(solution)} / 100</span>
                </span>
                <span className="pareto-solution-metrics">
                  <span className="pareto-solution-metric"><small>Demand</small><strong>{formatParetoObjectivePercent(solution.stats, "demand")}</strong></span>
                  <span className="pareto-solution-metric"><small>Residential</small><strong>{formatParetoObjectivePercent(solution.stats, "residential")}</strong></span>
                  <span className="pareto-solution-metric"><small>Propagation reach</small><strong>{formatParetoObjectivePercent(solution.stats, "propagation_reach")}</strong></span>
                  <span className="pareto-solution-metric"><small>Overlap</small><strong>{formatParetoObjectivePercent(solution.stats, "overlap")}</strong></span>
                  {showRadioQuality ? <span className="pareto-solution-metric"><small>Radio quality</small><strong>{formatParetoObjectivePercent(solution.stats, "radio_quality")}</strong></span> : null}
                </span>
                <span className="pareto-solution-action">Inspect solution</span>
              </button>
            </article>
          );
        })}
      </div>
      <ApplySolutionDialog
        open={Boolean(applyTarget)}
        sourceContext={resultContext}
        solution={applyTarget}
        destinationBaseName={resultContext?.scenario_name ?? "Scenario"}
        onClose={() => setApplyTarget(null)}
        onApply={(mode) => { const solution = applyTarget; setApplyTarget(null); onApplySolution?.(solution, mode); }}
      />
    </section>
  );
}

function ParetoSolutionDetail({ baseline, cellExplanation, comparison, constraintsConfigured, isRecommended, onApplySolution, onExplainCell, rank, solution }) {
  const objectiveRows = [
    { id: "demand", label: "Demand", rawLabel: "served / relevant demand" },
    { id: "residential", label: "Residential", rawLabel: "covered / relevant buildings" },
    { id: "propagation_reach", label: "Propagation reach", rawLabel: "score / maximum" },
    { id: "overlap", label: "Overlap", rawLabel: "overlap buildings / covered units" },
    ...(isRadioQualityEvaluated(solution.stats) ? [{ id: "radio_quality", label: "Radio quality", rawLabel: "serviceable / fixed-domain samples" }] : []),
  ];
  const constraintsLabel = !constraintsConfigured
    ? "Not configured"
    : solution.constraints_satisfied === true
      ? "Satisfied"
      : solution.constraints_satisfied === false
        ? "Not satisfied"
        : UNAVAILABLE_VALUE;
  const cellConfigurations = buildParetoCellConfigurations(baseline, solution);
  const explanationMatches = String(cellExplanation?.solutionID ?? "") === String(solution.id)
    && Boolean(cellExplanation?.cellID);
  return (
    <section className="pareto-solution-detail" aria-labelledby="pareto-selected-solution-title">
      <div className="pareto-detail-heading">
        <div>
          <span className="pareto-detail-kicker">Solution #{rank}</span>
          <h3 id="pareto-selected-solution-title">Inspected solution</h3>
        </div>
        <div className="pareto-detail-badges">
          <span className="pareto-badge selected">Selected</span>
          {isRecommended ? <span className="pareto-badge recommended">Recommended</span> : null}
        </div>
      </div>
      <div className="pareto-detail-score">
        <span>Optimization score</span>
        <strong>{formatParetoScore(solution)} / 100</strong>
      </div>
      <div className="pareto-detail-section">
        <span className="pareto-detail-section-title">Objective performance</span>
        <div className="pareto-objective-detail-grid">
          {objectiveRows.map(({ id, label, rawLabel }) => (
            <div className="pareto-objective-detail" key={id}>
              <span>{label}</span>
              <strong>{formatParetoObjectivePercent(solution.stats, id)}</strong>
              <small aria-label={`${label} ${rawLabel}`}>{formatParetoRawMetricPair(solution.stats, id)}</small>
            </div>
          ))}
        </div>
        <div className="pareto-constraint-line">
          <span>Constraints</span>
          <strong className={!constraintsConfigured ? "not-configured" : solution.constraints_satisfied === true ? "satisfied" : solution.constraints_satisfied === false ? "not-satisfied" : "not-available"}>
            {constraintsLabel}
          </strong>
        </div>
      </div>
      <div className="pareto-detail-section">
        <span className="pareto-detail-section-title">Cell configuration</span>
        <div className="pareto-cell-list">
          {cellConfigurations.map((configuration) => {
            const cellID = String(configuration.id);
            const isExplainedCell = explanationMatches && String(cellExplanation.cellID) === cellID;
            const canExplain = configuration.available && configuration.changed;
            return (
              <div className={`pareto-cell-row${configuration.changed ? " changed" : ""}`} key={cellID}>
                <div className="pareto-cell-change">
                  <strong>Cell {cellID}</strong>
                  {configuration.available ? (
                    <span>
                      {formatNumber(configuration.baseline_azimuth_deg, 0)}° baseline → {formatNumber(configuration.selected_azimuth_deg, 0)}° selected
                    </span>
                  ) : (
                    <span>Saved cell configuration metadata unavailable</span>
                  )}
                </div>
                <div className="pareto-cell-action">
                  {canExplain ? (
                    <button
                      type="button"
                      className="pareto-cell-explain"
                      aria-label={`Explain Cell ${cellID} marginal effect`}
                      disabled={cellExplanation?.loading && isExplainedCell}
                      onClick={() => onExplainCell?.(solution.id, configuration.id)}
                    >
                      {cellExplanation?.loading && isExplainedCell ? "Explaining…" : "Explain"}
                    </button>
                  ) : configuration.available ? (
                    <span className="pareto-cell-unchanged">Unchanged from baseline</span>
                  ) : null}
                </div>
                {isExplainedCell ? <CellMarginalEffectPanel explanation={cellExplanation} /> : null}
              </div>
            );
          })}
        </div>
        {!baseline?.cell_configurations?.length ? (
          <p className="data-note">Per-cell marginal effects are unavailable for this saved result because baseline configuration metadata was not retained.</p>
        ) : null}
      </div>
      {comparison ? <ParetoTradeoffComparison comparison={comparison} /> : null}
      <div className="pareto-apply-actions">
        <strong>Apply this solution</strong>
        <button type="button" onClick={() => onApplySolution?.(solution)} disabled={!onApplySolution}>Apply solution…</button>
        <small>Review the source Run and destination before continuing.</small>
      </div>
      <p className="data-note pareto-map-note">
        Inspection does not change the recommendation. RF map rays remain from the last simulation and are not re-simulated for this solution.
      </p>
    </section>
  );
}

function CellMarginalEffectPanel({ explanation }) {
  if (explanation?.loading) {
    return <p className="cell-marginal-effect-status" role="status" aria-live="polite">Evaluating one counterfactual for this cell…</p>;
  }
  if (explanation?.error) {
    return <p className="cell-marginal-effect-status error" role="alert">{explanation.error}</p>;
  }
  const effect = explanation?.view;
  if (!effect) return null;
  const cellID = effect.cell?.id ?? explanation.cellID ?? UNAVAILABLE_VALUE;
  const rows = [
    { key: "demand", label: "Demand served" },
    { key: "residential", label: "Residential" },
    { key: "propagation_reach", label: "Propagation reach" },
    { key: "overlap_buildings", label: "Overlap buildings" },
    { key: "overlap", label: "Overlap ratio" },
    { key: "covered_units", label: "Covered units" },
    { key: "score", label: "Optimization score" },
    ...(effect.metrics?.radio_quality?.available ? [{ key: "radio_quality", label: "Radio quality" }] : []),
  ];
  return (
    <section className="cell-marginal-effect" aria-label={`Marginal effect for Cell ${cellID}`} aria-live="polite">
      <div className="cell-marginal-effect-heading">
        <div>
          <strong>Marginal effect</strong>
          <span>Selected solution − cell reverted to baseline</span>
        </div>
        {effect.unchanged ? <span className="pareto-cell-unchanged">Unchanged</span> : null}
      </div>
      <p className="cell-marginal-effect-explanation">
        Measured by restoring only Cell {cellID} to its baseline configuration while keeping every other cell in this solution unchanged.
      </p>
      <div className="cell-marginal-grid">
        {rows.map(({ key, label }) => {
          const metric = effect.metrics?.[key];
          return (
            <article className={`cell-marginal-row ${metric?.outcome ?? "informational"}`} key={key}>
              <div className="cell-marginal-label">
                <strong>{label}</strong>
                <span>{formatOutcomeLabel(metric?.outcome)}</span>
              </div>
              <div className="cell-marginal-values">
                <span><small>Selected</small><strong>{formatCellMarginalValue(metric, key, "actual")}</strong></span>
                <span><small>Cell reverted</small><strong>{formatCellMarginalValue(metric, key, "counterfactual")}</strong></span>
                <span><small>Δ</small><strong>{formatCellMarginalDelta(metric, key)}</strong></span>
              </div>
            </article>
          );
        })}
      </div>
      <div className={`cell-marginal-constraints ${effect.metrics?.constraints?.outcome ?? "unchanged"}`}>
        <div className="cell-marginal-constraint-heading">
          <strong>Feasibility</strong>
          <span>{formatOutcomeLabel(effect.metrics?.constraints?.outcome)}</span>
        </div>
        <div className="cell-marginal-constraint-values">
          <span>Selected: <strong>{effect.metrics?.constraints?.actual ? "Satisfied" : "Not satisfied"}</strong></span>
          <span>Cell reverted: <strong>{effect.metrics?.constraints?.counterfactual ? "Satisfied" : "Not satisfied"}</strong></span>
        </div>
        {effect.metrics?.constraints?.counterfactual_violations?.length ? (
          <p className="data-note">Counterfactual violations: {effect.metrics.constraints.counterfactual_violations.join("; ")}</p>
        ) : null}
      </div>
      <div className="cell-marginal-limitations">
        {(effect.limitations ?? []).map((limitation) => <p className="data-note" key={limitation}>{limitation}</p>)}
      </div>
    </section>
  );
}

function formatCellMarginalValue(metric, key, side) {
  if (!metric?.available) return UNAVAILABLE_VALUE;
  const value = Number(metric[side]);
  if (!Number.isFinite(value)) return UNAVAILABLE_VALUE;
  if (key === "demand") return `${formatNumber(value, 1)} / ${formatNumber(metric.denominator, 1)}`;
  if (key === "residential") return `${formatCount(value)} / ${formatCount(metric.denominator)}`;
  if (key === "propagation_reach" || key === "overlap") return `${formatNumber(value * 100, 1)}%`;
  if (key === "score") return formatNumber(value, 1);
  return formatCount(value);
}

function formatCellMarginalDelta(metric, key) {
  if (!metric?.available || !Number.isFinite(Number(metric.absolute_delta))) return UNAVAILABLE_VALUE;
  const delta = Number(metric.absolute_delta);
  if (key === "propagation_reach" || key === "overlap") return `${formatSignedNumber(delta * 100, 1)} pp`;
  if (key === "score") return `${formatSignedNumber(delta, 1)} points`;
  return formatSignedNumber(delta, key === "demand" ? 1 : 0);
}

function ParetoTradeoffComparison({ comparison }) {
  const rows = [
    { key: "demand", label: "Demand" },
    { key: "residential", label: "Residential" },
    { key: "propagation_reach", label: "Propagation reach" },
    { key: "overlap", label: "Overlap" },
    { key: "score", label: "Score" },
    ...(comparison.metrics?.radio_quality?.available ? [{ key: "radio_quality", label: "Radio quality" }] : []),
  ];
  return (
    <section className="pareto-tradeoff" aria-label="Selected solution compared with recommended">
      <div className="pareto-tradeoff-heading">
        <strong>Compared with recommended</strong>
        <span>Recommended → selected · selected − recommended</span>
      </div>
      <div className="pareto-tradeoff-list">
        {rows.map(({ key, label }) => {
          const metric = comparison.metrics?.[key];
          return (
            <div className={`pareto-tradeoff-row ${metric?.outcome ?? "informational"}`} key={key}>
              <div>
                <strong>{label}</strong>
                <small>{formatParetoTradeoffValues(metric, key)}</small>
              </div>
              <div>
                <strong>{formatParetoTradeoffDelta(metric, key)}</strong>
                <span>{formatOutcomeLabel(metric?.outcome)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NetworkOptimizationPanel({ comparison, kind, onViewComparison, onViewSolutions, optimization }) {
  if (!optimization) {
    return null;
  }
  const stats = optimization.stats ?? {};
  const outcome = optimization.optimization ?? {};
  const frontier = optimization.pareto_frontier ?? [];
  const raw = stats.raw_metrics ?? {};
  const objectiveStatus = outcome.objective_status ?? stats.objective_status ?? {};
  const objectiveAvailable = (id) => objectiveStatus?.[id]?.available !== false;
  const radioQualityMetadata = outcome.radio_quality ?? {};
  const radioQualityEvaluated = isRadioQualityEvaluated(stats);
  const radioQualityValue = radioQualityEvaluated
    ? `${formatPercent(raw.radio_quality_serviceable_fraction)} (${formatCount(raw.radio_quality_serviceable_samples)} / ${formatCount(raw.radio_quality_total_samples)} samples)`
    : radioQualityMetadata.enabled && radioQualityMetadata.available === false
      ? (radioQualityMetadata.reason ?? UNAVAILABLE_VALUE)
      : null;
  const constraintsConfigured = Object.keys(outcome.constraints ?? {}).length > 0;
  const constraintsLabel = !constraintsConfigured
    ? "Not configured"
    : outcome.constraints_satisfied === true
      ? "Satisfied"
      : outcome.constraints_satisfied === false
        ? "Not satisfied"
        : UNAVAILABLE_VALUE;
  const score = Number.isFinite(Number(stats.score)) ? `${formatNumber(stats.score, 1)} / 100` : UNAVAILABLE_VALUE;
  const overlapRatio = objectiveAvailable("overlap") && Number.isFinite(Number(raw.overlap_ratio))
    ? `${formatNumber(Number(raw.overlap_ratio) * 100, 1)}%`
    : UNAVAILABLE_VALUE;
  const stateLabel = constraintsConfigured && outcome.constraints_satisfied === false
    ? "Infeasible — not recommended"
    : kind === "evaluation" || outcome.recommended === false
      ? "Feasible evaluation"
      : "Recommended solution";
  return (
    <section className="network-card" aria-label={`${kind === "evaluation" ? "Network evaluation" : "Network optimization"} summary`}>
      <div className="panel-title">
        <RadioTower size={16} />
        <span>{kind === "evaluation" ? "Network Evaluation" : "Network Optimization"}</span>
      </div>
      <div className="optimization-score">
        <span>Optimization Score</span>
        <strong>{score}</strong>
      </div>
      {kind !== "evaluation" && comparison ? (
        <OptimizationImpact comparison={comparison} onViewComparison={onViewComparison} />
      ) : null}
      {kind !== "evaluation" && optimization.baseline && !comparison ? (
        <p className="data-note">No feasible recommended solution is available for a baseline comparison under the current constraints.</p>
      ) : null}
      <div className="metric-list compact">
        <MetricRow label="Served demand weight" value={objectiveAvailable("demand") ? `${formatNumber(raw.served_demand_weight ?? raw.served_weighted_demand, 1)} / ${formatNumber(raw.relevant_demand_weight ?? raw.total_weighted_demand, 1)}` : UNAVAILABLE_VALUE} />
        <MetricRow label="Residential buildings" value={objectiveAvailable("residential") ? `${formatCount(raw.residential_covered)} / ${formatCount(raw.relevant_residential_total ?? raw.residential_total)}` : UNAVAILABLE_VALUE} />
        <MetricRow label="Propagation reach" value={objectiveAvailable("coverage") ? `${formatNumber(raw.propagation_reach_score ?? raw.coverage_reach_score, 1)} / ${formatNumber(raw.propagation_reach_maximum ?? raw.coverage_reach_maximum, 1)}` : UNAVAILABLE_VALUE} />
        <MetricRow label="Overlap ratio" value={overlapRatio} />
        <MetricRow label="Covered units" value={formatCount(raw.covered_units)} />
        <MetricRow label="Overlap buildings" value={objectiveAvailable("overlap") ? (stats.overlap_buildings ?? 0).toLocaleString() : UNAVAILABLE_VALUE} />
        {radioQualityValue !== null ? <MetricRow label="Radio quality" value={radioQualityValue} /> : null}
        <MetricRow label="Constraints" value={constraintsLabel} />
      </div>
      <div className="optimization-result-summary">
        <span className={!constraintsConfigured ? "constraint-state not-configured" : outcome.constraints_satisfied === false ? "constraint-state failed" : "constraint-state passed"}>
          {stateLabel}
        </span>
      </div>
      {(outcome.violations ?? []).map((violation) => <p className="optimization-violation" key={violation}>{violation}</p>)}
      <div className="network-tower-list">
        {(optimization.optimized_towers ?? []).map((tower) => (
          <span key={tower.id}>
            Cell {tower.id}: {Number(tower.optimal_azimuth ?? 0).toFixed(0)}°
          </span>
        ))}
      </div>
      {frontier.length > 0 && kind !== "evaluation" ? (
        <div className="pareto-summary">
          <div>
            <strong>{frontier.length} feasible non-dominated solution{frontier.length === 1 ? "" : "s"}</strong>
            <span>Current priorities determine the recommendation order.</span>
          </div>
          <button type="button" onClick={onViewSolutions}>Explore solutions</button>
        </div>
      ) : frontier.length > 0 ? (
        <p className="data-note">This evaluation is a single configuration. Run network optimization to inspect Pareto alternatives.</p>
      ) : (
        <p className="data-note">No feasible non-dominated set was found under the active constraints.</p>
      )}
      <p className="data-note">Adjusted parameters: {(outcome.adjusted_parameters ?? ["azimuth"]).join(", ")}. Tilt, power, candidate-site, cost, fiber, and permitting inputs are not synthesized by this optimizer.</p>
    </section>
  );
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : UNAVAILABLE_VALUE;
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${formatNumber(Number(value) * 100, 1)}%` : UNAVAILABLE_VALUE;
}

function formatParetoObjectivePercent(stats, id) {
  const objectiveID = id === "propagation_reach" ? "coverage" : id;
  const objectiveStatus = stats?.objective_status ?? stats?.objectiveStatus ?? {};
  if (objectiveStatus?.[objectiveID]?.available === false) return UNAVAILABLE_VALUE;
  const utilities = stats?.objectives ?? stats?.objectives_normalized ?? {};
  const raw = stats?.raw_metrics ?? stats?.rawMetrics ?? {};
  if (id === "overlap") {
    const rawRatio = readOptimizationRawMetric(raw, "overlap_ratio", "overlapRatio");
    if (rawRatio !== undefined) return formatPercent(rawRatio);
    const utilityValue = utilities.overlap;
    if (utilityValue === null || utilityValue === undefined || utilityValue === "") return UNAVAILABLE_VALUE;
    const utility = Number(utilityValue);
    return Number.isFinite(utility) ? formatPercent(1 - utility) : UNAVAILABLE_VALUE;
  }
  if (id === "radio_quality") {
    const rawFraction = readOptimizationRawMetric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction");
    if (rawFraction !== undefined) return formatPercent(rawFraction);
  }
  const utilityValue = utilities[objectiveID];
  if (utilityValue === null || utilityValue === undefined || utilityValue === "") return UNAVAILABLE_VALUE;
  return formatPercent(utilityValue);
}

function hasParetoSolutionData(solution) {
  const stats = solution?.stats ?? {};
  const raw = stats.raw_metrics ?? stats.rawMetrics;
  const utilities = stats.objectives ?? stats.objectives_normalized;
  const objectiveStatus = stats.objective_status ?? stats.objectiveStatus ?? {};
  const objectiveIDs = ["demand", "residential", "coverage", "overlap"];
  // A disabled/placeholder radio status is not evidence that the candidate
  // was evaluated. Add the dimension only when fixed-domain raw metrics exist.
  if (isRadioQualityEvaluated(stats)) objectiveIDs.push("radio_quality");
  const hasObjectiveData = objectiveIDs.every((id) => (
    objectiveStatus?.[id]?.available === false
      || hasFiniteParetoUtility(utilities?.[id])
      || hasParetoRawMetric(raw, id)
  ));
  const hasUsableMetric = objectiveIDs.some((id) => (
    objectiveStatus?.[id]?.available !== false
      && (hasFiniteParetoUtility(utilities?.[id]) || hasParetoRawMetric(raw, id))
  ));
  return Array.isArray(solution?.towers)
    && solution.towers.length > 0
    && hasObjectiveData
    && hasUsableMetric;
}

function hasParetoRawMetric(raw, id) {
  if (!raw || typeof raw !== "object") return false;
  if (id === "demand") {
    return readOptimizationRawMetric(raw, "served_demand_weight", "servedDemandWeight", "served_weighted_demand", "servedWeightedDemand") !== undefined
      && readOptimizationRawMetric(raw, "relevant_demand_weight", "relevantDemandWeight", "total_weighted_demand", "totalWeightedDemand") !== undefined;
  }
  if (id === "residential") {
    return readOptimizationRawMetric(raw, "residential_covered", "residentialCovered") !== undefined
      && readOptimizationRawMetric(raw, "relevant_residential_total", "relevantResidentialTotal", "residential_total", "residentialTotal") !== undefined;
  }
  if (id === "coverage") {
    return readOptimizationRawMetric(raw, "propagation_reach_score", "propagationReachScore", "coverage_reach_score", "coverageReachScore") !== undefined
      && readOptimizationRawMetric(raw, "propagation_reach_maximum", "propagationReachMaximum", "coverage_reach_maximum", "coverageReachMaximum") !== undefined;
  }
  if (id === "radio_quality") {
    return readOptimizationRawMetric(raw, "radio_quality_serviceable_fraction", "radioQualityServiceableFraction") !== undefined
      && readOptimizationRawMetric(raw, "radio_quality_total_samples", "radioQualityTotalSamples") !== undefined;
  }
  return readOptimizationRawMetric(raw, "overlap_ratio", "overlapRatio") !== undefined
    || (
      readOptimizationRawMetric(raw, "overlap_buildings", "overlapBuildings") !== undefined
      && readOptimizationRawMetric(raw, "covered_units", "coveredUnits") !== undefined
    );
}

function hasFiniteParetoUtility(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function formatParetoRawMetricPair(stats, id) {
  const objectiveID = id === "propagation_reach" ? "coverage" : id;
  const objectiveStatus = stats?.objective_status ?? stats?.objectiveStatus ?? {};
  if (objectiveStatus?.[objectiveID]?.available === false) return UNAVAILABLE_VALUE;
  const raw = stats?.raw_metrics ?? stats?.rawMetrics ?? {};
  if (id === "demand") {
    const served = readOptimizationRawMetric(raw, "served_demand_weight", "servedDemandWeight", "served_weighted_demand", "servedWeightedDemand");
    const relevant = readOptimizationRawMetric(raw, "relevant_demand_weight", "relevantDemandWeight", "total_weighted_demand", "totalWeightedDemand");
    return formatPair(served, relevant, (value) => formatNumber(value, 1));
  }
  if (id === "residential") {
    const covered = readOptimizationRawMetric(raw, "residential_covered", "residentialCovered");
    const relevant = readOptimizationRawMetric(raw, "relevant_residential_total", "relevantResidentialTotal", "residential_total", "residentialTotal");
    return formatPair(covered, relevant, formatCount);
  }
  if (id === "propagation_reach") {
    const score = readOptimizationRawMetric(raw, "propagation_reach_score", "propagationReachScore", "coverage_reach_score", "coverageReachScore");
    const maximum = readOptimizationRawMetric(raw, "propagation_reach_maximum", "propagationReachMaximum", "coverage_reach_maximum", "coverageReachMaximum");
    return formatPair(score, maximum, (value) => formatNumber(value, 1));
  }
  if (id === "overlap") {
    const buildings = readOptimizationRawMetric(raw, "overlap_buildings", "overlapBuildings")
      ?? readOptimizationRawMetric(stats, "overlap_buildings", "overlapBuildings");
    const units = readOptimizationRawMetric(raw, "covered_units", "coveredUnits");
    return formatPair(buildings, units, formatCount);
  }
  if (id === "radio_quality") {
    const serviceable = readOptimizationRawMetric(raw, "radio_quality_serviceable_samples", "radioQualityServiceableSamples");
    const total = readOptimizationRawMetric(raw, "radio_quality_total_samples", "radioQualityTotalSamples");
    if (serviceable === undefined || total === undefined) return UNAVAILABLE_VALUE;
    return `${formatCount(serviceable)} / ${formatCount(total)} samples`;
  }
  return UNAVAILABLE_VALUE;
}

function formatPair(left, right, formatter) {
  if (left === undefined || right === undefined) return UNAVAILABLE_VALUE;
  return `${formatter(left)} / ${formatter(right)}`;
}

function formatParetoScore(solution) {
  const score = Number(solution?.stats?.score ?? solution?.score ?? Number(solution?.stats?.composite_score) * 100);
  return Number.isFinite(score) ? formatNumber(score, 1) : UNAVAILABLE_VALUE;
}

function formatParetoTradeoffValues(metric, key) {
  if (!metric?.available || !Number.isFinite(Number(metric.recommended)) || !Number.isFinite(Number(metric.selected))) {
    return UNAVAILABLE_VALUE;
  }
  if (key === "score") {
    return `${formatNumber(metric.recommended, 1)} → ${formatNumber(metric.selected, 1)}`;
  }
  return `${formatNumber(metric.recommended * 100, 1)}% → ${formatNumber(metric.selected * 100, 1)}%`;
}

function formatParetoTradeoffDelta(metric, key) {
  if (!metric?.available || !Number.isFinite(Number(metric.absolute_delta))) return UNAVAILABLE_VALUE;
  if (key === "score") return `${formatSignedNumber(metric.absolute_delta, 1)} points`;
  return `${formatSignedNumber(metric.absolute_delta * 100, 1)} pp`;
}

function readOptimizationRawMetric(raw, ...keys) {
  for (const key of keys) {
    const value = raw?.[key];
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function CoreLabTool({ applicable, coreLab, enabled, scenarios, startCommand, towerIDs, onRunScenario, onToggle, onUse5G }) {
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

function DataPanel({
  appMeta,
  calibrationProfile,
  diagnostics,
  evaluatingMeasurements,
  interferenceModel,
  measurementAnalysis,
  measurementCount,
  networkTech,
  onApplyCalibration,
  onEvaluateMeasurements,
  onMeasurementFile,
  settings,
  summary,
	installedDatasets,
	datasetMessage,
	isSwitchingDataset,
	onSwitchDataset,
}) {
  const dataQuality = diagnostics?.data_quality ?? summary?.data_quality ?? "unknown";
  const totalBuildings = summary?.total_buildings ?? null;
  const residential = summary?.residential_weighted_buildings ?? null;
  const demand = summary?.demand_weighted_buildings ?? null;
  const dataResearchStatus = measurementAnalysis
    ? "Results available"
    : measurementCount
      ? `${measurementCount.toLocaleString()} samples loaded`
      : calibrationProfile ? "Correction active" : "Available for local evidence";

  return (
    <section className="dataset-panel" aria-label="Dataset confidence">
      <DisclosureSection
        title="Planning data"
        description="Demand and dataset context used by ordinary planning and optimization."
        defaultOpen
      >
      <div className="panel-title">
        <Database size={16} />
        <span>Demand Surface</span>
      </div>
      <div className={`quality-meter ${dataQuality}`}>
        <span>Data quality</span>
        <strong>{dataQuality}</strong>
      </div>
      <div className="dataset-grid">
        <MiniDatum
          label="Buildings"
          value={totalBuildings === null ? UNAVAILABLE_VALUE : totalBuildings.toLocaleString()}
        />
        <MiniDatum label="POI demand" value={demand === null ? UNAVAILABLE_VALUE : demand.toLocaleString()} />
        <MiniDatum
          label="Residential"
          value={residential === null ? UNAVAILABLE_VALUE : residential.toLocaleString()}
        />
        <MiniDatum label="Dataset" value={appMeta?.dataset?.name ?? "Unavailable"} />
        <MiniDatum label="Dataset version" value={appMeta?.dataset?.version ?? UNAVAILABLE_VALUE} />
        <MiniDatum label="Model version" value={appMeta?.model_version ?? UNAVAILABLE_VALUE} />
        <MiniDatum label="Application" value={appMeta?.application_version ?? "dev"} />
      </div>
      <p className="data-note">
        Static OSM/OpenCellID-derived files are loaded locally. Demand values combine explicit POI tags
        with residential-density heuristics, so confidence is useful context for optimization results.
      </p>
		</DisclosureSection>
		<DisclosureSection
			title="Dataset details"
			description="Installed packs, provenance, QA, and pack-building commands."
			status={appMeta?.dataset?.name ?? "Dataset details available"}
		>
		<section className="model-assumptions dataset-switcher" aria-label="Installed dataset packs">
			<div className="panel-title"><Database size={16} /><span>Installed Dataset Packs</span></div>
			<p className="data-note">Only packs discovered under the configured local <code>ATOM_DATASETS_ROOT</code> can be activated. A candidate is fully hash- and geometry-validated before the active in-memory snapshot changes.</p>
			<div className="dataset-pack-list">
				{(installedDatasets?.datasets ?? []).map((dataset) => (
					<button key={dataset.id} type="button" className={dataset.active ? "active" : ""} disabled={dataset.active || isSwitchingDataset} onClick={() => onSwitchDataset(dataset.id)}>
						<span><strong>{dataset.name}</strong><small>{dataset.id} · v{dataset.version} · schema {dataset.schema_version}</small></span>
						<em>{dataset.active ? "Active" : "Activate"}</em>
					</button>
				))}
			</div>
			{datasetMessage ? <p className="inventory-message" role="status">{datasetMessage}</p> : null}
			{(installedDatasets?.warnings ?? []).map((warning, index) => <p className="inventory-validation" key={`${warning}-${index}`}>{warning}</p>)}
			{appMeta?.dataset?.quality ? (
				<div className="dataset-quality-preview">
					<strong>Pack QA</strong>
					<p>{appMeta.dataset.quality.summary}</p>
					<MiniDatum label="Coverage" value={`${formatNumber((appMeta.dataset.quality.coverage?.coverage_ratio ?? 0) * 100, 1)}%`} />
					<MiniDatum label="Optional layers" value={Object.keys(appMeta.dataset.layers ?? {}).filter((key) => appMeta.dataset.layers[key]?.optional).join(", ") || "None"} />
					<MiniDatum label="Sources" value={(appMeta.dataset.sources ?? []).join(", ") || UNAVAILABLE_VALUE} />
					<MiniDatum label="Licenses" value={(appMeta.dataset.licenses ?? []).join(", ") || UNAVAILABLE_VALUE} />
					<MiniDatum label="Hashed files" value={Object.keys(appMeta.dataset.sha256 ?? {}).length.toLocaleString()} />
					<p>{appMeta.dataset.confidence}</p>
				</div>
			) : null}
			<pre className="dataset-studio-command">python data-pipeline/pack_studio.py inspect --towers cells.geojson --buildings buildings.gpkg{"\n"}python data-pipeline/pack_studio.py build --help</pre>
		</section>
		</DisclosureSection>
		<DisclosureSection
			title="Advanced model details"
			description="Expanded propagation and radio-quality assumptions for this plan."
			count={Number(Number.isFinite(Number(settings?.calibrationOffsetDb)) && Number(settings?.calibrationOffsetDb) !== 0)}
		>
      <section className="model-assumptions" aria-label="Propagation model assumptions">
        <div className="panel-title">
          <RadioTower size={16} />
          <span>Propagation Model</span>
        </div>
        <div className="dataset-grid">
          <MiniDatum label="RF model" value={appMeta?.model_id ?? "urban_short_range"} />
          <MiniDatum label="Estimator" value={appMeta?.model_description ?? "FSPL + footprint obstruction"} />
          <MiniDatum label="Technology" value={networkTech} />
          <MiniDatum label="Frequency" value={`${formatNumber(settings?.frequencyGHz, 1)} GHz`} />
          <MiniDatum label="Ray scope" value={`${formatNumber(settings?.rayCount, 0)} rays`} />
          <MiniDatum label="Calibration" value={settings?.calibrationOffsetDb ? `${formatNumber(settings.calibrationOffsetDb, 1)} dB` : "None"} />
        </div>
        <ul className="assumption-list">
          <li>{appMeta?.model_id === "urban_short_range" ? "Urban baseline uses 3GPP UMa LOS/NLOS path loss with a shared 2D footprint classifier; legacy wall loss is not added to empirical NLOS." : "Canonical link budget uses absolute TX/gain/system/calibration terms plus FSPL, building loss, and relative horizontal/vertical pattern attenuation."}</li>
          <li>Receiver sensitivity defaults to Manual at −115 dBm per effective cell. Derived mode uses −174 dBm/Hz + 10 log₁₀(B<sub>noise</sub>) + NF + required SNR + receiver margin; interference remains a separate RSRP/SINR/RSRQ model.</li>
          <li>Building service is raw received power &gt; −100 dBm. Receiver link margin is raw received power minus the effective receiver threshold; it is not a fade margin.</li>
          <li>Fast fading, diffraction, sidelobes, MIMO scheduling, and UE measurement effects are outside the current model.</li>
        </ul>
      </section>
      {interferenceModel ? (
        <section className="model-assumptions" aria-label="Interference model assumptions">
          <div className="panel-title">
            <Activity size={16} />
            <span>Radio Quality Model</span>
          </div>
          <div className="dataset-grid">
            <MiniDatum label="Family" value={interferenceModel.measurement_family ?? UNAVAILABLE_VALUE} />
            <MiniDatum label="Bandwidth" value={`${formatNumber(interferenceModel.bandwidth_mhz, 0)} MHz`} />
            <MiniDatum label="SCS" value={`${formatNumber(interferenceModel.subcarrier_spacing_khz, 0)} kHz`} />
            <MiniDatum label="Resource blocks" value={formatNumber(interferenceModel.resource_blocks, 0)} />
            <MiniDatum label="Noise figure" value={`${formatNumber(interferenceModel.noise_figure_db, 1)} dB`} />
            <MiniDatum label="Cell load" value={`${formatNumber(interferenceModel.load_factor * 100, 0)}%`} />
            <MiniDatum label="Reuse" value={`1 / ${interferenceModel.reuse_factor ?? 1}`} />
            <MiniDatum label="Grid" value={`${formatNumber(interferenceModel.effective_sample_spacing_m, 1)} m`} />
          </div>
          <ul className="assumption-list">
            {(interferenceModel.assumptions ?? []).map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
      ) : null}
		</DisclosureSection>
		<DisclosureSection
			title="Research / reference"
			description="Field evidence and calibration review. Applying an eligible correction remains an explicit action that updates the canonical plan."
			research
			status={dataResearchStatus}
		>
      <section className="model-assumptions measurement-panel" aria-label="Field measurement validation">
        <div className="panel-title">
          <Activity size={16} />
          <span>Measurement Validation</span>
        </div>
        <p className="data-note">Import up to 5,000 RSRP samples with columns <code>id, longitude, latitude, technology, rsrp_dbm, cell_id</code>. Short <code>lon</code>/<code>lat</code> headers are also accepted.</p>
        <label className="measurement-file-button">
          <Upload size={15} />
          <span>{measurementCount ? `${measurementCount} samples loaded` : "Import measurement CSV"}</span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => onMeasurementFile(event.target.files?.[0])} />
        </label>
        <button type="button" className="panel-primary-action" onClick={onEvaluateMeasurements} disabled={!measurementCount || evaluatingMeasurements}>
          {evaluatingMeasurements ? "Evaluating measurements..." : "Evaluate residuals"}
        </button>
        {measurementAnalysis?.stats ? (
          <>
            <div className="dataset-grid">
              <MiniDatum label="Valid samples" value={`${measurementAnalysis.stats.valid_sample_count ?? 0} / ${measurementAnalysis.stats.sample_count ?? 0}`} />
              <MiniDatum label="No signal" value={(measurementAnalysis.stats.no_signal_count ?? 0).toLocaleString()} />
              <MiniDatum label="Cell mismatch" value={(measurementAnalysis.stats.cell_mismatch_count ?? 0).toLocaleString()} />
              <MiniDatum label="MAE" value={formatMetric(measurementAnalysis.stats.mae_db, "dB")} />
              <MiniDatum label="RMSE" value={formatMetric(measurementAnalysis.stats.rmse_db, "dB")} />
              <MiniDatum label="Median bias" value={formatMetric(measurementAnalysis.stats.median_bias_db, "dB")} />
              <MiniDatum label="P50 absolute error" value={formatMetric(measurementAnalysis.stats.p50_abs_error_db, "dB")} />
              <MiniDatum label="P90 absolute error" value={formatMetric(measurementAnalysis.stats.p90_abs_error_db, "dB")} />
            </div>
            <div className="calibration-review">
              <strong>Spatially validated global bias</strong>
              <p>{measurementAnalysis.calibration?.reason}</p>
              <div className="dataset-grid">
                <MiniDatum label="Spatial areas" value={(measurementAnalysis.calibration?.spatial_group_count ?? 0).toLocaleString()} />
                <MiniDatum label="Campaign span" value={formatMetric(measurementAnalysis.calibration?.spatial_span_m, "m")} />
                <MiniDatum label="Spatial folds" value={(measurementAnalysis.calibration?.fold_count ?? 0).toLocaleString()} />
                <MiniDatum label="Outliers" value={(measurementAnalysis.diagnostics?.outlier_count ?? 0).toLocaleString()} />
                <MiniDatum label="Validation P50" value={formatMetric(measurementAnalysis.calibration?.p50_absolute_error_db, "dB")} />
                <MiniDatum label="Validation P90" value={formatMetric(measurementAnalysis.calibration?.p90_absolute_error_db, "dB")} />
              </div>
              {measurementAnalysis.calibration?.adjustment_confidence_95 ? (
                <p>95% median-adjustment interval: {formatNumber(measurementAnalysis.calibration.adjustment_confidence_95.lower_db, 1)} to {formatNumber(measurementAnalysis.calibration.adjustment_confidence_95.upper_db, 1)} dB.</p>
              ) : null}
              {measurementAnalysis.calibration?.eligible ? (
                <>
                  <div className="dataset-grid">
                    <MiniDatum label="Suggested offset" value={formatMetric(measurementAnalysis.calibration.recommended_total_offset_db, "dB")} />
                    <MiniDatum label="Holdout before" value={formatMetric(measurementAnalysis.calibration.holdout_mae_before_db, "dB MAE")} />
                    <MiniDatum label="Holdout after" value={formatMetric(measurementAnalysis.calibration.holdout_mae_after_db, "dB MAE")} />
                  </div>
                  <button type="button" onClick={onApplyCalibration}>Apply correction to plan</button>
                </>
              ) : null}
              <CalibrationDiagnosticsPanel analysis={measurementAnalysis} />
            </div>
          </>
        ) : null}
        {calibrationProfile ? <p className="calibration-active">Active correction: {formatNumber(calibrationProfile.offsetDb, 1)} dB. This is a global bias adjustment, not full calibration.</p> : null}
      </section>
		</DisclosureSection>
    </section>
  );
}

function ModelApplicabilityDetails({ appMeta, settings }) {
  const modelID = settings?.propagationModelID ?? "urban_short_range";
  const frequencyGHz = Number(settings?.frequencyGHz);
  const isResearch = frequencyGHz >= 100 || modelID === "research_sub_thz";
  const modelName = modelID === "research_sub_thz"
    ? "Research sub-THz"
    : modelID === "legacy_fspl_walls" ? "Legacy FSPL + walls" : "Urban short-range (UMa)";

  return (
    <section className="model-applicability-details" aria-label="Propagation model applicability">
      <p><strong>{modelName}</strong> · {isResearch ? "research/reference profile; radio quality unsupported" : "urban planning profile; runtime frequency ceiling 100 GHz"}</p>
      {isResearch ? <p className="research-profile-boundary"><ResearchReferenceBadge />140 GHz is not canonical validation or production-calibrated. It remains outside ordinary radio-quality analysis.</p> : null}
      <details className="model-limit-details">
        <summary>Model scope, RF contract, and assumptions <span>{appMeta?.model_id ?? modelID}</span></summary>
        <p>For <code>urban_short_range</code>, A.T.O.M runs the deterministic UMa LOS/NLOS path-loss subset for its normal 2.6/28 GHz planning profiles. The documented mathematical envelope is 0.5–100 GHz, 10–5,000 m ground distance, 10–150 m transmitter height, and 1.5–&lt;13 m receiver height; full 3GPP channel-model conformance is not claimed.</p>
        <p>The canonical RF contract carries the selected propagation model and per-cell RF profile into the existing request. Conducted power, absolute TX gain, pattern attenuation, RX gain, system and polarization losses, calibration, propagation loss, building loss, and receiver thresholds remain distinct terms.</p>
        <ul>
          <li>UMa empirical NLOS does not add legacy wall loss. The isolated P.526/path-profile calculation is diagnostic evidence and is not added to canonical UMa.</li>
          <li>Fast fading, multipath reflection, MIMO scheduling, vendor antenna diagrams, and UE measurement behavior are outside the current model.</li>
          <li>Building service uses the fixed raw-power threshold; per-cell receiver sensitivity and interference RSRP/SINR/RSRQ thresholds remain separate.</li>
          <li>Sub-THz, P.1411, material, and reflection panels are isolated references and do not silently change canonical network RF.</li>
        </ul>
        <p>Full applicability and limitations are documented in <a href="https://github.com/Berk-Unsal/atom/blob/main/docs/modeling-limits.md">Modeling limits</a>.</p>
      </details>
    </section>
  );
}

function CalibrationDiagnosticsPanel({ analysis }) {
  const perCell = analysis?.per_cell ?? [];
  const perBand = analysis?.per_band ?? [];
  const distanceBins = analysis?.diagnostics?.residual_vs_distance ?? [];
  const obstructionBins = analysis?.diagnostics?.residual_vs_obstruction ?? [];
  const folds = analysis?.calibration?.folds ?? [];
  if (perCell.length === 0 && perBand.length === 0 && folds.length === 0) return null;
  return (
    <details className="calibration-diagnostics">
      <summary>Inspect residual diagnostics</summary>
      <DiagnosticRows title="Per cell" rows={perCell.map((row) => ({
        key: row.cell_id, label: `Cell ${row.cell_id}`, count: row.sample_count,
        detail: `bias ${formatNumber(row.mean_bias_db, 1)} dB · MAE ${formatNumber(row.mae_db, 1)} dB`,
      }))} />
      <DiagnosticRows title="Per band" rows={perBand.map((row) => ({
        key: row.frequency_ghz, label: `${formatNumber(row.frequency_ghz, 2)} GHz`, count: row.sample_count,
        detail: `bias ${formatNumber(row.mean_bias_db, 1)} dB · MAE ${formatNumber(row.mae_db, 1)} dB`,
      }))} />
      <DiagnosticRows title="Residual versus distance" rows={distanceBins.map((row) => ({
        key: row.label, label: row.label, count: row.sample_count,
        detail: `bias ${formatNumber(row.mean_bias_db, 1)} dB · MAE ${formatNumber(row.mae_db, 1)} dB`,
      }))} />
      <DiagnosticRows title="Residual versus obstruction" rows={obstructionBins.map((row) => ({
        key: row.label, label: row.label, count: row.sample_count,
        detail: `bias ${formatNumber(row.mean_bias_db, 1)} dB · MAE ${formatNumber(row.mae_db, 1)} dB`,
      }))} />
      <DiagnosticRows title="Spatial folds" rows={folds.map((fold) => ({
        key: fold.fold, label: `Fold ${fold.fold}`, count: fold.validation_sample_count,
        detail: `${formatNumber(fold.mae_before_db, 1)} → ${formatNumber(fold.mae_after_db, 1)} dB MAE`,
      }))} />
    </details>
  );
}

function DiagnosticRows({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <section className="diagnostic-group">
      <strong>{title}</strong>
      {rows.map((row) => (
        <div key={row.key}><span>{row.label}</span><small>{row.detail}</small><em>{row.count} samples</em></div>
      ))}
    </section>
  );
}

function CoverageGapPanel({ stats }) {
  const gapCount = stats?.gap_buildings ?? null;
  const candidateCount = stats?.candidate_buildings ?? null;
  const gapPct = stats?.gap_pct ?? null;
  const worstRx = stats?.worst_rx_dbm ?? null;
  const unmetDemand = stats?.total_gap_demand ?? null;

  return (
    <section className="gap-panel" aria-label="Coverage gap summary">
      <div className="panel-title">
        <AlertTriangle size={16} />
        <span>Coverage Gaps</span>
      </div>
      <div className="gap-summary">
        <div>
          <span>Underserved buildings</span>
          <strong>{gapCount === null ? UNAVAILABLE_VALUE : gapCount.toLocaleString()}</strong>
        </div>
        <div>
          <span>Gap ratio</span>
          <strong>{gapPct === null ? UNAVAILABLE_VALUE : `${gapPct.toFixed(1)}%`}</strong>
        </div>
      </div>
      <div className="dataset-grid">
        <MiniDatum
          label="Candidates"
          value={candidateCount === null ? UNAVAILABLE_VALUE : candidateCount.toLocaleString()}
        />
        <MiniDatum
          label="Returned"
          value={stats?.returned_gaps === undefined ? UNAVAILABLE_VALUE : stats.returned_gaps.toLocaleString()}
        />
        <MiniDatum
          label="Unmet demand"
          value={unmetDemand === null ? UNAVAILABLE_VALUE : formatCompactNumber(unmetDemand)}
        />
        <MiniDatum label="Worst Rx" value={worstRx === null ? UNAVAILABLE_VALUE : `${worstRx.toFixed(1)} dBm`} />
      </div>
    </section>
  );
}

function OptimizerBreakdown({ diagnostics }) {
  if (!diagnostics) {
    return (
      <section className="optimizer-card" aria-label="Optimizer breakdown">
        <div className="panel-title">
          <SlidersHorizontal size={16} />
          <span>Optimizer</span>
        </div>
    <p className="empty-note">Run Auto-Optimize to see demand, residential, and propagation reach scores.</p>
      </section>
    );
  }

  return (
    <section className={`optimizer-card ${diagnostics.data_quality ?? "sparse"}`} aria-label="Optimizer breakdown">
      <div className="panel-title">
        <SlidersHorizontal size={16} />
        <span>Optimizer</span>
      </div>
      <div className="metric-list compact">
        <MetricRow label="Data quality" value={diagnostics.data_quality ?? "unknown"} />
        <MetricRow label="POI hits" value={(diagnostics.hit_demand_buildings ?? 0).toLocaleString()} />
        <MetricRow
          label="Residential hits"
          value={(diagnostics.hit_residential_buildings ?? 0).toLocaleString()}
        />
        <MetricRow label="Demand score" value={formatCompactNumber(diagnostics.demand_score)} />
        <MetricRow
          label="Residential score"
          value={formatCompactNumber(diagnostics.residential_score)}
        />
        <MetricRow label="Propagation reach tie-break" value={formatCompactNumber(diagnostics.coverage_score)} />
      </div>
    </section>
  );
}

function ReportExportPanel({
  artifacts,
  definitions,
  error,
  issues,
  loading,
  onDeleteArtifact,
  onDownloadArtifact,
  onInspectArtifact,
  onOpenSource,
  onRegenerateArtifact,
  onExportMarkdown,
  onExportPdf,
  reportWarning,
  currentWorkspace,
  currentResultContext,
  runs,
  scenarios,
  selectedArtifactId,
}) {
  return (
    <section className="report-card" aria-label="Planning report export">
      <div className="panel-title">
        <FileText size={16} />
        <span>Report</span>
      </div>
      <p className="empty-note">
        Export the selected tower, beam direction, RF KPIs, demand hits, gap summary, and a portable map
        preview for stakeholder review.
      </p>
      <div className="report-source-summary" aria-label="Report source">
        <strong>Report source</strong>
        {currentWorkspace?.unsaved || !currentWorkspace?.scenario_revision_id ? (
          <p className="report-live-source"><b>Current unsaved plan</b><span>This Report will not be tied to a saved Version.</span></p>
        ) : currentResultContext?.freshness === "current" ? (
          <ResultContextBadge context={currentResultContext} />
        ) : (
          <p>{currentWorkspace.scenario_name} · {currentWorkspace.version_label}. A Report records its source Run when one is available.</p>
        )}
      </div>
      {reportWarning ? <div className="run-history-message warning" role="status"><AlertTriangle size={14} />{reportWarning}</div> : null}
      <div className="report-actions">
        <button type="button" className="report-button primary" onClick={onExportPdf}>
          <FileText size={15} />
          <span>PDF / Print</span>
        </button>
        <button type="button" className="report-button" onClick={onExportMarkdown}>
          <Download size={15} />
          <span>Markdown</span>
        </button>
      </div>
      <ReportArtifactsPanel
        artifacts={artifacts}
        definitions={definitions}
        error={error}
        issues={issues}
        loading={loading}
        onDelete={onDeleteArtifact}
        onDownload={onDownloadArtifact}
        onInspect={onInspectArtifact}
        onOpenSource={onOpenSource}
        onRegenerate={onRegenerateArtifact}
        currentWorkspace={currentWorkspace}
        runs={runs}
        scenarios={scenarios}
        selectedArtifactId={selectedArtifactId}
      />
    </section>
  );
}

function ComparisonPanel({ comparison }) {
  const metrics = getComparisonMetrics(comparison);

  if (metrics.length === 0) {
    return (
      <section className="comparison-card" aria-label="Before and after optimization comparison">
        <div className="panel-title">
          <BarChart3 size={16} />
          <span>Before / After</span>
        </div>
        <p className="empty-note">
          Run Auto-Optimize or Optimize Network to capture the current plan as Before and compare it
          with the optimized result.
        </p>
      </section>
    );
  }

  return (
    <section className="comparison-card" aria-label="Before and after optimization comparison">
      <div className="panel-title">
        <BarChart3 size={16} />
        <span>Before / After</span>
      </div>
      <div className="comparison-chart" dangerouslySetInnerHTML={{ __html: buildComparisonBarChartSvg(comparison) }} />
      <div className="comparison-chart" dangerouslySetInnerHTML={{ __html: buildComparisonSlopeChartSvg(comparison) }} />
      <div className="delta-list">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className={`delta-row ${metric.status}`}
          >
            <span>{metric.label}</span>
            <strong>{metric.deltaLabel}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniDatum({ label, value }) {
  return (
    <div className="mini-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
