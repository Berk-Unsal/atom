# Algorithms & Physics

A.T.O.M combines deterministic planning equations with computational geometry to produce inspectable RF estimates. It is not a calibrated propagation solver or a substitute for field measurements.

## Concept 4D: Urban Short-Range Propagation

The production planning default for 2.6 GHz and 28 GHz is `urban_short_range`, a deterministic 3GPP TR 38.901 UMa outdoor-to-outdoor median path-loss baseline. It uses known Tx/Rx heights and one shared `footprint-height-los-v1` centerline classifier across rays, surfaces, interference, and network scoring. Known building heights can clear a footprint when the roof stays below the Tx-to-Rx line; unknown-height intersections are conservative NLOS. Missing footprint data, unknown LOS/NLOS, unsupported endpoint cases, or out-of-envelope distances produce an explicit applicability result and use `legacy_fspl_walls` as the reported fallback.

The urban formula uses metres, GHz, base-10 logarithms, and the 3GPP breakpoint:

```text
d3D = sqrt(d2D^2 + (hBS - hUT)^2)
dBP' = 4 (hBS - 1) (hUT - 1) fc_Hz / 3e8
PL_LOS = PL1 or PL2 at dBP'
PL_NLOS = max(PL_LOS, 13.54 + 39.08 log10(d3D) + 20 log10(fc_GHz) - 0.6(hUT - 1.5))
```

The urban path-loss result is not combined with FSPL or the legacy wall heuristic. The `research_sub_thz` mode is the explicit 140 GHz safety profile, while the separate [`Concept 4D design note`](concept-4d-urban-propagation.md) records scope, limitations, fallback policy, and references.

## Concept 4F.1: Height-Aware Centerline Obstruction

The height-aware branch keeps the equations above unchanged and changes only the urban LOS/NLOS input. For each footprint interval `[t_entry, t_exit]`, it compares the roof evidence with `h_los(t) = h_tx + (h_rx - h_tx)t` on flat ground. Exact roof contact is deterministic obstruction; no Fresnel or diffraction margin is applied. Explicit `height` tags are `observed_tag`, `building:levels` uses 3 m per level and is `derived_from_levels`, and the existing generic 9 m fallback is `unavailable` evidence and therefore conservative NLOS. See the [`Concept 4F.1 design note`](concept-4f1-height-aware-obstruction.md) for the result metadata, multipart identity contract, terrain status, and Ankara audit.

## Concept 4E: Building Entry

The separate [`Concept 4E design note`](concept-4e-building-entry.md) evaluates a representative building facade in one batched analysis. It first evaluates the Concept 4D outdoor baseline to the facade, then subtracts the deterministic median O2I external-wall term from [3GPP TR 38.901 V19.4.0, §7.4.3.1](https://www.etsi.org/deliver/etsi_tr/138900_138999/138901/19.04.00_60/tr_138901v190400p.pdf). Indoor depth is fixed at zero, so no interior loss, room/floor geometry, or whole-building claim is produced. Outdoor NLOS does not receive a second legacy wall loss. At 28 GHz the standard low/high terms are evaluated from the glass/concrete compositions; at 2.6 GHz the single-frequency 20 dB compatibility value is used for both API scenarios. Material tags are evidence only, and the deterministic median omits random shadow-fading draws.

## Concept 4G.2: Receiver Noise and Sensitivity

[`Concept 4G.2`](concept-4g2-receiver-noise-sensitivity.md) adds a deterministic receiver usability contract while preserving the manual `-115 dBm` default. Manual mode uses the configured per-cell threshold. Opt-in derived mode uses the rounded 290 K reference `-174 dBm/Hz` and evaluates:

```text
Nfloor = -174 + 10 log10(B_noise_Hz) + NF_dB
Sensitivity = Nfloor + RequiredSNR_dB + ReceiverMargin_dB
RxMargin = ReceivedPower_dBm - Sensitivity_dBm
```

Usability is strict (`received_power_dbm > sensitivity_dbm`). Noise-equivalent receiver bandwidth is independent of interference SCS/resource-element bandwidth. The same resolved threshold is surfaced in link diagnostics, static reach, building-entry indoor scenarios, surfaces, interference carrier admission, optimization, and reports, while building service (`> -100 dBm`), raw surface values, and interference RSRP/SINR/RSRQ serviceability retain their separate semantics. See the standalone note for equations, references, canonical evidence, and non-claims.

## Concept 4H.1: Interference and Radio Quality

[`Concept 4H.1`](concept-4h1-interference-radio-quality.md) formalizes the existing interference path as an inspectable planning contract. Propagation first returns total received carrier power. The path then applies a declared uniform full-carrier-to-reference-resource conversion, sums desired/interfering powers in mW on that same basis, and adds independent `kTB` thermal noise at the serving subcarrier spacing. RSRP, RSSI, RSRQ, and SINR are labeled planning approximations rather than UE measurements. Serving selection, exact co-channel matching, deterministic load, serving-only receiver-sensitivity admission, finite per-cell interference horizons, failure reasons, a per-cell power ledger, and a scenario fingerprint are returned with the result. Radio-quality diagnostics never feed the canonical propagation-only optimizer.

## Concept 4H.2: Interference-Aware Optimization

[`Concept 4H.2`](concept-4h2-radio-quality-optimization.md) adds the optional
`radio_quality` soft objective. It evaluates the existing 4H.1 planning policy
(`RSRP >= -110 dBm`, `SINR >= 0 dB`, `RSRQ >= -20 dB`) over one fixed,
candidate-independent row-major union grid. The serviceable fraction is a
stable utility; no-carrier points remain denominator failures. A positive
priority adds the utility to composite ranking and Pareto dominance, while a
zero priority leaves the propagation-only candidate, score, recommendation,
and Pareto dimensions unchanged. Stored raw candidate metrics support local
priority reranking and the same fixed-domain counterfactual used by per-cell
explanations.

The optimizer prepares geometry once and keeps the candidate hot loop compact:
azimuth-dependent antenna/link evaluation, automatic strongest eligible
serving selection, exact co-channel linear power summation, thermal noise, and
aggregate serviceability/outage/percentile metrics. It does not call the
public interference endpoint per candidate. The reported result is conditional
on the finite per-cell effective-radius compatibility horizon and is not a
network-wide interference, throughput, MCS, scheduler, indoor, adjacent
channel, or 140 GHz model. The 140 GHz research profile returns
`unsupported_radio_quality_model` and renormalizes available objectives.

## Radio Frequency Physics Foundation

### Free-Space Path Loss (FSPL)

The fundamental free-space term uses the current [ITU-R P.525-5 (2024-11)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.525-5-202411-I!!PDF-E.pdf) equation as a mathematical reference:

$$L = 20 \log_{10}(d[m]) + 20 \log_{10}(f[GHz]) + 32.45$$

**Simplification** (practical form):

$$L[dB] = 20 \log_{10}(d[m]) + 20 \log_{10}(f[GHz]) + 32.45$$

### Legacy Received Power Calculation

The selectable compatibility mode is `legacy_fspl_walls` (historically reported as `fspl-walls-2p5d-v3`). Its link budget is:

$$P_{rx}[dBm] = P_{tx} + G_{tx} - L_{system} + C - L_{FSPL} - L_{building} - A_{horizontal} - A_{vertical}$$

Where:
- $P_{tx}$ and $G_{tx}$ are the absolute transmit-power and antenna-gain terms
- $L_{system}$ is the configured system loss and $C$ is the signed global calibration offset
- $L_{FSPL}$ uses the slant distance between the transmitter and receiver, with meter/GHz units
- $L_{building}$ is cumulative frequency-dependent, material-agnostic building-boundary loss
- $A_{horizontal}$ and $A_{vertical}$ are relative analytic antenna-pattern attenuations

This compatibility mode uses horizontal building-footprint geometry and height-aware FSPL; it does not use the urban roof classifier, terrain, diffraction, reflection, fast fading, or multipath. A positive $C$ raises predicted received power by the same global dB offset. The separate path-profile workflow is an advanced point-to-point diagnostic with its own `path-profile-diagnostic-v1` contract; it does not alter network RF.

## 2.5D Point-To-Point Profiles

For a selected transmitter and receiver, the engine samples a geodesic path at a bounded spacing. Each sample contains ground elevation plus any intersecting building height. Antenna and receiver elevations are their local ground elevations plus configured height above ground.

The result reports direct geometric line-of-sight clearance and a 60% first-Fresnel-zone clearance check. Fresnel concern is a separate geometry diagnostic and does not change LOS/NLOS classification:

```text
r1 = sqrt(lambda * d1 * d2 / (d1 + d2))
```

The isolated Concept 4F.2 workflow represents each known flat-roof footprint by deterministic entry and exit roof-edge candidates. It exposes the signed P.526-16 equation (26) parameter and applies equation (31) for `v > -0.78`; the candidate with maximum applicable `v` is selected. Generic fallback heights are unavailable evidence. The diagnostic compares FSPL plus explicit single-edge loss against canonical UMa; it never adds diffraction to UMa NLOS. Deygout/multiple-edge, reflection, and terrain-clutter coupling are not implemented.

The inspectable loss budget keeps FSPL, horizontal/vertical antenna attenuation, system loss, wall penetration, diffraction, clutter, vegetation, gas, rain, and calibration as separate signed components. Shadow sigma produces sensitivity bounds and is not injected as a random field, preserving determinism.

The `terrain-profile` and `urban-short-range` labels use the current recorded scopes of [ITU-R P.1812-8 (2025-09)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1812-8-202509-I!!PDF-E.pdf) and [ITU-R P.1411-13 (2025-09)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-13-202509-I!!PDF-E.pdf), while retaining A.T.O.M's existing runtime conditions and limits. The knife-edge, material, gas, and rain controls are informed by [P.526-16](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.526-16-202511-I!!PDF-E.pdf), [P.2040-4](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf), [P.676](https://www.itu.int/rec/R-REC-P.676/en), and [P.838](https://www.itu.int/rec/R-REC-P.838/en); A.T.O.M does not claim full Recommendation conformance.

### Frequency Dependence

FSPL increases with frequency squared:

$$L \propto f^2$$

**Consequence**: Same distance results in substantially higher loss as frequency rises, which is why mmWave and Sub-THz coverage shrink quickly in urban settings.

---

## Building Penetration Model

### Legacy Generation-Specific Wall Loss

The selectable `legacy_fspl_walls` mode applies a fixed loss each time a ray crosses a building boundary. OSM building tags are still used for demand scoring and diagnostics, but wall penetration is intentionally frequency-driven in that compatibility mode:

```
if frequency_ghz < 10:
    loss_4g = 8 dB
elif frequency_ghz < 100:
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
5. Evaluate the selected shared propagation model at each physical endpoint; only the explicit legacy mode applies cumulative wall dB
6. Apply the effective per-cell receiver sensitivity threshold
7. Color each segment by received power
8. Serialize the segments as GeoJSON

### Pseudocode

```go
func TraceSector(tx Location, req SimulationRequest) GeoJSON {
    result := GeoJSON{}
    if req.rays * ceil(req.radius_m / 25) > 25_000 {
        return error("simulation response feature limit exceeded")
    }
    maxDistance := req.radius_m
    receiverSensitivity := effectiveReceiverSensitivity(req)

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
            txGain := effectiveTxAntennaGain(req)
            patternLoss := sharedAntennaPatternLoss(req, segmentEnd)
            propagationLoss := fspl + wallLoss
            rxPower := req.tx_power_dbm + txGain - patternLoss + req.rx_antenna_gain_dbi - req.system_loss_db - req.polarization_loss_db + req.calibration_offset_db - propagationLoss

            if rxPower <= receiverSensitivity {
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

**Solution**: Query the R-Tree's segment bounding box, then test each candidate polygon with exact segment-edge intersections and point-in-polygon checks. Duplicate boundary points for the same building are collapsed within the current 5 cm tolerance, and intersections are processed in distance order.

```go
func SegmentIntersectsPolygon(segment Line, polygon Polygon) bool {
    // Test the segment against all polygon edges
    for i := 0; i < len(polygon.Edges); i++ {
        edge := polygon.Edges[i]
        if SegmentIntersectsSegment(segment, edge) {
            return true
        }
    }
    
    // Test if segment start/end is inside the polygon
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

**Query cost**: the R-tree prunes non-overlapping bounds before polygon tests. Cost depends on tree overlap, returned candidates and geometry; it is not a universal logarithmic-time guarantee.

---

## Spatial Indexing: R-Tree

### Why R-Tree?

RF evaluation repeats spatial queries. A linear scan tests every footprint; the R-tree first selects overlapping bounds and then checks candidate geometry. Candidate counts and runtime depend on the dataset and queried paths. This is an implementation description, not a measured speedup claim.

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

**Result**: a path-dependent candidate set. Counts are workload evidence, not a fixed property of the index.

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
      | (relative loss=0dB)|
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

Samples outside the configured sector or radius do not contribute. Configured antenna gain is applied separately in the link budget; the diagram's zero value means zero relative preset attenuation at boresight. Compatibility sector presets use hard eligibility; omni and the optional single-element reference have their separately documented full-azimuth behavior. These are analytic patterns, not vendor antenna diagrams.

---

## Deterministic Optimization: Sweep & Score Algorithm

### Problem Statement

**Find**: The recommended azimuth among 36 evaluated 10-degree directions, using POI demand and residential-demand scores plus capped usable-ray reach as a tie-break component.

**Constraints**:
- Distance range: 25 m to 5 km
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
        
        // Usable ray reach contributes a capped planning score
        reachScore := 0.0
        reachCap := min(request.radius_m, 500)
        for ray in rays {
            reachScore += min(ray.distance, reachCap) / reachCap * 100
        }
        score := demandScore + residentialScore + reachScore
        
        // Track best
        if score > bestScore {
            bestScore = score
            bestAzimuth = azimuth
        }
    }
    
    return bestAzimuth
}
```

### Search scope and runtime evidence

The single-sector sweep evaluates 36 directions from 0° through 350°. For each direction, it sums unique POI demand weight × 10,000, unique residential demand × 10,000, and per-ray usable reach capped at `min(radius_m, 500 m)` and normalized to 100 per ray. These are demand proxies and a reach component, not a continuous-area coverage percentage. The chosen direction has the highest combined score among those evaluated; ties preserve the established deterministic order. The compatibility field `optimal_azimuth` means this bounded recommendation, not a global optimum over arbitrary angles or radio parameters.

The sector implementation uses at most four workers, bounded by available CPUs and candidate count. This does not establish a proportional speedup or a general latency promise.

A separate [historical network optimization audit](network-optimization-deadline-audit.md) records an affected **six-Cell, 28 GHz** Ankara request at **120 rays, 400 m, 30 dBm and a 120° beam**, using legacy two-pass search, default priorities and no positive radio-quality objective. In the recorded Go 1.26.6 Linux/arm64 Docker controls on an Apple M4 host (10 logical CPUs, GOMAXPROCS=10, no container CPU/memory quota), uncached request times were approximately **94.7–112.7 s**, versus corrected isolated controls of **6.72–6.76 s**. The first uncached run overlapped host measurements; these small samples are descriptive, not population latency guarantees.

All **434 network proposals** remained. The scorer still requested **2,604 independent Cell contributions**, but request-local reuse reduced expensive work to **180 misses plus 2,424 hits**; two selected IDs had identical locations/profiles. Removal of repeated RF contribution work was the demonstrated implementation change. Worker counts and scheduling were unchanged. There is no controlled factorial percentage split for caching versus concurrency. These are admitted-request measurements, excluding the full browser journey, dataset startup and later map refreshes; request-local reuse starts fresh on each request. OS/runtime warm state and other workloads can affect timing. No universal speedup, eight-Cell latency or current-hardware guarantee follows.

Network optimization is also bounded: the default two-pass coordinate search proposes `72 × Cell count + 2` evaluations, or **578 proposals for eight Cells**. Its recommendation and discovered Pareto set do not prove global mathematical optimality.

## Network Objective Model

Network azimuth optimization keeps the existing RF evaluation and hard feasibility checks separate from preference scoring. Each feasible evaluated configuration stores raw measurements and stable utilities. Demand and residential measurements use the same indexed `BuildingFootprint` unit for both numerator and denominator; multipart source geometries remain separate suffixed footprints because the RF engine has no stable logical-building ID to merge safely:

- **Demand**: served relevant demand weight / relevant demand weight inside the fixed selected-cell radius-union domain. Demand relevance uses the existing building-centroid convention.
- **Residential**: covered relevant residential footprints / residential footprints intersecting the fixed selected-cell radius-union domain.
- **Propagation reach**: the existing capped aggregate usable-ray-reach score / `towers × rays × 100`, the stable maximum of that metric. The legacy objective ID remains `coverage` for compatibility; it does not mean spatial-area coverage.
- **Overlap**: `1 - (overlapping covered buildings / covered buildings)`.

Utilities are clamped to `[0, 1]`; they are not normalized against the current candidate set. The optimization domain is prepared once per request from the logical union of each selected cell's configured service-radius envelope and is independent of candidate azimuths. User priorities are 0–100 values; unavailable objectives are marked N/A and excluded from the effective-priority denominator without mutating their configured values. The composite score is the weighted utility sum over available objectives, exposed as `score = composite_score × 100`. Hard constraint violations exclude candidates from the feasible Pareto frontier; they are not converted into score penalties. The same stored frontier can therefore be re-ranked when priorities change without repeating RF evaluation.

---

## Performance Characteristics

### Workload-dependent runtime and memory

Runtime depends on dataset geometry, Cell count, band, rays, radius, selected model and objective, hardware, and concurrent host work. The historical six-Cell comparison above is the supported timing example; it is not a general response-time promise. `BenchmarkCanonicalAnkaraNetworkOptimization` provides a repeatable developer workload, not a product latency guarantee.

Memory depends on the loaded dataset, spatial indices, active requests and retained results. The 25,000-feature response ceiling bounds one output dimension; it does not establish a universal process-memory footprint. See the [eight-Cell qualification](eight-cell-product-cap-promotion.md) for the bounded Profile A envelope and measurements.

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

- Canonical network propagation does not consume terrain. Optional terrain, Fresnel and single-edge path-profile diagnostics are separate evidence.
- Canonical RF excludes multipath reflection, fading, array/codebook beamforming, MIMO scheduling and UE behavior. Isolated reference panels do not silently add those effects.
- Antenna presets are analytic or single-element references, not measured/vendor hardware patterns.
- Geometry and demand are static, incomplete planning inputs; missing height evidence and model fallback are explicit.
- Building-entry estimates apply just inside a representative facade, not throughout rooms or floors.

### When to use A.T.O.M

Use it for bounded configuration comparisons, azimuth recommendations, inspectable link budgets, building-service estimates and modeled co-channel interference. The interference ledger uses explicit resource assumptions and finite per-Cell horizons; it is not measured UE interference, adjacent-channel full-system modeling or commercial network KPI truth.

Measured real-world propagation accuracy is not yet established. Deployment approval, calibrated antenna/terrain performance, mobility/handover prediction, dynamic traffic/capacity and complete operator-network validation require evidence and capabilities outside the released scope.

---

**Next**: Explore the [API Reference](api.md) to integrate A.T.O.M into your systems.
