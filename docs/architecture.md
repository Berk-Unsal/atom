# A.T.O.M System Architecture

The interactive architecture guide is available at [architecture.html](./architecture.html).

A.T.O.M is a local-first React and Go application. The browser owns planning state, request orchestration, map presentation, inspection, and report assembly. The Go service owns request validation, bounded RF computation, spatial querying, and the optional Core Lab proxy.

## System at a Glance

```text
Planner / API consumer
        |
        v
React workspace and Leaflet map
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
        |
        +--> in-memory building R-tree and tower store
        |
        +--> optional 5G Core proxy --> Core Lab adapter --> optional Open5GS
```

The production Docker image contains the built frontend, Go binary, and local Ankara data. There is no runtime database. Leaflet currently requests OpenStreetMap basemap tiles over the network unless a separate local tile source is configured.

## Frontend Workspace

The React application is organized around a map-first focused workspace:

- **Command bar**: active plan context, run state, RF action, and latest result summary.
- **Workflow rail**: Setup, Propagation, Interference, 5G Core, Results, Data, and Report.
- **Overlay drawer**: opens one focused tool without resizing or recentering the map.
- **MapCanvas**: renders towers, rays, coverage gaps, selection geometry, interference samples, and 5G communication paths.
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

## Go API Boundary

The Gin service provides:

- CORS for local Vite development.
- A 1 MiB request-body limit.
- Pointer-aware request DTOs so omitted values can receive defaults without replacing valid explicit zero values.
- Route-specific validation before engine execution.
- Client-context propagation into RF engines.
- Two concurrent RF jobs by default through `MAX_CONCURRENT_RF_REQUESTS`.
- Up to four Go workers inside each expensive RF job.
- `429 Too Many Requests` plus `Retry-After` when RF capacity is saturated.
- Five-second header, 15-second read, 120-second write, and 60-second idle timeouts.

### Principal Routes

| Method | Route | Responsibility |
|---|---|---|
| GET | `/healthz` | Process liveness and loaded-data counts |
| GET | `/readyz` | Building, tower, and frontend readiness |
| GET | `/api/towers` | Tower GeoJSON |
| GET | `/api/buildings` | Building GeoJSON |
| GET | `/api/buildings/summary` | Demand and data-quality summary |
| POST | `/api/simulate` | Segmented directional propagation |
| POST | `/api/coverage-gaps` | Demand-weighted underserved buildings |
| POST | `/api/optimize-azimuth` | Single-sector demand-aware azimuth sweep |
| POST | `/api/evaluate-network` | Score supplied selected-cell azimuths |
| POST | `/api/optimize-network` | Optimize selected-cell azimuths with overlap penalty |
| POST | `/api/interference` | RSRP, SINR, RSRQ, RSSI, and demand-quality analysis |
| GET/POST | `/api/core/*` | Optional Core Lab proxy |

## Runtime Data and Spatial Index

The offline data pipeline prepares the runtime files ahead of time:

1. Extract building geometry and tower records from OSM/OpenCellID-derived sources.
2. Normalize footprints and add POI, residential, and local-density demand signals.
3. Write local GeoJSON/CSV artifacts.
4. Store the large building GeoJSON through Git LFS.
5. Parse buildings and populate an in-memory R-tree during backend startup.

Each RF engine first queries bounded candidates from the R-tree, then applies exact geometry, radius, sector, and intersection tests. This avoids scanning the complete building dataset for every ray or demand point.

## Propagation Engine

For each sampled angle inside the active beam, the propagation engine:

1. Converts the requested geographic radius into ray segments.
2. Queries candidate building bounds from the R-tree.
3. Performs exact segment/polygon intersection tests.
4. Calculates free-space path loss and antenna gain.
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

## Request Lifecycles

### Run Sector

The browser submits `/api/simulate` and `/api/coverage-gaps` in parallel with one cancellation signal. Both results must remain current before the map and RF result view are updated.

### Optimize Sector

The browser captures a Before snapshot, requests `/api/optimize-azimuth`, reruns propagation and gap analysis with the returned azimuth, and commits the After comparison.

### Evaluate or Optimize Network

The backend first returns network scoring. The browser then simulates selected cells sequentially and merges their ray collections for map rendering.

### Analyze Interference

One `/api/interference` call returns the radio-quality surface, bounded demand points, aggregate statistics, per-cell summaries, and the exact assumptions needed by the Data and Report tools.

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
3. Copies the binary, frontend bundle, and runtime data into Alpine.
4. Runs as a non-root `atom` user.
5. Exposes port 8080 and checks `/readyz`.

### Optional Core Lab Profile

The compose overlay sets `CORE_LAB_ENABLED=true`, points the backend at the adapter, and starts the adapter as a separate service. It does not start a full Open5GS deployment by itself.

## Trust and Model Boundaries

A.T.O.M does not currently include:

- Diffraction or reflection-heavy multipath.
- Fast fading or calibrated channel models.
- Sidelobes or adjacent-channel leakage.
- MIMO beamforming and scheduling gain.
- Uplink interference.
- A plan database or durable analysis history.
- Authentication or multi-user collaboration.
- A bundled offline basemap.

Static OSM/OpenCellID-derived data and synthetic demand can be incomplete or stale. Internet-facing deployments require a trusted reverse proxy or gateway because the API does not provide built-in authentication.

## Further Reading

- [Interactive architecture guide](./architecture.html)
- [API reference](./api.md)
- [Algorithms and physics](./algorithms.md)
- [Download and use](./download.html)
- [Deployment](./deployment.md)
- [Academic report](./academic-report.pdf)
