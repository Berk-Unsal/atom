# Modeling Limits

A.T.O.M produces deterministic planning estimates. It is designed for comparative RF planning, education, API experimentation, and inspectable scenario analysis. Its outputs are not UE measurements, drive-test results, calibrated link budgets, or a replacement for a commercial propagation tool.

## What the Model Uses

- Per-cell coordinates, azimuth, technology/frequency/bandwidth, interference channel, beam width, radius, transmit power, antenna gain/loss, antenna and receiver heights, downtilts, orientation, pattern preset, sensitivity, and load
- Free-space path loss (FSPL)
- Configured per-cell antenna gain and system loss
- Beam-sector, horizontal/vertical pattern-preset attenuation, receiver-sensitivity, and configured-radius eligibility
- Building-polygon intersections from the local Ankara GeoJSON dataset
- Frequency-dependent cumulative wall attenuation
- Deterministic POI and residential-demand enrichment for scoring
- Co-channel cell power, load, reuse, thermal noise, and resource-block presets for interference analysis
- Optional COG/GeoTIFF ground elevation, building-height obstruction, LOS/Fresnel geometry, and one dominant single knife-edge approximation in the point-to-point path-profile workflow
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

Cells outside their configured beam or radius contribute no signal in the current model. This sharp planning boundary explains why samples can show no signal immediately outside a sector even when a real antenna might contribute sidelobe energy.

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
- Building footprints infer height from `height`, then `building:levels`, then an explicit 9 m fallback. Material tags are normalized when present; explicit material/environment controls must not be described as surveyed site data.
- Separate clutter, height, and material sidecar layers are validated as pack metadata but are not automatically spatially joined into all analyses.

Review the Data tool and exported report for the assumptions attached to a specific analysis.

## Recommendation Applicability

The `terrain-profile` label is available only from 30 MHz to 6 GHz, matching the published frequency range of [ITU-R P.1812-8](https://www.itu.int/rec/R-REC-P.1812-8-202509-I/en). The `urban-short-range` label is available from 300 MHz to 100 GHz, matching [ITU-R P.1411-9](https://www.itu.int/rec/R-REC-P.1411-9-201706-I/en). A research sub-THz profile is explicitly outside both ranges. A.T.O.M implements selected inspectable concepts and sensitivity components; it does not implement either Recommendation in full.

The single knife-edge term is an approximation informed by [ITU-R P.526](https://www.itu.int/rec/R-REC-P.526/en). User-selected material, atmospheric-gas, and rain terms are informed by [ITU-R P.2040](https://www.itu.int/rec/r-rec-p.2040/en), [ITU-R P.676](https://www.itu.int/rec/R-REC-P.676/en), and [ITU-R P.838](https://www.itu.int/rec/R-REC-P.838/en), respectively. They are not automatic implementations driven by surveyed construction or current meteorological data.

## Appropriate Interpretation

Use A.T.O.M to compare configurations, find deterministic coverage gaps, understand co-channel relationships, inspect communication-path fallbacks, and communicate planning assumptions. Validate deployment decisions with calibrated propagation models, current operator data, spectrum assumptions, link-budget engineering, and field measurements.

## Related References

- [System architecture](./architecture.html)
- [RF algorithms](./algorithms.md)
- [REST API](./api.md)
