# Application appearance and dark basemap

Choose **Light**, **Dark**, or **System** in **Layers → Appearance**. System is the initial preference and follows live OS changes. `atom.theme` in localStorage stores only this preference; invalid or cleared values become System. Denied storage leaves a working session preference. Another tab's changes are observed. The entry module applies the resolved theme before mounting React, and `useTheme` keeps the root `data-theme` and native `color-scheme` synchronized. No inline startup script or new CSP origin is required.

`theme.css` defines semantic surface, text, border, action, focus, disabled and elevation roles. The existing stylesheet uses those roles with **exact incumbent light values as fallbacks**. This allows a broad shell migration without normalizing away subtle light-state differences. Shared scientific hue variables, chart marks, RF swatches and raster/overlay pixels remain fixed. Teal UI emphasis is restrained; selected-cell order remains orange, Map Focus dashed, and inspection solid. Cell outline colors alone gain contrast in dark mode; position, radius, ordering and interaction targets are unchanged.

Provider choices are independent presentation state per resolved theme, defaulting to Alidade Smooth in light and Alidade Smooth Dark in dark. Returning to a theme restores its session provider choice. Reloading resets provider choices, while preserving the theme preference. OpenStreetMap and Alidade Smooth remain selectable in light; both remain explicit fallbacks in dark. A failed dark source stays observable and names OpenStreetMap as the recovery option. There is no silent provider substitution.

The same MapContainer and raster layer stay mounted. Provider changes update the existing layer's URL, class, zoom limit and attribution. Theme changes do not fit/recenter the map, trigger RF requests, mutate selection, clear inspection, or invalidate results. Neither setting belongs to Project/Scenario/Version/Run/Report schemas, request builders, configuration fingerprints, freshness, or exported scientific identity.

## Provider decision

Use Stadia's [Alidade Smooth Dark raster XYZ style](https://docs.stadiamaps.com/map-styles/alidade-smooth-dark/) through the existing registry:

```text
https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png
```

This is a purpose-designed subdued dark map, with equivalent geography and tile projection to the existing light source. It needs no CSS inversion, vector renderer, new dependency, or credential in the bundle. Leaflet's `{r}` requests the native HiDPI suffix; `detectRetina` remains false. Provider zoom 20 and application zoom 10–18 are unchanged.

The source owns linked **© Stadia Maps © OpenMapTiles © OpenStreetMap** attribution, following the [provider attribution requirements](https://docs.stadiamaps.com/attribution/). Attribution stays visible in both themes and wraps on narrow screens. The OSM source shows only its own attribution.

Tile service access is governed by [Stadia's service terms](https://stadiamaps.com/terms-of-service/), separately from A.T.O.M's source-code license or the underlying OSM data license. The [free plan is for non-commercial use](https://stadiamaps.com/pricing/); commercial deployments need an active paid plan sized for usage. This suits local development and non-commercial project evaluation without making a blanket claim that hosted tiles are unrestricted or free for production.

[Authentication documentation](https://docs.stadiamaps.com/authentication/) allows keyless localhost/127.0.0.1 development under rate limits. For a public browser deployment, register the exact domain/subdomain in Stadia's dashboard and preserve Origin/Referer headers. Domain authentication needs no client key. LAN/intranet deployments need the provider's documented authentication configuration; the localhost exemption does not cover them. This change does not provision a domain, buy a plan, or add a key. Operators can choose OSM explicitly if Stadia is unavailable, subject to [OSM's tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Verification and visual evidence

See the [matched comparison report](dark-mode-visual-comparison.md) and [capture evidence](assets/dark-mode/evidence.json). Captures use real provider tiles with deterministic scientific fixtures and retain visible attribution. They are application-review evidence, not a provider performance benchmark or new RF validation. Successful test-only tile responses may be reused from `/tmp/atom-basemap-tiles`; no tile cache or offline download feature is shipped.

From `frontend-react`:

```sh
npm run lint
npm test
npm run test:e2e -- --workers=4
npm run build
ATOM_THEME_CAPTURE=1 npx playwright test --project=desktop-1440 --workers=1 --grep 'captures matched theme'
ATOM_REAL_E2E=1 npx playwright test e2e/basemap-csp.spec.js --project=desktop-1440 --workers=1
```

The gated capture compares all computed light styles and screenshot pixels in place (at most two 8-bit channel values across less than 0.2% of pixels for Chromium corner-antialias rounding) against the pre-theme basemap stylesheet (`7765e62`), except the intentionally expanded Appearance/Layers menu. Each matched pair checks camera position/zoom, selection ordering, context/status/action, scientific key palette and Signal image identity. Browser contracts additionally compare full exported projects and API request counts while switching themes/providers, preserve the inspected and focused cell, and test persisted and live System preference behavior. Unit tests cover denied storage, corruption, cross-tab changes and listener cleanup.
