<div align="center">

<img src="./icon/icon.svg" alt="A.T.O.M Logo" width="120" />

# A.T.O.M

**Ankara Telecom Optimization Model | RF Propagation Predictor**

[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=for-the-badge&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## Overview

A.T.O.M is a full-stack spatial simulation engine designed to visualize and optimize cellular networks across multiple generations (4G LTE, 5G mmWave, 6G Sub-THz) in dense urban environments. Built on real OpenStreetMap (OSM) and OpenCellID data, the platform merges high-performance RF propagation physics with interactive geospatial visualization, enabling telecommunications engineers to predict signal coverage, optimize antenna placement, and validate network topology in complex urban landscapes like Ankara, Turkey.

The engine combines Go's lightning-fast concurrency model with advanced ray-tracing algorithms and AI-driven optimization to deliver millisecond-level intersection testing across thousands of building geometries. The result is a production-ready decision-support tool that transforms raw network data into actionable intelligence for 5G/6G deployment strategies.

---

## Key Features

- **Multi-Generation Physics**: Simulates 4G (2.6 GHz), 5G (28 GHz), and 6G (140 GHz) using Free-Space Path Loss (FSPL) models with frequency-accurate propagation characteristics.

- **Segmented Heatmap Raytracing**: Generates custom GeoJSON ray segments that change color (Green → Yellow → Red) based on real-time signal strength (Rx dBm), providing intuitive visual feedback on coverage quality.

- **Frequency-Dependent Penetration**: 4G rays penetrate concrete buildings with Cumulative Wall Loss calculations, while 5G/6G rays experience heavy attenuation or immediate blockage, reflecting real-world propagation behavior.

- **Smart Beamforming**: Sector antenna simulation with adjustable Azimuth and Beam Width parameters, enabling realistic directional coverage patterns and sidelobe analysis.

- **Demand-Aware Auto-Optimization**: Sweeps candidate azimuths and scores sectors with POI demand, residential-density demand, and a capped coverage tie-breaker, eliminating manual trial-and-error.

- **Coverage Gap Finder**: Flags demand-weighted buildings inside the active beam that fall below usable service quality, helping planners see underserved residential and POI targets instead of only raw ray distance.

---

## Architecture & Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | Go (Golang) | Massive concurrency via Goroutines; in-memory R-Tree spatial indexing for sub-millisecond ray-polygon intersection testing |
| **Frontend** | React + Leaflet | Complex GeoJSON heatmap rendering with dynamic map layers and real-time simulation controls |
| **Data Pipeline** | Python + OSMnx | Local tower/building extraction and demand-surface enrichment |
| **Runtime Data** | GeoJSON + CSV | Static local files loaded into memory at startup; no database required |
| **Deployment** | Docker | Multi-stage build compiling both React and Go into a single, lightweight Alpine container |

---

## Codebase Structure

```text
backend-go/       Go API, in-memory R-tree, ray tracing, azimuth optimization
frontend-react/   React/Vite/Leaflet dashboard and RF heatmap UI
data-pipeline/    Python scripts for local tower/building data generation
docs/             GitHub Pages documentation, academic report, charts, screenshots
assets/           Source screenshots used by README/docs
Dockerfile        Production multi-stage build for the static in-memory app
```

Generated artifacts such as `frontend-react/dist/`, local virtual environments, and build caches are intentionally ignored. The large Ankara building GeoJSON is stored through Git LFS.

---

## Propagation Visualization

### 4G Coverage
![4G Propagation](./assets/4g.png)

### 5G Coverage
![5G Propagation](./assets/5g.png)

### 6G Sub-THz Coverage
![6G Propagation](./assets/6g.png)

### Auto-Optimized 5G Beamforming
![5G Auto-Optimized](./assets/5g-auto-optimized.png)

*Visualizing multi-generation RF propagation patterns and AI-optimized antenna placement in urban environments.*

---

## Getting Started with Docker

### Prerequisites
- Docker installed on your system

### Build & Run

```bash
# Build the Docker image
docker build -t atom-simulator .

# Run the container
docker run -p 8080:8080 atom-simulator
```

The application will be available at **`http://localhost:8080`**.

### Optional Core Lab Mode

Core Lab Mode is opt-in. The default app does **not** start any 5G Core containers or require Open5GS.

```bash
docker compose -f docker-compose.yml -f docker-compose.core-lab.yml --profile core-lab up --build
```

This starts A.T.O.M with `CORE_LAB_ENABLED=true` and a lightweight `core-lab-adapter` sidecar at port `8090`. The adapter exposes stable Core Lab JSON for AMF, SMF, UPF, UDM/UDR, AUSF, PCF, NRF, and NSSF status. If no Open5GS endpoint is configured, scenario effects are marked as a deterministic `simulated_overlay`; point `OPEN5GS_STATUS_URL` or `OPEN5GS_METRICS_URL` at a real Open5GS lab to bridge external emulator state.

Suggested Docker memory allocation:

| Profile | Memory | Use |
|---|---:|---|
| `core-lite` | 4-6 GB | A.T.O.M + adapter status bridge |
| `core-demo` | 8-12 GB | Adapter + simulated gNB/UE session overlays |
| `core-observe` | 12-16 GB | Full Open5GS lab plus metrics/observability |

---

## Documentation

The full docs site lives in [docs/index.html](docs/index.html), with the source markdown pages alongside it in `docs/`.

---

## Author & Credits

Architected and Developed by [Berk Ünsal](https://berkunsal.com)

This project demonstrates the practical intersection of spatial algorithms, high-concurrency systems design in Go, and advanced telecommunications physics simulation.

---

<div align="center">

**Built with precision. Optimized for scale. Ready for production.**

</div>
