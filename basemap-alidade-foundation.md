# Basemap foundation — Alidade Smooth evaluation

Alidade Smooth is the default light basemap after [15 matched visual comparisons](basemap-alidade-visual-comparison.md). OpenStreetMap remains a selectable fallback in Layers. Concept 8H layout and scientific behavior remain frozen.

`frontend-react/src/components/basemaps.js` owns IDs, labels, URLs, attribution, provider zoom limits, Retina metadata and presentation classes. `BasemapLayer.jsx` keeps one Leaflet raster layer, updates its URL/attribution in place, and resets the provider error state on selection. There are no new dependencies. MapContainer retains its center, projection and 10–18 zoom limits. The provider source limits are OSM 19 and Stadia 20.

OSM retains `saturate(0.62) contrast(0.94) brightness(1.03)` on its raster container. Alidade uses `filter: none`. All overlay panes, RF colors and geometry remain unchanged. Each active source owns its attribution; inactive Stadia attribution is removed when OSM is selected.

Selection is session-local React presentation state. There was no existing local UI preference mechanism to reuse. It is absent from Project/Scenario/Run/Report schemas, saved plans, request builders, fingerprints and result freshness. It does not trigger RF or optimization. Tile errors remain observable, hide the failed raster as the previous infrastructure did, and name the alternative in Layers. Switching is explicit, without automatic provider substitution or a retry subsystem.

Use Stadia's [official Alidade configuration](https://docs.stadiamaps.com/map-styles/alidade-smooth/): `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png`. Leaflet substitutes `{r}` with `@2x` on HiDPI, keeping the 256 CSS-pixel tile grid; `detectRetina` stays false to avoid requesting extra tiles. Provider attribution follows the [official requirement](https://docs.stadiamaps.com/attribution/): Stadia Maps, OpenMapTiles and OpenStreetMap, each linked.

[Stadia authentication](https://docs.stadiamaps.com/authentication/) allows localhost/127.0.0.1 development without credentials, under local rate limits. For production browser deployments, register the complete deployed domain/subdomain in the Stadia property dashboard and allow the necessary Origin/Referer headers. Domain authentication needs no frontend credential. Private LAN/intranet addresses do not inherit the localhost exemption; use the provider's documented authentication or OSM. No private API key is shipped or added to Vite settings. Domain provisioning remains a deployment action for the operator; it has not been performed for this repository.

Captures use `ATOM_BASEMAP_CAPTURE=1 npx playwright test --project=desktop-1440 --workers=1 --grep 'captures Alidade basemap'` from `frontend-react`. Successful real PNGs are cached only in `/tmp/atom-basemap-tiles`. The shared capture helper waits for loaded opaque visible tiles, full viewport coverage, settled canvas sizing and status. It records one active raster container, camera/overlay invariance, scientific canvas hashes, palette values, tile counts and layout collisions. Remote pixels are excluded from contract tests. A stabilized exported-draft wait corrects the existing baseline 8H test's hydration race without changing persistence code.

A future `alidade-smooth-dark` registry entry can reuse this layer and selector when dark-theme work is authorized. No dark entry, dark tokens, vector tiles, MapLibre or new UI concept is shipped.

Recommended next action: register the intended production domain with Stadia before deploying, then verify authenticated live tiles on that domain. The explicit OSM fallback remains available.
