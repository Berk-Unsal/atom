# Deployment

A.T.O.M is local-first and stateless on the server. The production image serves the compiled React workspace, Go API, and an immutable active dataset-pack snapshot from a single non-root container.

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
| `BIND_ADDRESS` | `127.0.0.1` (`0.0.0.0` in container) | HTTP listener address; Compose publishes it on loopback by default |
| `PORT` | `8080` | Public HTTP listener inside the container |
| `FRONTEND_DIST_PATH` | `/app/dist` | Compiled frontend bundle |
| `ATOM_DATASET_DIR` | `/app/data-pipeline` | Directory containing `manifest.json` and referenced data files |
| `ATOM_DATASETS_ROOT` | unset | Local directory whose own pack and immediate child pack directories are listed for safe runtime switching |
| `DATASET_ADMIN_API_KEY` | unset | Require this key to activate an installed dataset pack by ID |
| `MAX_CONCURRENT_RF_REQUESTS` | `2` | Process-wide expensive RF admission limit |
| `MAX_CONCURRENT_RF_REQUESTS_PER_CLIENT` | `1` | Maximum simultaneous expensive jobs from one client identity |
| `RF_REQUESTS_PER_MINUTE` | `20` | Per-client expensive-route request budget per process |
| `RF_REQUEST_TIMEOUT_SECONDS` | `60` | Hard computation deadline for each expensive RF request |
| `RF_API_KEY` | unset | Require this key on expensive RF routes as a bearer token or `X-API-Key` when configured |
| `MAX_CONCURRENT_BUILDING_DOWNLOADS` | `2` | Process-wide admission limit for fresh full-dataset transfers |
| `MAX_CONCURRENT_BUILDING_DOWNLOADS_PER_CLIENT` | `1` | Maximum simultaneous full-dataset transfers from one client identity |
| `BUILDING_DOWNLOADS_PER_MINUTE` | `2` | Per-client fresh building-dataset transfer budget per process |
| `BUILDINGS_API_KEY` | unset | Require this key on the full building-dataset route when configured |
| `TRUSTED_PROXIES` | unset | Comma-separated proxy CIDRs whose forwarded client-IP headers are trusted |
| `REQUIRE_HTTPS` | `false` | Reject non-HTTPS requests with `426`; enable behind a TLS proxy that supplies `X-Forwarded-Proto` |
| `CORE_LAB_ENABLED` | `false` | Enables backend proxy routes for the optional adapter |
| `CORE_LAB_ADAPTER_URL` | `http://localhost:8090` | Internal adapter URL when Core Lab is enabled |
| `CORE_LAB_API_KEY` | unset | Required shared key for Core Lab scenario mutation when Core Lab is enabled |

The manifest-driven dataset directory is the authoritative data boundary; individual building and tower paths are not configured independently. `ATOM_DATASETS_ROOT` expands that boundary only to installed child packs and never permits client-supplied paths.

## Dataset Mounts

Validate a pack before deployment:

```bash
cd backend-go
go run ./cmd/validate-dataset /absolute/path/to/dataset
```

Mount one pack read-only and set `ATOM_DATASET_DIR`:

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

For a local catalog, make the initial pack a child of the mounted root and set both variables:

```yaml
services:
  atom:
    environment:
      ATOM_DATASET_DIR: /datasets/ankara
      ATOM_DATASETS_ROOT: /datasets
      DATASET_ADMIN_API_KEY: ${DATASET_ADMIN_API_KEY}
    volumes:
      - /absolute/path/to/installed-packs:/datasets:ro
```

The Data tool and `GET /api/datasets` list unique valid manifests. Activation submits only a manifest ID. The backend resolves entries beneath the configured root, validates every referenced hash plus tower/building usability, and atomically replaces the pack after success; ongoing requests retain their captured old snapshot. Failed candidates, duplicate IDs, and symlink escapes do not change the active pack. When `DATASET_ADMIN_API_KEY` is configured, a same-origin gateway must inject it because the browser does not store administration credentials.

Missing files, hash mismatches, invalid EPSG:4326 bounds, duplicate tower IDs, or unusable geometry keep initial readiness at `503`. See [Dataset Pack Studio](dataset-pack-studio.html) to build and validate arbitrary-region schema-v2 packs.

## Health And Capacity

- `GET /healthz` is process liveness and can succeed before the application is ready.
- `GET /readyz` requires valid data, loaded tower/building indexes, and the frontend bundle.
- Request bodies are limited to 1 MiB; oversized requests return `413`.
- Two RF jobs are admitted globally, but one client can run only one at a time by default. Each client also receives 20 expensive-route attempts per minute. Rejection returns `429`, `Retry-After`, and rate-budget headers.
- Fresh full-building-dataset responses are limited to two globally, one concurrently per client, and two per minute per client. A strong content-hash `ETag` and one-hour browser/shared-cache lifetime avoid retransferring the approximately 117 MB file; matching revalidations return `304` before download admission.
- Each expensive job has a 60-second computation deadline and uses no more than four workers. Ray, geometry, grid, measurement, and recommendation loops observe cancellation.
- Segmented-ray requests must satisfy `rays × ceil(radius_m / 25) ≤ 25,000`; a shared worker budget also prevents building-intersection splits from collecting or serializing more than 25,000 response features.
- HTTP timeouts are 5 seconds for headers, 15 seconds for reads, 120 seconds for writes, and 60 seconds idle.

Raise `MAX_CONCURRENT_RF_REQUESTS` or its per-client counterpart only after measuring CPU, memory, and tail latency with representative two-to-six-cell requests. Admission and request budgets are process-local; use a gateway for a shared multi-replica budget.

## Reverse Proxy Boundary

Compose binds the application to `127.0.0.1` by default. Set `ATOM_BIND_ADDRESS` only when another interface must accept traffic. For an internet-facing deployment, set strong `RF_API_KEY`, `BUILDINGS_API_KEY`, and `DATASET_ADMIN_API_KEY` values as applicable and place a trusted proxy or gateway in front of port 8080 for:

- TLS termination and authentication.
- Request-rate and source policy.
- Access logging and security headers.
- A response timeout longer than the backend's 120-second RF write window.

Authenticated clients send either `Authorization: Bearer <key>` or `X-API-Key: <key>`. The bundled browser UI does not store API keys, so deployments that enable either backend key should terminate user authentication at a same-origin gateway and inject the appropriate key there. Keep `TRUSTED_PROXIES` unset unless the server is actually behind those proxies; otherwise forwarded IP headers are ignored for per-client budgets.

The backend emits CSP, frame-ancestor, MIME-sniffing, referrer, permissions, and opener-policy headers on every response. HSTS is emitted for TLS requests. The container intentionally serves HTTP on its internal port; terminate TLS at the gateway and set `REQUIRE_HTTPS=true` after the gateway is configured to supply `X-Forwarded-Proto: https`.

The Core Lab overlay keeps the adapter private to the service network, runs it as a non-root user with a read-only filesystem, drops all Linux capabilities, and prevents privilege escalation. Use an explicit, separately reviewed override if direct host access is required for diagnostics.

## Optional 5G Core Lab

```bash
export CORE_LAB_API_KEY="$(openssl rand -hex 32)"
docker compose -f docker-compose.yml -f docker-compose.core-lab.yml \
  --profile core-lab up --build
```

The adapter does not deploy a complete Open5GS core. Without configured Open5GS endpoints it returns a deterministic `simulated_overlay`; with endpoints it briefly probes external health/metrics while preserving the same `/api/core/*` contracts. Both the backend mutation route and the adapter require `CORE_LAB_API_KEY`; the backend forwards its configured credential on the private adapter hop. Browser deployments should inject the key at a same-origin gateway rather than store it in frontend code.

## Tagged Multi-Architecture Images

Pushing a `v*` Git tag triggers `.github/workflows/release.yml`. The workflow:

1. Pulls Git LFS data.
2. Builds Linux AMD64 and ARM64 images.
3. Embeds the tag and commit into `/api/meta` using Go linker values.
4. Publishes semantic-version tags to `ghcr.io/<repository-owner>/atom` with SPDX SBOM and provenance attestations.

Every external action used by the quality and release workflows is pinned to a full commit SHA, with its release version retained in a comment for review. Container build stages retain readable version tags but are also pinned to immutable multi-architecture image digests. CI rejects mutable build inputs, reviews dependency changes on pull requests, builds the production and Core Lab adapter images, stores SPDX JSON SBOMs, and fails on fixable high or critical vulnerabilities. Checkout does not persist its Git credential, and weekly Dependabot updates keep reviewed action, module, Python, and container pins current.

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
- Public deployments enforce TLS and user authentication at the gateway and set `RF_API_KEY` plus `BUILDINGS_API_KEY` on the backend hop.

See [Download and Use](download.html), [System Architecture](architecture.html), and the [OpenAPI contract](openapi.yaml).
