import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import ControlPanel from "./components/ControlPanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import { networkTechLabelForFrequency } from "./utils/networkTech.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const APP_ICON_URL = "/icon/icon.svg";

const DEFAULT_SIMULATION = {
  frequencyGHz: 28,
  txPowerDbm: 30,
  rayCount: 120,
  radiusMeters: 400,
  azimuthDeg: 90,
  beamWidthDeg: 120,
};

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SIMULATION);
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState(null);
  const [simulation, setSimulation] = useState({
    geojson: { type: "FeatureCollection", features: [] },
    stats: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/api/towers`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Tower GeoJSON could not be loaded");
        }
        return response.json();
      })
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

  const runSimulation = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tower_lon: selectedTower.coordinates[0],
          tower_lat: selectedTower.coordinates[1],
          rays: settings.rayCount,
          radius_m: settings.radiusMeters,
          frequency_ghz: settings.frequencyGHz,
          tx_power_dbm: settings.txPowerDbm,
          azimuth: settings.azimuthDeg,
          beam_width: settings.beamWidthDeg,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Simulation request failed");
      }
      setSimulation(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTower, settings]);

  const optimizeAzimuth = useCallback(async () => {
    if (!selectedTower) {
      setError("No tower selected");
      return;
    }

    setIsOptimizing(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/optimize-azimuth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tower_lon: selectedTower.coordinates[0],
          tower_lat: selectedTower.coordinates[1],
          rays: settings.rayCount,
          radius_m: settings.radiusMeters,
          frequency_ghz: settings.frequencyGHz,
          tx_power_dbm: settings.txPowerDbm,
          azimuth: settings.azimuthDeg,
          beam_width: settings.beamWidthDeg,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Optimization request failed");
      }
      setSettings((current) => ({
        ...current,
        azimuthDeg: Number(payload.optimal_azimuth),
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsOptimizing(false);
    }
  }, [selectedTower, settings]);

  useEffect(() => {
    if (selectedTower) {
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
  const activeNetworkTech = networkTechLabelForFrequency(settings.frequencyGHz);

  return (
    <main className="app-shell">
      <aside className="control-rail">
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

        <ControlPanel
          settings={settings}
          onChange={setSettings}
          onRun={runSimulation}
          onOptimizeAzimuth={optimizeAzimuth}
          isLoading={isLoading}
          isOptimizing={isOptimizing}
        />

        <section className="stats-grid" aria-label="Simulation stats">
          <Stat label="Blocked" value={`${stats.blockedRatio}%`} />
          <Stat
            label="Avg Rx"
            value={stats.avgPower === null ? "n/a" : `${stats.avgPower.toFixed(1)} dBm`}
          />
          <Stat
            label="Max Range"
            value={stats.maxRange === null ? "n/a" : `${stats.maxRange.toFixed(1)} m`}
          />
          <Stat
            label="Min Range"
            value={stats.minRange === null ? "n/a" : `${stats.minRange.toFixed(1)} m`}
          />
        </section>

        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <button className="refresh-button" onClick={runSimulation} disabled={isLoading}>
          <RefreshCw size={18} className={isLoading ? "spin" : ""} />
          <span>{isLoading ? "Simulating" : "Run simulation"}</span>
        </button>
      </aside>

      <section className="map-stage" aria-label="Ankara propagation map">
        <MapCanvas
          towers={towers}
          selectedTower={selectedTower}
          onSelectTower={setSelectedTower}
          simulation={simulation.geojson}
          activeNetworkTech={activeNetworkTech}
        />
      </section>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
