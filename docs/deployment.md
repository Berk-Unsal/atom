# Deployment

A.T.O.M is local-first and stateless on the server. The production image serves the compiled React workspace, Go API, and one validated dataset pack from a single non-root container.

## Recommended Local Deployment

```bash
git lfs install
git clone https://github.com/Berk-Unsal/urban-ray-tracer.git
cd urban-ray-tracer
git lfs pull
docker compose up --build -d atom
curl --fail http://localhost:8080/readyz
```

Open `http://localhost:8080`. Stop the service with `docker compose down`.

## Runtime Topology

| Component | Default | Responsibility |
|---|---|---|
| `atom` container | Required | Static frontend, REST API, RF engines, spatial index, active dataset pack |
| Browser IndexedDB | Required for projects | Local project/scenario history; not shared across users |
| OpenStreetMap tiles | External by default | Visual basemap only; RF computation remains local |
| `core-lab-adapter` | Optional profile | Deterministic 5G path state and optional Open5GS probes |

The Go server does not persist projects, jobs, reports, or measurements. Multiple API replicas can serve independent requests, but browser projects do not become collaborative storage.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Public HTTP listener inside the container |
| `FRONTEND_DIST_PATH` | `/app/dist` | Compiled frontend bundle |
| `ATOM_DATASET_DIR` | `/app/data-pipeline` | Directory containing `manifest.json` and referenced data files |
| `MAX_CONCURRENT_RF_REQUESTS` | `2` | Process-wide expensive RF admission limit |
| `CORE_LAB_ENABLED` | `false` | Enables backend proxy routes for the optional adapter |
| `CORE_LAB_BASE_URL` | unset | Internal adapter URL when Core Lab is enabled |

The manifest-driven dataset directory is the authoritative data boundary; individual building and tower paths are not configured independently.

## Dataset Mounts

Validate a pack before deployment:

```bash
cd backend-go
go run ./cmd/validate-dataset /absolute/path/to/dataset
```

Mount it read-only and set `ATOM_DATASET_DIR`:

```yaml
services:
  atom:
    build: .
    ports:
      - "8080:8080"
    environment:
      ATOM_DATASET_DIR: /datasets/region
    volumes:
      - /absolute/path/to/dataset:/datasets/region:ro
```

A dataset change requires restart. Missing files, hash mismatches, invalid EPSG:4326 bounds, duplicate tower IDs, or unusable geometry keep readiness at `503` with an explanatory dataset error.

## Health And Capacity

- `GET /healthz` is process liveness and can succeed before the application is ready.
- `GET /readyz` requires valid data, loaded tower/building indexes, and the frontend bundle.
- Request bodies are limited to 1 MiB; oversized requests return `413`.
- Two RF jobs are admitted by default; saturation returns `429` and `Retry-After`.
- Expensive jobs use no more than four workers each and observe client cancellation where supported.
- HTTP timeouts are 5 seconds for headers, 15 seconds for reads, 120 seconds for writes, and 60 seconds idle.

Raise `MAX_CONCURRENT_RF_REQUESTS` only after measuring CPU, memory, and tail latency with representative two-to-six-cell requests. A load balancer cannot share the in-process admission counter between replicas.

## Reverse Proxy Boundary

The application has no built-in authentication. An internet-facing deployment should place a trusted proxy or gateway in front of port 8080 for:

- TLS termination and authentication.
- Request-rate and source policy.
- Access logging and security headers.
- A response timeout longer than the backend's 120-second RF write window.

Keep the Core Lab adapter private to the service network unless direct access is explicitly required.

## Optional 5G Core Lab

```bash
docker compose -f docker-compose.yml -f docker-compose.core-lab.yml \
  --profile core-lab up --build
```

The adapter does not deploy a complete Open5GS core. Without configured Open5GS endpoints it returns a deterministic `simulated_overlay`; with endpoints it briefly probes external health/metrics while preserving the same `/api/core/*` contracts.

## Tagged Multi-Architecture Images

Pushing a `v*` Git tag triggers `.github/workflows/release.yml`. The workflow:

1. Pulls Git LFS data.
2. Builds Linux AMD64 and ARM64 images.
3. Embeds the tag and commit into `/api/meta` using Go linker values.
4. Publishes semantic-version tags to `ghcr.io/<repository-owner>/atom`.

Use immutable version tags in deployments. The running application exposes its version, commit, model version, and dataset identity in Data and `/api/meta`.

## Upgrade And Rollback

Before an upgrade, export important `.atom-project.json` files. Then:

```bash
git pull
git lfs pull
docker compose up --build -d atom
curl --fail http://localhost:8080/readyz
```

Imported projects include a schema version and dataset reference. A mismatch is surfaced rather than silently treating previous results as current. Roll back by deploying the previous immutable image/source tag and its matching dataset pack.

## Verification Checklist

- `/healthz`, `/readyz`, and `/api/meta` return expected process, version, model, and dataset details.
- The Data tool shows the intended pack provenance and hashes.
- A single sector run completes and report metadata matches `/api/meta`.
- A concurrent-capacity test returns bounded `429` behavior instead of unbounded CPU growth.
- Project export/import works in a clean browser profile.
- Public deployments enforce TLS and authentication outside the app.

See [Download and Use](download.html), [System Architecture](architecture.html), and the [OpenAPI contract](openapi.yaml).
