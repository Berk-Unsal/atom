# Architecture

A.T.O.M is designed as a modern, cloud-native full-stack application with clear separation of concerns.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React + Leaflet)          │
│  ┌─────────────────────────────────────────────┐    │
│  │  - Interactive Map Canvas                    │    │
│  │  - Control Panel (Azimuth, Beam Width, etc)  │    │
│  │  - Real-time Heatmap Rendering              │    │
│  │  - GeoJSON Layer Management                  │    │
│  └─────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────┘
                     │ REST API (JSON)
┌────────────────────┴────────────────────────────────┐
│              Backend API (Go)                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  HTTP Handlers & Request Validation         │    │
│  │  ┌──────────────────────────────────────┐   │    │
│  │  │ Ray Tracing Engine (Goroutines)      │   │    │
│  │  │  - FSPL Calculation                  │   │    │
│  │  │  - Polygon Intersection Testing      │   │    │
│  │  │  - Material Attenuation Lookup       │   │    │
│  │  └──────────────────────────────────────┘   │    │
│  │  ┌──────────────────────────────────────┐   │    │
│  │  │ Spatial Index (In-Memory R-Tree)     │   │    │
│  │  │  - Building Geometries               │   │    │
│  │  │  - Fast Intersection Queries         │   │    │
│  │  └──────────────────────────────────────┘   │    │
│  │  ┌──────────────────────────────────────┐   │    │
│  │  │ Optimization Engine (Sweep & Score)  │   │    │
│  │  │  - Coverage Calculation              │   │    │
│  │  │  - Azimuth Optimization              │   │    │
│  │  └──────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────┘
                     │ Load at Startup
┌────────────────────┴────────────────────────────────┐
│            Static Data Files (GeoJSON)              │
│  - ankara_5g_nodes.geojson (tower locations)       │
│  - ankara_buildings.geojson (building footprints)  │
└─────────────────────────────────────────────────────┘
```

## Technology Stack

### Backend: Go (Golang)

**Why Go?**

- ⚡ **Speed**: Compiled to native binary; minimal overhead
- 🔄 **Concurrency**: Goroutines enable 1000s of concurrent operations
- 💾 **Memory Efficiency**: Garbage collection optimized for server workloads
- 🎯 **Simplicity**: Clear, readable syntax for high-performance code
- 🐳 **Deployment**: Single binary fits in tiny container

**Key Packages**:

| Package | Purpose |
|---------|---------|
| `github.com/gin-gonic/gin` | HTTP router and middleware |
| `encoding/json` | GeoJSON serialization |
| Custom R-Tree | Spatial indexing for buildings |
| `math` | FSPL calculations and geometry |

### Frontend: React + Leaflet

**Why React?**

- ⚛️ **Component Model**: Reusable UI components for control panel
- 🎨 **Reactivity**: Instant response to parameter changes
- 📦 **Ecosystem**: Rich library support for visualization

**Why Leaflet?**

- 🗺️ **Proven Standard**: Industry-standard web mapping library
- ⚖️ **Lightweight**: Only ~40 KB minified (vs ~250 KB for Mapbox)
- 🎯 **GeoJSON Native**: First-class support for feature layers
- 📱 **Mobile-Friendly**: Touch controls and responsive design

**Key Libraries**:

| Library | Purpose |
|---------|---------|
| `react` | UI framework |
| `leaflet` | Map rendering |
| `vite` | Build tool (fast bundling) |
| `fetch` | HTTP client for API calls |

### Deployment: Docker

**Multi-Stage Build**:

```dockerfile
# Stage 1: Build React
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend-react
COPY frontend-react/package*.json ./
RUN npm install
COPY frontend-react/ ./
RUN npm run build

# Stage 2: Build Go
FROM golang:1.22-alpine AS backend-builder
WORKDIR /app/backend-go
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
RUN go build -o server .

# Stage 3: Runtime
FROM alpine:latest
WORKDIR /app
COPY --from=backend-builder /app/backend-go/server ./server
COPY --from=frontend-builder /app/frontend-react/dist ./dist
COPY data-pipeline/ankara_buildings.geojson ./data-pipeline/ankara_buildings.geojson
COPY data-pipeline/ankara_5g_nodes.geojson ./data-pipeline/ankara_5g_nodes.geojson
EXPOSE 8080
CMD ["./server"]
```

**Result**: Single image (~150 MB) containing both frontend and backend.

## Component Deep Dive

### 1. Frontend (React + Leaflet)

**File Structure**:

```
frontend-react/
├── src/
│   ├── App.jsx              # Root component
│   ├── main.jsx             # Entry point
│   ├── components/
│   │   ├── MapCanvas.jsx    # Leaflet map renderer
│   │   └── ControlPanel.jsx # Parameter controls
│   └── utils/
│       ├── geojson.js       # GeoJSON helpers
│       └── networkTech.js   # Tech-specific constants
└── vite.config.js
```

**Data Flow**:

1. User adjusts azimuth slider → React state update
2. Component calls `/api/simulate` with new parameters
3. Backend returns GeoJSON heatmap
4. Leaflet layer updates with new colors
5. User sees real-time visualization

### 2. Backend API (Go)

**Endpoints**:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/healthz` | Liveness check |
| `GET` | `/api/buildings` | Fetch building GeoJSON |
| `GET` | `/api/towers` | Fetch tower locations |
| `POST` | `/api/simulate` | Run propagation simulation |
| `POST` | `/api/optimize-azimuth` | Auto-optimize antenna azimuth |

**Request/Response Example**:

```json
POST /api/simulate
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

Response:
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {"signal_dbm": -78.4, "is_blocked": false},
        "geometry": {"type": "LineString", "coordinates": [...]}
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

### 3. Ray Tracing Engine

**Algorithm Overview**:

```go
for each grid_point in coverage_area {
    // 1. Calculate FSPL
    distance = euclidean_distance(tx, grid_point)
    fspl_db = calculate_fspl(distance, frequency_ghz)
    
    // 2. Query building intersections
    intersected_buildings = rtree.query(ray_segment)
    
    // 3. Apply cumulative wall loss
    total_loss = fspl_db
    for building in intersected_buildings {
        wall_loss = material_attenuation(building.material, frequency_ghz)
        total_loss += wall_loss
    }
    
    // 4. Calculate received power
    rx_dbm = eirp_dbm - total_loss
    
    // 5. Color ray
    color = signal_strength_to_color(rx_dbm)
    
    // 6. Append to GeoJSON
    output.append(linestring(tx, grid_point, color, rx_dbm))
}
```

**Performance**:

- **Grid size**: 10×10 meter resolution
- **Coverage radius**: 3-5 km typical
- **Total rays**: ~90,000 per simulation
- **Runtime**: ~2 seconds (parallelized across cores)

### 4. Spatial Index (R-Tree)

**Why R-Tree?**

- 🚀 **Fast Range Queries**: O(log n) lookup for intersecting buildings
- 🎯 **Optimal for 2D**: Minimizes tree depth for geographic data
- 💾 **Memory Efficient**: Packed node structure

**Usage**:

```
Load Phase:
  - Parse ankara_buildings.geojson
  - Insert each polygon into R-Tree
  - Result: ~12,000 nodes indexed

Query Phase (per ray):
  - Call rtree.query(ray_segment)
  - Returns list of building geometries that intersect ray
  - Apply material attenuation for each
  - O(log n) complexity
```

### 5. Optimization Engine

**Sweep & Score Algorithm**:

```go
best_azimuth = 0
best_coverage = 0

for azimuth := 0; azimuth < 360; azimuth += 5 {
    // Simulate at this azimuth
    rays = simulate(tx_location, azimuth, frequency)
    
    // Calculate coverage area
    coverage_area = 0
    for ray in rays {
        if ray.rx_dbm > -100 {  // Threshold
            distance = ray.distance
            coverage_area += distance^2
        }
    }
    
    // Track best
    if coverage_area > best_coverage {
        best_coverage = coverage_area
        best_azimuth = azimuth
    }
}

return best_azimuth
```

## Data Flow

### Startup Sequence

1. **Container Launch**
   - Alpine Linux kernel boot
   - Golang runtime initialization

2. **GeoJSON Loading** (~500 ms)
   - Read `ankara_5g_nodes.geojson` (tower list)
   - Read `ankara_buildings.geojson` (building footprints)
   - Parse JSON into memory

3. **R-Tree Construction** (~1 second)
   - Insert 12,000+ building polygons
   - Build spatial index structure
   - Verify no parse errors

4. **HTTP Server Start** (< 100 ms)
   - Listen on port 8080
   - Register endpoints
   - Ready for requests

5. **Frontend Load** (browser)
   - Fetch React app from `/` route
   - Vite hydrates components
   - Map canvas initializes
   - Ready for user interaction

### Simulation Request Flow

```
User Action: Adjust azimuth slider to 90°
    ↓
React Component: State update
    ↓
Frontend: POST /simulate {azimuth: 90, ...}
    ↓
Go Handler: Validate request parameters
    ↓
Ray Engine: Cast 90,000 rays at azimuth 90°
    ↓
R-Tree: Query building intersections (parallelized)
    ↓
Attenuation: Apply frequency-dependent losses
    ↓
GeoJSON: Serialize heatmap to JSON
    ↓
Response: Send heatmap back to frontend (< 100 ms)
    ↓
Leaflet: Update layer with new colors
    ↓
Screen: User sees updated coverage
```

## Scalability Considerations

### Horizontal Scaling

- **Stateless API**: Each request is independent
- **Stateless Frontend**: No user sessions required
- **No Shared Database**: All data in-memory at startup
- **Result**: Deploy multiple instances behind load balancer

### Vertical Scaling

- **Goroutine Concurrency**: Linear improvement per CPU core
- **Memory Usage**: ~500 MB for Ankara; scales with building count
- **Ray Budget**: Can increase grid density on larger machines

### Regional Expansion

- Replace GeoJSON files with new city
- Rebuild Docker image
- Deploy same container

---

**Next**: Explore [Algorithms & Physics](algorithms.md) or see visual examples in [Visualization](visualization.md).
