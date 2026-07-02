import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";
import { rxPowerColor } from "../utils/geojson.js";

const ANKARA_CENTER = [39.9208, 32.8541];

export default function MapCanvas({
  towers,
  selectedTower,
  onSelectTower,
  simulation,
  rayLayerKey,
  coverageGaps,
  coverageGapLayerKey,
  activeNetworkTech,
}) {
  return (
    <MapContainer center={ANKARA_CENTER} zoom={12} minZoom={10} maxZoom={18} className="leaflet-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {towers.map((tower) => {
        const [lon, lat] = tower.coordinates;
        const isSelected = selectedTower?.id === tower.id;
        return (
          <CircleMarker
            key={tower.id}
            center={[lat, lon]}
            radius={isSelected ? 8 : 5}
            pathOptions={{
              color: isSelected ? "#0b4f49" : "#1d4ed8",
              fillColor: isSelected ? "#ffffff" : "#60a5fa",
              fillOpacity: isSelected ? 1 : 0.82,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: () => onSelectTower(tower),
            }}
          >
            <Popup>
              <dl className="tower-popup">
                <div>
                  <dt>Cell ID</dt>
                  <dd>{tower.cellId}</dd>
                </div>
                <div>
                  <dt>Active Node</dt>
                  <dd>{activeNetworkTech}</dd>
                </div>
              </dl>
            </Popup>
          </CircleMarker>
        );
      })}

      <RayGeoJSONLayer simulation={simulation} layerKey={rayLayerKey} />
      <CoverageGapLayer gaps={coverageGaps} layerKey={coverageGapLayerKey} />
    </MapContainer>
  );
}

function RayGeoJSONLayer({ simulation, layerKey }) {
  const features = simulation?.features ?? [];
  if (features.length === 0) {
    return null;
  }

  return (
    <GeoJSON
      key={layerKey}
      data={simulation}
      style={(feature) => ({
        color: rxPowerColor(Number(feature?.properties?.signal_dbm ?? -120)),
        opacity: 0.8,
        weight: 4,
        lineCap: "round",
        lineJoin: "round",
      })}
    />
  );
}

function CoverageGapLayer({ gaps, layerKey }) {
  const features = gaps?.features ?? [];
  if (features.length === 0) {
    return null;
  }

  return features.map((feature, index) => {
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (typeof lon !== "number" || typeof lat !== "number") {
      return null;
    }
    const properties = feature.properties ?? {};
    const isOutage = properties.severity === "outage";
    const demand = Number(properties.total_demand ?? 0);
    return (
      <CircleMarker
        key={`${layerKey}-${properties.building_id ?? index}`}
        center={[lat, lon]}
        radius={Math.max(5, Math.min(12, 5 + demand / 35))}
        pathOptions={{
          color: isOutage ? "#881337" : "#b45309",
          fillColor: isOutage ? "#e11d48" : "#f59e0b",
          fillOpacity: 0.78,
          opacity: 0.95,
          weight: 2,
        }}
      >
        <Popup>
          <dl className="gap-popup">
            <div>
              <dt>Coverage Gap</dt>
              <dd>{properties.severity ?? "weak"}</dd>
            </div>
            <div>
              <dt>Rx</dt>
              <dd>{formatNumber(properties.rx_dbm)} dBm</dd>
            </div>
            <div>
              <dt>Demand</dt>
              <dd>{formatNumber(properties.total_demand)}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{properties.reason ?? "demand"}</dd>
            </div>
          </dl>
        </Popup>
      </CircleMarker>
    );
  });
}

function formatNumber(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return "n/a";
  }
  return number.toFixed(1);
}
