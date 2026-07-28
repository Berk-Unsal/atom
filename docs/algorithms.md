# Algorithms & Physics

A.T.O.M combines deterministic planning equations with computational geometry to produce inspectable RF estimates. It is not a calibrated propagation solver or a substitute for field measurements.

## Radio Frequency Physics Foundation

### Free-Space Path Loss (FSPL)

The fundamental equation for all propagation calculations:

$$L = 20 \log_{10}(d[m]) + 20 \log_{10}(f[GHz]) + 32.45$$

**Simplification** (practical form):

$$L[dB] = 20 \log_{10}(d[m]) + 20 \log_{10}(f[GHz]) + 32.45$$

### Received Power Calculation

$$P_{rx}[dBm] = EIRP_{dBm} - L_{path} - L_{walls}$$

Where:
- $EIRP$ = Transmit power plus antenna gain
- $L_{path}$ = Free-space path loss (FSPL equation)
- $L_{walls}$ = Cumulative building penetration loss

The current model does not include diffraction, reflection, fast fading, terrain, or multipath.

### Frequency Dependence

FSPL increases with frequency squared:

$$L \propto f^2$$

**Consequence**: Same distance results in substantially higher loss as frequency rises, which is why mmWave and Sub-THz coverage shrink quickly in urban settings.

---

## Building Penetration Model

### Generation-Specific Wall Loss

A.T.O.M uses the selected network generation to apply a fixed loss each time a ray crosses a building boundary. OSM building tags are still used for demand scoring and diagnostics, but wall penetration is intentionally frequency-driven in the current runtime:

```
if frequency_ghz <= 3:
    loss_4g = 8 dB
elif frequency_ghz <= 40:
    loss_5g = 30 dB
else:
    loss_6g = 80 dB
```

### Cumulative Wall Loss

If a ray intersects multiple buildings, losses are **cumulative**:

$$L_{total\_walls} = \sum_{i=1}^{n} L_i(f)$$

**Example**: Ray through two building boundaries at 5G frequency:
- Building 1: +30 dB
- Building 2: +30 dB
- **Total**: +60 dB additional loss

---

## Raytracing Algorithm

### Overview

A.T.O.M uses a **deterministic segmented sector raytracer**:

1. Define the antenna azimuth and beam width
2. Split the selected sector into configurable rays
3. Split each ray into short segments
4. Query the R-Tree for buildings intersecting each segment
5. Apply cumulative wall loss and receiver sensitivity thresholding
6. Color each segment by received power
7. Serialize the segments as GeoJSON

### Pseudocode

```go
func TraceSector(tx Location, req SimulationRequest) GeoJSON {
    result := GeoJSON{}
    if req.rays * ceil(req.radius_m / 25) > 25_000 {
        return error("simulation response feature limit exceeded")
    }
    maxDistance := min(req.radius_m, sensitivityLimitedDistance(req))

    for angle in sector_angles(req.azimuth, req.beam_width, req.rays) {
        current := tx
        wallLoss := 0.0

        for segmentEnd in stepped_points(tx, angle, maxDistance) {
            segment := LineSegment{current, segmentEnd}
            intersections := rtree.Query(segment.Bounds())

            for building in intersections {
                if segment_intersects_polygon(segment, building.Polygon) {
                    wallLoss += penetration_loss(req.frequency_ghz)
                }
            }

            distance := haversine_distance(tx, segmentEnd)
            fspl := 20*log10(distance) + 20*log10(req.frequency_ghz) + 32.45
            rxPower := EIRP_DBM - fspl - wallLoss

            if rxPower < ReceiverSensitivityDBm {
                break
            }

            result.Add(LineString{current, segmentEnd}, rxPower)
            current = segmentEnd
        }
    }

    return result
}
```

### Computational Geometry: Polygon Intersection

**Problem**: Does a ray (line segment) intersect a building (polygon)?

**Solution**: Use **separating axis theorem** (SAT):

```go
func SegmentIntersectsPolygon(segment Line, polygon Polygon) bool {
    // Test segment against all polygon edges
    for i := 0; i < len(polygon.Edges); i++ {
        edge := polygon.Edges[i]
        if SegmentIntersectsSegment(segment, edge) {
            return true
        }
    }
    
    // Test if segment start/end inside polygon
    return PointInPolygon(segment.Start, polygon) ||
           PointInPolygon(segment.End, polygon)
}

func SegmentIntersectsSegment(s1, s2 Line) bool {
    // Standard 2D line intersection test
    // (Cross product method)
    d1 := cross_product(s2.Start - s1.Start, s1.Dir)
    d2 := cross_product(s2.End - s1.Start, s1.Dir)
    d3 := cross_product(s1.Start - s2.Start, s2.Dir)
    d4 := cross_product(s1.End - s2.Start, s2.Dir)
    
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
```

**Complexity**: O(log n) per ray thanks to R-Tree spatial indexing.

---

## Spatial Indexing: R-Tree

### Why R-Tree?

RF simulations require millions of queries:
- **Naive approach** (linear scan): O(n) per query × 90,000 rays = 1+ billion operations
- **R-Tree approach** (spatial index): O(log n) per query × 90,000 rays = 1+ million operations
- **Speedup**: 1000× faster

### R-Tree Structure

An R-Tree organizes rectangles (bounding boxes) in a balanced tree:

```
Root
├─ Node A (covers buildings 1-5)
│  ├─ Building 1 bbox
│  ├─ Building 2 bbox
│  └─ Building 3 bbox
├─ Node B (covers buildings 6-10)
│  ├─ Building 6 bbox
│  └─ Building 7 bbox
└─ Node C (covers buildings 11-15)
   └─ Building 11 bbox
```

### Query Algorithm

```go
func RTtree.Query(ray LineSegment) []Building {
    candidates := []Building{}
    
    // Recursively check which nodes overlap with ray
    func traverse(node *RNode) {
        if node.bbox.Intersects(ray) {
            if node.IsLeaf() {
                candidates.append(node.buildings)
            } else {
                for child in node.Children {
                    traverse(child)
                }
            }
        }
    }
    
    traverse(rtree.Root)
    return candidates
}
```

**Result**: Typically 5-20 building candidates per ray (vs 12,000 total buildings).

---

## Sector Eligibility

### Hard Sector Model

A.T.O.M uses the configured azimuth and beam width as a hard geometric eligibility boundary:

```
Azimuth = 45°, Beam Width = 65°
Coverage: 12.5° to 77.5°

              ↑ 0°
              |
        /─────────────\
       /               \
      |    Main Lobe     |
      |   (Gain = 0 dBi)  |
       \               /
        \─────────────/
             θ = 65°
```

### Eligibility Function

```go
func IsInsideSector(direction float64, antennaAzimuth float64,
                    beamWidth float64) bool {
    offset := abs(normalize_angle(direction - antennaAzimuth))
    return offset <= beamWidth / 2
}
```

Samples outside the configured sector or radius do not contribute. Version 1 does not model sidelobes or a continuous antenna gain pattern.

---

## Deterministic Optimization: Sweep & Score Algorithm

### Problem Statement

**Find**: The antenna azimuth that best serves demand-weighted coverage

**Constraints**:
- Distance range: 50 m to 5 km
- Beam width: user configured
- Frequency: user selected

### Algorithm

```go
func OptimizeAzimuth(tx Location, request SimulationRequest) float64 {
    bestAzimuth := 0.0
    bestScore := 0.0
    
    // Sweep all azimuths in 10° increments
    for azimuth := 0; azimuth < 360; azimuth += 10 {
        // Run simulation at this azimuth
        rays := TraceSector(tx, request.withAzimuth(azimuth))
        
        // Track unique buildings reached by the sector
        demandScore := 0.0
        residentialScore := 0.0
        hitBuildings := NewSet()
        for ray in rays {
            for building in ray.hitBuildings {
                if hitBuildings.add(building.id) {
                    demandScore += building.demandWeight * 10000
                    residentialScore += building.residentialDemand * 10000
                }
            }
        }
        
        // Coverage is capped and used as a tie-breaker
        coverageTieBreaker := 0.0
        for ray in rays {
            coverageTieBreaker += min(ray.distance, 500) / 500 * 100
        }
        score := demandScore + residentialScore + coverageTieBreaker
        
        // Track best
        if score > bestScore {
            bestScore = score
            bestAzimuth = azimuth
        }
    }
    
    return bestAzimuth
}
```

### Complexity Analysis

- **Loop iterations**: 360° / 5° = 72
- **Per iteration**:
  - Ray tracing: O(90,000 rays × log n intersections) ~1 second
  - Coverage calculation: O(90,000)
- **Total time**: ~72 seconds (naive)
- **Optimized time**: ~250 ms (with parallelization)

### Parallelization

Go's Goroutines enable **embarrassingly parallel** optimization:

```go
// Create worker pool
type Job struct {
    azimuth float64
}

type Result struct {
    azimuth float64
    coverage float64
}

// Dispatch all azimuths to workers
jobs := make(chan Job, 72)
results := make(chan Result, 72)

// 4 workers process in parallel
for w := 1; w <= 4; w++ {
    go worker(jobs, results)
}

for azimuth := 0; azimuth < 360; azimuth += 5 {
    jobs <- Job{azimuth}
}

// Collect results
for i := 1; i <= 72; i++ {
    result := <-results
    if result.coverage > bestCoverage {
        bestCoverage = result.coverage
        bestAzimuth = result.azimuth
    }
}
```

**Result**: 4× speedup on quad-core machine.

---

## Performance Characteristics

### Benchmarks (Ankara Dataset)

| Operation | Time | Scaling |
|-----------|------|---------|
| Load GeoJSON | 500 ms | O(n) where n=12,000 buildings |
| Build R-Tree | 1 second | O(n log n) |
| Single ray trace | < 1 μs | O(log n) |
| Up to 25,000 returned ray features | Bounded | O(n log n) parallelized |
| Optimization (72 iterations) | 250 ms | O(72 × n log n) with Goroutines |
| API response | < 100 ms p99 | Network + serialization |

### Memory Usage

| Component | Size |
|-----------|------|
| Buildings (GeoJSON) | 80 MB (disk) → 40 MB (RAM) |
| R-Tree indices | 150 MB |
| Tower locations | 2 MB |
| Returned ray features per request | 25,000 maximum |
| **Total footprint** | ~200 MB typical |

---

## Validation & Limitations

### Response Complexity Bound

Before ray allocation, the API requires `rays × ceil(radius_m / 25) ≤ 25,000`. The same atomic budget is shared by all ray workers and counts additional features created when building intersections split a 25-meter base segment. If the actual count reaches the ceiling, workers cancel the request before response assembly and serialization. Response assembly independently checks the ceiling, sizes its flattened slice from the actual count, and releases the per-ray slices when the top-level operation finishes.

### Model Confidence

| Aspect | Status | Notes |
|--------|--------|-------|
| FSPL equation | Deterministic | Standard free-space equation |
| Wall attenuation | Approximation | Fixed by selected frequency family |
| Wall intersection | Deterministic | Binary geometric intersection against loaded footprints |
| Field calibration | Not completed | Validate estimates before deployment decisions |

### Model Limitations

1. **Flat Earth**: No terrain elevation (can add with GeoTIFF)
2. **No multipath**: Doesn't model reflections/scattering
3. **Ideal antennas**: Assumes perfect omnidirectional at low freq
4. **Static buildings**: Doesn't model moving obstructions
5. **Weather**: No rain/weather fading

### When to Use A.T.O.M

✅ **Good for**:
- Network planning and site selection
- Quick feasibility studies
- Education and training
- Comparison between sites
- Coverage mapping

❌ **Not suitable for**:
- Detailed link budget analysis
- Precise handover prediction
- Interference modeling
- Non-stationary targets

---

**Next**: Explore the [API Reference](api.md) to integrate A.T.O.M into your systems.
