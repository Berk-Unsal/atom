# Frequently Asked Questions

## Product And Model

### What is A.T.O.M for?

A.T.O.M is a local-first workspace for deterministic urban RF planning. It supports sector propagation, demand gaps, multi-cell evaluation and optimization, 4G/5G interference analysis, candidate-site recommendations, measurement residual analysis, scenario comparison, and an optional 5G communication-path overlay.

### Are the results field measurements?

No. RSRP, SINR, RSRQ, RSSI, coverage, and demand KPIs are planning estimates from the configured model and dataset. They are not UE, drive-test, channel-sounder, or PHY measurements.

### Which propagation model is used?

The default model combines free-space path loss with antenna gain, beam/radius eligibility, exact building intersections, and cumulative frequency-dependent wall loss. It does not currently implement Okumura-Hata, diffraction, reflections, fading, terrain, sidelobes, MIMO scheduling, or uplink propagation.

### Why can SINR be close to 0 dB?

When the serving cell and strongest co-channel interferer arrive at nearly equal power, their linear power ratio approaches one, which is `0 dB`. This is expected even when RSRP is strong. Reuse factor, load, geometry, and directional sectors can change that relationship.

### Why does a sample say no signal?

A cell contributes only when the point is inside its configured radius and beam. High path loss or cumulative wall attenuation can then push modeled power below the signal floor. The interference Inspector lists serving-cell, wall, radius, beam, and interferer context where available.

### Does measurement import calibrate the complete model?

No. A.T.O.M compares measured and predicted RSRP and may suggest one robust global path-loss bias when at least 20 valid samples exist. A deterministic holdout reports whether that correction improves unseen samples. It does not fit separate wall, clutter, terrain, or fading parameters.

### What is the 6G mode?

The 140 GHz mode is an exploratory Sub-THz propagation overlay. Interference analysis, measurement validation, recommendations, and 5G Core language are intentionally unavailable where their assumptions are unsupported.

## Projects And Results

### Where are projects stored?

Projects are stored in the current browser through IndexedDB. Saves are serialized, and local storage is used only when an IndexedDB write fails. If both copies exist, persistence revisions select the newest valid workspace. The server remains stateless. Export a versioned `.atom-project.json` file for backup or transfer to another browser.

### Why is a saved result marked stale?

The saved inputs, dataset, model, or calibration profile no longer match the active workspace. A.T.O.M preserves the scenario but requires a rerun before treating its result as current.

### Why do old scenarios not contain every map layer?

To bound browser storage, complete GeoJSON artifacts are retained for the five most recently used scenarios. Older scenarios retain settings, exact requests, metadata, and compact summaries.

### What does candidate recommendation guarantee?

It ranks unselected records from the active tower dataset by bounded, deterministic RF and demand scoring inside the drawn area. It does not establish ownership, rooftop access, permitting, cost, power, fiber, backhaul, or construction feasibility. Analyze interference after applying a recommendation.

## Data

### Can I use a region other than Ankara?

Yes, through a validated dataset pack. Set `ATOM_DATASET_DIR` to a directory containing the versioned manifest and referenced tower/building files, then restart the application. The validator checks schema, CRS, coordinates, geometry, duplicate IDs, and SHA-256 hashes.

```bash
cd backend-go
go run ./cmd/validate-dataset -dataset-dir /path/to/dataset
```

The application does not yet download or build arbitrary cities from the browser.

### Why does `/readyz` return 503?

Read the JSON response and container logs. Readiness requires a valid dataset manifest and hashes, loaded towers/buildings, a built frontend bundle, and successful startup indexing. `/healthz` only confirms process liveness.

### Does the default app work fully offline?

RF computation, project storage, and datasets are local. The default Leaflet basemap still requests OpenStreetMap tiles unless you configure or cache a local tile source.

### Why is Git LFS required?

The default Ankara building GeoJSON is larger than a normal Git object. A Git LFS pointer is not valid GeoJSON, so source installations should run `git lfs pull` before building.

## Runtime And API

### Is there a documented REST API?

Yes. The [API Reference](api.html) and downloadable [OpenAPI 3.1 specification](openapi.yaml) cover RF simulation, gaps, optimization, network evaluation, interference, recommendations, measurement evaluation, metadata, datasets, and Core Lab routes.

### Why did an RF request return 429?

A.T.O.M admits two RF jobs globally, one per client, and 20 expensive-route attempts per client each minute by default. Global capacity, per-client concurrency, or budget exhaustion returns `429` with `Retry-After` and rate-budget headers. Let active work finish or tune the corresponding limit cautiously.

### What request limits apply?

POST bodies are limited to 1 MiB. Expensive work has a 60-second default computation deadline and deep-loop cancellation. The HTTP server also uses bounded header, read, write, and idle timeouts. Frontend operations cancel superseded work, reject stale responses, and sequence sector simulation and gap analysis.

### Is the server stateless?

Yes. RF results and projects are not stored by the Go service. This allows multiple API replicas, but browser projects are not automatically shared between them or between users.

### Does the API require authentication?

Local-only use does not require it. Set `RF_API_KEY` to require a bearer token or `X-API-Key` on expensive RF routes. Internet-facing deployments should authenticate users at a trusted TLS gateway, inject that backend key, and enforce a shared gateway rate policy in addition to the built-in per-process client budget.

## 5G Core Lab

### Does Core Lab deploy Open5GS?

No. The optional adapter provides deterministic 5G topology, health, session, event, and scenario state and can probe configured Open5GS endpoints. It does not bundle a complete mobile core.

### Why is Core Lab unavailable in 4G or 6G?

Its terminology and paths model 5GS behavior: Xn-C/Xn-U, N2 via AMF, and N3 via UPF. A.T.O.M does not relabel those interfaces as LTE/EPC or speculative 6G Core behavior.

## Installation And Troubleshooting

### What is the recommended installation path?

Clone with Git LFS and use Docker Compose:

```bash
git lfs install
git clone https://github.com/Berk-Unsal/urban-ray-tracer.git
cd urban-ray-tracer
git lfs pull
docker compose up --build -d atom
```

Open `http://localhost:8080` and verify `http://localhost:8080/readyz`.

### Can I run on Apple Silicon?

Yes. Local Docker builds support ARM64, and tagged releases are intended to publish multi-architecture images.

### How do I report a problem?

Include the application/model/dataset versions from Data or `/api/meta`, the exact request or exported project, the readiness response, and relevant logs in a [GitHub issue](https://github.com/Berk-Unsal/urban-ray-tracer/issues).

See [Download and Use](download.html), [System Architecture](architecture.html), and [Model Limitations](modeling-limits.html) for deeper guidance.
