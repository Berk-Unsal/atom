import { useLayoutEffect, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";

export default function BasemapLayer({ basemap }) {
  const layerRef = useRef(null);
  const [tileState, setTileState] = useState({ id: basemap.id, failed: false });
  if (tileState.id !== basemap.id) setTileState({ id: basemap.id, failed: false });
  const unavailable = tileState.id === basemap.id && tileState.failed;
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const container = layer?.getContainer();
    if (!container) return;
    for (const name of [...container.classList]) {
      if (name.startsWith("atom-basemap")) container.classList.remove(name);
    }
    container.classList.add(...basemap.className.split(" "));
    layer.options.maxZoom = basemap.maxZoom;
  }, [basemap]);
  return (
    <>
      <TileLayer
        ref={layerRef}
        className={basemap.className}
        attribution={basemap.attribution}
        maxZoom={basemap.maxZoom}
        eventHandlers={{ tileerror: () => setTileState({ id: basemap.id, failed: true }) }}
        opacity={unavailable ? 0 : 1}
        url={basemap.url}
      />
      {unavailable ? (
        <div className="map-basemap-status" role="status">
          {basemap.label}: Base map unavailable. RF layers remain available; choose {basemap.provider === "Stadia Maps" ? "OpenStreetMap" : "Alidade Smooth"} in Layers or check provider deployment settings.
        </div>
      ) : null}
    </>
  );
}
