# Getting Started

The recommended way to run A.T.O.M is Docker Compose. For the visual, task-based version of this guide, open [Download and Use](./download.html).

## Prerequisites

- Docker Desktop or Docker Engine with Compose
- Git and [Git LFS](https://git-lfs.com/)
- Internet access during the first build and for the default OpenStreetMap basemap
- For source development: Go 1.22 and Node.js 18 or newer

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
docker compose -f docker-compose.yml -f docker-compose.core-lab.yml \
  --profile core-lab up --build
```

The adapter provides deterministic Xn-C, Xn-U, N2, and N3 communication-path state. It can probe configured Open5GS status or metrics endpoints, but it does not bundle a complete Open5GS deployment.

## First Use

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

### 5G Communication Paths

1. Start the optional Core Lab profile.
2. Select 5G Network mode with at least two cells.
3. Enable Core Lab from the **5G Core** tool.
4. Run Xn degraded or unavailable scenarios to observe direct Xn paths and N2 fallback through AMF; inspect N3 user-plane state separately.

### Results, Data, Layers, and Reports

- Use **Layers** on the map to show or hide rays, gaps, selected cells, interference, and communication paths.
- Select a tower, gap, path, or interference sample to open the persistent Inspector.
- Use **Data** to review dataset confidence, RF assumptions, and exclusions.
- Use **Report** to export Markdown or a printable PDF report from the current plan state.

## Troubleshooting

### Git LFS Pointer Instead of GeoJSON

Run `git lfs install` and `git lfs pull`, then rebuild. A pointer file starts with `version https://git-lfs.github.com/spec/v1` and cannot be loaded as GeoJSON.

### Port Conflict

Stop the process using port 8080 or 5173. For Docker, change the host side of the port mapping in `docker-compose.yml`, such as `8081:8080`.

### Readiness Returns 503

Inspect the readiness JSON and `docker compose logs -f atom`. The usual causes are a missing LFS object, missing tower data, or a frontend bundle that was not built.

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
