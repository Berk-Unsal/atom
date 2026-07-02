import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  FileText,
  PlayCircle,
  RadioTower,
  Server,
  SlidersHorizontal,
} from "lucide-react";
import ControlPanel from "./components/ControlPanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import { is5GCoreFrequency, networkTechLabelForFrequency } from "./utils/networkTech.js";
import { distanceToCentroid, pointInPolygon, polygonCentroid } from "./utils/polygonSelection.js";
import {
  buildPlanningReport,
  buildComparisonBarChartSvg,
  buildComparisonSlopeChartSvg,
  getComparisonMetrics,
  downloadMarkdownReport,
  openPdfReport,
} from "./utils/reportExport.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
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
};

export default function App() {
  const [activeInspectorTab, setActiveInspectorTab] = useState("plan");
  const [planningMode, setPlanningMode] = useState("single");
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [selectionPolygon, setSelectionPolygon] = useState([]);
  const [selectionNotice, setSelectionNotice] = useState("");
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
  const [buildingSummary, setBuildingSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
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

  useEffect(() => {
    let isMounted = true;
    const loadJSON = async (path, label) => {
      const response = await fetch(`${API_BASE_URL}${path}`);
      if (!response.ok) {
        throw new Error(`${label} could not be loaded`);
      }
      return response.json();
    };

    loadJSON("/api/towers", "Tower GeoJSON")
      .then((geojson) => {
        if (!isMounted) {
          return;
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
    fetch(`${API_BASE_URL}/api/buildings/summary`)
      .then((response) => {
        if (!response.ok) {
          return null;
        }
        return response.json();
      })
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

  const simulateForSettings = useCallback(async (tower, nextSettings) => {
    const requestPayload = buildSimulationPayload(tower, nextSettings);
    const [simulationPayload, gapPayload] = await Promise.all([
      postJSON("/api/simulate", requestPayload, "Simulation request failed"),
      postJSON("/api/coverage-gaps", requestPayload, "Coverage gap request failed"),
    ]);
    return { coverageGaps: gapPayload, simulation: simulationPayload };
  }, []);

  const simulateRaysForSettings = useCallback(async (tower, nextSettings) => {
    return postJSON(
      "/api/simulate",
      buildSimulationPayload(tower, nextSettings),
      "Simulation request failed",
    );
  }, []);

  const runSimulation = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const { simulation: simulationPayload, coverageGaps: gapPayload } = await simulateForSettings(
        selectedTower,
        settings,
      );
      setSimulation(simulationPayload);
      setCoverageGaps(gapPayload);
      setNetworkOptimization(null);
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTower, settings, simulateForSettings]);

  const optimizeAzimuth = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    setIsOptimizing(true);
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
      const response = await fetch(`${API_BASE_URL}/api/optimize-azimuth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSimulationPayload(selectedTower, settings)),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Optimization request failed");
      }
      const optimizedSettings = {
        ...settings,
        azimuthDeg: Number(payload.optimal_azimuth),
      };
      const { simulation: optimizedSimulation, coverageGaps: optimizedGaps } =
        await simulateForSettings(selectedTower, optimizedSettings);
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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsOptimizing(false);
    }
  }, [
    coverageGaps,
    optimizationDiagnostics,
    selectedTower,
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

    setIsOptimizing(true);
    setError("");
    try {
      const networkRequest = buildNetworkOptimizationPayload(selectedNetworkTowers, settings);
      const baselinePayload = await postJSON(
        "/api/evaluate-network",
        networkRequest,
        "Network baseline request failed",
      );
      const payload = await postJSON(
        "/api/optimize-network",
        networkRequest,
        "Network optimization request failed",
      );
      const optimizedByID = new Map(
        (payload.optimized_towers ?? []).map((tower) => [String(tower.id), tower]),
      );
      const simulations = await Promise.all(
        selectedNetworkTowers.map((tower) => {
          const optimizedTower = optimizedByID.get(String(tower.cellId ?? tower.id));
          return simulateRaysForSettings(tower, {
            ...settings,
            azimuthDeg: Number(optimizedTower?.optimal_azimuth ?? settings.azimuthDeg),
          });
        }),
      );
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
      setOptimizationDiagnostics(null);
      setComparison({ kind: "network", before: beforeSnapshot, after: afterSnapshot });
      setSimulation(combineNetworkSimulations(simulations));
      setCoverageGaps({ geojson: { type: "FeatureCollection", features: [] }, stats: null });
      setSimulationRevision((current) => current + 1);
      setCoverageGapRevision((current) => current + 1);
      setActiveInspectorTab("results");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsOptimizing(false);
    }
  }, [selectedNetworkTowerIds, settings, simulateRaysForSettings, towers]);

  const selectedNetworkTowers = useMemo(
    () => towers.filter((tower) => selectedNetworkTowerIds.includes(tower.id)),
    [selectedNetworkTowerIds, towers],
  );
  const coreLabApplicable = is5GCoreFrequency(settings.frequencyGHz);

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
    setCoreLab((current) => ({ ...current, isLoading: true, lastError: "" }));
    try {
      const query = buildCoreLabQuery(coreLabTowerIDs, selectedNetworkTowers, selectedTower);
      const [status, topology, sessions, events] = await Promise.all([
        getJSON("/api/core/status", "Core Lab status request failed"),
        getJSON(`/api/core/topology${query}`, "Core Lab topology request failed"),
        getJSON(`/api/core/sessions${query}`, "Core Lab sessions request failed"),
        getJSON("/api/core/events", "Core Lab events request failed"),
      ]);
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
  }, [coreLabApplicable, coreLabEnabled, coreLabTowerIDs, selectedNetworkTowers, selectedTower]);

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
  }, [coreLabApplicable]);

  const runCoreLabScenario = useCallback(async (scenario) => {
    if (!coreLabApplicable) {
      return;
    }
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
      );
      setCoreLab((current) => ({ ...current, scenario }));
      await refreshCoreLab();
    } catch (requestError) {
      setCoreLab((current) => ({
        ...current,
        isLoading: false,
        lastError: requestError.message,
      }));
    }
  }, [coreLabApplicable, coreLabTowerIDs, refreshCoreLab]);

  const resetNetworkArtifacts = useCallback(() => {
    setNetworkOptimization(null);
    setComparison({ before: null, after: null });
  }, []);

  const updateSettings = useCallback((nextSettings) => {
    setOptimizationDiagnostics(null);
    resetNetworkArtifacts();
    setSettings(nextSettings);
  }, [resetNetworkArtifacts]);

  const selectTower = useCallback((tower) => {
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
  }, [planningMode, resetNetworkArtifacts]);

  const changePlanningMode = useCallback((mode) => {
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
  }, [resetNetworkArtifacts, selectedTower]);

  const startAreaSelection = useCallback(() => {
    if (planningMode !== "network") {
      changePlanningMode("network");
    }
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
    setSelectedNetworkTowerIds([]);
    setSelectionPolygon([]);
    setSelectionNotice("");
    resetNetworkArtifacts();
  }, [resetNetworkArtifacts]);

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
    setSelectedTower((current) => selected[0] ?? current);
    resetNetworkArtifacts();
    setIsDrawingSelection(false);
    setSelectionPolygon(finalPolygon);
    setSelectionNotice(
      inside.length > 6
        ? `${inside.length} towers found, nearest 6 selected.`
        : `${selected.length} towers selected from drawn area.`,
    );
  }, [resetNetworkArtifacts, selectionPolygon, towers]);

  const addSelectionPolygonPoint = useCallback((coordinate) => {
    setSelectionPolygon((current) => [...current, coordinate]);
  }, []);

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
  const runState = isLoading ? "Simulating" : isOptimizing ? "Optimizing" : "Ready";
  const hudDemandMetric = networkOptimization?.stats
    ? {
        label: "Overlap",
        value: (networkOptimization.stats.overlap_buildings ?? 0).toLocaleString(),
      }
    : {
        label: "Gaps",
        value: gapStats?.gap_buildings?.toLocaleString() ?? "n/a",
      };
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

  return (
    <main className="app-shell">
      <aside className="control-rail">
        <RailHeader
          activeNetworkTech={activeNetworkTech}
          runState={runState}
          selectedTowerLabel={selectedTowerLabel}
        />

        <InspectorTabs activeTab={activeInspectorTab} onChange={setActiveInspectorTab} />

        <div
          className="inspector-body"
          id={`inspector-panel-${activeInspectorTab}`}
          role="tabpanel"
          aria-labelledby={`inspector-tab-${activeInspectorTab}`}
        >
          {activeInspectorTab === "plan" ? (
            <ControlPanel
              settings={settings}
              onChange={updateSettings}
              onRun={runSimulation}
              onOptimizeAzimuth={optimizeAzimuth}
              isLoading={isLoading}
              isOptimizing={isOptimizing}
              networkSelectionCount={selectedNetworkTowerIds.length}
              onCancelAreaSelection={cancelAreaSelection}
              onClearNetworkSelection={clearNetworkSelection}
              onDrawArea={startAreaSelection}
              onFinishAreaSelection={() => finishAreaSelection()}
              onOptimizeNetwork={optimizeNetwork}
              onPlanningModeChange={changePlanningMode}
              selectionCanFinish={selectionPolygon.length >= 3}
              selectionNotice={selectionNotice}
              planningMode={planningMode}
              isDrawingSelection={isDrawingSelection}
              coreLabEnabled={coreLabEnabled}
              coreLabApplicable={coreLabApplicable}
              coreLabState={coreLab.status?.state ?? "off"}
              coreLabSource={coreLab.status?.source}
              coreLabStartCommand={CORE_LAB_START_COMMAND}
              onToggleCoreLab={toggleCoreLab}
            />
          ) : null}

          {activeInspectorTab === "results" ? (
            <ResultsPanel
              comparison={comparison}
              diagnostics={optimizationDiagnostics}
              networkOptimization={networkOptimization}
              onExportMarkdown={exportMarkdownReport}
              onExportPdf={exportPdfReport}
              gapStats={gapStats}
              stats={stats}
              coreLab={coreLab}
              coreLabApplicable={coreLabApplicable}
              coreLabEnabled={coreLabEnabled}
              coreLabScenarios={CORE_LAB_SCENARIOS}
              coreLabStartCommand={CORE_LAB_START_COMMAND}
              coreLabTowerIDs={coreLabTowerIDs}
              onRunCoreScenario={runCoreLabScenario}
            />
          ) : null}

          {activeInspectorTab === "data" ? (
            <DataPanel summary={buildingSummary} diagnostics={optimizationDiagnostics} />
          ) : null}
        </div>

        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
      </aside>

      <section className="map-stage" aria-label="Ankara propagation map">
        <div className="map-hud" aria-label="Map simulation status">
          <div className="hud-cluster">
            <RadioTower size={18} />
            <div>
              <span>Cell {selectedTowerLabel}</span>
              <strong>{activeNetworkTech}</strong>
            </div>
          </div>
          <div className="hud-metrics">
            <HudMetric label="Rays" value={stats.rayCount.toLocaleString()} />
            <HudMetric
              label="Avg Rx"
              value={stats.avgPower === null ? "n/a" : `${stats.avgPower.toFixed(1)} dBm`}
            />
            <HudMetric
              label="Range"
              value={stats.maxRange === null ? "n/a" : `${stats.maxRange.toFixed(1)} m`}
            />
            <HudMetric label={hudDemandMetric.label} value={hudDemandMetric.value} />
          </div>
        </div>
        <MapCanvas
          towers={towers}
          selectedTower={selectedTower}
          selectedNetworkTowerIds={selectedNetworkTowerIds}
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
        />
      </section>
    </main>
  );
}

function RailHeader({ activeNetworkTech, runState, selectedTowerLabel }) {
  return (
    <header className="rail-header">
      <div className="brand-block">
        <img src={APP_ICON_URL} alt="" aria-hidden="true" />
        <div>
          <h1>A.T.O.M</h1>
          <p>Ankara Telecom Optimization Model</p>
          <a
            className="brand-signature"
            href="https://berkunsal.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            by Berk Ünsal
          </a>
        </div>
      </div>

      <section className="active-context" aria-label="Active simulation context">
        <div>
          <span>Cell</span>
          <strong>{selectedTowerLabel}</strong>
        </div>
        <div>
          <span>Network</span>
          <strong>{activeNetworkTech}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{runState}</strong>
        </div>
      </section>
    </header>
  );
}

function InspectorTabs({ activeTab, onChange }) {
  const tabs = [
    { id: "plan", label: "Plan", icon: SlidersHorizontal },
    { id: "results", label: "Results", icon: BarChart3 },
    { id: "data", label: "Data", icon: Database },
  ];

  return (
    <nav className="inspector-tabs" aria-label="Control center sections" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`inspector-tab-${tab.id}`}
            type="button"
            role="tab"
            className={isActive ? "active" : ""}
            aria-controls={`inspector-panel-${tab.id}`}
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={15} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function buildSimulationPayload(selectedTower, settings) {
  return {
    tower_lon: selectedTower.coordinates[0],
    tower_lat: selectedTower.coordinates[1],
    rays: settings.rayCount,
    radius_m: settings.radiusMeters,
    frequency_ghz: settings.frequencyGHz,
    tx_power_dbm: settings.txPowerDbm,
    azimuth: settings.azimuthDeg,
    beam_width: settings.beamWidthDeg,
  };
}

function buildNetworkOptimizationPayload(selectedNetworkTowers, settings) {
  return {
    towers: selectedNetworkTowers.map((tower) => ({
      id: String(tower.cellId ?? tower.id),
      tower_lon: tower.coordinates[0],
      tower_lat: tower.coordinates[1],
      azimuth: settings.azimuthDeg,
    })),
    rays: settings.rayCount,
    radius_m: settings.radiusMeters,
    frequency_ghz: settings.frequencyGHz,
    tx_power_dbm: settings.txPowerDbm,
    beam_width: settings.beamWidthDeg,
  };
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

async function postJSON(path, payload, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json();
  if (!response.ok) {
    throw new Error(responsePayload.error ?? fallbackMessage);
  }
  return responsePayload;
}

async function getJSON(path, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const responsePayload = await response.json();
  if (!response.ok) {
    throw new Error(responsePayload.error ?? fallbackMessage);
  }
  return responsePayload;
}

function ResultsPanel({
  comparison,
  coreLab,
  coreLabApplicable,
  coreLabEnabled,
  coreLabScenarios,
  coreLabStartCommand,
  coreLabTowerIDs,
  diagnostics,
  gapStats,
  networkOptimization,
  onExportMarkdown,
  onExportPdf,
  onRunCoreScenario,
  stats,
}) {
  return (
    <section className="results-panel" aria-label="Simulation results">
      <div className="panel-title">
        <BarChart3 size={16} />
        <span>Simulation Results</span>
      </div>
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
      {networkOptimization ? null : <CoverageGapPanel stats={gapStats} />}
      {networkOptimization ? null : <OptimizerBreakdown diagnostics={diagnostics} />}
      <NetworkOptimizationPanel optimization={networkOptimization} />
      <ComparisonPanel comparison={comparison} />
      <CoreLabPanel
        coreLab={coreLab}
        applicable={coreLabApplicable}
        enabled={coreLabEnabled}
        scenarios={coreLabScenarios}
        startCommand={coreLabStartCommand}
        towerIDs={coreLabTowerIDs}
        onRunScenario={onRunCoreScenario}
      />
      <ReportExportPanel onExportMarkdown={onExportMarkdown} onExportPdf={onExportPdf} />
    </section>
  );
}

function NetworkOptimizationPanel({ optimization }) {
  if (!optimization) {
    return null;
  }
  const stats = optimization.stats ?? {};
  return (
    <section className="network-card" aria-label="Network optimization summary">
      <div className="panel-title">
        <RadioTower size={16} />
        <span>Network Optimization</span>
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

function DataPanel({ summary, diagnostics }) {
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

function HudMetric({ label, value }) {
  return (
    <div className="hud-metric">
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
