import { useCallback, useEffect, useMemo, useState } from "react";
import { RadioTower, RefreshCw } from "lucide-react";
import ControlPanel from "./components/ControlPanel.jsx";
import MapCanvas from "./components/MapCanvas.jsx";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const DEFAULT_SIMULATION = {
  frequencyGHz: 28,
  txPowerDbm: 30,
  rayCount: 120,
  radiusMeters: 400,
};

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SIMULATION);
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState(null);
  const [simulation, setSimulation] = useState({ type: "FeatureCollection", features: [] });
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    if (selectedTower) {
      runSimulation();
    }
  }, [selectedTower, runSimulation]);

  const stats = useMemo(() => {
    const rays = simulation?.features ?? [];
    const blocked = rays.filter((ray) => ray.properties?.is_blocked).length;
    const avgPower =
      rays.length === 0
        ? null
        : rays.reduce((sum, ray) => sum + ray.properties.signal_dbm, 0) / rays.length;

    return {
      towerCount: towers.length,
      rayCount: rays.length,
      blocked,
      avgPower,
      blockedRatio: rays.length === 0 ? 0 : Math.round((blocked / rays.length) * 100),
    };
  }, [simulation, towers]);

  return (
    <main className="app-shell">
      <aside className="control-rail">
        <div className="brand-block">
          <RadioTower size={28} strokeWidth={1.8} />
          <div>
            <h1>mmWave AI Propagation Predictor</h1>
            <p>Ankara core simulation</p>
          </div>
        </div>

        <ControlPanel
          settings={settings}
          onChange={setSettings}
          onRun={runSimulation}
          isLoading={isLoading}
        />

        <section className="stats-grid" aria-label="Simulation stats">
          <Stat label="Towers" value={stats.towerCount} />
          <Stat label="Rays" value={stats.rayCount} />
          <Stat label="Blocked" value={`${stats.blockedRatio}%`} />
          <Stat
            label="Avg Rx"
            value={stats.avgPower === null ? "n/a" : `${stats.avgPower.toFixed(1)} dBm`}
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
          simulation={simulation}
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
