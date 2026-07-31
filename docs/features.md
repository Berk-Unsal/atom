# Features

A.T.O.M is a local-first, deterministic RF planning workspace for comparing urban 4G, 5G, and exploratory 6G sector plans. Its outputs are planning estimates, not UE or PHY measurements.

## Focused Planning Workspace

- Ten workflow tools in one rail: Setup, Inventory, Propagation, Experiments, Surfaces, Interference, 5G Core, Results, Data, and Report.
- A compact command bar keeps the current project, cell context, technology, RF summary, and primary run action visible.
- The map remains full size while tool and Inspector drawers overlay it.
- Contextual layers appear only when their results exist.
- Towers, gaps, communication paths, interference samples, candidate sites, and measurement residuals open persistent Inspector details.

## Projects And Scenarios

- Native browser IndexedDB persistence with automatic last-workspace restoration.
- Named scenarios preserve exact inputs, selected cells, RF settings, result summaries, model metadata, and recent GeoJSON layers.
- Rename, duplicate, delete, import, and export complete projects as versioned `.atom-project.json` files.
- Input changes mark saved results stale instead of presenting them as current.
- Compare exactly two scenarios using KPI deltas and an A/B map switch.
- Promote either comparison side to the active plan without modifying the source snapshot.

Project history is local to the browser. A.T.O.M does not provide accounts, shared editing, or server-side project storage.

## Cell Inventory And RF Profiles

- Place cells manually on the map, drag editable cells, edit coordinates, duplicate or delete them, and import bounded CSV or GeoJSON inventories.
- Search the inventory and select cells without losing their per-cell overrides.
- Configure technology, band, frequency, bandwidth, channel, duplex mode, transmit power, antenna gain, system loss, radius, beam width, height, mechanical/electrical downtilt, orientation, horizontal/vertical pattern, load, reuse, PCI, receiver height, and receiver sensitivity independently for every cell.
- Validate technology/frequency compatibility and all numeric/text limits before RF execution.
- Persist the complete inventory and profile overrides in schema-v2 project drafts and scenarios; schema-v1 files remain importable.
- Include resolved per-cell profiles in simulation, network, interference, recommendation, measurement, and planning-report contracts.

Legacy top-level RF controls remain request defaults. A nested `rf_profile` overrides those defaults for its cell, so older API clients continue to work while heterogeneous networks can be modeled explicitly.

## Propagation And Coverage

### Supported Modes

| Mode | Default frequency | Intended use |
|---|---:|---|
| 4G LTE | 2.6 GHz | Wider urban coverage planning |
| 5G NR mmWave | 28 GHz | Directional high-capacity planning |
| 6G Sub-THz research overlay | 140 GHz | Exploratory propagation comparison |

The backend uses free-space path loss with meter/GHz units:

```text
FSPL(dB) = 32.45 + 20log10(distance_m) + 20log10(frequency_GHz)
```

It then applies configured transmit power, antenna gain, beam/radius eligibility, and cumulative frequency-dependent wall loss. Rays are segmented and returned as GeoJSON with modeled received power.

The fast sector and surface models remain FSPL-plus-walls estimators. A separate 2.5D point-to-point workflow adds terrain/building profiles, LOS and Fresnel classification, material-specific wall planning losses, and an explicitly selected single knife-edge approximation. It does not claim full ITU-R Recommendation conformance or simulate reflection-heavy multipath, fast fading, MIMO scheduling, or uplink behavior.

### 2.5D Path Profiles And Fidelity

- Loads an optional north-up EPSG:4326 COG/GeoTIFF terrain layer lazily by strip/tile and samples it bilinearly.
- Combines ground elevation, inferred or explicit building height, transmitter/receiver height above ground, direct LOS, 60% first-Fresnel clearance, and a dominant obstruction.
- Provides `terrain-profile` (30 MHz–6 GHz), `urban-short-range` (300 MHz–100 GHz), and explicitly out-of-range research profiles. These applicability labels follow the published ranges of [ITU-R P.1812-8](https://www.itu.int/rec/R-REC-P.1812-8-202509-I/en) and [ITU-R P.1411-9](https://www.itu.int/rec/R-REC-P.1411-9-201706-I/en); the implementation is an inspectable planning approximation, not either complete method.
- Exposes free-space, antenna-pattern, system, wall, diffraction, clutter, vegetation, atmospheric-gas, rain, calibration, and shadow-sensitivity components rather than hiding them in one total.
- Uses an explicitly selected single knife-edge approximation informed by [ITU-R P.526](https://www.itu.int/rec/R-REC-P.526/en). Material, gas, and rain controls are planning inputs informed by [ITU-R P.2040](https://www.itu.int/rec/r-rec-p.2040/en), [ITU-R P.676](https://www.itu.int/rec/R-REC-P.676/en), and [ITU-R P.838](https://www.itu.int/rec/R-REC-P.838/en), not automatic weather or construction-data inference.
- Displays a vertical terrain/building/LOS/Fresnel cross section with the loss budget and P50/P90-style shadow-sensitivity bounds.

## Demand-Aware Planning

- Coverage gaps identify demand-building centroids that are inside a sector but below the service threshold.
- Demand scoring distinguishes POI and residential signals from empty geometry.
- Single-sector optimization performs a deterministic azimuth sweep.
- Network evaluation scores two to six selected cells using coverage, unique demand, and overlap.
- Network optimization coordinates selected-cell azimuths using selected objectives/weights, optional minimum coverage/demand and maximum-overlap constraints, feasibility violations, and an explained Pareto frontier. Tilt, power, and site selection are not silently adjusted.

## Batch Experiments

- Sweeps frequency, transmit power, beam width, azimuth, and calibration offset across at most 64 deterministic combinations.
- Executes through bounded asynchronous jobs with progress, cancellation, a dataset/model/request fingerprint, and a small result cache.
- Compares runs in a scenario table and Pareto view and exports the exact experiment definition.
- Runs headlessly through `go run ./cmd/run-experiment -definition experiment.json` or the process/job API.
- Follows the asynchronous execution shape of [OGC API Processes](https://www.ogc.org/standards/ogcapi-processes/) without claiming a complete conformance class implementation.

## Analytical Surfaces And GIS Interchange

- Evaluates bounded regular received-power grids with a 100,000-cell ceiling and produces unsmoothed marching-square isolines.
- Renders the raster below the cell/measurement overlays with opacity and minimum-display-threshold controls.
- Exports the regular grid as float32 EPSG:4326 GeoTIFF, valid grid cells as CSV, and isolines as GeoJSON.
- Queries building footprints through mandatory viewport `bbox`, pagination, a 50 km diagonal ceiling, and a 5,000-feature page ceiling; outputs GeoJSON or CSV/WKT.
- Provides an opt-in material/height-tinted map overlay at zoom 12 or closer; panning cancels stale requests and loads only the current bounded viewport.
- Uses OGC API Features-style collections and query parameters, informed by [OGC API Features](https://www.ogc.org/standards/ogcapi-features/). Vector tiles and GeoPackage export remain future work; [OGC API Tiles](https://www.ogc.org/standards/ogcapi-tiles/) and [GeoPackage](https://www.ogc.org/standards/geopackage/) are the intended interoperability references.

## Interference And Radio Quality

Planning-grade 4G and 5G interference analysis calculates:

- Serving-cell selection by strongest modeled RSRP.
- RSRP, SINR, RSRQ, RSSI, noise, strongest interferer, and contributing-cell count.
- Co-channel loading and reuse-factor behavior using linear power addition.
- Adaptive spatial sampling capped to keep requests bounded.
- Serviceable, interference-limited, and affected-demand statistics.
- SINR, RSRP, and RSRQ map surfaces with threshold-specific legends.

Near-equal co-channel powers can correctly produce SINR near `0 dB`; the Inspector explains this and other no-signal or poor-quality states.

## Candidate Site Recommendations

- Uses unselected towers from the active dataset as candidate records.
- Restricts candidates to the user-drawn planning area.
- Prefilters at most 50 records by proximity to unmet demand and evaluates a bounded subset.
- Keeps existing selected-cell azimuths fixed and optimizes only the candidate in v1.
- Returns up to five deterministic options with recommended azimuth, marginal KPIs, score components, and reasons.
- Applies a recommendation as a new scenario without overwriting the baseline.

Recommendations are RF planning options, not claims of rooftop availability, ownership, permitting, cost, or deployment approval. Candidate scoring intentionally excludes interference; analyze it after applying an option.

## Measurement Validation

- Imports up to 5,000 CSV records with ID, longitude, latitude, technology, measured RSRP, and optional cell ID.
- Predicts RSRP at each measurement location using the active selected cells and RF assumptions.
- Reports residual GeoJSON, MAE, RMSE, mean/median bias, no-signal count, and per-cell statistics.
- With at least 20 valid points, requires at least five distinct 50 m spatial areas spanning at least 100 m, then evaluates a robust global bias through deterministic spatially blocked five-fold validation.
- Reports per-cell and per-band residuals, residual-versus-distance and residual-versus-obstruction bins, robust MAD outliers, P50/P90 errors, a median-adjustment confidence interval, fold evidence, and provenance/expiration state.
- Applies correction only after explicit user confirmation and stores the profile with the project.
- Invalidates calibration when technology, frequency, model version, or dataset changes.

This is global path-loss bias correction, not full propagation calibration.

## Validated Dataset Packs

- `ATOM_DATASET_DIR` selects the initial dataset directory; Ankara remains the default.
- Dataset Pack Studio previews source CRS, coverage, geometry repair/drop counts, and missing fields before building an arbitrary-region pack.
- Schema v2 records dataset identity, EPSG:4326 bounds, sources, licenses, confidence, generation date, filenames, SHA-256 hashes, per-layer metadata, and quality evidence.
- Optional terrain, clutter, building-height, and material layers can be packaged and validated for provenance and future model versions.
- The validator checks hashes, required properties, geometry, coordinate bounds, duplicate IDs, and building-index viability.
- Invalid packs keep `/readyz` unavailable with an explanatory error.
- Active dataset identity and provenance appear in Data, scenarios, reports, and `/api/meta`.
- `ATOM_DATASETS_ROOT` enables a local installed-pack catalog. Switching accepts a manifest ID rather than a path, rejects root escapes and duplicate IDs, validates the whole candidate, and swaps the immutable runtime snapshot only after success.

Schema-v1 packs remain loadable. The application does not perform arbitrary-city live ingestion or large browser uploads; building is an explicit local CLI workflow. The optional terrain layer is consumed only by the 2.5D point-to-point profile. Clutter and material controls can be selected explicitly, but raster clutter and separate height/material sidecar layers are not yet automatically joined into every RF workflow.

## 5G Communication Paths

The optional 5G Core Lab applies only to 5G mmWave and remains independent from RF interference:

- Xn-C and Xn-U for eligible neighboring gNB coordination and forwarding.
- N2 fallback through AMF when Xn is degraded or unavailable.
- N3 session traffic through UPF.
- AMF, SMF, UPF, NRF, UDM/UDR, AUSF, PCF, and NSSF status.
- Deterministic health and Xn scenarios, sessions, and events.
- Optional probing of configured Open5GS status/metrics endpoints.

It is a planning overlay, not an LTE/EPC model or a complete bundled Open5GS deployment.

## Reproducibility And Reports

- `/api/meta` exposes application version, build commit, model version, supported technologies, and active dataset identity.
- Scenarios and reports retain exact request inputs and runtime metadata.
- Markdown and printable PDF reports include RF assumptions, radio quality, communication paths, calibration evidence, recommendations, and scenario comparison where available.
- The downloadable OpenAPI 3.1 specification documents current REST routes and error envelopes.
- RF requests support cancellation, latest-response protection, a 1 MiB body limit, bounded workers, and `429` overload behavior.

## Deliberately Out Of Scope

- Full 3D reflection-heavy ray tracing, multiple-obstacle diffraction, fading, and MIMO scheduling.
- Live network control, LTE/EPC integration, and 6G Core integration.
- Cloud accounts, multi-user collaboration, and hosted project storage.
- Guessed cost, fiber, equity, or emergency-priority scoring without authoritative data.
- Live OSM/OpenCellID ingestion from the browser.

See [System Architecture](architecture.html), [REST API](api.html), [RF Algorithms](algorithms.html), and [Model Limitations](modeling-limits.html).
