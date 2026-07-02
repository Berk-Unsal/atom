import { useEffect } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import { rxPowerColor } from "../utils/geojson.js";

const ANKARA_CENTER = [39.9208, 32.8541];

export default function MapCanvas({
  towers,
  selectedTower,
  selectedNetworkTowerIds = [],
  onSelectTower,
  simulation,
  rayLayerKey,
  coverageGaps,
  coverageGapLayerKey,
  activeNetworkTech,
  isDrawingSelection,
  onAddSelectionPolygonPoint,
  onCancelAreaSelection,
  onFinishAreaSelection,
  planningMode,
  selectionPolygon,
  coreLabTopology,
}) {
  return (
    <MapContainer center={ANKARA_CENTER} zoom={12} minZoom={10} maxZoom={18} className="leaflet-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SelectionPolygonLayer
        isDrawing={isDrawingSelection}
        onAddPoint={onAddSelectionPolygonPoint}
        onCancel={onCancelAreaSelection}
        onFinish={onFinishAreaSelection}
        polygon={selectionPolygon}
      />

      {towers.map((tower) => {
        const [lon, lat] = tower.coordinates;
        const isSelected = selectedTower?.id === tower.id;
        const isNetworkSelected = selectedNetworkTowerIds.includes(tower.id);
        return (
          <CircleMarker
            key={tower.id}
            center={[lat, lon]}
            radius={isNetworkSelected ? 8 : isSelected ? 8 : 5}
            pathOptions={{
              color: isNetworkSelected ? "#b45309" : isSelected ? "#0b4f49" : "#1d4ed8",
              fillColor: isNetworkSelected ? "#fef3c7" : isSelected ? "#ffffff" : "#60a5fa",
              fillOpacity: isNetworkSelected || isSelected ? 1 : 0.82,
              weight: isNetworkSelected || isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: (event) => {
                if (isDrawingSelection) {
                  return;
                }
                event.originalEvent?.stopPropagation();
                onSelectTower(tower);
              },
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
                {planningMode === "network" ? (
                  <div>
                    <dt>Cluster</dt>
                    <dd>{isNetworkSelected ? "Selected" : "Click to add"}</dd>
                  </div>
                ) : null}
              </dl>
            </Popup>
          </CircleMarker>
        );
      })}

      <RayGeoJSONLayer simulation={simulation} layerKey={rayLayerKey} />
      <CommunicationPathLayer topology={coreLabTopology} towers={towers} />
      <CoverageGapLayer gaps={coverageGaps} layerKey={coverageGapLayerKey} />
    </MapContainer>
  );
}

function CommunicationPathLayer({ topology, towers }) {
  const routeDecisions = topology?.route_decisions ?? [];
  if (routeDecisions.length === 0) {
    return null;
  }

  const towerByGnbID = new Map();
  towers.forEach((tower) => {
    const towerID = String(tower.cellId ?? tower.id);
    towerByGnbID.set(`gNB-${towerID}`, tower);
  });

  return routeDecisions.map((route) => {
    const fromTower = towerByGnbID.get(route.from);
    const toTower = towerByGnbID.get(route.to);
    if (!fromTower || !toTower) {
      return null;
    }
    const [fromLon, fromLat] = fromTower.coordinates;
    const [toLon, toLat] = toTower.coordinates;
    const isFallback = route.route_type === "ng_fallback";
    const isDegraded = route.status === "degraded" || route.status === "down";
    return (
      <Polyline
        key={`${route.from}-${route.to}-${route.route_type}-${route.status}`}
        positions={[
          [fromLat, fromLon],
          [toLat, toLon],
        ]}
        pathOptions={{
          color: isFallback ? "#be123c" : "#0f766e",
          dashArray: isFallback ? "8 8" : undefined,
          opacity: isDegraded ? 0.9 : 0.82,
          weight: isFallback ? 4 : 5,
        }}
      >
        <Popup>
          <dl className="path-popup">
            <div>
              <dt>Route</dt>
              <dd>{formatRouteType(route.route_type)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{route.status ?? "active"}</dd>
            </div>
            <div>
              <dt>Interfaces</dt>
              <dd>{isFallback ? "N2 via AMF" : "Xn-C / Xn-U"}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{route.reason ?? "selected 5G neighbor pair"}</dd>
            </div>
          </dl>
        </Popup>
      </Polyline>
    );
  });
}

function SelectionPolygonLayer({ isDrawing, onAddPoint, onCancel, onFinish, polygon }) {
  useMapEvents({
    click(event) {
      if (!isDrawing) {
        return;
      }
      onAddPoint([event.latlng.lng, event.latlng.lat]);
    },
    dblclick(event) {
      if (!isDrawing) {
        return;
      }
      event.originalEvent?.preventDefault();
      onFinish(polygon);
    },
  });

  useEffect(() => {
    if (!isDrawing) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel();
      }
      if (event.key === "Enter") {
        onFinish(polygon);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, onCancel, onFinish, polygon]);

  if (!Array.isArray(polygon) || polygon.length === 0) {
    return null;
  }

  const positions = polygon.map(([lon, lat]) => [lat, lon]);
  return (
    <>
      {positions.length >= 3 ? (
        <Polygon
          positions={positions}
          pathOptions={{
            color: "#b45309",
            fillColor: "#f59e0b",
            fillOpacity: 0.15,
            opacity: 0.9,
            weight: 2,
          }}
        />
      ) : (
        <Polyline
          positions={positions}
          pathOptions={{
            color: "#b45309",
            opacity: 0.9,
            weight: 2,
          }}
        />
      )}
      {positions.map((position, index) => (
        <CircleMarker
          key={`${position[0]}-${position[1]}-${index}`}
          center={position}
          radius={4}
          pathOptions={{
            color: "#92400e",
            fillColor: "#f59e0b",
            fillOpacity: 0.95,
            weight: 2,
          }}
        />
      ))}
    </>
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

function formatRouteType(value) {
  return String(value ?? "direct_xn")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
