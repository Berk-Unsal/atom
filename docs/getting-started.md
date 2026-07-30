# Getting Started

The recommended way to run A.T.O.M is Docker Compose. For the visual, task-based version of this guide, open [Download and Use](./download.html).

## Prerequisites

- Docker Desktop or Docker Engine with Compose
- Git and [Git LFS](https://git-lfs.com/)
- Internet access during the first build and for the default OpenStreetMap basemap
- For source development: Go 1.26.5 and Node.js 24 or newer

## Get the Complete Repository

The Ankara building dataset is approximately 111 MB and is managed by Git LFS.

```bash
git lfs install
git clone https://github.com/Berk-Unsal/urban-ray-tracer.git
cd urban-ray-tracer
git lfs pull
```

If you use the [repository ZIP](https://github.com/Berk-Unsal/urban-ray-tracer/archive/refs/heads/main.zip), verify that `data-pipeline/ankara_buildings.geojson` is roughly 111 MB and contains GeoJSON rather than a Git LFS pointer. Clone with Git LFS if it does not.

## Docker Compose

Build and start the application from the repository root:

```bash
docker compose up --build -d atom
```

Open [http://localhost:8080](http://localhost:8080).

Verify that the runtime data and frontend are ready:

```bash
curl http://localhost:8080/readyz
docker compose logs -f atom
```

`/healthz` is a liveness check. `/readyz` returns success only when the required building data, tower data, and frontend bundle are available.

Stop the application:

```bash
docker compose down
```

Update an existing clone:

```bash
git pull --ff-only
git lfs pull
docker compose up --build -d atom
```

## Local Development

Run the backend and frontend in separate terminals.

### Go Backend

```bash
cd backend-go
go mod download
go run .
```

The API listens on `http://localhost:8080`.

### React Frontend

```bash
cd frontend-react
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies API requests to the Go service on port 8080.

## Optional 5G Core Lab

Core Lab is opt-in and applies only to 5G mode. Start the main application and adapter with:

```bash
export CORE_LAB_API_KEY="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.core-lab.yml \
  --profile core-lab up --build
```

The adapter is available only to the Compose service network and runs as a non-root, read-only service. It provides deterministic Xn-C, Xn-U, N2, and N3 communication-path state. Scenario changes require `CORE_LAB_API_KEY`. The adapter can probe configured Open5GS status or metrics endpoints, but it does not bundle a complete Open5GS deployment.

## First Use

### Create A Repeatable Project

1. Use the project selector in the command bar to rename the default project or create a new one.
2. Configure a plan and save a named scenario after each meaningful analysis.
3. Reopen scenarios from the project menu; stale results are labeled when inputs or runtime metadata no longer match.
4. Export a `.atom-project.json` file to move the full project to another browser or keep an external archive.

The five most recently used scenarios retain complete map layers. Older scenarios keep settings and summaries and may require a rerun.

### Build A Cell Inventory

1. Open **Inventory** to search or select the active local cells.
2. Choose **Place cell**, click the map, and drag the new marker or edit its coordinates precisely.
3. Configure the cell's carrier, link budget, radius/beam, antenna heights/tilts/orientation/patterns, interference load/reuse/PCI, and receiver assumptions.
4. Duplicate a cell to create a nearby sector, or import CSV/GeoJSON inventory records in bulk.
5. Resolve every inline validation error before running an analysis. The complete inventory and per-cell overrides autosave with the project.

Legacy Setup/Propagation values supply defaults when a cell has no explicit override. Use **Reset profile** to return a selected cell to those defaults.

### Single-Cell Sector Planning

1. Open **Setup**, select **Single** mode and a network technology, then choose a tower.
2. Open **Propagation** and set ray count, radius, azimuth, and beam width.
3. Select **Run Sector** in the command bar.
4. Inspect rays and gaps on the map or in **Results**.

### Network Evaluation and Optimization

1. Select **Network** mode and choose two to six cells.
2. Use **Evaluate Network** in the command bar to score the current plan.
3. Use **Optimize Network** in Propagation to test deterministic azimuth candidates.
4. Review score, demand reach, overlap, and before/after deltas in Results.

### Interference Analysis

1. Use 4G LTE or 5G NR and select at least two cells.
2. Open **Interference** and configure bandwidth, load, reuse, noise figure, and spacing.
3. Select **Analyze Interference**.
4. Switch between SINR, RSRP, and RSRQ, then inspect samples for serving-cell and strongest-interferer details.

### Compare Scenarios

1. Save at least two scenarios in the current project.
2. Open **Results**, then select **Compare**.
3. Choose exactly two scenarios to review RF, optimization, interference, demand, and communication-path deltas where available.
4. Use the A/B map switch to inspect one scenario surface at a time, or promote either side to the active plan.

### Candidate Site Recommendations

1. Use 4G or 5G Network mode and select two to five existing cells.
2. Draw the planning area on the map.
3. Open **Results**, select **Candidates**, and run the recommendation action.
4. Review deterministic candidate reasons and marginal KPIs, then use **Apply as scenario** to preserve the baseline.
5. Evaluate and analyze interference for the applied scenario before treating it as a preferred RF option.

Candidate records come from the active tower dataset and do not imply site availability, approval, cost, or backhaul feasibility.

### Validate Against Measurements

1. Prepare a CSV with `id`, `longitude`, `latitude`, `technology`, `rsrp_dbm`, and optional `cell_id` columns. `lon`, `lat`, and `rsrp` aliases are also accepted.
2. Open **Data**, import up to 5,000 4G or 5G rows, and evaluate them against the selected cells.
3. Inspect residual points and review MAE, RMSE, median bias, and per-cell statistics.
4. With at least 20 valid samples, review holdout error before explicitly applying the suggested global bias correction.

Applied correction is stored in the project and recorded in reports. It is a global bias adjustment, not full propagation calibration.

### Build Or Switch Dataset Packs

Use [Dataset Pack Studio](dataset-pack-studio.html) to preview source coverage, invalid geometry, CRS, and missing fields before building a local schema-v2 pack for another region. Validate its output with `go run ./cmd/validate-dataset /path/to/pack` from `backend-go`.

When the server has `ATOM_DATASETS_ROOT` configured, **Data** lists installed child packs with provenance and QA. Activating one clears current rendered analysis and inventory selection, then reloads the new immutable pack. Existing saved scenarios remain bound to their original dataset identity and are marked stale rather than silently reinterpreted.

### 5G Communication Paths

1. Start the optional Core Lab profile.
2. Select 5G Network mode with at least two cells.
3. Enable Core Lab from the **5G Core** tool.
4. Run Xn degraded or unavailable scenarios to observe direct Xn paths and N2 fallback through AMF; inspect N3 user-plane state separately.

### Results, Data, Layers, and Reports

- Use **Layers** on the map to show or hide rays, gaps, selected cells, interference, and communication paths.
- Select a tower, gap, path, interference sample, candidate, or measurement residual to open the persistent Inspector.
- Use **Data** to review dataset provenance, runtime/model versions, measurement evidence, RF assumptions, and exclusions.
- Use **Report** to export Markdown or a printable PDF report from the current plan state.

## Troubleshooting

### Git LFS Pointer Instead of GeoJSON

Run `git lfs install` and `git lfs pull`, then rebuild. A pointer file starts with `version https://git-lfs.github.com/spec/v1` and cannot be loaded as GeoJSON.

### Port Conflict

Stop the process using port 8080 or 5173. For Docker, change the host side of the port mapping in `docker-compose.yml`, such as `8081:8080`.

### Readiness Returns 503

Inspect the readiness JSON and `docker compose logs -f atom`. The usual causes are a missing LFS object, invalid dataset manifest/hash, missing tower/building data, or a frontend bundle that was not built.

Validate the active dataset directly with:

```bash
cd backend-go
go run ./cmd/validate-dataset ../data-pipeline
```

### RF Analysis Capacity Is Busy

A.T.O.M admits two RF jobs by default. A saturated request returns `429` with `Retry-After`. Let the active job finish, then retry; avoid starting optimization, interference, and repeated sector runs simultaneously.

### Blank Basemap

The RF engines and datasets run locally, but the default Leaflet layer requests OpenStreetMap tiles. Confirm network access or configure a separate local tile source.

## Next References

- [System architecture](./architecture.html)
- [REST API](./api.md)
- [RF algorithms](./algorithms.md)
- [Model limitations](./modeling-limits.md)
- [Deployment](./deployment.md)
