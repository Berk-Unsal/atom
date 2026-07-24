# Modeling Limits

A.T.O.M produces deterministic planning estimates. It is designed for comparative RF planning, education, API experimentation, and inspectable scenario analysis. Its outputs are not UE measurements, drive-test results, calibrated link budgets, or a replacement for a commercial propagation tool.

## What the Model Uses

- Selected tower coordinates, azimuth, beam width, radius, transmit power, frequency, and ray count
- Free-space path loss (FSPL)
- Technology-specific antenna gain assumptions
- Beam-sector and configured-radius eligibility
- Building-polygon intersections from the local Ankara GeoJSON dataset
- Frequency-dependent cumulative wall attenuation
- Deterministic POI and residential-demand enrichment for scoring
- Co-channel cell power, load, reuse, thermal noise, and resource-block presets for interference analysis

The same request and dataset produce the same RF result. Core Lab scenario state does not modify propagation or interference calculations.

## Propagation Effects Not Modeled

- Fast or slow fading
- Diffraction around roofs, corners, and terrain
- Multipath reflection or ray bouncing
- Terrain elevation, foliage, weather, and atmospheric absorption
- Antenna sidelobes and detailed antenna radiation patterns
- MIMO layers, beamforming codebooks, polarization, or device orientation
- Dynamic scheduling, mobility, handover margins, and UE implementation behavior
- Uplink interference and adjacent-channel leakage

Cells outside their configured beam or radius contribute no signal in the current model. This sharp planning boundary explains why samples can show no signal immediately outside a sector even when a real antenna might contribute sidelobe energy.

## Interference Metrics

LTE RSRP and RSRQ are CRS-style planning estimates. 5G values are modeled SS-RSRP and SS-RSRQ estimates. SINR, RSSI, RSRP, and RSRQ are derived from deterministic carrier powers and standardized resource-block concepts; they are not sampled from UE or PHY measurement reports.

An SINR near `0 dB` is expected when the serving cell and a co-channel interferer arrive at similar power and noise is comparatively small. A no-signal sample means no configured cell contributes under the current radius and beam geometry.

## Data Confidence

- Building footprints and metadata are static snapshots derived from OpenStreetMap processing.
- Tower locations are a planning dataset derived from OpenCellID-oriented source processing, not an operator inventory.
- Demand weights use available OSM tags and residential-density enrichment; missing tags reduce semantic confidence.
- Basemap tiles provide visual context only and do not enter RF calculations.

Review the Data tool and exported report for the assumptions attached to a specific analysis.

## Appropriate Interpretation

Use A.T.O.M to compare configurations, find deterministic coverage gaps, understand co-channel relationships, inspect communication-path fallbacks, and communicate planning assumptions. Validate deployment decisions with calibrated propagation models, current operator data, spectrum assumptions, link-budget engineering, and field measurements.

## Related References

- [System architecture](./architecture.html)
- [RF algorithms](./algorithms.md)
- [REST API](./api.md)
