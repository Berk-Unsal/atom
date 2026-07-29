# A.T.O.M System Architecture

The interactive architecture guide is available at [architecture.html](./architecture.html).

A.T.O.M is a local-first React and Go application. The browser owns planning state, request orchestration, map presentation, inspection, and report assembly. The Go service owns request validation, bounded RF computation, spatial querying, and the optional Core Lab proxy.

## System at a Glance

```text
Planner / API consumer
        |
        v
React workspace and Leaflet map
        +--> IndexedDB projects and scenario layer cache
        |
        | REST JSON
        v
Go + Gin API
        |
        +--> RF capacity limiter
        |      +--> propagation and coverage gaps
        |      +--> sector/network optimization
        |      +--> network evaluation
        |      +--> interference analysis
        |      +--> candidate recommendation
        |      +--> measurement residual evaluation
        |
        +--> in-memory building R-tree and tower store
        |
        +--> optional 5G Core proxy --> Core Lab adapter --> optional Open5GS
```

The production Docker image contains the built frontend, Go binary, and local Ankara data. There is no runtime database. Leaflet currently requests OpenStreetMap basemap tiles over the network unless a separate local tile source is configured.

## Shared Runtime Policy

Core Lab scenario IDs, technology frequency bands, RF defaults, and validation limits have one canonical source in `policy/rf-policy.json`. `scripts/generate_policy.py` produces self-contained bindings for the backend, Core Lab adapter, and frontend. CI checks generated output byte-for-byte, so a policy change cannot merge while any runtime consumer still carries an older binding. Measurement, interference, optimization, and recommendation inputs also share one Go tower DTO.

## Frontend Workspace

The React application is organized around a map-first focused workspace:

- **Command bar**: active plan context, run state, RF action, and latest result summary.
- **Project menu**: local projects, autosaved drafts, versioned import/export, and named scenario snapshots.
- **Workflow rail**: Setup, Propagation, Interference, 5G Core, Results, Data, and Report.
- **Overlay drawer**: opens one focused tool without resizing or recentering the map.
- **MapCanvas**: renders towers, rays, coverage gaps, selection geometry, interference samples, measurement residuals, candidate records, and 5G communication paths.
- **Inspector**: persistent details for towers, gaps, communication paths, and interference samples.
- **Report assembly**: creates Markdown and printable HTML from current client state.

### Request Coordination

RF operations share one coordinated request channel:

1. Starting an operation aborts the superseded request.
2. Every operation receives a monotonically increasing request ID.
3. Results are committed only if the request remains current.
4. RF-setting changes clear incompatible interference and optimization state.
5. Per-cell network ray rendering runs sequentially to stay inside backend RF capacity.

This prevents slow responses from replacing results produced by newer settings.

### Local Project Persistence

The browser stores projects in IndexedDB without adding a server database. Workspace commits are serialized and carry monotonic persistence revisions. Local storage is written only when the IndexedDB commit fails; if both copies exist after a partial failure, loading selects the newest revision and uses content timestamps to arbitrate legacy copies. Each scenario records exact inputs, selected cells, area geometry, compact KPI summaries, application/model metadata, and active dataset identity. Full GeoJSON layers are retained for the five most recently used scenarios; older scenarios preserve reproducible requests and are marked for rerun. Exported `.atom-project.json` files use a versioned schema and warn when the active dataset hash differs.

## Go API Boundary

The Gin service provides:

- CORS for local Vite development.
- A 1 MiB request-body limit.
- Pointer-aware request DTOs so omitted values can receive defaults without replacing valid explicit zero values.
- Route-specific validation before engine execution.
- Client-context propagation into RF engines.
- Two concurrent RF jobs by default through `MAX_CONCURRENT_RF_REQUESTS`.
- One active RF job and 20 expensive-route attempts per minute per client by default.
- Optional backend API-key enforcement and explicit trusted-proxy configuration.
- A 60-second computation deadline with cancellation inside ray, polygon, grid, measurement, and recommendation loops.
- Up to four Go workers inside each expensive RF job.
- `429 Too Many Requests` plus `Retry-After` when RF capacity is saturated.
- Five-second header, 15-second read, 120-second write, and 60-second idle timeouts.

### Principal Routes

| Method | Route | Responsibility |
|---|---|---|
| GET | `/healthz` | Process liveness and loaded-data counts |
| GET | `/readyz` | Building, tower, and frontend readiness |
| GET | `/api/meta` | Application, model, build, and active dataset identity |
| GET | `/api/towers` | Tower GeoJSON |
| GET | `/api/buildings` | Building GeoJSON |
| GET | `/api/buildings/summary` | Demand and data-quality summary |
| POST | `/api/analyze-sector` | Shared propagation and coverage-gap analysis for one sector |
| POST | `/api/simulate` | Segmented directional propagation |
| POST | `/api/coverage-gaps` | Demand-weighted underserved buildings |
| POST | `/api/optimize-azimuth` | Single-sector demand-aware azimuth sweep |
| POST | `/api/evaluate-network` | Score supplied selected-cell azimuths |
| POST | `/api/optimize-network` | Optimize selected-cell azimuths with overlap penalty |
| POST | `/api/interference` | RSRP, SINR, RSRQ, RSSI, and demand-quality analysis |
| POST | `/api/recommend-sites` | Rank known candidate records inside a search polygon |
| POST | `/api/measurements/evaluate` | RSRP residuals and holdout-checked global bias guidance |
| GET/POST | `/api/core/*` | Optional Core Lab proxy |

## Runtime Data and Spatial Index

The offline data pipeline prepares the runtime files ahead of time:

1. Extract building geometry and tower records from OSM/OpenCellID-derived sources.
2. Normalize footprints and add POI, residential, and local-density demand signals.
3. Write local GeoJSON/CSV artifacts and a versioned dataset manifest.
4. Record EPSG:4326 bounds, provenance, licenses, filenames, and SHA-256 hashes.
5. Store the large building GeoJSON through Git LFS.
6. Validate the pack selected by `ATOM_DATASET_DIR`, then populate the in-memory R-tree during backend startup.

Each RF engine first queries bounded candidates from the R-tree, then applies exact geometry, radius, sector, and intersection tests. This avoids scanning the complete building dataset for every ray or demand point.

## Propagation Engine

For each sampled angle inside the active beam, the propagation engine:

1. Converts the requested geographic radius into ray segments.
2. Queries candidate building bounds from the R-tree.
3. Performs exact segment/polygon intersection tests.
4. Calculates free-space path loss with meter/GHz units and antenna gain.
5. Applies frequency-dependent cumulative wall loss.
6. Emits signal-colored GeoJSON line segments and aggregate range/power statistics.

Cells outside the configured radius or hard beam sector do not contribute. The current engine does not model sidelobes.

## Planning Engines

### Coverage Gaps

Coverage-gap analysis filters demand-weighted building centroids by radius and sector, estimates received power, and returns buildings below the service threshold ordered by demand and signal severity.

### Single-Sector Optimization

The optimizer sweeps candidate azimuths and scores each sector using:

- Explicit POI demand.
- Residential-density demand.
- A capped geometry/coverage tie-breaker.

The selected direction is deterministic for the same request and dataset.

### Network Evaluation and Optimization

Network evaluation scores the supplied azimuth for each of two to six selected cells. Network optimization searches candidate azimuths and includes an overlap penalty. Both return network score, unique demand coverage, overlap, and per-cell azimuth records.

The frontend renders selected-cell propagation with a sequential `/api/simulate` queue after the network score is returned.

### Candidate Cell Recommendation

Recommendation accepts two to five selected cells and a drawn search polygon. It considers unselected records from the active dataset, prefilters up to 50 by nearby demand, evaluates at most 12, optimizes only the candidate azimuth, and returns the five strongest marginal network-score gains. Existing selected-cell azimuths remain fixed. Interference, cost, backhaul, permitting, and site availability are intentionally excluded.

## Interference Engine

Interference analysis supports selected 4G and 5G cells:

1. Build the union of selected-cell coverage bounds.
2. Start with the requested grid spacing and increase it when needed to keep the surface bounded.
3. Evaluate eligible cells using FSPL, gain, beam/radius eligibility, and wall loss.
4. Choose the strongest modeled RSRP as the serving cell.
5. Add receiver noise and load-scaled co-channel interference in linear power.
6. Derive modeled RSRP, SINR, RSRQ, RSSI, quality class, and serviceability.
7. Evaluate bounded demand-building centroids using the same radio assumptions.

Returned averages and P10 values are nullable when no valid signal samples exist.

These KPIs are deterministic planning estimates. They are not UE, drive-test, or PHY measurements.

## Measurement Validation

Measurement evaluation accepts up to 5,000 4G or 5G RSRP points. It applies the same radius, beam, FSPL, wall-intersection, resource-block, and serving-cell rules used by interference analysis, then returns per-point residuals plus MAE, RMSE, mean bias, median bias, and per-cell statistics. With at least 20 valid points, a deterministic 80/20 split estimates a robust median dB adjustment and reports holdout error before and after correction. The optional correction is a global path-loss offset, not full propagation calibration.

## Request Lifecycles

### Run Sector

The browser submits one `/api/analyze-sector` request. The backend computes ray profiles and building interactions once, derives both propagation and coverage-gap responses from that shared result, and returns them atomically under one cancellation signal.

### Optimize Sector

The browser captures a Before snapshot, requests `/api/optimize-azimuth`, reruns propagation and gap analysis with the returned azimuth, and commits the After comparison.

### Evaluate or Optimize Network

The backend first returns network scoring. The browser then simulates selected cells sequentially and merges their ray collections for map rendering.

### Analyze Interference

One `/api/interference` call returns the radio-quality surface, bounded demand points, aggregate statistics, per-cell summaries, and the exact assumptions needed by the Data and Report tools.

### Recommend Candidate Cells

One `/api/recommend-sites` job performs bounded prefiltering and candidate scoring. Applying a result creates a new local scenario and requires a normal network evaluation before interference conclusions are drawn.

### Validate Measurements

The browser parses and validates CSV structure before sending `/api/measurements/evaluate`. The returned residual layer remains separate from simulation and interference surfaces. Applying a suggested offset marks current results stale and records the profile with model and dataset identity.

## 5G Communication Path

Core Lab applies only to the 28 GHz 5G mode and remains independent of RF interference.

The default application keeps Core Lab disabled. The optional compose profile starts a Core Lab adapter and enables the Go proxy.

For selected towers, the adapter produces:

- Stable tower-to-gNB mappings.
- `Xn-C` control coordination and `Xn-U` forwarding for eligible direct neighbors.
- `N2` fallback through AMF when direct Xn is degraded or unavailable.
- `N3` user-plane session traffic through UPF.
- Per-neighbor `direct_xn`, `ng_fallback`, or `unreachable` decisions with reasons.
- AMF, SMF, UPF, NRF, UDM/UDR, AUSF, PCF, and NSSF health.
- Sessions, events, and deterministic failure/degradation scenarios.

Without configured Open5GS status or metrics URLs, the adapter identifies its source as `simulated_overlay`. With configured endpoints, it briefly probes external lab state while preserving the same frontend-facing JSON contracts.

## Deployment Modes

### Local Development

- Vite frontend: `http://localhost:5173`
- Go backend: `http://localhost:8080`
- Optional Core Lab adapter: `http://localhost:8090`

Vite proxies `/api`, `/healthz`, and `/readyz` to the Go service.

### Production Container

The multi-stage Docker build:

1. Builds the React application with Node.
2. Compiles the Go service with CGO disabled.
3. Copies the binary, frontend bundle, dataset manifest, and runtime data into Alpine.
4. Runs as a non-root `atom` user.
5. Exposes port 8080 and checks `/readyz`.

### Optional Core Lab Profile

The compose overlay sets `CORE_LAB_ENABLED=true`, points the backend at the adapter, and starts the adapter as a separate service. It does not start a full Open5GS deployment by itself.

## Trust and Model Boundaries

A.T.O.M does not currently include:

- Diffraction or reflection-heavy multipath.
- Fast fading or fully calibrated channel models.
- Sidelobes or adjacent-channel leakage.
- MIMO beamforming and scheduling gain.
- Uplink interference.
- Server-side project storage or shared analysis history. Local IndexedDB projects are supported.
- User accounts or multi-user collaboration. A shared backend RF API key is available for gateway-to-service authentication.
- A bundled offline basemap.

Static OSM/OpenCellID-derived data and synthetic demand can be incomplete or stale. Internet-facing deployments require a trusted TLS gateway for user authentication and shared multi-replica rate policy; the backend can enforce `RF_API_KEY` on expensive routes.

## Further Reading

- [Interactive architecture guide](./architecture.html)
- [API reference](./api.md)
- [Algorithms and physics](./algorithms.md)
- [Download and use](./download.html)
- [Deployment](./deployment.md)
