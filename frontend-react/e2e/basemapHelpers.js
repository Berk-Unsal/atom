// Check every visible tile and the full viewport, including interior holes.
export async function waitForBasemap(page) {
  await page.waitForFunction(() => {
    const map = document.querySelector(".leaflet-container")?.getBoundingClientRect();
    const layer = document.querySelector(".atom-basemap");
    if (!map || !layer || document.querySelectorAll(".atom-basemap").length !== 1 || Number(getComputedStyle(layer).opacity) < 0.99) return false;
    const tiles = [...layer.querySelectorAll(".leaflet-tile")].filter((tile) => {
      const r = tile.getBoundingClientRect();
      return r.right > map.left && r.left < map.right && r.bottom > map.top && r.top < map.bottom;
    });
    if (!tiles.length || !tiles.every((tile) => tile.complete && tile.naturalWidth > 0 && Number(getComputedStyle(tile).opacity) >= 0.99)) return false;
    const bounds = tiles.map((tile) => tile.getBoundingClientRect());
    const xs = [map.left, map.right, ...bounds.flatMap((r) => [Math.max(map.left, r.left), Math.min(map.right, r.right)])].sort((a, b) => a - b);
    const ys = [map.top, map.bottom, ...bounds.flatMap((r) => [Math.max(map.top, r.top), Math.min(map.bottom, r.bottom)])].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
      const x = (xs[i - 1] + xs[i]) / 2;
      const y = (ys[j - 1] + ys[j]) / 2;
      if (!bounds.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return false;
    }
    return !document.querySelector(".leaflet-zoom-anim, .leaflet-pan-anim");
  }, null, { timeout: 30_000 });
  // Leaflet's canvas resize can settle after the tile grid on viewport changes.
  await page.waitForFunction(() => new Promise((resolveStable) => {
    let previous = "";
    let stableSince = performance.now();
    const frame = () => {
      const signature = [...document.querySelectorAll(".leaflet-map-pane, .leaflet-overlay-pane canvas, .leaflet-marker-pane")].map((e) => [e.getAttribute("style"), e.getAttribute("width"), e.getAttribute("height"), e.tagName === "CANVAS" ? e.toDataURL() : ""]).join("|") + document.querySelector(".command-status")?.textContent;
      if (signature !== previous) { previous = signature; stableSince = performance.now(); }
      if (performance.now() - stableSince >= 700) resolveStable(true);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
}

export async function selectBasemap(page, label) {
  const trigger = page.getByRole("button", { name: "Map layers" });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await page.getByRole("radio", { name: label, exact: true }).check();
  await trigger.click();
}

export async function basemapSnapshot(page) {
  return page.evaluate(async () => {
    const pane = document.querySelector(".leaflet-map-pane");
    const layer = document.querySelector(".atom-basemap");
    const map = document.querySelector(".leaflet-container").getBoundingClientRect();
    const visibleTiles = [...(layer?.querySelectorAll(".leaflet-tile") ?? [])].filter((t) => { const r = t.getBoundingClientRect(); return r.right > map.left && r.left < map.right && r.bottom > map.top && r.top < map.bottom; });
    const tile = layer?.querySelector(".leaflet-tile");
    const overlays = [...document.querySelectorAll(".leaflet-overlay-pane, .leaflet-marker-pane, .leaflet-shadow-pane, .leaflet-tooltip-pane, .leaflet-overlay-pane *, .leaflet-marker-pane *")];
    const reference = visibleTiles[0];
    const coords = reference?.src.match(/\/(\d+)\/(\d+)\/(\d+)(?:@2x)?\.png/);
    const rect = reference?.getBoundingClientRect();
    const tileViewport = coords && rect ? {
      center: [(Number(coords[2]) + ((map.left + map.right) / 2 - rect.left) / rect.width) / 2 ** Number(coords[1]), (Number(coords[3]) + ((map.top + map.bottom) / 2 - rect.top) / rect.height) / 2 ** Number(coords[1])].map((v) => Number(v.toFixed(9))),
      zoom: Number((Number(coords[1]) + Math.log2(rect.width / 256)).toFixed(4)),
    } : null;
    const overlayCanvasHashes = await Promise.all([...document.querySelectorAll(".leaflet-overlay-pane canvas")].map(async (canvas) => {
      const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }));
    return {
      overlayCanvasHashes,
      scientificPalette: [...document.querySelectorAll(".quality-swatch, .map-key-line, .signal-surface-scale i")].map((e) => [e.className, getComputedStyle(e).backgroundColor]),
      signalImages: [...document.querySelectorAll(".leaflet-image-layer")].map((e) => e.getAttribute("src")),
      palette: [...document.querySelectorAll(".focused-map-legend i")].map((e) => { const css = getComputedStyle(e); return [e.className, css.color, css.backgroundColor, css.borderColor]; }),
      tileViewport,
      mapTransform: pane?.style.transform,
      tiles: visibleTiles.map((t) => new URL(t.src).pathname.replace("/tiles/alidade_smooth", "").replace("@2x", "")).sort(),
      selectedMarkers: [...document.querySelectorAll(".tower-order-badge")].map((e) => [e.textContent, e.getAttribute("style")]),
      overlayHTML: document.querySelector(".leaflet-overlay-pane")?.innerHTML,
      markerHTML: document.querySelector(".leaflet-marker-pane")?.innerHTML,
      context: document.querySelector(".rf-context-primary")?.textContent,
      status: document.querySelector(".command-status")?.textContent,
      primary: document.querySelector(".command-primary-action")?.textContent,
      filter: layer ? getComputedStyle(layer).filter : null,
      paneFilters: [pane, ...overlays].filter(Boolean).map((e) => getComputedStyle(e).filter),
      layerCount: document.querySelectorAll(".atom-basemap").length,
      tileSize: tile ? [tile.naturalWidth, tile.naturalHeight] : null,
      attribution: document.querySelector(".leaflet-control-attribution")?.textContent,
    };
  });
}
