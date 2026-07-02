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

A.T.O.M v1.0 has **no authentication** (suitable for internal/private networks). For production deployments, add authentication via reverse proxy (e.g., nginx with OAuth2).

## Response Format

All responses are **JSON**, but the exact shape depends on the route:

- `GET /healthz` returns a status object
- `GET /api/buildings` and `GET /api/towers` return raw GeoJSON
- `POST /api/simulate` returns `{ geojson, stats }`
- `POST /api/coverage-gaps` returns `{ geojson, stats }`
- `POST /api/optimize-azimuth` returns `{ optimal_azimuth, coverage_score, demand_score, residential_score }`

Error responses use a simple object with an `error` message.

---

## Endpoints

### Health Check

**Endpoint**: `GET /healthz`

Check if the API is running and all data is loaded.

**Response**:

```json
{
  "status": "ok",
  "backend": "static-in-memory",
  "buildingIndex": {
    "sourcePath": "data-pipeline/ankara_buildings.geojson"
  },
  "rtreeFootprints": 12047,
  "towerCount": 287
}
```

**Status Codes**:
- `200 OK` - API is healthy
- `503 Service Unavailable` - Data not yet loaded (startup)

---

### Get Buildings

**Endpoint**: `GET /api/buildings`

Retrieve all building geometries as GeoJSON.

**Query Parameters**: None

**Response**:

```json
{
  "success": true,
  "data": {
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
          "coordinates": [[[33.8, 39.9], [33.801, 39.9], ...]]
        }
      }
    ]
  }
}
```

**Performance**: ~100 MB response, consider client-side filtering.

---

### Get Towers

**Endpoint**: `GET /api/towers`

Retrieve all 5G/4G tower locations.

**Query Parameters**:
- `frequency` (optional): Filter by band (`4G`, `5G`, `6G`)

**Response**:

```json
{
  "success": true,
  "data": {
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
}
```

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
| `rays` | number | 8 - 720 | Yes | Ray count used to sample the sector |
| `radius_m` | number | 25 - 5000 | Yes | Maximum requested simulation radius |
| `frequency_ghz` | number | 0 - 300 | Yes | Network frequency in GHz |
| `tx_power_dbm` | number | 0 - 60 | Yes | Transmit power before antenna gain |
| `azimuth` | number | 0 - 360 | Yes | Antenna direction (degrees) |
| `beam_width` | number | 10 - 360 | Yes | Sector width (degrees) |

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
- `404 Not Found` - Tower not found
- `500 Internal Server Error` - Simulation error

**Performance**:
- Typical response time: 1-3 seconds (depends on grid size)
- Maximum rays: 100,000+ per request
- Timeout: 30 seconds

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
- `404 Not Found` - Tower not found
- `500 Internal Server Error` - Optimization error

**Performance**:
- Typical response time: 3-5 seconds
- Parallelization: Uses all available CPU cores
- Timeout: 60 seconds

---

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
curl -X GET "http://localhost:8080/api/towers?frequency=5G"
```

---

## Client Libraries

### Go Client

```go
import "github.com/your-org/atom-client-go"

client := atom.NewClient("http://localhost:8080")

result, err := client.Simulate(context.Background(), &atom.SimulateRequest{
    TowerID: "ankara_001",
    Frequency: "5G",
    Azimuth: 45,
    BeamWidth: 65,
})
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

## Rate Limiting

A.T.O.M v1.0 has **no built-in rate limiting**. For production:

1. Deploy behind reverse proxy (nginx, HAProxy)
2. Add rate limiting at proxy layer
3. Implement API key authentication
4. Track per-client request counts

**Recommended limits**:
- 10 requests/second per API key
- 1000 requests/day per API key
- 100 concurrent requests max

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
