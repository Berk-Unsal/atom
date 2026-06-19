import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { rxPowerColor } from "../utils/geojson.js";

const ANKARA_CENTER = [39.9208, 32.8541];

export default function MapCanvas({ towers, selectedTower, onSelectTower, simulation }) {
  return (
    <MapContainer center={ANKARA_CENTER} zoom={12} minZoom={10} maxZoom={18} className="leaflet-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SignalCanvasLayer simulation={simulation} />
      {towers.map((tower) => {
        const [lon, lat] = tower.coordinates;
        const isSelected = selectedTower?.id === tower.id;
        return (
          <CircleMarker
            key={tower.id}
            center={[lat, lon]}
            radius={isSelected ? 8 : 5}
            pathOptions={{
              color: tower.isSimulated ? "#d97706" : "#0369a1",
              fillColor: tower.isSimulated ? "#f59e0b" : "#38bdf8",
              fillOpacity: isSelected ? 1 : 0.82,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: () => onSelectTower(tower),
            }}
          >
            <Popup>
              <strong>Cell {tower.cellId}</strong>
              <br />
              {tower.radioType}
              {tower.isSimulated ? " simulated 5G" : ""}
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

function SignalCanvasLayer({ simulation }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const layerRef = useRef(null);

  const rays = useMemo(
    () =>
      (simulation?.features ?? []).filter(
        (feature) =>
          feature.geometry?.type === "LineString" &&
          Array.isArray(feature.geometry.coordinates) &&
          feature.geometry.coordinates.length >= 2,
      ),
    [simulation],
  );

  useEffect(() => {
    const pane = map.getPanes().overlayPane;
    const canvas = L.DomUtil.create("canvas", "signal-canvas");
    canvasRef.current = canvas;
    layerRef.current = pane;
    pane.appendChild(canvas);

    return () => {
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
    };
  }, [map]);

  useEffect(() => {
    if (!canvasRef.current) {
      return undefined;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const ratio = window.devicePixelRatio || 1;
      canvas.width = size.x * ratio;
      canvas.height = size.y * ratio;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;

      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      drawGeoJSONRays(ctx, map, rays);
    };

    draw();
    map.on("move zoom resize", draw);
    return () => {
      map.off("move zoom resize", draw);
    };
  }, [rays, map]);

  return null;
}

function drawGeoJSONRays(ctx, map, rays) {
  ctx.save();
  for (const ray of rays) {
    const coordinates = ray.geometry.coordinates;
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    if (!start || !end) {
      continue;
    }

    const startPoint = map.latLngToContainerPoint([start[1], start[0]]);
    const endPoint = map.latLngToContainerPoint([end[1], end[0]]);
    const isBlocked = Boolean(ray.properties?.is_blocked);
    const signal = Number(ray.properties?.signal_dbm ?? -120);

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.strokeStyle = rxPowerColor(signal, isBlocked);
    ctx.globalAlpha = isBlocked ? 0.52 : 0.42;
    ctx.lineWidth = isBlocked ? 2 : 1.3;
    ctx.stroke();
  }
  ctx.restore();
}
