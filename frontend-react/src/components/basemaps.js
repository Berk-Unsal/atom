// Presentation only: never include this choice in a plan, RF request or fingerprint.
export const DEFAULT_BASEMAP_ID = "alidade-smooth";

export const BASEMAPS = Object.freeze([
  Object.freeze({
    id: "osm-standard",
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    retina: false,
    className: "atom-basemap atom-basemap-osm",
    provider: "OpenStreetMap",
  }),
  Object.freeze({
    id: "alidade-smooth",
    label: "Alidade Smooth",
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://stadiamaps.com/attribution/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    maxZoom: 20,
    retina: true, // Leaflet substitutes {r} with @2x on HiDPI; no detectRetina subdivision.
    className: "atom-basemap atom-basemap-alidade",
    provider: "Stadia Maps",
    authentication: "domain", // localhost/127.0.0.1 need no configuration.
  }),
]);

export function getBasemap(id) {
  return BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS.find((basemap) => basemap.id === DEFAULT_BASEMAP_ID);
}
