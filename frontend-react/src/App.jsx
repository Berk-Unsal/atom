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
} from "lucide-react";
import ControlPanel from "./components/ControlPanel.jsx";
import InterferenceResultsPanel from "./components/InterferenceResultsPanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import {
  CommandBar,
  InterferenceLegend,
  MapToolbar,
  ToolDrawer,
  WorkflowRail,
} from "./components/WorkspaceChrome.jsx";
import { WORKSPACE_TOOLS } from "./components/workspaceTools.js";
import useRequestCoordinator from "./hooks/useRequestCoordinator.js";
import { getJSON, isAbortError, postJSON } from "./utils/apiClient.js";
import { is5GCoreFrequency, networkTechLabelForFrequency } from "./utils/networkTech.js";
import { runNetworkSimulationQueue } from "./utils/networkSimulationQueue.js";
import { distanceToCentroid, pointInPolygon, polygonCentroid } from "./utils/polygonSelection.js";
import {
  buildInterferencePayload,
  buildNetworkOptimizationPayload,
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
};

const EMPTY_INTERFERENCE_ANALYSIS = {
  geojson: { type: "FeatureCollection", features: [] },
  demand_geojson: { type: "FeatureCollection", features: [] },
  stats: null,
  model: null,
};

const DEFAULT_LAYER_VISIBILITY = {
  rays: true,
  gaps: true,
  selectedCells: true,
  communicationPaths: true,
  interference: true,
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
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState(null);
  const [selectedNetworkTowerIds, setSelectedNetworkTowerIds] = useState([]);
  const [simulation, setSimulation] = useState({
    geojson: { type: "FeatureCollection", features: [] },
    stats: null,
  });
  const [simulationRevision, setSimulationRevision] = useState(0);
  const [coverageGaps, setCoverageGaps] = useState({
    geojson: { type: "FeatureCollection", features: [] },
    stats: null,
  });
  const [coverageGapRevision, setCoverageGapRevision] = useState(0);
  const [interferenceAnalysis, setInterferenceAnalysis] = useState(EMPTY_INTERFERENCE_ANALYSIS);
  const [interferenceRevision, setInterferenceRevision] = useState(0);
  const [interferenceMetric, setInterferenceMetric] = useState("sinr");
  const [buildingSummary, setBuildingSummary] = useState(null);
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
  const skipNextSimulationRun = useRef(false);
  const requests = useRequestCoordinator();
  const isLoading = activeRFTask === "simulation" || activeRFTask === "network_evaluation";
  const isEvaluatingNetwork = activeRFTask === "network_evaluation";
  const isOptimizing = activeRFTask === "optimization";
  const isAnalyzingInterference = activeRFTask === "interference";

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
      skipNextSimulationRun.current = true;
      setSettings(optimizedSettings);
      setSimulation(optimizedSimulation);
      setCoverageGaps(optimizedGaps);
      setComparison({ before: beforeSnapshot, after: afterSnapshot });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("optimization");
      setActiveResultsView("optimization");
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
      const networkRequest = buildNetworkOptimizationPayload(selectedNetworkTowers, settings);
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
      setNetworkResultKind("optimization");
      setOptimizationDiagnostics(null);
      setComparison({ kind: "network", before: beforeSnapshot, after: afterSnapshot });
      setSimulation(combineNetworkSimulations(simulations));
      setCoverageGaps({ geojson: { type: "FeatureCollection", features: [] }, stats: null });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setLastAnalysisKind("network");
      setActiveResultsView("optimization");
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
  }, [clearInterferenceAnalysis, requests, selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

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
      const networkRequest = buildNetworkOptimizationPayload(selected, settings);
      const payload = await postJSON(
        "/api/evaluate-network",
        networkRequest,
        "Network evaluation request failed",
        request.signal,
      );
      const simulations = await runNetworkSimulationQueue(selected, (tower) =>
        simulateRaysForSettings(tower, settings, request.signal));
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
  }, [clearInterferenceAnalysis, requests, selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

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
        buildInterferencePayload(selectedNetworkTowers, settings, networkOptimization),
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
  }, [interferenceApplicable, networkOptimization, requests, selectedNetworkTowers, settings]);

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
  }, [clearInterferenceAnalysis]);

  const updateSettings = useCallback((nextSettings) => {
    requests.cancel("rf");
    setActiveRFTask(null);
    setOptimizationDiagnostics(null);
    resetNetworkArtifacts();
    setSettings(nextSettings);
  }, [requests, resetNetworkArtifacts]);

  const selectTower = useCallback((tower) => {
    requests.cancel("rf");
    setActiveRFTask(null);
    if (planningMode === "network") {
      resetNetworkArtifacts();
      setSelectionNotice("");
      setSelectedNetworkTowerIds((current) => {
        if (current.includes(tower.id)) {
          return current.filter((id) => id !== tower.id);
        }
        if (current.length >= 6) {
          setError("Network optimization supports up to 6 selected towers");
          return current;
        }
        setError("");
        return [...current, tower.id];
      });
      setSelectedTower(tower);
      return;
    }
    setOptimizationDiagnostics(null);
    resetNetworkArtifacts();
    setSelectedTower(tower);
  }, [planningMode, requests, resetNetworkArtifacts]);

  const changePlanningMode = useCallback((mode) => {
    requests.cancel("rf");
    setActiveRFTask(null);
    setPlanningMode(mode);
    setOptimizationDiagnostics(null);
    resetNetworkArtifacts();
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
  }, [requests, resetNetworkArtifacts, selectedTower]);

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
    requests.cancel("rf");
    setActiveRFTask(null);
    setSelectedNetworkTowerIds([]);
    setSelectionPolygon([]);
    setSelectedMapObject(null);
    setSelectionNotice("");
    resetNetworkArtifacts();
  }, [requests, resetNetworkArtifacts]);

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
    setSelectedNetworkTowerIds(selected.map((tower) => tower.id));
    requests.cancel("rf");
    setActiveRFTask(null);
    setSelectedTower((current) => selected[0] ?? current);
    resetNetworkArtifacts();
    setIsDrawingSelection(false);
    setSelectionPolygon(finalPolygon);
    setSelectionNotice(
      inside.length > 6
        ? `${inside.length} towers found, nearest 6 selected.`
        : `${selected.length} towers selected from drawn area.`,
    );
  }, [requests, resetNetworkArtifacts, selectionPolygon, towers]);

  const addSelectionPolygonPoint = useCallback((coordinate) => {
    setSelectionPolygon((current) => [...current, coordinate]);
  }, []);

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
        return;
      }
      if (drawerOpen) {
        closeDrawer(drawerMode === "inspector" ? "map" : "tool");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDrawer, drawerMode, drawerOpen, isDrawingSelection, layerMenuOpen]);

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

  useEffect(() => {
    if (selectedTower) {
      if (skipNextSimulationRun.current) {
        skipNextSimulationRun.current = false;
        return;
      }
      runSimulation();
    }
  }, [selectedTower, runSimulation]);

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
  const runState = isEvaluatingNetwork
    ? "Evaluating"
    : activeRFTask === "simulation"
      ? "Simulating"
    : isOptimizing
      ? "Optimizing"
      : isAnalyzingInterference
        ? "Analyzing"
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
    if ((lastAnalysisKind === "network" || lastAnalysisKind === "optimization") && networkOptimization?.stats) {
      return {
        label: networkResultKind === "evaluation" ? "Network plan" : "Optimization",
        primary: formatCompactNumber(networkOptimization.stats.network_score),
        secondary: `${(networkOptimization.stats.overlap_buildings ?? 0).toLocaleString()} overlap`,
        view: "optimization",
      };
    }
    if (simulation?.stats) {
      return {
        label: "Sector result",
        primary: stats.avgPower === null ? "n/a" : `${stats.avgPower.toFixed(1)} dBm`,
        secondary: `${gapStats?.gap_buildings?.toLocaleString() ?? "n/a"} gaps`,
        view: "rf",
      };
    }
    return null;
  }, [gapStats, interferenceAnalysis.stats, lastAnalysisKind, networkOptimization, networkResultKind, simulation?.stats, stats.avgPower]);
  const contextLabel = planningMode === "network"
    ? `Network · ${selectedNetworkTowerIds.length} cells`
    : `Single · Cell ${selectedTowerLabel}`;
  const planSummary = `${formatNumber(settings.frequencyGHz, 1)} GHz · ${formatNumber(settings.txPowerDbm, 0)} dBm · ${formatNumber(settings.radiusMeters, 0)} m`;
  const hasInterferenceData = (interferenceAnalysis.geojson?.features ?? []).length > 0;
  const hasResults = Boolean(simulation?.stats || networkOptimization?.stats || interferenceAnalysis.stats);
  const interferenceUnavailableReason = planningMode !== "network"
    ? "Interference requires Network planning mode"
    : !interferenceApplicable
      ? "Interference is not applicable to 6G research mode"
      : selectedNetworkTowerIds.length < 2
        ? "Select at least two cells"
        : null;
  const coreUnavailableReason = coreLabApplicable ? null : "5G Core is available only in 5G mmWave mode";
  const toolState = {
    setup: { badge: planningMode === "network" ? String(selectedNetworkTowerIds.length) : null },
    propagation: {},
    interference: {
      disabled: Boolean(interferenceUnavailableReason),
      reason: interferenceUnavailableReason,
      badge: hasInterferenceData ? "•" : null,
      tone: "success",
    },
    core: {
      disabled: Boolean(coreUnavailableReason),
      reason: coreUnavailableReason,
      badge: coreLabEnabled ? "•" : null,
      tone: coreLab.status?.state === "connected" ? "success" : "warning",
    },
    results: { badge: hasResults ? "•" : null, tone: "success" },
    data: {},
    report: {},
  };
  const activeToolDefinition = WORKSPACE_TOOLS.find((tool) => tool.id === activeTool) ?? WORKSPACE_TOOLS[0];
  const createPlanningReport = useCallback(
    () =>
      buildPlanningReport({
        activeNetworkTech,
        buildingSummary,
        coreLab,
        coreLabApplicable,
        coreLabEnabled,
        coverageGaps,
        diagnostics: optimizationDiagnostics,
        interferenceAnalysis,
        comparison,
        networkOptimization,
        selectedTower,
        settings,
        simulation,
        stats,
      }),
    [
      activeNetworkTech,
      buildingSummary,
      comparison,
      coreLab,
      coreLabApplicable,
      coreLabEnabled,
      interferenceAnalysis,
      networkOptimization,
      coverageGaps,
      optimizationDiagnostics,
      selectedTower,
      settings,
      simulation,
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
        isBusy={activeRFTask !== null}
        networkTech={activeNetworkTech}
        onDismissError={() => setError("")}
        onOpenResults={() => openResults(resultSummary?.view)}
        onRun={planningMode === "network" ? evaluateNetwork : runSimulation}
        planSummary={planSummary}
        primaryActionLabel={isEvaluatingNetwork ? "Evaluating..." : planningMode === "network" ? "Evaluate Network" : isLoading ? "Running..." : "Run Sector"}
        primaryDisabled={activeRFTask !== null || (planningMode === "network" ? selectedNetworkTowerIds.length < 2 : !selectedTower)}
        resultSummary={resultSummary}
        runState={runState}
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
          />
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
              onViewChange={setActiveResultsView}
              stats={stats}
            />
          ) : null}

          {drawerMode === "tool" && activeTool === "data" ? (
            <DataPanel
              summary={buildingSummary}
              diagnostics={optimizationDiagnostics}
              interferenceModel={interferenceAnalysis.model}
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
    </div>
  );
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
  interferenceAnalysis,
  networkOptimization,
  networkResultKind,
  onViewChange,
  stats,
}) {
  const views = [
    { id: "rf", label: "RF" },
    { id: "optimization", label: "Optimization" },
    { id: "interference", label: "Interference" },
  ];

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
      ) : null}

      {activeView === "optimization" ? (
        <>
          <NetworkOptimizationPanel optimization={networkOptimization} kind={networkResultKind} />
          {!networkOptimization ? <OptimizerBreakdown diagnostics={diagnostics} /> : null}
          <ComparisonPanel comparison={comparison} />
        </>
      ) : null}

      {activeView === "interference" ? (
        interferenceAnalysis?.stats ? (
          <InterferenceResultsPanel analysis={interferenceAnalysis} />
        ) : (
          <p className="empty-note">Run an interference analysis to compare SINR, RSRP, and RSRQ.</p>
        )
      ) : null}
    </section>
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

function CoreLabTool({ applicable, coreLab, enabled, scenarios, startCommand, towerIDs, onRunScenario, onToggle }) {
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
        <p className="selection-note">5G Core controls apply only to the 28 GHz 5G planning mode.</p>
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

function DataPanel({ summary, diagnostics, interferenceModel }) {
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
      </div>
      <p className="data-note">
        Static OSM/OpenCellID-derived files are loaded locally. Demand values combine explicit POI tags
        with residential-density heuristics, so confidence is useful context for optimization results.
      </p>
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
