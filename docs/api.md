# API Reference

A.T.O.M exposes a comprehensive REST API for programmatic access to all simulation and optimization features.

## Base URL

```
http://localhost:8080/api
```

Or in production:

```
https://your-domain.com/api
```

## Authentication

Expensive RF routes can require a shared backend key by setting `RF_API_KEY`. Send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`; an invalid or missing key receives `401`. The setting is off for localhost-only development. Public deployments should authenticate users at a TLS gateway and inject this backend key rather than exposing it to browser JavaScript.

## Response Format

All responses are **JSON**, but the exact shape depends on the route:

- `GET /healthz` returns a liveness status object
- `GET /readyz` returns dependency readiness
- `GET /api/meta` returns application, model, and active dataset identity
- `GET /api/buildings` and `GET /api/towers` return raw GeoJSON
- `POST /api/analyze-sector` returns `{ simulation, coverage_gaps }` from one shared ray-profile computation
- `POST /api/simulate` returns `{ geojson, stats }`
- `POST /api/coverage-gaps` returns `{ geojson, stats }`
- `POST /api/interference` returns `{ geojson, demand_geojson, stats, model }`
- `POST /api/optimize-azimuth` returns `{ optimal_azimuth, coverage_score, demand_score, residential_score }`
- `POST /api/recommend-sites` returns a baseline plus ranked candidate records and GeoJSON
- `POST /api/measurements/evaluate` returns residual GeoJSON, error statistics, and bias guidance

Error responses use a simple object with an `error` message.

---

## Endpoints

### Health Check

**Endpoint**: `GET /healthz`

Check whether the HTTP process is alive. This endpoint remains `200` even while required datasets or the frontend bundle are unavailable.

**Response**:

```json
{
  "status": "ok",
  "backend": "static-in-memory",
  "buildingIndex": {
    "sourcePath": "data-pipeline/ankara_buildings.geojson"
  },
  "rtreeFootprints": 161784,
  "towerCount": 451
}
```

**Status Codes**:
- `200 OK` - Process is alive

### Readiness Check

**Endpoint**: `GET /readyz`

Check whether the building index, tower dataset, and frontend bundle are available. Use this route for deployment readiness probes.

```json
{
  "status": "ready",
  "buildings": true,
  "towers": true,
  "frontend": true
}
```

**Status Codes**:
- `200 OK` - Instance is ready to receive traffic
- `503 Service Unavailable` - At least one required dependency is unavailable

### Reproducibility Metadata

**Endpoint**: `GET /api/meta`

Returns the running application and model versions, build commit, supported technology modes, and the validated dataset manifest. Store this response with planning scenarios and reports when exact reproduction matters.

```json
{
  "application_version": "1.0.0",
  "build_commit": "abc1234",
  "model_version": "fspl-walls-v1",
  "supported_technologies": ["4g", "5g", "6g-research"],
  "dataset": {
    "id": "ankara-open-planning",
    "version": "2026.07",
    "crs": "EPSG:4326"
  }
}
```

---

### Get Buildings

**Endpoint**: `GET /api/buildings`

Retrieve all building geometries as GeoJSON.

**Query Parameters**: None

**Response**:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "building": "concrete",
        "name": "Ankara Central Tower",
        "height": 45
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[33.8, 39.9], [33.801, 39.9], [33.8, 39.9]]]
      }
    }
  ]
}
```

**Performance**: ~100 MB response, consider client-side filtering.

---

### Get Towers

**Endpoint**: `GET /api/towers`

Retrieve all 5G/4G tower locations.

**Query Parameters**: None

**Response**:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "cell_id": 20560152,
        "radio_type": "NR",
        "is_simulated": false
      },
      "geometry": {
        "type": "Point",
        "coordinates": [32.8541, 39.9208]
      }
    }
  ]
}
```

---

### Analyze Sector

**Endpoint**: `POST /api/analyze-sector`

This is the preferred browser workflow when both propagation rays and coverage gaps are needed. It accepts the same body as `/api/simulate`, computes ray profiles and building interactions once, and returns:

```json
{
  "simulation": { "geojson": {}, "stats": {} },
  "coverage_gaps": { "geojson": {}, "stats": {} }
}
```

The standalone `/api/simulate` and `/api/coverage-gaps` endpoints remain available when a client needs only one result.

---

### Simulate Propagation

**Endpoint**: `POST /api/simulate`

Run RF propagation simulation with given parameters.

**Request Body**:

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "azimuth": 45,
  "beam_width": 120
}
```

**Parameters**:

| Parameter | Type | Range | Required | Description |
|-----------|------|-------|----------|-------------|
| `tower_lon` | number | -180 - 180 | Yes | Tower longitude |
| `tower_lat` | number | -90 - 90 | Yes | Tower latitude |
| `rays` | number | 8 - 720 | No | Ray count used to sample the sector; defaults to 60 |
| `radius_m` | number | 25 - 5000 | No | Maximum requested simulation radius; defaults to 400 |
| `frequency_ghz` | number | > 0 - 300 | No | Network frequency in GHz; defaults to 28 |
| `tx_power_dbm` | number | 0 - 60 | No | Transmit power before antenna gain; defaults to 30 |
| `azimuth` | number | Any finite angle | No | Antenna direction, normalized to 0-360; defaults to 0 |
| `beam_width` | number | 10 - 360 | No | Sector width in degrees; defaults to 120 |

**Response**:

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "ray_index": 0,
          "segment_index": 0,
          "signal_dbm": -78.4,
          "is_blocked": false
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [[32.8541, 39.9208], [32.856, 39.922]]
        }
      }
    ]
  },
  "stats": {
    "blocked_pct": 42.5,
    "avg_rx_dbm": -88.2,
    "min_range_m": 24.7,
    "max_range_m": 398.1
  }
}
```

**Status Codes**:
- `200 OK` - Simulation completed successfully
- `400 Bad Request` - Invalid parameters
- `413 Content Too Large` - Request body exceeds 1 MiB
- `429 Too Many Requests` - RF worker capacity is busy; inspect `Retry-After`
- `500 Internal Server Error` - Simulation error

**Performance**:
- Runtime depends on ray count, radius, and local building density.
- Maximum rays: 720 per request.
- The server uses a 120-second write timeout and caps each RF job at four workers.

---

### Find Coverage Gaps

**Endpoint**: `POST /api/coverage-gaps`

Find demand-weighted buildings inside the selected sector whose estimated received power is below the usable service threshold.

**Request Body**:

Uses the same payload as `POST /api/simulate`.

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "azimuth": 45,
  "beam_width": 120
}
```

**Response**:

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "building_id": "building-2841",
          "rx_dbm": -117.6,
          "total_demand": 42.5,
          "demand_weight": 20,
          "residential_demand": 22.5,
          "severity": "outage",
          "reason": "commercial + residential demand"
        },
        "geometry": {
          "type": "Point",
          "coordinates": [32.8562, 39.9211]
        }
      }
    ]
  },
  "stats": {
    "candidate_buildings": 128,
    "served_buildings": 97,
    "gap_buildings": 31,
    "returned_gaps": 31,
    "gap_pct": 24.2,
    "total_gap_demand": 618.5,
    "worst_rx_dbm": -126.4,
    "threshold_dbm": -105
  }
}
```

**How it works**:

- Candidate buildings must have `demand_weight + residential_demand > 0`
- The building centroid must be inside the requested radius and beam sector
- Received power is estimated with EIRP, FSPL, and cumulative wall penetration loss
- Returned point features are sorted by demand, then by weakest estimated signal

---

### Analyze Interference and Radio Quality

**Endpoint**: `POST /api/interference`

Calculate planning-grade LTE or NR RSRP, SINR, RSRQ, RSSI, serving-cell, and strongest-interferer estimates over a bounded spatial grid and demand-building centroids.

```json
{
  "network_tech": "5g",
  "towers": [
    { "id": "cell-1", "tower_lon": 32.8541, "tower_lat": 39.9208, "azimuth": 45 },
    { "id": "cell-2", "tower_lon": 32.8581, "tower_lat": 39.9218, "azimuth": 225 }
  ],
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "bandwidth_mhz": 100,
  "load_factor": 0.7,
  "reuse_factor": 1,
  "noise_figure_db": 7,
  "sample_spacing_m": 40
}
```

The request accepts 2–6 unique cells. LTE bandwidths are `1.4`, `3`, `5`, `10`, `15`, or `20` MHz; 5G NR bandwidths are `50`, `100`, `200`, or `400` MHz. Reuse must be `1` or `3`. 6G is rejected because standardized project-level RSRP/RSRQ assumptions are not defined for the research overlay.

The response contains:

- `geojson`: up to 3,000 grid samples with radio KPIs and serving/interferer context.
- `demand_geojson`: up to 500 affected demand-building centroids.
- `stats`: average and P10 radio quality, serviceable area, interference-limited area, affected demand, and per-cell summaries. `valid_sample_count` reports the number of samples with usable measurements; average and P10 fields are `null` when that count is zero.
- `model`: bandwidth, SCS, resource blocks, load, reuse, effective spacing, and explicit modeling assumptions.

Results are deterministic planning estimates, not measurements reported by a UE or live radio network.

Optional numeric fields receive defaults only when omitted. Explicit zero values remain explicit: for example, `noise_figure_db: 0` is valid, while `load_factor: 0` is rejected by range validation.

---

### Optimize Antenna Placement

**Endpoint**: `POST /api/optimize-azimuth`

Automatically find the optimal antenna azimuth for maximum coverage.

**Request Body**:

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "azimuth": 45,
  "beam_width": 120
}
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tower_lon` | number | Yes | Tower longitude |
| `tower_lat` | number | Yes | Tower latitude |
| `rays` | number | Yes | Ray count used to sample the sector |
| `radius_m` | number | Yes | Maximum requested simulation radius |
| `frequency_ghz` | number | Yes | Network frequency in GHz |
| `tx_power_dbm` | number | Yes | Transmit power before antenna gain |
| `azimuth` | number | Yes | Current azimuth seed value |
| `beam_width` | number | Yes | Sector width in degrees |

**Response**:

```json
{
  "optimal_azimuth": 42,
  "coverage_score": 18320.5,
  "demand_score": 140000,
  "residential_score": 86000,
  "hit_demand_buildings": 18,
  "data_quality": "good"
}
```

**Response Fields**:

| Field | Description |
|-------|-------------|
| `optimal_azimuth` | Recommended antenna direction (0-360°) |
| `coverage_score` | Capped distance-based tie-breaker score |
| `demand_score` | POI/commercial/critical-building score |
| `residential_score` | Residential-density demand score |
| `hit_demand_buildings` | Unique demand-weighted buildings reached by the winning sector |
| `data_quality` | Summary of local demand metadata quality |

**Status Codes**:
- `200 OK` - Optimization succeeded
- `400 Bad Request` - Invalid parameters
- `413 Content Too Large` - Request body exceeds 1 MiB
- `429 Too Many Requests` - RF worker capacity is busy
- `500 Internal Server Error` - Optimization error

**Performance**:
- Typical response time: 3-5 seconds
- Parallelization: Up to four workers per RF request
- Server write timeout: 120 seconds

---

## Planning Product Endpoints

### Recommend Candidate Cells

**Endpoint**: `POST /api/recommend-sites`

Ranks known, unselected tower records inside a search polygon for a 4G or 5G network containing two to five selected cells. The backend prefilters candidates by nearby unmet demand, optimizes only the candidate azimuth, and returns at most the requested number of deterministic recommendations.

```json
{
  "network_tech": "5g",
  "towers": [
    { "id": "101", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90 },
    { "id": "102", "tower_lon": 32.852, "tower_lat": 39.921, "azimuth": 180 }
  ],
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "search_polygon": [[32.84, 39.91], [32.87, 39.91], [32.87, 39.94], [32.84, 39.94]],
  "max_results": 5
}
```

Candidate records are not approved deployment sites. Cost, backhaul, permitting, and interference are not included in candidate scoring; run `/api/interference` after applying a candidate.

### Evaluate Field Measurements

**Endpoint**: `POST /api/measurements/evaluate`

Compares one to 5,000 measured 4G or 5G RSRP points with the deterministic model. At least one selected cell is required. With 20 or more valid predictions, the response includes a robust global bias suggestion evaluated against a deterministic 20% holdout.

```json
{
  "network_tech": "5g",
  "towers": [{ "id": "101", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90 }],
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "bandwidth_mhz": 100,
  "noise_figure_db": 7,
  "samples": [
    { "id": "drive-001", "lon": 32.851, "lat": 39.921, "technology": "5g", "rsrp_dbm": -91, "cell_id": "101" }
  ]
}
```

The response separates valid predictions, no-signal samples, and requested-cell mismatches before reporting residual MAE, RMSE, mean/median bias, and per-cell statistics. The correction is a single dB path-loss offset, not full propagation calibration. When applied, send `calibration_offset_db` with compatible simulation, network, interference, recommendation, and measurement requests. Accepted range is `-40` to `40` dB.

### Dataset Packs

The backend loads one validated pack from `ATOM_DATASET_DIR` at startup. A pack contains `manifest.json`, tower GeoJSON, and building GeoJSON. The manifest fixes the dataset identity, EPSG:4326 bounds, provenance, licenses, filenames, and SHA-256 hashes. Invalid packs keep `/readyz` at `503`.

Validate a pack before starting the server:

```bash
cd backend-go
go run ./cmd/validate-dataset ../data-pipeline
```

The complete machine-readable contract is available as [`openapi.yaml`](openapi.yaml).

## Usage Examples

### Example 1: Get Health Status

```bash
curl -X GET http://localhost:8080/healthz
```

### Example 2: Simulate 5G Coverage

```bash
curl -X POST http://localhost:8080/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 120,
    "radius_m": 400,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 90,
    "beam_width": 120
  }'
```

### Example 3: Auto-Optimize Antenna

```bash
curl -X POST http://localhost:8080/api/optimize-azimuth \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 120,
    "radius_m": 400,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 90,
    "beam_width": 120
  }'
```

### Example 4: Find Coverage Gaps

```bash
curl -X POST http://localhost:8080/api/coverage-gaps \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 120,
    "radius_m": 400,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 90,
    "beam_width": 120
  }'
```

### Example 5: Fetch All Towers

```bash
curl -X GET "http://localhost:8080/api/towers"
```

---

## Client Examples

### Go Standard Library

```go
package main

import (
    "bytes"
    "net/http"
)

func main() {
    payload := []byte(`{
      "tower_lon": 32.8541,
      "tower_lat": 39.9208,
      "frequency_ghz": 28,
      "tx_power_dbm": 30,
      "rays": 120,
      "radius_m": 400,
      "azimuth": 90,
      "beam_width": 120
    }`)
    request, _ := http.NewRequest(
        http.MethodPost,
        "http://localhost:8080/api/simulate",
        bytes.NewReader(payload),
    )
    request.Header.Set("Content-Type", "application/json")
    response, err := http.DefaultClient.Do(request)
    if err != nil {
        panic(err)
    }
    defer response.Body.Close()
}
```

### Python Client

```python
import requests

client = requests.Session()
response = client.post(
    'http://localhost:8080/api/simulate',
    json={
        'tower_lon': 32.8541,
        'tower_lat': 39.9208,
        'rays': 120,
        'radius_m': 400,
        'frequency_ghz': 28,
        'tx_power_dbm': 30,
        'azimuth': 45,
        'beam_width': 120
    }
)

data = response.json()
print(data['geojson'])
```

### JavaScript Client

```javascript
async function simulateRF(params) {
  const response = await fetch('http://localhost:8080/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  
  const data = await response.json();
  return data.geojson;
}

const coverage = await simulateRF({
  tower_lon: 32.8541,
  tower_lat: 39.9208,
  rays: 120,
  radius_m: 400,
  frequency_ghz: 28,
  tx_power_dbm: 30,
  azimuth: 45,
  beam_width: 120
});
```

---

## Capacity and Rate Limiting

The server allows two RF jobs globally but only one active job per client by default. A client also has a 20-request-per-minute budget. Configure these with `MAX_CONCURRENT_RF_REQUESTS`, `MAX_CONCURRENT_RF_REQUESTS_PER_CLIENT`, and `RF_REQUESTS_PER_MINUTE`.

Rejected requests return `429` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. Client identity comes from the socket peer unless `TRUSTED_PROXIES` explicitly lists the proxy CIDRs allowed to supply forwarding headers. These controls are process-local; a multi-replica deployment still needs a gateway-level shared budget.

Set `RF_REQUEST_TIMEOUT_SECONDS` to bound compute time; the default is 60 seconds and expiration returns `504`. Keep RF concurrency aligned with CPU allocation and set `RF_API_KEY` for any non-private backend hop.

---

## Versioning

**Current API Version**: `1.0`

Future versions will:
- Add webhook support for async simulations
- Support batch optimization requests
- Include terrain elevation models
- Add custom propagation model endpoints

Breaking changes will increment major version (e.g., `/v2`).

---

## Troubleshooting

### 503 Service Unavailable

**Cause**: Data not yet loaded at startup

**Solution**: Wait 5-10 seconds and retry

### 400 Bad Request

**Cause**: Invalid parameter values

**Solution**: Check parameter types and ranges in documentation

### 500 Internal Server Error

**Cause**: Computation timeout or backend crash

**Solution**: 
- Check logs: `docker logs atom-simulator`
- Reduce `rays` or `radius_m` for faster computation
- Increase timeout values if needed

### Slow Response Times

**Cause**: Overlapping concurrent requests

**Solution**:
- Reduce grid size (10 m → 20 m)
- Increase container resources (CPU/RAM)
- Implement client-side request batching

---

**Next**: See [Getting Started](getting-started.md) or [Deployment](deployment.md).
