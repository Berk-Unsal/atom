import { Fragment, useEffect, useMemo, useState } from "react";
import { circleMarker, divIcon, latLngBounds } from "leaflet";
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { rxPowerColor } from "../utils/geojson.js";
import { getJSON } from "../utils/apiClient.js";
import { formatNumber } from "../utils/appWorkspace.js";
import { recommendationMapFeatures } from "../utils/recommendations.js";

const ANKARA_CENTER = [39.9208, 32.8541];

export default function MapCanvas({
  towers,
  selectedTower,
  selectedNetworkTowerIds = [],
  selectedTowerOrder,
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
  layerVisibility,
  selectedMapObject,
  onSelectMapObject,
  fitRequestVersion,
  interference,
  interferenceDemand,
  interferenceLayerKey,
  interferenceMetric,
  interferenceModel,
  measurements,
  recommendations,
	isPlacingCell,
	onPlaceCell,
	onMoveTower,
  isSelectingPathEndpoint,
  onSelectPathEndpoint,
  pathProfile,
  coverageSurface,
  surfaceOpacity = 0.62,
  surfaceDisplayThresholdDBm = -110,
}) {
  return (
    <MapContainer center={ANKARA_CENTER} zoom={12} minZoom={10} maxZoom={18} className="leaflet-map" preferCanvas>
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
		<CellPlacementLayer active={isPlacingCell} onPlace={onPlaceCell} />
      <PathEndpointSelectionLayer active={isSelectingPathEndpoint} onSelect={onSelectPathEndpoint} />
      <FitSelectionLayer
        fitRequestVersion={fitRequestVersion}
        selectedNetworkTowerIds={selectedNetworkTowerIds}
        selectedTower={selectedTower}
        towers={towers}
      />

      {layerVisibility?.buildings ? <ViewportBuildingLayer /> : null}

      {layerVisibility?.surfaces === false ? null : (
        <CoverageSurfaceLayer
          displayThresholdDBm={surfaceDisplayThresholdDBm}
          opacity={surfaceOpacity}
          surface={coverageSurface}
        />
      )}

      {layerVisibility?.interference === false ? null : (
        <InterferenceLayer
          demand={interferenceDemand}
          layerKey={interferenceLayerKey}
          metric={interferenceMetric}
          model={interferenceModel}
          onSelectMapObject={onSelectMapObject}
          selectedMapObject={selectedMapObject}
          surface={interference}
        />
      )}

      {layerVisibility?.measurements === false ? null : (
        <MeasurementLayer
          measurements={measurements}
          onSelectMapObject={onSelectMapObject}
          selectedMapObject={selectedMapObject}
        />
      )}

      <RecommendationLayer
        onSelectMapObject={onSelectMapObject}
        recommendations={recommendations}
        selectedMapObject={selectedMapObject}
      />

      {towers.map((tower) => {
        const [lon, lat] = tower.coordinates;
        const isSelected = selectedTower?.id === tower.id;
        const isNetworkSelected = selectedNetworkTowerIds.includes(tower.id);
        const isNetworkVisible = layerVisibility?.selectedCells !== false && isNetworkSelected;
        const order = selectedTowerOrder?.get(tower.id);
        const isInspectorSelected = selectedMapObject?.type === "tower" && selectedMapObject?.payload?.tower?.id === tower.id;
        return (
          <Fragment key={tower.id}>
            <CircleMarker
              center={[lat, lon]}
              radius={isNetworkVisible || isSelected ? 8 : 5}
              pathOptions={{
                color: isInspectorSelected ? "#be123c" : isNetworkVisible ? "#b45309" : isSelected ? "#0b4f49" : "#1d4ed8",
                fillColor: isNetworkVisible ? "#fef3c7" : isSelected ? "#ffffff" : "#60a5fa",
                fillOpacity: isNetworkVisible || isSelected ? 1 : 0.82,
                weight: isInspectorSelected ? 4 : isNetworkVisible || isSelected ? 3 : 2,
              }}
              eventHandlers={{
                click: (event) => {
                  if (isDrawingSelection) {
                    return;
                  }
                  event.originalEvent?.stopPropagation();
                  onSelectMapObject?.({
                    type: "tower",
                    payload: {
                      tower,
                      activeNetworkTech,
                      isNetworkSelected: planningMode === "network" ? !isNetworkSelected : isNetworkSelected,
                      order:
                        planningMode === "network" && !isNetworkSelected
                          ? order ?? selectedNetworkTowerIds.length + 1
                          : planningMode === "network"
                            ? null
                            : order,
                    },
                  });
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
            {isNetworkVisible && order ? (
              <Marker
                position={[lat, lon]}
                interactive={false}
                icon={divIcon({
                  className: "tower-order-badge",
                  html: `<span>${order}</span>`,
                  iconAnchor: [8, 22],
                })}
              />
            ) : null}
			{isSelected && tower.editable ? (
				<Marker
					position={[lat, lon]}
					draggable
					icon={divIcon({ className: "inventory-drag-marker", html: "<span></span>", iconAnchor: [12, 12] })}
					eventHandlers={{
						dragend: (event) => {
							const position = event.target.getLatLng();
							onMoveTower?.(tower.id, [position.lng, position.lat]);
						},
					}}
				/>
			) : null}
          </Fragment>
        );
      })}

      {layerVisibility?.rays === false ? null : <RayGeoJSONLayer simulation={simulation} layerKey={rayLayerKey} />}
      {layerVisibility?.communicationPaths === false ? null : (
        <CommunicationPathLayer
          onSelectMapObject={onSelectMapObject}
          selectedMapObject={selectedMapObject}
          topology={coreLabTopology}
          towers={towers}
        />
      )}
      {layerVisibility?.gaps === false ? null : (
        <CoverageGapLayer
          gaps={coverageGaps}
          layerKey={coverageGapLayerKey}
          onSelectMapObject={onSelectMapObject}
          selectedMapObject={selectedMapObject}
        />
      )}
      <PathProfileMapLayer profile={pathProfile} />
    </MapContainer>
  );
}

function ViewportBuildingLayer() {
  const map = useMap();
  const [collection, setCollection] = useState({ type: "FeatureCollection", features: [] });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let controller = null;
    let timeoutID;
    let active = true;
    const load = () => {
      window.clearTimeout(timeoutID);
      timeoutID = window.setTimeout(async () => {
        const bounds = map.getBounds();
        if (map.getZoom() < 12 || map.distance(bounds.getSouthWest(), bounds.getNorthEast()) > 48_000) {
          if (active) setCollection({ type: "FeatureCollection", features: [] });
          return;
        }
        controller?.abort();
        controller = new AbortController();
        const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((value) => value.toFixed(7)).join(",");
        try {
          const payload = await getJSON(`/api/collections/buildings/items?bbox=${bbox}&limit=5000`, "Viewport buildings could not be loaded", controller.signal);
          if (active && Array.isArray(payload?.features)) {
            setCollection(payload);
            setRevision((current) => current + 1);
          }
        } catch (error) {
          if (active && error?.name !== "AbortError") setCollection({ type: "FeatureCollection", features: [] });
        }
      }, 220);
    };
    load();
    map.on("moveend zoomend", load);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timeoutID);
      map.off("moveend zoomend", load);
    };
  }, [map]);
  if (!collection.features.length) return null;
  return (
    <GeoJSON
      key={revision}
      data={collection}
      interactive={false}
      style={(feature) => buildingOverlayStyle(feature?.properties)}
    />
  );
}

function buildingOverlayStyle(properties = {}) {
  const materialColors = {
    brick: "#b45309",
    concrete: "#64748b",
    glass: "#0891b2",
    metal: "#475569",
    wood: "#a16207",
    unknown: "#78716c",
  };
  const height = Number(properties.height_m);
  return {
    color: materialColors[properties.material] ?? materialColors.unknown,
    fillColor: materialColors[properties.material] ?? materialColors.unknown,
    fillOpacity: Math.min(0.38, 0.08 + Math.max(0, Number.isFinite(height) ? height : 0) / 120),
    opacity: 0.52,
    weight: 0.7,
  };
}

function CoverageSurfaceLayer({ displayThresholdDBm, opacity, surface }) {
  const grid = surface?.grid;
  const imageURL = useMemo(() => coverageSurfaceImageURL(grid, displayThresholdDBm), [grid, displayThresholdDBm]);
  if (!grid || !imageURL || !Array.isArray(grid.bounds) || grid.bounds.length !== 4) return null;
  const contours = {
    type: "FeatureCollection",
    features: (surface?.contours?.features ?? []).filter((feature) => Number(feature.properties?.threshold_dbm) >= displayThresholdDBm),
  };
  return (
    <>
      <ImageOverlay
        bounds={[[grid.bounds[1], grid.bounds[0]], [grid.bounds[3], grid.bounds[2]]]}
        opacity={opacity}
        url={imageURL}
        zIndex={220}
      />
      <GeoJSON
        key={`${displayThresholdDBm}-${contours.features.length}`}
        data={contours}
        interactive={false}
        style={(feature) => ({ color: surfaceSignalColor(feature?.properties?.threshold_dbm), opacity: Math.min(1, opacity + 0.25), weight: 1.5 })}
      />
    </>
  );
}

function coverageSurfaceImageURL(grid, displayThresholdDBm) {
  if (!grid || !Array.isArray(grid.values) || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = grid.width;
    canvas.height = grid.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(grid.width, grid.height);
    for (let sourceRow = 0; sourceRow < grid.height; sourceRow += 1) {
      const targetRow = grid.height - sourceRow - 1;
      for (let column = 0; column < grid.width; column += 1) {
        const value = Number(grid.values[sourceRow * grid.width + column]);
        const target = (targetRow * grid.width + column) * 4;
        if (!Number.isFinite(value) || value === Number(grid.nodata) || value < displayThresholdDBm) {
          image.data[target + 3] = 0;
          continue;
        }
        const [red, green, blue] = surfaceSignalRGB(value);
        image.data[target] = red;
        image.data[target + 1] = green;
        image.data[target + 2] = blue;
        image.data[target + 3] = 220;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function surfaceSignalRGB(value) {
  if (value >= -80) return [5, 150, 105];
  if (value >= -90) return [34, 197, 94];
  if (value >= -100) return [245, 158, 11];
  if (value >= -110) return [225, 29, 72];
  return [126, 34, 206];
}

function surfaceSignalColor(value) {
  const [red, green, blue] = surfaceSignalRGB(Number(value));
  return `rgb(${red} ${green} ${blue})`;
}

function CellPlacementLayer({ active, onPlace }) {
	useMapEvents({
		click: (event) => {
			if (active) onPlace?.([event.latlng.lng, event.latlng.lat]);
		},
	});
	return null;
}

function PathEndpointSelectionLayer({ active, onSelect }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const previous = container.style.cursor;
    if (active) container.style.cursor = "crosshair";
    return () => { container.style.cursor = previous; };
  }, [active, map]);
  useMapEvents({
    click: (event) => {
      if (active) onSelect?.([event.latlng.lng, event.latlng.lat]);
    },
  });
  return null;
}

function PathProfileMapLayer({ profile }) {
  const samples = profile?.samples ?? [];
  if (samples.length < 2) return null;
  const positions = samples.map((sample) => [sample.lat, sample.lon]);
  const dominantDistance = Number(profile?.dominant_obstruction?.distance_m);
  const dominant = Number.isFinite(dominantDistance)
    ? samples.reduce((closest, sample) => Math.abs(Number(sample.distance_m) - dominantDistance) < Math.abs(Number(closest.distance_m) - dominantDistance) ? sample : closest, samples[0])
    : null;
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color: "#0f766e", weight: 4, opacity: 0.9, dashArray: "8 6" }} interactive={false} />
      {dominant ? <CircleMarker center={[dominant.lat, dominant.lon]} radius={7} pathOptions={{ color: "#881337", fillColor: "#fb7185", fillOpacity: 0.9, weight: 3 }} interactive={false} /> : null}
    </>
  );
}

function RecommendationLayer({ onSelectMapObject, recommendations, selectedMapObject }) {
  const features = recommendationMapFeatures(recommendations);
  return features.map((feature, index) => {
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const properties = feature.properties ?? {};
    const selected = selectedMapObject?.type === "site_recommendation"
      && selectedMapObject?.payload?.properties?.id === properties.id;
    return (
      <CircleMarker
        key={`recommendation-${properties.id ?? index}`}
        center={[lat, lon]}
        radius={10}
        pathOptions={{
          color: selected ? "#0f172a" : "#6d28d9",
          fillColor: "#c4b5fd",
          fillOpacity: 0.9,
          weight: selected ? 4 : 3,
          dashArray: "4 3",
        }}
        eventHandlers={{
          click: (event) => {
            event.originalEvent?.stopPropagation();
            onSelectMapObject?.({ type: "site_recommendation", payload: { properties, coordinates: [lon, lat] } });
          },
        }}
      >
        <Popup>Candidate {properties.cell_id ?? properties.id}: {formatNumber(properties.marginal_network_score)} score gain</Popup>
      </CircleMarker>
    );
  });
}

function MeasurementLayer({ measurements, onSelectMapObject, selectedMapObject }) {
  const features = measurements?.features ?? [];
  return features.map((feature, index) => {
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const properties = feature.properties ?? {};
    const residual = Math.abs(Number(properties.residual_db));
    const color = properties.status !== "valid" ? "#64748b" : residual > 10 ? "#be123c" : residual > 5 ? "#d97706" : "#0f766e";
    const selected = selectedMapObject?.type === "measurement_sample"
      && selectedMapObject?.payload?.properties?.id === properties.id;
    return (
      <CircleMarker
        key={`measurement-${properties.id ?? index}`}
        center={[lat, lon]}
        radius={selected ? 9 : 6}
        pathOptions={{ color: selected ? "#0f172a" : color, fillColor: color, fillOpacity: 0.82, weight: selected ? 4 : 2 }}
        eventHandlers={{
          click: (event) => {
            event.originalEvent?.stopPropagation();
            onSelectMapObject?.({ type: "measurement_sample", payload: { properties, coordinates: [lon, lat] } });
          },
        }}
      />
    );
  });
}

function FitSelectionLayer({ fitRequestVersion, selectedNetworkTowerIds, selectedTower, towers }) {
  const map = useMap();

  useEffect(() => {
    if (!fitRequestVersion) {
      return;
    }
    const selected = towers.filter((tower) => selectedNetworkTowerIds.includes(tower.id));
    const targets = selected.length > 0 ? selected : selectedTower ? [selectedTower] : [];
    const points = targets
      .map((tower) => {
        const [lon, lat] = tower.coordinates ?? [];
        return Number.isFinite(lon) && Number.isFinite(lat) ? [lat, lon] : null;
      })
      .filter(Boolean);
    if (points.length === 0) {
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 14), { animate: true });
      return;
    }
    map.fitBounds(latLngBounds(points), { maxZoom: 15, padding: [42, 42] });
  }, [fitRequestVersion, map, selectedNetworkTowerIds, selectedTower, towers]);

  return null;
}

function CommunicationPathLayer({ onSelectMapObject, selectedMapObject, topology, towers }) {
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
    const isInspectorSelected =
      selectedMapObject?.type === "communication_path" &&
      selectedMapObject?.payload?.route?.from === route.from &&
      selectedMapObject?.payload?.route?.to === route.to;
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
          weight: isInspectorSelected ? 7 : isFallback ? 4 : 5,
        }}
        eventHandlers={{
          click: (event) => {
            event.originalEvent?.stopPropagation();
            onSelectMapObject?.({
              type: "communication_path",
              payload: { route },
            });
          },
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

function CoverageGapLayer({ gaps, layerKey, onSelectMapObject, selectedMapObject }) {
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
    const isInspectorSelected =
      selectedMapObject?.type === "coverage_gap" &&
      selectedMapObject?.payload?.properties?.building_id === properties.building_id;
    return (
      <CircleMarker
        key={`${layerKey}-${properties.building_id ?? index}`}
        center={[lat, lon]}
        radius={Math.max(5, Math.min(12, 5 + demand / 35))}
        pathOptions={{
          color: isInspectorSelected ? "#0f172a" : isOutage ? "#881337" : "#b45309",
          fillColor: isOutage ? "#e11d48" : "#f59e0b",
          fillOpacity: 0.78,
          opacity: 0.95,
          weight: isInspectorSelected ? 4 : 2,
        }}
        eventHandlers={{
          click: (event) => {
            event.originalEvent?.stopPropagation();
            onSelectMapObject?.({
              type: "coverage_gap",
              payload: {
                properties,
                coordinates: [lon, lat],
              },
            });
          },
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

function InterferenceLayer({ demand, layerKey, metric, model, onSelectMapObject, selectedMapObject, surface }) {
  const surfaceFeatures = surface?.features ?? [];
  const demandFeatures = demand?.features ?? [];
  if (surfaceFeatures.length === 0 && demandFeatures.length === 0) {
    return null;
  }
  const selectedSampleID = selectedMapObject?.type === "interference_sample"
    ? selectedMapObject?.payload?.properties?.sample_id
    : null;
  const selectedFeature = selectedSampleID
    ? [...surfaceFeatures, ...demandFeatures].find((feature) => feature?.properties?.sample_id === selectedSampleID)
    : null;
  const bindFeature = (feature, layer) => {
    layer.on("click", (event) => {
      event.originalEvent?.stopPropagation();
      onSelectMapObject?.({
        type: "interference_sample",
        payload: {
          properties: feature.properties ?? {},
          coordinates: feature.geometry?.coordinates ?? [],
          model,
        },
      });
    });
  };
  const makeMarker = (isDemand) => (feature, latlng) => {
    const properties = feature?.properties ?? {};
    const color = interferenceMetricColor(metric, properties);
    return circleMarker(latlng, {
      className: isDemand ? "interference-demand-marker" : "interference-surface-marker",
      radius: isDemand ? 7 : 5,
      color: isDemand ? "#7f1d1d" : color,
      fillColor: color,
      fillOpacity: isDemand ? 0.88 : 0.58,
      opacity: 0.92,
      weight: isDemand ? 2 : 1,
    });
  };
  const [selectedLon, selectedLat] = selectedFeature?.geometry?.coordinates ?? [];

  return (
    <>
      {surfaceFeatures.length > 0 ? (
        <GeoJSON
          key={`interference-surface-${layerKey}-${metric}`}
          data={surface}
          pointToLayer={makeMarker(false)}
          onEachFeature={bindFeature}
        />
      ) : null}
      {demandFeatures.length > 0 ? (
        <GeoJSON
          key={`interference-demand-${layerKey}-${metric}`}
          data={demand}
          pointToLayer={makeMarker(true)}
          onEachFeature={bindFeature}
        />
      ) : null}
      {Number.isFinite(selectedLon) && Number.isFinite(selectedLat) ? (
        <CircleMarker
          center={[selectedLat, selectedLon]}
          radius={9}
          interactive={false}
          pathOptions={{
            color: "#0f172a",
            fillColor: "transparent",
            fillOpacity: 0,
            opacity: 1,
            weight: 3,
          }}
        />
      ) : null}
    </>
  );
}

function interferenceMetricColor(metric, properties) {
  const rawValue = metric === "rsrp" ? properties.rsrp_dbm : metric === "rsrq" ? properties.rsrq_db : properties.sinr_db;
  if (rawValue === null || rawValue === undefined) {
    return "#64748b";
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return "#64748b";
  }
  const thresholds = metric === "rsrp" ? [-100, -90, -80] : metric === "rsrq" ? [-20, -15, -10] : [0, 13, 20];
  if (value < thresholds[0]) {
    return "#be123c";
  }
  if (value < thresholds[1]) {
    return "#d97706";
  }
  if (value < thresholds[2]) {
    return "#2563eb";
  }
  return "#0f766e";
}

function formatRouteType(value) {
  return String(value ?? "direct_xn")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
