# Features

A.T.O.M is a local-first, deterministic RF planning workspace for comparing urban 4G, 5G, and exploratory 6G sector plans. Its outputs are planning estimates, not UE or PHY measurements.

## Focused Planning Workspace

- Eight workflow tools in one rail: Setup, Inventory, Propagation, Interference, 5G Core, Results, Data, and Report.
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

The current model does not simulate diffraction, reflections, fast fading, terrain, material-specific penetration, sidelobes, MIMO scheduling, or uplink behavior.

## Demand-Aware Planning

- Coverage gaps identify demand-building centroids that are inside a sector but below the service threshold.
- Demand scoring distinguishes POI and residential signals from empty geometry.
- Single-sector optimization performs a deterministic azimuth sweep.
- Network evaluation scores two to six selected cells using coverage, unique demand, and overlap.
- Network optimization coordinates selected-cell azimuths and renders each cell through a bounded sequential queue.

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
- With at least 20 valid points, uses a deterministic training/holdout split to evaluate a robust global bias correction.
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

Schema-v1 packs remain loadable. The application does not perform arbitrary-city live ingestion or large browser uploads; building is an explicit local CLI workflow. Optional layers are not yet consumed by RF calculations.

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

- Full 3D ray tracing, multipath, diffraction, fading, and MIMO scheduling.
- Live network control, LTE/EPC integration, and 6G Core integration.
- Cloud accounts, multi-user collaboration, and hosted project storage.
- Guessed cost, fiber, equity, or emergency-priority scoring without authoritative data.
- Live OSM/OpenCellID ingestion from the browser.

See [System Architecture](architecture.html), [REST API](api.html), [RF Algorithms](algorithms.html), and [Model Limitations](modeling-limits.html).
