# Getting Started

Get A.T.O.M running on your machine in just a few minutes.

## Prerequisites

- **Docker**: [Install Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Git**: For cloning the repository (optional)
- **Disk Space**: ~2 GB for Docker image
- **Network**: Internet for initial Docker pull

## Quick Start (Docker)

### 1. Clone or Download Repository

```bash
git clone https://github.com/your-org/A.T.O.M.git
cd urban-ray-tracer
```

### 2. Build Docker Image

```bash
docker build -t atom-simulator .
```

**What happens**:
- Pulls Alpine Linux base
- Builds React frontend (Vite bundling)
- Compiles Go backend
- Copies static data files
- Creates ~150 MB image

**Time**: ~3-5 minutes (first build includes npm/go downloads)

### 3. Run Container

```bash
docker run -p 8080:8080 atom-simulator
```

**What happens**:
- Container starts
- Loads GeoJSON data (~1 second)
- Builds R-Tree spatial index (~1 second)
- HTTP server listens on port 8080

**Expected output**:

```
2026/06/20 14:30:00 Loading buildings from data-pipeline/ankara_buildings.geojson...
2026/06/20 14:30:01 Loaded 12047 buildings into R-Tree
2026/06/20 14:30:01 Loading towers from data-pipeline/ankara_5g_nodes.geojson...
2026/06/20 14:30:01 Loaded 287 towers
2026/06/20 14:30:01 Server running on :8080
```

### 4. Access the Web Interface

Open your browser to:

```
http://localhost:8080
```

You should see:
- 🗺️ Interactive map of Ankara
- 📊 Control panel (frequency, azimuth, beam width)
- 🟢 Coverage heatmap overlay

---

## Local Development Setup

For development without Docker:

### Backend (Go)

**Requirements**:
- Go 1.21+ ([Install Go](https://golang.org/doc/install))

**Steps**:

```bash
# Navigate to backend
cd backend-go

# Download dependencies
go mod download

# Run server
go run .
```

**Output**: Server on `http://localhost:8080`

**To modify RF models**, edit `raytracer/geometry.go` and rebuild.

### Frontend (React)

**Requirements**:
- Node.js 18+ ([Install Node.js](https://nodejs.org/))

**Steps**:

```bash
# Navigate to frontend
cd frontend-react

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Output**: Dev server on `http://localhost:5173`

**Frontend → Backend**: Configure API proxy in `vite.config.js`:

```javascript
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
}
```

### Running Both Together

**Terminal 1 (Backend)**:
```bash
cd backend-go
go run .
```

**Terminal 2 (Frontend)**:
```bash
cd frontend-react
npm run dev
```

**Open**: `http://localhost:5173` in browser

---

## Data Pipeline (Optional)

If you want to regenerate the GeoJSON data files from raw sources:

### Requirements

- Python 3.9+ ([Install Python](https://www.python.org/))
- Osmium tool or OSM data file

### Run Data Pipeline

```bash
cd data-pipeline

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate  # Windows

# Install dependencies
pip install -r Requirements.txt

# Extract Ankara buildings from OSM planet file
python extract_ankara.py --input planet-latest.osm.pbf

# Export to GeoJSON
python export_ankara_buildings.py
python export_tower_geojson.py
```

**Files generated**:
- `ankara_buildings.geojson` (~80 MB)
- `ankara_5g_nodes.geojson` (~2 MB)

---

## Configuration

### Environment Variables

Override default paths:

```bash
# Custom data paths
export BUILDINGS_GEOJSON_PATH=/path/to/custom_buildings.geojson
export TOWERS_GEOJSON_PATH=/path/to/custom_towers.geojson

# Server port
export PORT=9000

# Start backend
go run .
```

### Building Docker Image with Custom Data

```bash
# Copy custom GeoJSON files
cp custom_buildings.geojson data-pipeline/
cp custom_towers.geojson data-pipeline/

# Build image
docker build -t atom-simulator .

# Run
docker run -p 8080:8080 atom-simulator
```

---

## Verification

### API Health Check

```bash
curl http://localhost:8080/healthz
```

**Expected response**:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "buildings_loaded": 12047,
    "towers_loaded": 287,
    "version": "1.0.0"
  }
}
```

### Run Test Simulation

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
    "azimuth": 45,
    "beam_width": 120
  }'
```

**Expected**: GeoJSON FeatureCollection with heatmap rays

### Open Web UI

```
http://localhost:8080
```

Should see:
- ✅ Map loads without errors
- ✅ Control panel is interactive
- ✅ Changing azimuth updates heatmap

---

## First Simulation: Step-by-Step

### Step 1: Open Web Interface

Navigate to `http://localhost:8080` in your browser.

### Step 2: Select a Frequency Band

- Use dropdown to select: **4G**, **5G**, or **6G**

### Step 3: Adjust Antenna Direction

- Move the **Azimuth** slider (0-360°)
- Watch coverage heatmap rotate in real-time

### Step 4: Configure Beam Width

- Adjust **Beam Width** slider (5-180°)
- Narrower beams = more focused coverage

### Step 5: Run Auto-Optimization

- Click **"Auto-Optimize"** button
- System finds optimal azimuth automatically
- Results display in 2-3 seconds

### Step 6: Export Coverage Map

- Click **"Export GeoJSON"**
- Import into ArcGIS, QGIS, or Google Earth

---

## Troubleshooting

### Docker Build Fails

**Error**: `npm: not found`

**Solution**: Ensure Dockerfile stages are correct; rebuild with clean slate:
```bash
docker build --no-cache -t atom-simulator .
```

### Docker Run: Port Already in Use

**Error**: `bind: address already in use`

**Solution**: Use different port:
```bash
docker run -p 9000:8080 atom-simulator
# Then open http://localhost:9000
```

### Slow Startup

**Normal**: First run loads 12,000+ buildings (~5 seconds)

**Subsequent runs**: Fast (data cached in R-Tree)

### UI Doesn't Load

**Check**:
1. Is server running? `curl http://localhost:8080`
2. Are you using correct port? (default: 8080)
3. Check browser console for errors (F12)

### API Returns 500 Error

**Check logs**:
```bash
docker logs atom-simulator
```

**Common causes**:
- Invalid coordinate or ray-count input
- Unsupported frequency_ghz value
- Backend timeout

---

## Next Steps

- 📖 Read [Overview](overview.md) for project background
- ⚙️ Explore [Architecture](architecture.md) to understand internals
- 🔌 Check [API Reference](api.md) for programmatic access
- 📈 See [Visualization](visualization.md) for example outputs
- 🚀 Learn [Deployment](deployment.md) for production setup

---

## Performance Tips

### For Fast Simulations

```bash
# Use coarser grid (20 m instead of 10 m)
# This reduces ray count by 4×
curl -X POST http://localhost:8080/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 72,
    "radius_m": 250,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 45,
    "beam_width": 120
  }'
```

### For High-Quality Results

```bash
# Use fine grid (5 m)
# This increases ray count and accuracy
curl -X POST http://localhost:8080/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 240,
    "radius_m": 600,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 45,
    "beam_width": 120
  }'
```

---

**Ready to explore?** Start with the [Overview](overview.md) or dive into [Features](features.md).
