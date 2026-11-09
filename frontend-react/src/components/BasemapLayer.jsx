import { useLayoutEffect, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";
import { platform } from "../platform/index.js";

export default function BasemapLayer({ basemap, native = platform.kind === "desktop" }) {
  const layerRef = useRef(null);
  const statusRef = useRef(null);
  const [tileState, setTileState] = useState({ id: basemap.id, failed: false });
  if (tileState.id !== basemap.id) setTileState({ id: basemap.id, failed: false });
  const unavailable = tileState.id === basemap.id && tileState.failed;
  useLayoutEffect(() => {
    if (!native || !unavailable) return undefined;
    const status = statusRef.current;
    const stage = status?.closest(".map-stage");
    if (!stage) return undefined;
    const measure = () => stage.style.setProperty("--native-basemap-status-height", `${status.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(status);
    return () => { observer?.disconnect(); stage.style.removeProperty("--native-basemap-status-height"); };
  }, [native, unavailable]);
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
        <div ref={statusRef} className={`map-basemap-status${native ? " native-basemap-status" : ""}`} role="status">
          {native ? <>{basemap.label}: Base map unavailable. RF layers remain available. Check your connection; the public map service may also be temporarily unavailable. <button type="button" onClick={() => { setTileState({ id: basemap.id, failed: false }); layerRef.current?.redraw(); }}>Retry base map</button></>
            : <>{basemap.label}: Base map unavailable. RF layers remain available; choose {basemap.provider === "Stadia Maps" ? "OpenStreetMap" : "Alidade Smooth"} in Layers or check provider deployment settings.</>}
        </div>
      ) : null}
    </>
  );
}
