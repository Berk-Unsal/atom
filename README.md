# mmWave AI Propagation Predictor

Ankara-focused 5G/mmWave propagation simulator using static local GeoJSON files, an in-memory Go R-tree, and a React/Leaflet canvas frontend.

## Component Order

Build the static data pipeline first. The extracted tower GeoJSON and OSM building GeoJSON define the local files that the Go API loads into memory on startup.

## Run Locally

```bash
cd data-pipeline
python3 -m venv .venv
.venv/bin/pip install -r Requirements.txt
cd ..
data-pipeline/.venv/bin/python data-pipeline/extract_ankara.py --input 286.csv.gz
data-pipeline/.venv/bin/python data-pipeline/export_tower_geojson.py
data-pipeline/.venv/bin/python data-pipeline/export_ankara_buildings.py
```

If you only have an uncompressed dump during development, use `--input 286.csv`.

```bash
cd backend-go
go run .
```

```bash
cd frontend-react
npm install
npm run dev
```

The frontend expects the API at the same origin in production, or at `http://localhost:8080` through the Vite dev proxy.

To serve the built frontend from the Go backend on `http://localhost:8080`, build the UI first and then start the backend:

```bash
cd frontend-react
npm install
npm run build
cd ../backend-go
go run .
```

Then open `http://localhost:8080` or `http://localhost:8080/dashboard/`.

## Static Data Files

The backend auto-discovers these paths:

- `data-pipeline/ankara_5g_nodes.geojson`
- `data-pipeline/ankara_buildings.geojson`

You can override either path:

```bash
TOWERS_GEOJSON_PATH=/absolute/path/to/ankara_5g_nodes.geojson \
BUILDINGS_GEOJSON_PATH=/absolute/path/to/ankara_buildings.geojson \
go run .
```

Supported attenuation tags:

- `building=concrete` and `building=industrial`: `+35 dB`
- `building=office` and `building=glass`: `+20 dB`
- `natural=tree_row` and `natural=forest`: `+8 dB`
