import { describe, expect, it } from "vitest";
import { Browser, tileLayer } from "leaflet";
import { BASEMAPS, DEFAULT_BASEMAP_ID, getBasemap } from "./basemaps.js";

describe("raster basemap configuration", () => {
  it("uses the visually evaluated light default and resolves invalid choices", () => {
    expect(DEFAULT_BASEMAP_ID).toBe("alidade-smooth");
    expect(getBasemap("invalid")).toBe(getBasemap(DEFAULT_BASEMAP_ID));
    expect(BASEMAPS.map(({ id }) => id)).toEqual(["osm-standard", "alidade-smooth"]);
  });
  it("owns the provider URL, attribution and raster presentation", () => {
    const osm = getBasemap("osm-standard");
    const alidade = getBasemap("alidade-smooth");
    expect(osm.className).toContain("atom-basemap-osm");
    expect(osm.attribution).not.toContain("Stadia");
    expect(alidade.className).not.toContain("atom-basemap-osm");
    expect(alidade.attribution).toContain("Stadia Maps");
    expect(alidade.attribution).toContain("OpenMapTiles");
    expect(alidade.attribution).toContain("OpenStreetMap");
    expect(alidade.maxZoom).toBe(20);
    expect(alidade.url).toBe("https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png");
  });
  it("uses Leaflet's native retina suffix without multiplying the tile grid", () => {
    const previous = Browser.retina;
    try {
      for (const retina of [false, true]) {
        Browser.retina = retina;
        const layer = tileLayer(getBasemap("alidade-smooth").url);
        layer._tileZoom = 12;
        expect(layer.getTileUrl({ x: 2421, y: 1552 })).toBe(`https://tiles.stadiamaps.com/tiles/alidade_smooth/12/2421/1552${retina ? "@2x" : ""}.png`);
        expect(layer.options.detectRetina).toBe(false);
      }
    } finally { Browser.retina = previous; }
  });
});
