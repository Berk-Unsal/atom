# Modeling Limits

A.T.O.M produces deterministic planning estimates. It is designed for comparative RF planning, education, API experimentation, and inspectable scenario analysis. Its outputs are not UE measurements, drive-test results, calibrated link budgets, or a replacement for a commercial propagation tool.

The network engine dispatches explicit propagation models. `urban_short_range` is the deterministic 3GPP UMa LOS/NLOS baseline for 2.6/28 GHz, using the shared height-aware `footprint-height-los-v1` centerline classifier; `legacy_fspl_walls` is the compatibility model and fallback, and `research_sub_thz` is the explicitly research-only 140 GHz profile. Known heights can clear a footprint, while unknown-height intersections remain conservative NLOS. The current Ankara network has no terrain layer, so height-aware results report `terrain_unavailable` and use flat-ground relative heights. Its applicability and classification metadata are returned in `rf_contract`, ray explainability, interference, surface, and building-entry fields. The separate [Concept 4E building-entry analysis](concept-4e-building-entry.md) adds one standard O2I facade term at zero indoor depth; it is not indoor or whole-building coverage. The point-to-point path profile remains an isolated advanced diagnostic with model id `path-profile-diagnostic-v1`. Read the [Concept 4F.1 design note](concept-4f1-height-aware-obstruction.md) for the centerline rule and audit.

## RF Semantic Contract

| Concept | Meaning in the API | Threshold or scope |
|---|---|---|
| Raw received power | The link-budget output for a cell at a valid geometry sample | `P_rx` may be below sensitivity; the value remains numeric |
| Receiver sensitivity | Per-cell static-ray termination threshold | Read `rf_profile.receiver_sensitivity_dbm` from the effective cell profile |
| Usable signal | A cell/ray whose raw received power is strictly above its effective receiver sensitivity | Per-cell, not a building-service or interference threshold |
| Building service | Demand-building classification from raw received power | Served only when `raw P_rx > -100 dBm` |
| Propagation reach | Aggregate usable-ray reach used by coverage/reach scores | Capped by configured radius and beam geometry; panel patterns use the same sensitivity rule |
| Received-signal surface | One selected cell's raw received-power raster | Numeric below-sensitivity cells are retained; NoData means only radius/beam geometry exclusion |
| Interference serviceability | Quality classification after serving/interferer formation | `RSRP >= -110 dBm` **and** `SINR >= 0 dB` **and** `RSRQ >= -20 dB` |

The building and interference thresholds above are current planning defaults. They are intentionally separate from each cell's receiver sensitivity. A global calibration offset is signed: positive dB raises predicted received power.

## What the Model Uses

- Per-cell coordinates, azimuth, technology/frequency/bandwidth, interference channel, beam width, radius, transmit power, antenna gain/loss, antenna and receiver heights, downtilts, orientation, pattern preset, sensitivity, and load
- Explicit propagation model selection and the requested/applied model identity
- Free-space path loss (FSPL)
- Configured per-cell antenna gain and system loss
- Beam-sector, horizontal/vertical pattern-preset attenuation, per-cell receiver-sensitivity termination, and configured-radius eligibility
- Building-polygon intersections from the local Ankara GeoJSON dataset
- Frequency-dependent cumulative wall attenuation only in `legacy_fspl_walls`; urban empirical NLOS does not receive an additional legacy wall term, and indoor endpoint fallback is explicit
- Deterministic POI and residential-demand enrichment for scoring
- Co-channel cell power, load, reuse, thermal noise, and resource-block presets for interference analysis
- Optional COG/GeoTIFF ground elevation, building-height obstruction, LOS/Fresnel geometry, and one dominant single knife-edge approximation in the isolated point-to-point path-profile workflow
- Optional, user-entered material, clutter, vegetation, gas, rain, and shadow-sensitivity components in that path-profile workflow

The same request and dataset produce the same RF result. Core Lab scenario state does not modify propagation or interference calculations.

## Propagation Effects Not Modeled

- Fast or slow fading
- Multiple-obstacle diffraction, roof/corner diffraction beyond the selected single knife-edge approximation
- Multipath reflection or ray bouncing
- Automatic foliage, weather, atmospheric, and clutter datasets; those effects are explicit sensitivity inputs when enabled
- Measured antenna diagrams, sidelobes, polarization, and per-frequency pattern interpolation
- MIMO layers, beamforming codebooks, polarization, or device orientation
- Dynamic scheduling, mobility, handover margins, and UE implementation behavior
- Uplink interference and adjacent-channel leakage

Cells outside their configured beam or radius contribute no signal in the current model. Static rays terminate when modeled power is at or below the effective per-cell receiver sensitivity; coverage surfaces retain those valid below-sensitivity values instead of converting them to NoData. This sharp planning boundary explains why samples can show no signal immediately outside a sector even when a real antenna might contribute sidelobe energy.

The `ideal-sector`, `cosine-sector`, `omni`, `flat`, `panel-10deg`, and `panel-20deg` choices are deterministic analytic presets, not vendor antenna files. Mechanical and electrical downtilt are combined against a simple elevation angle; antenna and receiver heights affect slant distance but do not create a full 3D scene.

Band labels, duplex mode, reuse factor, and PCI are retained and validated as inventory/reproducibility metadata. Channel IDs determine co-channel interference, while reuse supplies deterministic default channel assignment; the engine does not otherwise simulate duplex timing, PCI planning, or band-specific protocol behavior.

## Interference Metrics

LTE RSRP and RSRQ are CRS-style planning estimates. 5G values are modeled SS-RSRP and SS-RSRQ estimates. SINR, RSSI, RSRP, and RSRQ are derived from deterministic carrier powers and standardized resource-block concepts; they are not sampled from UE or PHY measurement reports.

An SINR near `0 dB` is expected when the serving cell and a co-channel interferer arrive at similar power and noise is comparatively small. A no-signal sample means no configured cell contributes under the current radius and beam geometry.

## Data Confidence

- Building footprints and metadata are static snapshots derived from OpenStreetMap processing.
- Tower locations are a planning dataset derived from OpenCellID-oriented source processing, not an operator inventory.
- Demand weights use available OSM tags and residential-density enrichment; missing tags reduce semantic confidence.
- Basemap tiles provide visual context only and do not enter RF calculations.
- A supported north-up EPSG:4326 COG/GeoTIFF terrain layer is consumed by the point-to-point profile only. The fast sector, interference, optimization, batch, and regular-surface engines do not consume terrain.
- Building footprints preserve height provenance: reliable `height` is `observed_tag`, `building:levels` is `derived_from_levels` at 3 m per level, and the explicit 9 m display fallback is `unavailable` roof evidence. Unknown-height urban intersections are conservative NLOS. Material tags are normalized when present; explicit material/environment controls must not be described as surveyed site data.
- Separate clutter, height, and material sidecar layers are validated as pack metadata but are not automatically spatially joined into all analyses.

Review the Data tool and exported report for the assumptions attached to a specific analysis.

## Recommendation Applicability

The `terrain-profile` label is available only from 30 MHz to 6 GHz, matching the frequency scope recorded for the current [ITU-R P.1812-8 (2025-09) Recommendation](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1812-8-202509-I!!PDF-E.pdf). The runtime profile also requires a terrain-capable path context for that reference scope; missing terrain uses the explicit zero-metre local datum and is not P.1812 conformance.

The `urban-short-range` label is available from 300 MHz to 100 GHz in the current runtime profile. The current [ITU-R P.1411-13 (2025-09) Recommendation](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-13-202509-I!!PDF-E.pdf) has a broader 300 MHz to 300 GHz outdoor short-range scope, but A.T.O.M retains its existing 100 GHz runtime ceiling and does not claim full P.1411 implementation. A research sub-THz profile is explicitly outside both standards-based profiles.

The single knife-edge term is an approximation informed by [ITU-R P.526-16 (2025-11)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.526-16-202511-I!!PDF-E.pdf). User-selected material, atmospheric-gas, and rain terms are informed by [ITU-R P.2040-4](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf), [ITU-R P.676](https://www.itu.int/rec/R-REC-P.676/en), and [ITU-R P.838](https://www.itu.int/rec/R-REC-P.838/en), respectively. They are not automatic implementations driven by surveyed construction or current meteorological data.

The reference catalog also records [3GPP TR 38.901 V19.4.0 (2026-06-23)](https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3173) as a comparison scope for 0.5–100 GHz channel evaluation. The runtime dispatches the documented deterministic UMa path-loss subset as `urban_short_range`, without claiming full 3GPP channel-model conformance. Measurement and calibration behavior is represented by `/api/measurements/evaluate`; there is no standalone calibration endpoint in this matrix.

## Reference and Applicability Foundation

Concept 4B adds an independent, human-auditable fixture corpus at `backend-go/raytracer/testdata/rf-reference-fixtures.json` and the corresponding contract tests in `backend-go/raytracer/rf_reference_fixtures_test.go`. The corpus covers FSPL, slant-distance link budgets, antenna-pattern attenuation and beam boundaries, dBm/mW and thermal-noise arithmetic, RSRP/SINR arithmetic, Fresnel radius, knife-edge loss, exact polygon boundary cases, sensitivity termination, raw received-power surfaces, and point-sampled path-profile behavior. Expected values are independently calculated fixtures; the tests compare them with the existing implementation without changing its equations.

The metadata catalog in `backend-go/raytracer/reference_foundation.go` exposes explicit applicability states and failure reasons for frequency, path length, scenario, terrain, building data, and LOS/NLOS requirements. Failure results use identifiers such as `frequency_out_of_range`, `distance_out_of_range`, `unsupported_environment`, `required_terrain_missing`, `required_building_data_missing`, `required_los_or_nlos_missing`, `research_profile_only`, and `unsupported_endpoint`. Its capability matrix records 4G/2.6 GHz, 5G/28 GHz, and 6G/140 GHz across static, surface, network, azimuth/network optimization, interference, path profile, and measurement/calibration endpoints. Current support is not uniform: static, surface, and network RF evaluation accept 6G profiles; interference, measurement evaluation, and site recommendations remain restricted; path-profile 6G is research-only. Interference serviceability uses separate RSRP/SINR/RSRQ thresholds, not receiver sensitivity or building service. This catalog is descriptive and does not dispatch a new propagation model.

Network responses intentionally expose separate score representations. `stats.network_score` is the legacy raw aggregate of weighted domain metrics; it may be much larger than 100. `stats.objectives` contains normalized utilities, `stats.composite_score` is their weighted 0–1 composite, and `stats.score` is the authoritative 0–100 presentation score. `optimization.objective_score` and recommendation `marginal_network_score` remain raw compatibility values and must not be formatted as /100 scores.

## Appropriate Interpretation

Use A.T.O.M to compare configurations, find deterministic coverage gaps, understand co-channel relationships, inspect communication-path fallbacks, and communicate planning assumptions. Validate deployment decisions with calibrated propagation models, current operator data, spectrum assumptions, link-budget engineering, and field measurements.

## Related References

- [System architecture](./architecture.html)
- [RF algorithms](./algorithms.md)
- [REST API](./api.md)
