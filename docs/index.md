# Welcome to A.T.O.M

**Ankara Telecom Optimization Model** is an enterprise-grade, AI-driven RF (Radio Frequency) propagation predictor and network planning simulation platform.

Built with cutting-edge technologies in spatial algorithms, high-performance concurrency, and telecommunications physics, A.T.O.M enables telecommunications engineers to visualize, simulate, and optimize cellular networks across 4G LTE, 5G mmWave, and 6G Sub-THz frequency bands in complex urban environments.

## What is A.T.O.M?

A.T.O.M is a full-stack spatial simulation engine that:

- **Predicts signal coverage** using physics-based RF propagation models
- **Optimizes antenna placement** with AI-driven geometric algorithms
- **Visualizes networks** with interactive GeoJSON heatmaps and Leaflet mapping
- **Scales efficiently** through Go's Goroutine concurrency and in-memory spatial indexing
- **Leverages real-world data** from OpenStreetMap (OSM) and OpenCellID networks

## Core Capabilities

| Capability | Description |
|-----------|-------------|
| **Multi-Generation Physics** | Accurate FSPL models for 4G (2.6 GHz), 5G (28 GHz), and 6G (140 GHz) |
| **Raytracing Engine** | Fast polygon intersection testing with real-time heatmap rendering |
| **Building Penetration** | Frequency-dependent material attenuation for concrete, office, and forest |
| **Beamforming** | Sector antenna simulation with adjustable azimuth and beam width |
| **AI Optimization** | Demand-aware azimuth scoring for the active tower |
| **GeoJSON Export** | Native support for web-based visualization and GIS integration |

## Quick Links

- [📖 Overview](overview.md) - Project background and use cases
- [⚡ Features](features.md) - Detailed feature breakdown
- [🏗️ Architecture](architecture.md) - System design and tech stack
- [🎨 Visualization](visualization.md) - RF propagation examples
- [📐 Algorithms](algorithms.md) - Physics models and optimization methods
- [🚀 Getting Started](getting-started.md) - Installation and first run
- [🔌 API Reference](api.md) - REST API endpoints and parameters
- [🐳 Deployment](deployment.md) - Docker and production setup

---

## Project Status

**Current Release**: v1.0  
**Status**: Production-Ready  
**License**: MIT

## Get Started in 2 Minutes

```bash
# Build the Docker image
docker build -t atom-simulator .

# Run the container
docker run -p 8080:8080 atom-simulator

# Open http://localhost:8080 in your browser
```

For detailed setup instructions, see the [Getting Started](getting-started.md) guide.

---

**Built with precision. Optimized for scale. Ready for production.**

Architected and developed by [Berk Ünsal](https://berkunsal.com)
