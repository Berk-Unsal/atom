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
import InterferenceResultsPanel from "./components/InterferenceResultsPanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import {
  CommandBar,
  InterferenceLegend,
  MapToolbar,
  ProjectMenu,
  ToolDrawer,
  WorkflowRail,
} from "./components/WorkspaceChrome.jsx";
import { WORKSPACE_TOOLS } from "./components/workspaceTools.js";
import useRequestCoordinator from "./hooks/useRequestCoordinator.js";
import useProjectWorkspace from "./hooks/useProjectWorkspace.js";
import { selectScenarioArtifacts } from "./utils/scenarioSnapshot.js";
import { getJSON, isAbortError, postJSON } from "./utils/apiClient.js";
import { is5GCoreFrequency, networkTechLabelForFrequency } from "./utils/networkTech.js";
import { runNetworkSimulationQueue } from "./utils/networkSimulationQueue.js";
import { distanceToCentroid, pointInPolygon, polygonCentroid } from "./utils/polygonSelection.js";
import { parseMeasurementCsv } from "./utils/measurementCsv.js";
import { datasetReference, isDatasetCompatible } from "./utils/projectStore.js";
import {
  buildInterferencePayload,
  buildMeasurementPayload,
  buildNetworkOptimizationPayload,
  buildRecommendationPayload,
  buildSimulationPayload,
} from "./utils/requestPayloads.js";
import {
  buildPlanningReport,
  buildComparisonBarChartSvg,
  buildComparisonSlopeChartSvg,
  getComparisonMetrics,
  downloadMarkdownReport,
  openPdfReport,
} from "./utils/reportExport.js";

const APP_ICON_URL = "/icon/icon.svg";
const CORE_LAB_START_COMMAND =
  "docker compose -f docker-compose.yml -f docker-compose.core-lab.yml --profile core-lab up";
const CORE_LAB_SCENARIOS = [
  { id: "normal", label: "Normal" },
  { id: "registration_storm", label: "Registration storm" },
  { id: "udm_outage", label: "UDM outage" },
  { id: "ausf_auth_failure", label: "AUSF auth failure" },
  { id: "pcf_policy_degraded", label: "PCF degraded" },
  { id: "upf_degraded", label: "UPF degraded" },
  { id: "xn_degraded", label: "Xn degraded" },
  { id: "xn_unavailable", label: "Xn unavailable" },
];

const DEFAULT_SIMULATION = {
  frequencyGHz: 28,
  txPowerDbm: 30,
  rayCount: 120,
  radiusMeters: 400,
  azimuthDeg: 90,
  beamWidthDeg: 120,
  interferenceBandwidthMHz: 100,
  cellLoadPct: 70,
  reuseFactor: 1,
  noiseFigureDb: 7,
  sampleSpacingMeters: 40,
  calibrationOffsetDb: 0,
};

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

const DEFAULT_LAYER_VISIBILITY = {
  rays: true,
  gaps: true,
  selectedCells: true,
  communicationPaths: true,
  interference: true,
  measurements: true,
};

export default function App() {
  const [activeTool, setActiveTool] = useState("setup");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerMode, setDrawerMode] = useState("tool");
  const [previousTool, setPreviousTool] = useState("setup");
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
  const [fitRequestVersion, setFitRequestVersion] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SIMULATION);
  const [planDirty, setPlanDirty] = useState(false);
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState(null);
  const [selectedNetworkTowerIds, setSelectedNetworkTowerIds] = useState([]);
  const [networkAzimuths, setNetworkAzimuths] = useState({});
  const [simulation, setSimulation] = useState(EMPTY_SIMULATION);
  const [simulationRevision, setSimulationRevision] = useState(0);
  const [coverageGaps, setCoverageGaps] = useState(EMPTY_COVERAGE_GAPS);
  const [coverageGapRevision, setCoverageGapRevision] = useState(0);
  const [interferenceAnalysis, setInterferenceAnalysis] = useState(EMPTY_INTERFERENCE_ANALYSIS);
  const [interferenceRevision, setInterferenceRevision] = useState(0);
  const [interferenceMetric, setInterferenceMetric] = useState("sinr");
  const [buildingSummary, setBuildingSummary] = useState(null);
  const [appMeta, setAppMeta] = useState(null);
  const [siteRecommendations, setSiteRecommendations] = useState(null);
  const [measurementSamples, setMeasurementSamples] = useState([]);
  const [measurementAnalysis, setMeasurementAnalysis] = useState(null);
  const [calibrationProfile, setCalibrationProfile] = useState(null);
  const [activeRFTask, setActiveRFTask] = useState(null);
  const [optimizationDiagnostics, setOptimizationDiagnostics] = useState(null);
  const [networkOptimization, setNetworkOptimization] = useState(null);
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
  const restoredProjectRef = useRef(null);
  const requests = useRequestCoordinator();
  const projectWorkspace = useProjectWorkspace(appMeta);
  const activeProject = projectWorkspace.activeProject;
  const workspaceLoaded = projectWorkspace.loaded;
  const saveProjectDraft = projectWorkspace.saveDraft;
  const saveProjectScenario = projectWorkspace.saveScenario;
  const isLoading = activeRFTask === "simulation" || activeRFTask === "network_evaluation";
  const isEvaluatingNetwork = activeRFTask === "network_evaluation";
  const isOptimizing = activeRFTask === "optimization";
  const isAnalyzingInterference = activeRFTask === "interference";
  const isRecommendingSites = activeRFTask === "recommendation";
  const isEvaluatingMeasurements = activeRFTask === "measurements";

  useEffect(() => {
    let isMounted = true;
    getJSON("/api/meta", "Application metadata could not be loaded")
      .then((meta) => { if (isMounted) setAppMeta(meta); })
      .catch(() => { if (isMounted) setAppMeta(null); });
    return () => { isMounted = false; };
  }, []);

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
          .map((feature) => ({
            id: feature.id ?? `${feature.properties?.radio_type}-${feature.properties?.cell_id}`,
            cellId: feature.properties?.cell_id,
            radioType: feature.properties?.radio_type,
            isSimulated: Boolean(feature.properties?.is_simulated),
            coordinates: feature.geometry.coordinates,
          }));
        setTowers(loadedTowers);
        setSelectedTower((current) => current ?? loadedTowers[0] ?? null);
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.message);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
  }, []);

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
    const restoredSettings = { ...DEFAULT_SIMULATION, ...plan.settings };
    const calibrationCompatible = isCalibrationProfileCompatible(snapshot?.calibrationProfile, restoredSettings, appMeta);
    if (!calibrationCompatible) restoredSettings.calibrationOffsetDb = 0;
    setSettings(restoredSettings);
    if (plan.planningMode) setPlanningMode(plan.planningMode);
    if (Array.isArray(plan.selectionPolygon)) setSelectionPolygon(plan.selectionPolygon);
    if (Array.isArray(plan.selectedNetworkTowerIds)) {
      setSelectedNetworkTowerIds(plan.selectedNetworkTowerIds.filter((id) => towers.some((tower) => tower.id === id)));
    }
    setNetworkAzimuths(plan.networkAzimuths ?? {});
    if (plan.selectedTowerId) {
      setSelectedTower(towers.find((tower) => tower.id === plan.selectedTowerId) ?? towers[0] ?? null);
    }
    if (plan.layerVisibility) setLayerVisibility((current) => ({ ...current, ...plan.layerVisibility }));
    const artifacts = snapshot?.artifacts;
    setSimulation(artifacts?.simulation ?? EMPTY_SIMULATION);
    setCoverageGaps(artifacts?.coverageGaps ?? EMPTY_COVERAGE_GAPS);
    setInterferenceAnalysis(artifacts?.interferenceAnalysis ?? EMPTY_INTERFERENCE_ANALYSIS);
    setNetworkOptimization(artifacts?.networkOptimization ?? null);
    setOptimizationDiagnostics(artifacts?.optimizationDiagnostics ?? null);
    setSiteRecommendations(artifacts?.siteRecommendations ?? null);
    setMeasurementAnalysis(artifacts?.measurementAnalysis ?? null);
    setCalibrationProfile(calibrationCompatible ? snapshot?.calibrationProfile ?? null : null);
    setLastAnalysisKind(snapshot?.summary?.kind ?? "rf");
    setActiveResultsView(snapshot?.summary?.resultsView ?? "rf");
    const datasetStale = Boolean(appMeta && snapshot?.datasetRef && !isDatasetCompatible({ datasetRef: snapshot.datasetRef }, appMeta));
    const modelStale = Boolean(appMeta?.model_version && snapshot?.meta?.model_version && appMeta.model_version !== snapshot.meta.model_version);
    setPlanDirty(Boolean(snapshot?.requiresRerun || datasetStale || modelStale || !calibrationCompatible));
    setSimulationRevision((current) => current + 1);
    setCoverageGapRevision((current) => current + 1);
    setInterferenceRevision((current) => current + 1);
  }, [appMeta, towers]);

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
  }, [activeProject, restorePlanningSnapshot, towers.length, workspaceLoaded]);

  useEffect(() => {
    if (!workspaceLoaded || restoredProjectRef.current !== activeProject?.id) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      saveProjectDraft({
        plan: {
          layerVisibility,
          planningMode,
          selectedNetworkTowerIds,
          networkAzimuths,
          selectedTowerId: selectedTower?.id ?? null,
          selectionPolygon,
          settings,
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
    selectedTower?.id,
    selectionPolygon,
    settings,
    workspaceLoaded,
  ]);

  const simulateForSettings = useCallback(async (tower, nextSettings, signal) => {
    const requestPayload = buildSimulationPayload(tower, nextSettings);
    const [simulationPayload, gapPayload] = await Promise.all([
      postJSON("/api/simulate", requestPayload, "Simulation request failed", signal),
      postJSON("/api/coverage-gaps", requestPayload, "Coverage gap request failed", signal),
    ]);
    return { coverageGaps: gapPayload, simulation: simulationPayload };
  }, []);

  const simulateRaysForSettings = useCallback(async (tower, nextSettings, signal) => {
    return postJSON(
      "/api/simulate",
      buildSimulationPayload(tower, nextSettings),
      "Simulation request failed",
      signal,
    );
  }, []);

  const runSimulation = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    const request = requests.begin("rf");
    setActiveRFTask("simulation");
    setError("");
    try {
      const { simulation: simulationPayload, coverageGaps: gapPayload } = await simulateForSettings(
        selectedTower,
        settings,
        request.signal,
      );
      if (!request.isCurrent()) {
        return;
      }
      setSimulation(simulationPayload);
      setCoverageGaps(gapPayload);
      setNetworkOptimization(null);
      setNetworkResultKind(null);
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("rf");
      setActiveResultsView("rf");
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
  }, [requests, selectedTower, settings, simulateForSettings]);

  const optimizeAzimuth = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    const request = requests.begin("rf");
    setActiveRFTask("optimization");
    setError("");
    try {
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
        buildSimulationPayload(selectedTower, settings),
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
  }, [
    coverageGaps,
    optimizationDiagnostics,
    selectedTower,
    requests,
    settings,
    simulateForSettings,
    simulation,
  ]);

  const optimizeNetwork = useCallback(async () => {
    const selectedNetworkTowers = towers.filter((tower) => selectedNetworkTowerIds.includes(tower.id));
    if (selectedNetworkTowers.length < 2) {
      setError("Select at least 2 towers for network optimization");
      return;
    }

    const request = requests.begin("rf");
    setActiveRFTask("optimization");
    setError("");
    clearInterferenceAnalysis();
    try {
      const networkRequest = buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths);
      const baselinePayload = await postJSON(
        "/api/evaluate-network",
        networkRequest,
        "Network baseline request failed",
        request.signal,
      );
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
        (tower) => {
          const optimizedTower = optimizedByID.get(String(tower.cellId ?? tower.id));
          return simulateRaysForSettings(
            tower,
            {
              ...settings,
              azimuthDeg: Number(optimizedTower?.optimal_azimuth ?? settings.azimuthDeg),
            },
            request.signal,
          );
        },
      );
      if (!request.isCurrent()) {
        return;
      }
      const beforeSnapshot = buildNetworkComparisonSnapshot({
        label: "Before",
        optimization: baselinePayload,
        settings,
        towers: selectedNetworkTowers,
      });
      const afterSnapshot = buildNetworkComparisonSnapshot({
        label: "After",
        optimization: payload,
        settings,
        towers: selectedNetworkTowers,
      });
      setNetworkOptimization(payload);
      setNetworkAzimuths(networkAzimuthMap(selectedNetworkTowers, payload, networkAzimuths));
      setNetworkResultKind("optimization");
      setOptimizationDiagnostics(null);
      setComparison({ kind: "network", before: beforeSnapshot, after: afterSnapshot });
      setSimulation(combineNetworkSimulations(simulations));
      setCoverageGaps({ geojson: { type: "FeatureCollection", features: [] }, stats: null });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("network");
      setActiveResultsView("optimization");
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
  }, [clearInterferenceAnalysis, networkAzimuths, requests, selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

  const evaluateNetwork = useCallback(async () => {
    const selected = selectedNetworkTowerIds
      .map((towerID) => towers.find((tower) => tower.id === towerID))
      .filter(Boolean);
    if (selected.length < 2) {
      setError("Select at least 2 towers to evaluate the network");
      return;
    }

    const request = requests.begin("rf");
    setActiveRFTask("network_evaluation");
    setError("");
    clearInterferenceAnalysis();
    try {
      const networkRequest = buildNetworkOptimizationPayload(selected, settings, networkAzimuths);
      const payload = await postJSON(
        "/api/evaluate-network",
        networkRequest,
        "Network evaluation request failed",
        request.signal,
      );
      const simulations = await runNetworkSimulationQueue(selected, (tower) =>
        simulateRaysForSettings(tower, {
          ...settings,
          azimuthDeg: networkAzimuthFor(tower, networkAzimuths, settings.azimuthDeg),
        }, request.signal));
      if (!request.isCurrent()) {
        return;
      }
      setNetworkOptimization(payload);
      setNetworkResultKind("evaluation");
      setOptimizationDiagnostics(null);
      setComparison({ before: null, after: null });
      setSimulation(combineNetworkSimulations(simulations));
      setCoverageGaps({ geojson: { type: "FeatureCollection", features: [] }, stats: null });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("network");
      setActiveResultsView("optimization");
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
  }, [clearInterferenceAnalysis, networkAzimuths, requests, selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

  const selectedNetworkTowers = useMemo(
    () =>
      selectedNetworkTowerIds
        .map((towerID) => towers.find((tower) => tower.id === towerID))
        .filter(Boolean),
    [selectedNetworkTowerIds, towers],
  );
  const selectedTowerOrder = useMemo(() => {
    return new Map(selectedNetworkTowerIds.map((towerID, index) => [towerID, index + 1]));
  }, [selectedNetworkTowerIds]);
  const coreLabApplicable = is5GCoreFrequency(settings.frequencyGHz);
  const interferenceApplicable = settings.frequencyGHz < 100;

  const analyzeInterference = useCallback(async () => {
    if (!interferenceApplicable) {
      setError("Interference KPIs are not applicable to the 6G research mode");
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
    setNetworkResultKind(null);
    setComparison({ before: null, after: null });
    clearInterferenceAnalysis();
    setSiteRecommendations(null);
    setMeasurementAnalysis(null);
  }, [clearInterferenceAnalysis]);

  const clearRenderedAnalysis = useCallback(() => {
    setSimulation(EMPTY_SIMULATION);
    setCoverageGaps(EMPTY_COVERAGE_GAPS);
    setSimulationRevision((current) => current + 1);
    setCoverageGapRevision((current) => current + 1);
    setSelectedMapObject((current) => current?.type === "tower" ? current : null);
  }, []);

  const invalidatePlanResults = useCallback(() => {
    requests.cancel("rf");
    setActiveRFTask(null);
    setOptimizationDiagnostics(null);
    resetNetworkArtifacts();
    clearRenderedAnalysis();
    setPlanDirty(true);
  }, [clearRenderedAnalysis, requests, resetNetworkArtifacts]);

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

  const selectTower = useCallback((tower) => {
    if (planningMode === "network") {
      const isSelected = selectedNetworkTowerIds.includes(tower.id);
      if (!isSelected && selectedNetworkTowerIds.length >= 6) {
        setError("Network planning supports up to 6 selected cells");
        return;
      }
      invalidatePlanResults();
      setSelectionNotice("");
      setSelectedNetworkTowerIds((current) => {
        if (current.includes(tower.id)) {
          return current.filter((id) => id !== tower.id);
        }
        setError("");
        return [...current, tower.id];
      });
      setSelectedTower(tower);
      return;
    }
    invalidatePlanResults();
    setSelectedTower(tower);
  }, [invalidatePlanResults, planningMode, selectedNetworkTowerIds]);

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
      setSelectedNetworkTowerIds((current) => {
        if (current.length > 0) {
          return current;
        }
        return selectedTower ? [selectedTower.id] : [];
      });
    }
  }, [invalidatePlanResults, planningMode, selectedTower]);

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

    const centroid = polygonCentroid(finalPolygon);
    const selected = [...inside]
      .sort((left, right) => distanceToCentroid(left, centroid) - distanceToCentroid(right, centroid))
      .slice(0, 6);
    invalidatePlanResults();
    setSelectedNetworkTowerIds(selected.map((tower) => tower.id));
    setSelectedTower((current) => selected[0] ?? current);
    setIsDrawingSelection(false);
    setSelectionPolygon(finalPolygon);
    setSelectionNotice(
      inside.length > 6
        ? `${inside.length} towers found, nearest 6 selected.`
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
    if (selectedNetworkTowers.length < 2 || selectedNetworkTowers.length > 5) {
      setError("Select between 2 and 5 cells before adding one candidate");
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
      setSiteRecommendations(payload);
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
      const samples = parseMeasurementCsv(await file.text());
      const expectedTechnology = settings.frequencyGHz < 10 ? "4g" : settings.frequencyGHz < 100 ? "5g" : "6g";
      if (expectedTechnology === "6g" || samples.some((sample) => sample.technology !== expectedTechnology)) {
        throw new Error(`Measurement technology must match the active ${expectedTechnology.toUpperCase()} plan`);
      }
      setMeasurementSamples(samples);
      setMeasurementAnalysis(null);
      setError("");
    } catch (fileError) {
      setMeasurementSamples([]);
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
        buildMeasurementPayload(measurementTowers, settings, measurementSamples, networkOptimization, networkAzimuths),
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
  }, [interferenceApplicable, measurementSamples, networkAzimuths, networkOptimization, planningMode, requests, selectedNetworkTowers, selectedTower, settings]);

  const applyCalibration = useCallback(() => {
    const offset = measurementAnalysis?.calibration?.recommended_total_offset_db;
    if (!Number.isFinite(Number(offset))) {
      setError("No eligible calibration correction is available");
      return;
    }
    invalidatePlanResults();
    setSettings((current) => ({ ...current, calibrationOffsetDb: Number(offset) }));
    setCalibrationProfile({
      kind: "robust_global_path_loss_bias",
      offsetDb: Number(offset),
      technology: settings.frequencyGHz < 10 ? "4g" : "5g",
      frequencyGHz: settings.frequencyGHz,
      modelVersion: appMeta?.model_version ?? "unknown",
      dataset: datasetReference(appMeta),
      validation: measurementAnalysis.calibration,
    });
  }, [appMeta, invalidatePlanResults, measurementAnalysis, settings.frequencyGHz]);

  const toggleLayerVisibility = useCallback((layer) => {
    setLayerVisibility((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }, []);

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
  }, [cancelAreaSelection, closeDrawer, drawerMode, drawerOpen, isDrawingSelection, layerMenuOpen]);

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
            : planDirty
              ? "Plan changed"
              : "Ready";
  const resultSummary = useMemo(() => {
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
    if ((lastAnalysisKind === "network" || lastAnalysisKind === "optimization") && networkOptimization?.stats) {
      return {
        label: networkResultKind === "evaluation" ? "Network plan" : "Optimization",
        primary: formatCompactNumber(networkOptimization.stats.network_score),
        secondary: `${(networkOptimization.stats.overlap_buildings ?? 0).toLocaleString()} overlap`,
        view: "optimization",
      };
    }
    if (lastAnalysisKind === "rf" && simulation?.stats) {
      return {
        label: "Sector result",
        primary: stats.avgPower === null ? "n/a" : `${stats.avgPower.toFixed(1)} dBm`,
        secondary: `${gapStats?.gap_buildings?.toLocaleString() ?? "n/a"} gaps`,
        view: "rf",
      };
    }
    return null;
  }, [gapStats, interferenceAnalysis.stats, lastAnalysisKind, networkOptimization, networkResultKind, simulation?.stats, siteRecommendations, stats.avgPower]);
  const selectedCellCount = selectedNetworkTowerIds.length;
  const contextLabel = planningMode === "network"
    ? `Network · ${selectedCellCount} ${selectedCellCount === 1 ? "cell" : "cells"}`
    : `Single · Cell ${selectedTowerLabel}`;
  const planSummary = `${formatNumber(settings.frequencyGHz, 1)} GHz · ${formatNumber(settings.txPowerDbm, 0)} dBm · ${formatNumber(settings.radiusMeters, 0)} m`;
  const hasInterferenceData = (interferenceAnalysis.geojson?.features ?? []).length > 0;
  const hasResults = Boolean(simulation?.stats || networkOptimization?.stats || interferenceAnalysis.stats || siteRecommendations || measurementAnalysis);
  const interferenceUnavailableReason = planningMode !== "network"
    ? "Interference requires Network planning mode"
    : !interferenceApplicable
      ? "Interference is not applicable to 6G research mode"
      : selectedCellCount < 2
        ? "Select at least two cells"
        : null;
  const coreUnavailableReason = coreLabApplicable ? null : "5G Core is available only in 5G mmWave mode";
  const toolState = {
    setup: { badge: planningMode === "network" ? String(selectedNetworkTowerIds.length) : null },
    propagation: {},
    interference: {
      unavailable: Boolean(interferenceUnavailableReason),
      reason: interferenceUnavailableReason,
      badge: hasInterferenceData ? "•" : interferenceUnavailableReason ? "!" : null,
      tone: hasInterferenceData ? "success" : "warning",
    },
    core: {
      unavailable: Boolean(coreUnavailableReason),
      reason: coreUnavailableReason,
      badge: coreLabEnabled ? "•" : coreUnavailableReason ? "!" : null,
      tone: coreLab.status?.state === "connected" ? "success" : "warning",
    },
    results: { badge: hasResults ? "•" : null, tone: "success" },
    data: {},
    report: {},
  };
  const activeToolDefinition = WORKSPACE_TOOLS.find((tool) => tool.id === activeTool) ?? WORKSPACE_TOOLS[0];
  const cellsNeeded = Math.max(0, 2 - selectedCellCount);
  const primaryActionLabel = isEvaluatingNetwork
    ? "Evaluating..."
    : planningMode === "network"
      ? cellsNeeded > 0
        ? `Add ${cellsNeeded} ${cellsNeeded === 1 ? "cell" : "cells"}`
        : "Evaluate Network"
      : isLoading
        ? "Running..."
        : "Run Sector";
  const mapPlanPrompt = planDirty
    ? planningMode === "network" && cellsNeeded > 0
      ? {
          title: `Add ${cellsNeeded} more ${cellsNeeded === 1 ? "cell" : "cells"}`,
          detail: "Select towers on the map or draw an area to build the cluster.",
        }
      : {
          title: "Plan changed",
          detail: planningMode === "network"
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
      planningMode,
      selectedTowerId: selectedTower?.id ?? null,
        selectedNetworkTowerIds,
        networkAzimuths,
      selectionPolygon,
      layerVisibility,
      ...overrides.plan,
    },
    request: planningMode === "network"
      ? buildNetworkOptimizationPayload(selectedNetworkTowers, settings, networkAzimuths)
      : selectedTower ? buildSimulationPayload(selectedTower, settings) : null,
    summary: {
      kind: lastAnalysisKind,
      resultsView: activeResultsView,
      avgRxDBm: simulation?.stats?.avg_rx_dbm ?? null,
      gapPct: coverageGaps?.stats?.gap_pct ?? null,
      networkScore: networkOptimization?.stats?.network_score ?? null,
      overlapBuildings: networkOptimization?.stats?.overlap_buildings ?? null,
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
      networkOptimization,
      optimizationDiagnostics,
      siteRecommendations,
      measurementAnalysis,
    }),
    requiresRerun: Boolean(planDirty),
  }), [
    activeResultsView,
    appMeta,
    calibrationProfile,
    coverageGaps,
    interferenceAnalysis,
    lastAnalysisKind,
    layerVisibility,
    networkAzimuths,
    measurementAnalysis,
    networkOptimization,
    optimizationDiagnostics,
    planDirty,
    planningMode,
    selectedNetworkTowerIds,
    selectedNetworkTowers,
    selectedTower,
    selectionPolygon,
    settings,
    simulation,
    siteRecommendations,
  ]);

  const saveCurrentScenario = useCallback(() => {
    const count = activeProject?.scenarios?.length ?? 0;
    const label = lastAnalysisKind === "recommendation" ? "Candidate search" : lastAnalysisKind === "interference" ? "Interference" : planningMode === "network" ? "Network plan" : "Sector plan";
    saveProjectScenario(`${label} ${count + 1}`, buildCurrentScenarioSnapshot());
  }, [activeProject?.scenarios?.length, buildCurrentScenarioSnapshot, lastAnalysisKind, planningMode, saveProjectScenario]);

  const openSavedScenario = useCallback((scenario) => {
    projectWorkspace.activateScenario(scenario.id);
    restorePlanningSnapshot(scenario);
    if (scenario.requiresRerun) setError("This scenario retains its inputs and summary; rerun it to restore uncached map layers.");
  }, [projectWorkspace, restorePlanningSnapshot]);

  const applyRecommendation = useCallback((recommendation) => {
    const candidate = towers.find((tower) => String(tower.cellId) === String(recommendation.cell_id) || tower.id === recommendation.id);
    if (!candidate) {
      setError("The recommended candidate is not present in the active dataset");
      return;
    }
    const nextIDs = [...new Set([...selectedNetworkTowerIds, candidate.id])];
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
      summary: { kind: "recommendation", resultsView: "recommendations", networkScore: recommendation.stats?.network_score ?? null },
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
    selectedNetworkTowerIds,
    selectedNetworkTowers,
    settings,
    towers,
  ]);
  const createPlanningReport = useCallback(
    () =>
      buildPlanningReport({
        activeNetworkTech,
        appMeta,
        buildingSummary,
        calibrationProfile,
        coreLab,
        coreLabApplicable,
        coreLabEnabled,
        coverageGaps,
        diagnostics: optimizationDiagnostics,
        interferenceAnalysis,
        measurementAnalysis,
        comparison,
        networkOptimization,
        project: activeProject,
        recommendations: siteRecommendations,
        selectedTower,
        settings,
        simulation,
        stats,
      }),
    [
      activeNetworkTech,
      activeProject,
      appMeta,
      buildingSummary,
      calibrationProfile,
      comparison,
      coreLab,
      coreLabApplicable,
      coreLabEnabled,
      interferenceAnalysis,
      measurementAnalysis,
      networkOptimization,
      coverageGaps,
      optimizationDiagnostics,
      selectedTower,
      settings,
      simulation,
      siteRecommendations,
      stats,
    ],
  );

  const exportMarkdownReport = useCallback(() => {
    try {
      downloadMarkdownReport(createPlanningReport());
    } catch (exportError) {
      setError(exportError.message);
    }
  }, [createPlanningReport]);

  const exportPdfReport = useCallback(() => {
    try {
      openPdfReport(createPlanningReport());
    } catch (exportError) {
      setError(exportError.message);
    }
  }, [createPlanningReport]);

  const drawerSubtitles = {
    setup: "Mode, technology, power, and cell selection",
    propagation: "Ray geometry, coverage radius, and optimization",
    interference: "Co-channel load and radio-quality assumptions",
    core: "Xn, N2, N3, sessions, and lab scenarios",
    results: "Focused analysis from the latest RF operation",
    data: "Dataset confidence and model assumptions",
    report: "Export the current planning state",
  };

  return (
    <main className="focused-app-shell">
      <CommandBar
        appIconUrl={APP_ICON_URL}
        contextLabel={contextLabel}
        error={drawerOpen ? "" : error}
        networkTech={activeNetworkTech}
        onDismissError={() => setError("")}
        onOpenResults={() => openResults(resultSummary?.view)}
        onRun={planningMode === "network" ? evaluateNetwork : runSimulation}
        planSummary={planSummary}
        projectControl={(
          <ProjectMenu
            key={projectWorkspace.activeProject?.id}
            activeProject={projectWorkspace.activeProject}
            compatible={isDatasetCompatible(projectWorkspace.activeProject, appMeta)}
            exportContent={projectWorkspace.exportActiveProject}
            onAddProject={() => { restoredProjectRef.current = null; projectWorkspace.addProject(); }}
            onDeleteProject={() => { restoredProjectRef.current = null; projectWorkspace.deleteProject(); }}
            onDeleteScenario={projectWorkspace.deleteScenario}
            onDuplicateProject={() => { restoredProjectRef.current = null; projectWorkspace.duplicateProject(); }}
            onImportProject={(text) => { restoredProjectRef.current = null; return projectWorkspace.importProject(text); }}
            onOpenScenario={openSavedScenario}
            onRenameProject={projectWorkspace.renameProject}
            onSaveScenario={saveCurrentScenario}
            onSelectProject={(id) => { restoredProjectRef.current = null; projectWorkspace.selectProject(id); }}
            projects={projectWorkspace.workspace.projects}
          />
        )}
        primaryActionLabel={primaryActionLabel}
        primaryDisabled={activeRFTask !== null || (planningMode === "network" ? selectedCellCount < 2 : !selectedTower)}
        resultSummary={resultSummary}
        runState={runState}
        statusTone={error ? "error" : activeRFTask !== null ? "busy" : planDirty ? "pending" : "ready"}
      />

      <section className={`workspace-frame ${drawerOpen ? "drawer-open" : ""}`}>
        <WorkflowRail
          activeTool={activeTool}
          drawerMode={drawerMode}
          drawerOpen={drawerOpen}
          onSelectTool={selectWorkspaceTool}
          toolState={toolState}
        />

        <section className="map-stage" aria-label="Ankara propagation map">
          <MapToolbar
            availableLayers={{
              communicationPaths: Boolean(coreLabApplicable && coreLabEnabled && coreLab.topology),
              gaps: Boolean(coverageGaps?.geojson?.features?.length),
              interference: hasInterferenceData,
              measurements: Boolean(measurementAnalysis?.geojson?.features?.length),
              rays: Boolean(simulation?.geojson?.features?.length),
              selectedCells: selectedNetworkTowerIds.length > 0,
            }}
            isDrawingSelection={isDrawingSelection}
            layerMenuOpen={layerMenuOpen}
            layerVisibility={layerVisibility}
            onCancelAreaSelection={cancelAreaSelection}
            onClearNetworkSelection={clearNetworkSelection}
            onDrawArea={startAreaSelection}
            onFinishAreaSelection={() => finishAreaSelection()}
            onFitSelectedCells={fitSelectedCells}
            onLayerMenuToggle={setLayerMenuOpen}
            onToggleLayer={toggleLayerVisibility}
            interferenceMetric={interferenceMetric}
            onInterferenceMetricChange={setInterferenceMetric}
            hasInterferenceData={hasInterferenceData}
            planningMode={planningMode}
            selectionCanFinish={selectionPolygon.length >= 3}
            selectedCount={selectedNetworkTowerIds.length}
          />
          <MapCanvas
            towers={towers}
            selectedTower={selectedTower}
            selectedNetworkTowerIds={selectedNetworkTowerIds}
            selectedTowerOrder={selectedTowerOrder}
            onSelectTower={selectTower}
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
            recommendations={siteRecommendations?.geojson}
          />
          {mapPlanPrompt && activeRFTask === null ? (
            <div className="map-plan-prompt" role="status">
              <strong>{mapPlanPrompt.title}</strong>
              <span>{mapPlanPrompt.detail}</span>
            </div>
          ) : null}
          {layerVisibility.interference && hasInterferenceData ? (
            <InterferenceLegend
              collapsed={legendCollapsed}
              metric={interferenceMetric}
              onToggle={() => setLegendCollapsed((current) => !current)}
            />
          ) : null}
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
          title={drawerMode === "inspector" ? "Map Inspector" : activeToolDefinition.label}
        >
          {drawerMode === "inspector" ? <MapInspector selectedMapObject={selectedMapObject} /> : null}

          {drawerMode === "tool" && ["setup", "propagation", "interference"].includes(activeTool) ? (
            <ControlPanel
              activeTool={activeTool}
              settings={settings}
              onChange={updateSettings}
              onOptimizeAzimuth={optimizeAzimuth}
              isLoading={isLoading}
              isOptimizing={isOptimizing}
              networkSelectionCount={selectedNetworkTowerIds.length}
              onOptimizeNetwork={optimizeNetwork}
              onAnalyzeInterference={analyzeInterference}
              onFocusMap={() => closeDrawer("map")}
              onPlanningModeChange={changePlanningMode}
              selectionNotice={selectionNotice}
              planningMode={planningMode}
              interferenceApplicable={interferenceApplicable}
              isAnalyzingInterference={isAnalyzingInterference}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "core" ? (
            <CoreLabTool
              applicable={coreLabApplicable}
              coreLab={coreLab}
              enabled={coreLabEnabled}
              onRunScenario={runCoreLabScenario}
              onUse5G={() => updateSettings((current) => ({
                ...current,
                frequencyGHz: 28,
                interferenceBandwidthMHz: 100,
              }))}
              onToggle={toggleCoreLab}
              scenarios={CORE_LAB_SCENARIOS}
              startCommand={CORE_LAB_START_COMMAND}
              towerIDs={coreLabTowerIDs}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "results" ? (
            <ResultsPanel
              activeView={activeResultsView}
              comparison={comparison}
              diagnostics={optimizationDiagnostics}
              networkOptimization={networkOptimization}
              networkResultKind={networkResultKind}
              interferenceAnalysis={interferenceAnalysis}
              gapStats={gapStats}
              hasRFResults={Boolean(simulation?.stats)}
              onViewChange={setActiveResultsView}
              onApplyRecommendation={applyRecommendation}
              onOpenScenario={openSavedScenario}
              onRecommendSites={recommendSites}
              recommendations={siteRecommendations}
              recommending={isRecommendingSites}
              savedScenarios={projectWorkspace.activeProject?.scenarios ?? []}
              recommendationDisabled={selectedNetworkTowers.length < 2 || selectedNetworkTowers.length > 5 || selectionPolygon.length < 3 || !interferenceApplicable}
              stats={stats}
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
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "report" ? (
            <ReportExportPanel onExportMarkdown={exportMarkdownReport} onExportPdf={exportPdfReport} />
          ) : null}
        </ToolDrawer>
      </section>
    </main>
  );
}

function MapInspector({ selectedMapObject }) {
  if (!selectedMapObject) {
    return null;
  }
  const { type, payload } = selectedMapObject;

  return (
    <section className="map-inspector-card" aria-label="Map selection inspector">
      {type === "tower" ? <TowerInspector payload={payload} /> : null}
      {type === "coverage_gap" ? <GapInspector payload={payload} /> : null}
      {type === "communication_path" ? <PathInspector payload={payload} /> : null}
      {type === "interference_sample" ? <InterferenceInspector payload={payload} /> : null}
      {type === "measurement_sample" ? <MeasurementInspector payload={payload} /> : null}
      {type === "site_recommendation" ? <RecommendationInspector payload={payload} /> : null}
    </section>
  );
}

function TowerInspector({ payload }) {
  const tower = payload?.tower ?? {};
  const coordinates = tower.coordinates ?? [];
  return (
    <div className="inspector-grid">
      <MiniDatum label="Cell" value={tower.cellId ?? "n/a"} />
      <MiniDatum label="Network" value={payload?.activeNetworkTech ?? "n/a"} />
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
      <MiniDatum label="From" value={route.from ?? "n/a"} />
      <MiniDatum label="To" value={route.to ?? "n/a"} />
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
      <MiniDatum label="Channel" value={properties.channel_id ?? "n/a"} />
      <MiniDatum label="RSRP" value={formatMetric(properties.rsrp_dbm, "dBm")} />
      <MiniDatum label="SINR" value={formatMetric(properties.sinr_db, "dB")} />
      <MiniDatum label="RSRQ" value={formatMetric(properties.rsrq_db, "dB")} />
      <MiniDatum label="RSSI" value={formatMetric(properties.rssi_dbm, "dBm")} />
      <MiniDatum label="Strongest interferer" value={properties.strongest_interferer_id ?? "Noise-limited"} />
      <MiniDatum label="Interference" value={formatMetric(properties.interference_dbm, "dBm")} />
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
      <MiniDatum label="Sample" value={properties.id ?? "n/a"} />
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
      <MiniDatum label="Candidate cell" value={properties.cell_id ?? properties.id ?? "n/a"} />
      <MiniDatum label="Score gain" value={formatCompactNumber(properties.marginal_network_score)} />
      <MiniDatum label="Azimuth" value={`${formatNumber(properties.optimal_azimuth, 0)} deg`} />
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
  comparison,
  diagnostics,
  gapStats,
  hasRFResults,
  interferenceAnalysis,
  networkOptimization,
  networkResultKind,
  onApplyRecommendation,
  onOpenScenario,
  onRecommendSites,
  onViewChange,
  recommendationDisabled,
  recommendations,
  recommending,
  savedScenarios,
  stats,
}) {
  const views = [
    { id: "rf", label: "RF" },
    { id: "optimization", label: "Optimization" },
    { id: "interference", label: "Interference" },
    { id: "compare", label: "Compare" },
    { id: "recommendations", label: "Candidates" },
  ];
  const hasOptimizationResults = Boolean(
    networkOptimization || diagnostics || getComparisonMetrics(comparison).length > 0,
  );

  return (
    <section className="results-panel" aria-label="Simulation results">
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
                value={stats.avgPower === null ? "n/a" : `${stats.avgPower.toFixed(1)} dBm`}
              />
              <MetricRow
                label="Max range"
                value={stats.maxRange === null ? "n/a" : `${stats.maxRange.toFixed(1)} m`}
              />
              <MetricRow
                label="Min range"
                value={stats.minRange === null ? "n/a" : `${stats.minRange.toFixed(1)} m`}
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
            <NetworkOptimizationPanel optimization={networkOptimization} kind={networkResultKind} />
            {!networkOptimization ? <OptimizerBreakdown diagnostics={diagnostics} /> : null}
            <ComparisonPanel comparison={comparison} />
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
        interferenceAnalysis?.stats ? (
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
        <ScenarioComparisonPanel onOpenScenario={onOpenScenario} scenarios={savedScenarios} />
      ) : null}

      {activeView === "recommendations" ? (
        <RecommendationPanel
          disabled={recommendationDisabled}
          loading={recommending}
          onApply={onApplyRecommendation}
          onRun={onRecommendSites}
          response={recommendations}
        />
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
    ["Network score", "networkScore", ""],
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
          return <div key={key}><span>{label}</span><strong>{formatScenarioMetric(before, unit)}</strong><strong>{formatScenarioMetric(after, unit)}</strong><em>{delta === null ? "n/a" : `${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)} ${unit}`}</em></div>;
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
          <div><span>#{index + 1} · Cell {recommendation.cell_id}</span><strong>+{formatCompactNumber(recommendation.marginal_network_score)}</strong></div>
          <p>{recommendation.reason}</p>
          <dl><div><dt>Azimuth</dt><dd>{formatNumber(recommendation.optimal_azimuth, 0)} deg</dd></div><div><dt>Overlap</dt><dd>{recommendation.stats?.overlap_buildings ?? 0}</dd></div></dl>
          <button type="button" onClick={() => onApply(recommendation)}>Apply as scenario</button>
        </article>
      ))}
      {response?.notes?.map((note) => <p className="data-note" key={note}>{note}</p>)}
    </section>
  );
}

function formatScenarioMetric(value, unit) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)}${unit ? ` ${unit}` : ""}` : "n/a";
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

function NetworkOptimizationPanel({ optimization, kind }) {
  if (!optimization) {
    return null;
  }
  const stats = optimization.stats ?? {};
  return (
    <section className="network-card" aria-label={`${kind === "evaluation" ? "Network evaluation" : "Network optimization"} summary`}>
      <div className="panel-title">
        <RadioTower size={16} />
        <span>{kind === "evaluation" ? "Network Evaluation" : "Network Optimization"}</span>
      </div>
      <div className="metric-list compact">
        <MetricRow label="Network score" value={formatCompactNumber(stats.network_score)} />
        <MetricRow label="Unique POI" value={(stats.unique_demand_buildings ?? 0).toLocaleString()} />
        <MetricRow
          label="Unique residential"
          value={(stats.unique_residential_buildings ?? 0).toLocaleString()}
        />
        <MetricRow label="Overlap buildings" value={(stats.overlap_buildings ?? 0).toLocaleString()} />
        <MetricRow label="Overlap penalty" value={formatCompactNumber(stats.overlap_penalty)} />
      </div>
      <div className="network-tower-list">
        {(optimization.optimized_towers ?? []).map((tower) => (
          <span key={tower.id}>
            Cell {tower.id}: {Number(tower.optimal_azimuth ?? 0).toFixed(0)} deg
          </span>
        ))}
      </div>
    </section>
  );
}

function CoreLabTool({ applicable, coreLab, enabled, scenarios, startCommand, towerIDs, onRunScenario, onToggle, onUse5G }) {
  return (
    <section className="core-tool" aria-label="5G Core Lab controls">
      <label className="core-toggle-row">
        <span>
          <strong>Core Lab overlay</strong>
          <small>{enabled ? "Path monitoring enabled" : "Optional local Open5GS integration"}</small>
        </span>
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
      <MiniDatum label="Xn paths" value={hasRoutes ? directCount.toLocaleString() : "n/a"} />
      <MiniDatum label="N2 fallback" value={hasRoutes ? fallbackCount.toLocaleString() : "n/a"} />
      <MiniDatum label="N3 user plane" value={n3Degraded ? "Degraded" : n3Edges.length > 0 ? "Active" : "n/a"} />
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
}) {
  const dataQuality = diagnostics?.data_quality ?? summary?.data_quality ?? "unknown";
  const totalBuildings = summary?.total_buildings ?? null;
  const residential = summary?.residential_weighted_buildings ?? null;
  const demand = summary?.demand_weighted_buildings ?? null;

  return (
    <section className="dataset-panel" aria-label="Dataset confidence">
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
          value={totalBuildings === null ? "n/a" : totalBuildings.toLocaleString()}
        />
        <MiniDatum label="POI demand" value={demand === null ? "n/a" : demand.toLocaleString()} />
        <MiniDatum
          label="Residential"
          value={residential === null ? "n/a" : residential.toLocaleString()}
        />
        <MiniDatum label="Dataset" value={appMeta?.dataset?.name ?? "Unavailable"} />
        <MiniDatum label="Dataset version" value={appMeta?.dataset?.version ?? "n/a"} />
        <MiniDatum label="Model version" value={appMeta?.model_version ?? "n/a"} />
        <MiniDatum label="Application" value={appMeta?.application_version ?? "dev"} />
      </div>
      <p className="data-note">
        Static OSM/OpenCellID-derived files are loaded locally. Demand values combine explicit POI tags
        with residential-density heuristics, so confidence is useful context for optimization results.
      </p>
      <section className="model-assumptions" aria-label="Propagation model assumptions">
        <div className="panel-title">
          <RadioTower size={16} />
          <span>Propagation Model</span>
        </div>
        <div className="dataset-grid">
          <MiniDatum label="Estimator" value="FSPL + wall loss" />
          <MiniDatum label="Technology" value={networkTech} />
          <MiniDatum label="Frequency" value={`${formatNumber(settings?.frequencyGHz, 1)} GHz`} />
          <MiniDatum label="Ray scope" value={`${formatNumber(settings?.rayCount, 0)} rays`} />
          <MiniDatum label="Calibration" value={settings?.calibrationOffsetDb ? `${formatNumber(settings.calibrationOffsetDb, 1)} dB` : "None"} />
        </div>
        <ul className="assumption-list">
          <li>Deterministic planning estimate using beam eligibility, building intersections, and frequency-dependent wall attenuation.</li>
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
            <MiniDatum label="Family" value={interferenceModel.measurement_family ?? "n/a"} />
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
            </div>
            <div className="calibration-review">
              <strong>Global bias correction</strong>
              <p>{measurementAnalysis.calibration?.reason}</p>
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
            </div>
          </>
        ) : null}
        {calibrationProfile ? <p className="calibration-active">Active correction: {formatNumber(calibrationProfile.offsetDb, 1)} dB. This is a global bias adjustment, not full calibration.</p> : null}
      </section>
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
          <strong>{gapCount === null ? "n/a" : gapCount.toLocaleString()}</strong>
        </div>
        <div>
          <span>Gap ratio</span>
          <strong>{gapPct === null ? "n/a" : `${gapPct.toFixed(1)}%`}</strong>
        </div>
      </div>
      <div className="dataset-grid">
        <MiniDatum
          label="Candidates"
          value={candidateCount === null ? "n/a" : candidateCount.toLocaleString()}
        />
        <MiniDatum
          label="Returned"
          value={stats?.returned_gaps === undefined ? "n/a" : stats.returned_gaps.toLocaleString()}
        />
        <MiniDatum
          label="Unmet demand"
          value={unmetDemand === null ? "n/a" : formatCompactNumber(unmetDemand)}
        />
        <MiniDatum label="Worst Rx" value={worstRx === null ? "n/a" : `${worstRx.toFixed(1)} dBm`} />
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
        <p className="empty-note">Run Auto-Optimize to see demand, residential, and coverage scores.</p>
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
        <MetricRow label="Coverage tie-break" value={formatCompactNumber(diagnostics.coverage_score)} />
      </div>
    </section>
  );
}

function ReportExportPanel({ onExportMarkdown, onExportPdf }) {
  return (
    <section className="report-card" aria-label="Planning report export">
      <div className="panel-title">
        <FileText size={16} />
        <span>Planning Report</span>
      </div>
      <p className="empty-note">
        Export the selected tower, beam direction, RF KPIs, demand hits, gap summary, and a portable map
        preview for stakeholder review.
      </p>
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

function formatCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "n/a";
  }
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "n/a";
  }
  return number.toLocaleString("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatMetric(value, unit) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} ${unit}` : "n/a";
}

function formatCoreLabState(state) {
  if (state === "scenario_running") {
    return "Scenario running";
  }
  if (state === "connected") {
    return "Connected";
  }
  if (state === "disconnected") {
    return "Disconnected";
  }
  if (state === "disabled") {
    return "Disabled";
  }
  if (state === "not_applicable") {
    return "Not applicable";
  }
  return state ?? "Off";
}

function formatScenario(value) {
  return String(value ?? "normal")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCalibrationProfileCompatible(profile, settings, meta) {
  if (!profile) return true;
  if (!meta) return true;
  const technology = settings.frequencyGHz < 10 ? "4g" : settings.frequencyGHz < 100 ? "5g" : "6g";
  return profile.kind === "robust_global_path_loss_bias"
    && profile.technology === technology
    && Number(profile.frequencyGHz) === Number(settings.frequencyGHz)
    && profile.modelVersion === meta.model_version
    && isDatasetCompatible({ datasetRef: profile.dataset }, meta);
}

function networkAzimuthFor(tower, azimuths, fallback) {
  const value = azimuths[tower.id] ?? azimuths[String(tower.id)] ?? azimuths[String(tower.cellId ?? "")];
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function networkAzimuthMap(towers, optimization, existing = {}) {
  const optimizedByID = new Map(
    (optimization?.optimized_towers ?? []).map((tower) => [String(tower.id), tower.optimal_azimuth]),
  );
  return towers.reduce((azimuths, tower) => {
    const optimized = optimizedByID.get(String(tower.cellId ?? tower.id));
    if (Number.isFinite(Number(optimized))) {
      azimuths[tower.id] = Number(optimized);
    }
    return azimuths;
  }, { ...existing });
}

function MiniDatum({ label, value }) {
  return (
    <div className="mini-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildComparisonSnapshot({ coverageGaps, diagnostics, label, settings, simulation, tower }) {
  return {
    coverageGaps,
    diagnostics,
    kind: "single",
    label,
    settings: { ...settings },
    stats: normalizeSimulationStats(simulation, coverageGaps),
    timestamp: new Date().toISOString(),
    tower,
  };
}

function buildNetworkComparisonSnapshot({ label, optimization, settings, towers }) {
  return {
    kind: "network",
    label,
    optimization,
    settings: { ...settings },
    stats: normalizeNetworkStats(optimization),
    timestamp: new Date().toISOString(),
    towers,
  };
}

function combineNetworkSimulations(simulations) {
  const features = simulations.flatMap((payload, simulationIndex) =>
    (payload?.geojson?.features ?? []).map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        network_tower_index: simulationIndex,
      },
    })),
  );
  const stats = simulations.map((payload) => payload?.stats).filter(Boolean);
  return {
    geojson: {
      type: "FeatureCollection",
      features,
    },
    stats: {
      avg_rx_dbm: average(stats.map((item) => item.avg_rx_dbm)),
      blocked_pct: average(stats.map((item) => item.blocked_pct)),
      max_range_m: Math.max(...stats.map((item) => Number(item.max_range_m ?? 0)), 0),
      min_range_m: minFinite(stats.map((item) => item.min_range_m)),
    },
  };
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) {
    return 0;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function minFinite(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) {
    return 0;
  }
  return Math.min(...numbers);
}

function normalizeSimulationStats(simulation, coverageGaps) {
  return {
    avgPower: simulation?.stats?.avg_rx_dbm ?? null,
    blockedRatio: simulation?.stats?.blocked_pct ?? null,
    gapBuildings: coverageGaps?.stats?.gap_buildings ?? null,
    gapRatio: coverageGaps?.stats?.gap_pct ?? null,
    maxRange: simulation?.stats?.max_range_m ?? null,
    minRange: simulation?.stats?.min_range_m ?? null,
    rayCount: simulation?.geojson?.features?.length ?? 0,
    totalGapDemand: coverageGaps?.stats?.total_gap_demand ?? null,
    worstRx: coverageGaps?.stats?.worst_rx_dbm ?? null,
  };
}

function normalizeNetworkStats(optimization) {
  const stats = optimization?.stats ?? {};
  return {
    coverageScore: stats.coverage_score ?? null,
    demandScore: stats.demand_score ?? null,
    networkScore: stats.network_score ?? null,
    overlapBuildings: stats.overlap_buildings ?? null,
    overlapPenalty: stats.overlap_penalty ?? null,
    residentialScore: stats.residential_score ?? null,
    uniqueDemandBuildings: stats.unique_demand_buildings ?? null,
    uniqueResidentialBuildings: stats.unique_residential_buildings ?? null,
  };
}
