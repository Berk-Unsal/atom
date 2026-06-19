import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";
import { rxPowerColor } from "../utils/geojson.js";

const ANKARA_CENTER = [39.9208, 32.8541];

export default function MapCanvas({
  towers,
  selectedTower,
  onSelectTower,
  simulation,
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
              color: isSelected ? "#0f172a" : "#0369a1",
              fillColor: isSelected ? "#f8fafc" : "#38bdf8",
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

      <RayGeoJSONLayer simulation={simulation} />
    </MapContainer>
  );
}

function RayGeoJSONLayer({ simulation }) {
  const features = simulation?.features ?? [];
  const layerKey = features
    .map((feature) => `${feature.properties?.ray_index}:${feature.properties?.segment_index}:${feature.properties?.signal_dbm}`)
    .join("|");

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
