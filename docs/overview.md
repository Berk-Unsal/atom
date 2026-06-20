# Project Overview

## Background

The exponential growth of cellular networks has created unprecedented complexity in urban network planning. Engineers must optimize antenna placement, frequency allocation, and coverage patterns across dense building environments—all while meeting regulatory constraints and cost targets.

Traditional network planning relies on expensive commercial simulators or empirical field measurements. A.T.O.M democratizes this process by providing an open-source, production-grade simulation engine that combines:

- **Computational efficiency** through Go's concurrent processing
- **Spatial accuracy** using R-Tree indexing and polygon intersection testing
- **Physics fidelity** with frequency-dependent propagation models
- **Visual intelligence** via interactive GeoJSON rendering

## Use Cases

### 1. Network Operators
Rapidly evaluate 5G/6G deployment strategies in target urban areas without expensive commercial licenses.

### 2. Equipment Vendors
Validate antenna performance characteristics across different terrain and building profiles.

### 3. Telecommunications Researchers
Prototype new propagation models, beamforming techniques, and optimization algorithms.

### 4. Urban Planners
Visualize cellular infrastructure impact in smart city and IoT deployments.

### 5. Academic Institutions
Teach spatial algorithms, RF physics, and high-performance computing with real-world data.

## Problem Statement

Traditional approaches have several limitations:

- **Cost**: Commercial RF simulation software (Altair FEKO, AWR) costs tens of thousands per seat
- **Inflexibility**: Closed-source systems don't support custom propagation models
- **Scalability**: Legacy tools struggle with millions of building geometries
- **Accessibility**: Limited deployment options in resource-constrained environments

A.T.O.M solves these by:

| Problem | A.T.O.M Solution |
|---------|-----------------|
| High licensing costs | Open-source MIT license, zero upfront cost |
| Limited customization | Modular Go architecture, easy to extend |
| Scalability bottlenecks | In-memory R-Tree + Goroutine concurrency |
| Desktop-only tools | Containerized web application with REST API |
| Single-frequency testing | Multi-band simulation (4G, 5G, 6G) |

## Key Innovation: Frequency-Dependent Penetration

Unlike monolithic RF simulators, A.T.O.M natively models how different frequencies interact with urban materials:

- **4G (2.6 GHz)**: Long wavelength penetrates concrete; typical wall loss is much lower than mmWave
- **5G mmWave (28 GHz)**: Shorter wavelength; heavy attenuation through walls and facades
- **6G Sub-THz (140 GHz)**: Near-optical propagation; blocked by most buildings

This enables accurate visualization of **why** coverage differs across frequency bands.

## Architectural Philosophy

A.T.O.M follows these design principles:

1. **Separation of Concerns**: Data pipeline → API → Frontend (independent scaling)
2. **Immutable Spatial Data**: Load GeoJSON once; query thousands of times efficiently
3. **Real-time Interactivity**: Sub-100ms response times for beamforming adjustments
4. **Minimal Dependencies**: Pure Go backend with no external RF libraries
5. **Open Standards**: GeoJSON, REST, standard mapping libraries

## Ankara, Turkey: The Testbed

A.T.O.M is optimized for **Ankara's urban topology**:

- **Building density**: 12,000+ structures in core districts
- **Terrain complexity**: Hillsides and valleys affecting RF propagation
- **Data availability**: Complete OSM building and 5G tower data
- **Real-world validation**: Comparative analysis against measured field data

The same engine scales to any city or region with available GeoJSON geometry.

## Roadmap

### Current (v1.0)
- ✅ 4G/5G/6G multi-band simulation
- ✅ AI-driven antenna optimization
- ✅ Interactive web-based visualization
- ✅ Docker containerization

### Planned (v1.1+)
- 🔄 Custom propagation model editor
- 🔄 Multi-site optimization (distributed antenna systems)
- 🔄 Time-based coverage analysis (day/night patterns)
- 🔄 Terrain elevation integration (SRTM)
- 🔄 Mobile target tracking
- 🔄 REST API versioning and webhooks

## Who Benefits?

**A.T.O.M is designed for:**

- ✅ RF Engineers planning 5G/6G networks
- ✅ Network Operators evaluating new sites
- ✅ Researchers in spatial algorithms and telecommunications
- ✅ Educators teaching RF propagation and optimization
- ✅ Open-source enthusiasts interested in high-performance computing

---

**Next Steps**: Explore [Features](features.md) or jump to [Getting Started](getting-started.md).
