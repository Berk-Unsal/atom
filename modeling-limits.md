# Modeling Limits

A.T.O.M produces deterministic planning estimates. It is designed for comparative RF planning, education, API experimentation, and inspectable scenario analysis. Its outputs are not UE measurements, drive-test results, calibrated link budgets, or a replacement for a commercial propagation tool.

The network engine dispatches explicit propagation models. `urban_short_range` is the deterministic 3GPP UMa LOS/NLOS baseline for 2.6/28 GHz, using the shared height-aware `footprint-height-los-v1` centerline classifier; `legacy_fspl_walls` is the compatibility model and fallback, and `research_sub_thz` is the explicitly research-only 140 GHz profile. Known heights can clear a footprint, while unknown-height intersections remain conservative NLOS. The current Ankara network has no terrain layer, so height-aware results report `terrain_unavailable` and use flat-ground relative heights. Its applicability and classification metadata are returned in `rf_contract`, ray explainability, interference, surface, and building-entry fields. The separate [Concept 4E building-entry analysis](concept-4e-building-entry.md) adds one standard O2I facade term at zero indoor depth; it is not indoor or whole-building coverage. The point-to-point path profile remains an isolated advanced diagnostic with model id `path-profile-diagnostic-v1`. The separate [Concept 4I.2A atmospheric reference](concept-4i2a-atmospheric-reference.md) is an opt-in standards ledger and is never silently added to any network model. Read the [Concept 4F.1 design note](concept-4f1-height-aware-obstruction.md) for the centerline rule and audit, and the [Concept 4G.2 receiver-noise note](concept-4g2-receiver-noise-sensitivity.md) for the effective per-cell receiver threshold and link-margin contract.

## RF Semantic Contract

| Concept | Meaning in the API | Threshold or scope |
|---|---|---|
| Raw received power | The signed link-budget output for a cell at a valid geometry sample | `P_rx` may be below sensitivity; the value remains numeric |
| Conducted TX power | Transmitter output before absolute antenna gain | `tx_power_dbm`; never an EIRP input |
| TX boresight gain | Absolute transmit antenna gain at boresight | `tx_antenna_gain_dbi`; `antenna_gain_dbi` is a stable alias |
| TX pattern attenuation | Relative loss from the TX boresight direction | Non-negative dB; separate from absolute gain and hard-beam eligibility |
| Boresight/directional EIRP | Conducted TX plus absolute TX gain, before/after relative pattern loss | `boresight_eirp_dbm` and `directional_eirp_dbm`; neither includes an implicit receiver gain |
| Receiver gain | Scalar receiver-side gain | `rx_antenna_gain_dbi`, default `0 dBi`; no receiver orientation/pattern model |
| System loss | Aggregate non-propagation implementation loss | `system_loss_db`; does not include antenna pattern, building entry, polarization, or propagation |
| Polarization loss | Explicit deterministic mismatch loss | `polarization_loss_db`, default `0 dB`; no vector or stochastic model |
| Receiver sensitivity | Per-cell static-ray termination and usable-carrier admission threshold | `manual` reads `rf_profile.receiver_sensitivity_dbm`; `derived` uses the returned `receiver_threshold` from noise bandwidth, noise figure, required SNR, and receiver margin |
| Usable signal | A cell/ray whose raw received power is strictly above its effective receiver sensitivity | Per-cell, not a building-service or interference threshold |
| Building service | Demand-building classification from raw received power | Served only when `raw P_rx > -100 dBm` |
| Propagation reach | Aggregate usable-ray reach used by coverage/reach scores | Capped by configured radius and compatibility hard-beam geometry; full-azimuth reference patterns retain finite off-axis power |
| Received-signal surface | One selected cell's raw received-power raster | Numeric below-sensitivity cells are retained; NoData means only radius/beam geometry exclusion |
| Interference serviceability | Quality classification after serving/interferer formation | `RSRP >= -110 dBm` **and** `SINR >= 0 dB` **and** `RSRQ >= -20 dB`, independent of receiver sensitivity |

The building and interference thresholds above are current planning defaults. They are intentionally separate from each cell's receiver sensitivity. In derived mode, `Sensitivity = -174 dBm/Hz + 10 log10(B_noise_Hz) + NF + RequiredSNR + ReceiverMargin`; the `-174 dBm/Hz` value is a rounded 290 K reference convention and the selected planning SNR/margin are not UE or 3GPP conformance parameters. The canonical ledger is `P_rx = P_tx_conducted + G_tx_boresight - A_tx_pattern + G_rx - L_system - L_polarization + calibration - L_propagation - L_building`. A global calibration offset is signed: positive dB raises predicted received power. The historical `eirp_dbm` field is retained as an effective-transmit compatibility alias and must not be read as conducted power or as boresight EIRP.

## What the Model Uses

- Per-cell coordinates, azimuth, technology/frequency/bandwidth, interference channel, beam width, radius, conducted TX power, absolute antenna gain, relative pattern, antenna and receiver heights, downtilts, orientation, pattern preset, receiver sensitivity mode, manual sensitivity, noise bandwidth, noise figure, required SNR, receiver margin, and load
- Explicit propagation model selection and the requested/applied model identity
- Free-space path loss (FSPL)
- Configured per-cell conducted TX power, absolute TX boresight gain, scalar RX gain, system loss, deterministic polarization loss, and calibration
- One shared antenna evaluator for horizontal/vertical relative attenuation, tilt, orientation, and eligibility across direct links, rays, surfaces, interference, building entry, and optimization
- Analytic compatibility patterns with hard-sector eligibility, plus the optional full-azimuth `3gpp-single-element` reference cut
- Building-polygon intersections from the local Ankara GeoJSON dataset
- Frequency-dependent cumulative wall attenuation only in `legacy_fspl_walls`; urban empirical NLOS does not receive an additional legacy wall term, and indoor endpoint fallback is explicit
- Deterministic POI and residential-demand enrichment for scoring
- Co-channel cell power, load, reuse, thermal noise, and resource-block presets for interference analysis
- A shared thermal-noise arithmetic helper with distinct receiver noise-equivalent bandwidth and interference per-resource-element bandwidth semantics
- Optional COG/GeoTIFF or explicitly declared standard HGT ground elevation, building-height obstruction, LOS/Fresnel geometry, and one dominant single knife-edge approximation in the isolated point-to-point path-profile workflow
- Optional, user-entered material, clutter, vegetation, gas, rain, and shadow-sensitivity components in that path-profile workflow
- Separate opt-in `sub_thz_atmospheric_reference_v1` component ledger for explicit P.525-5 free space, P.676-13 gas, P.838-3 rain, and local-fog P.840-9 sensitivity; this ledger is not a canonical propagation model and does not make serviceability decisions

The same request and dataset produce the same RF result. Core Lab scenario state does not modify propagation or interference calculations.

## Propagation Effects Not Modeled

- Fast or slow fading
- Multiple-obstacle diffraction, roof/corner diffraction beyond the selected single knife-edge approximation
- Multipath reflection or ray bouncing
- Automatic foliage, weather, atmospheric, and clutter datasets; those effects are explicit sensitivity inputs when enabled
- Measured/vendor antenna diagrams, tabulated-pattern upload/interpolation, array factor, codebooks, and per-frequency hardware calibration
- MIMO layers, beamforming codebooks, stochastic polarization, UE/device orientation, or receiver radiation patterns. A scalar RX gain, scalar polarization loss, and deterministic noise-limited receiver threshold are the receiver-side terms; no UE implementation model is implied.
- Dynamic scheduling, mobility, handover margins, and UE implementation behavior
- Uplink interference and adjacent-channel leakage

Cells outside their configured beam or radius contribute no signal in the current model. Static rays terminate as usable rays when modeled power is at or below the effective per-cell receiver sensitivity; coverage surfaces retain those valid below-sensitivity values instead of converting them to NoData. Building-entry outdoor service remains the separate raw-power `> -100 dBm` rule, and post-threshold geometry is retained only where needed for that independent building accounting. This sharp planning boundary explains why samples can show no usable signal immediately outside a sector even when a real antenna might contribute sidelobe energy.

The `ideal-sector`, `cosine-sector`, `omni`, `flat`, `panel-10deg`, and `panel-20deg` choices are deterministic analytic presets, not vendor antenna files. Compatibility sector presets use hard beam eligibility; `omni` and `3gpp-single-element` evaluate finite directions across the full azimuth. Mechanical and electrical downtilt are combined against a simple elevation angle; antenna and receiver heights affect slant distance but do not create a full 3D scene. Positive downtilt points the boresight downward.

Band labels, duplex mode, reuse factor, and PCI are retained and validated as inventory/reproducibility metadata. Channel IDs determine co-channel interference, while reuse supplies deterministic default channel assignment; the engine does not otherwise simulate duplex timing, PCI planning, or band-specific protocol behavior.

## Interference Metrics

LTE RSRP and RSRQ are CRS-style planning estimates. 5G values are modeled SS-RSRP and SS-RSRQ estimates. SINR, RSSI, RSRP, and RSRQ are derived from deterministic carrier powers and standardized resource-block concepts; their per-RE thermal noise remains separate from the receiver noise-equivalent bandwidth and is not sampled from UE or PHY measurement reports.

An SINR near `0 dB` is expected when the serving cell and a co-channel interferer arrive at similar power and noise is comparatively small. A no-signal sample means no configured cell contributes under the current radius and beam geometry.

## Data Confidence

- Building footprints and metadata are static snapshots derived from OpenStreetMap processing.
- Tower locations are a planning dataset derived from OpenCellID-oriented source processing, not an operator inventory.
- Demand weights use available OSM tags and residential-density enrichment; missing tags reduce semantic confidence.
- Basemap tiles provide visual context only and do not enter RF calculations.
- A supported north-up EPSG:4326 COG/GeoTIFF or standard HGT terrain layer is consumed by the point-to-point profile only. The fast sector, interference, optimization, batch, and regular-surface engines do not consume terrain.
- Building footprints preserve height provenance: reliable `height` is `observed_tag`, `building:levels` is `derived_from_levels` at 3 m per level, and the explicit 9 m display fallback is `unavailable` roof evidence. Unknown-height urban intersections are conservative NLOS. Material tags are normalized when present; explicit material/environment controls must not be described as surveyed site data.
- Separate clutter, height, and material sidecar layers are validated as pack metadata but are not automatically spatially joined into all analyses.

Review the Data tool and exported report for the assumptions attached to a specific analysis.

## Recommendation Applicability

The `terrain-profile` label is available only from 30 MHz to 6 GHz, matching the frequency scope recorded for the current [ITU-R P.1812-8 (2025-09) Recommendation](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1812-8-202509-I!!PDF-E.pdf). The runtime profile also requires a terrain-capable path context for that reference scope; missing terrain uses the explicit zero-metre local datum and is not P.1812 conformance.

The `urban-short-range` label is available from 300 MHz to 100 GHz in the current runtime profile. The current [ITU-R P.1411-13 (2025-09) Recommendation](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-13-202509-I!!PDF-E.pdf) has a broader 300 MHz to 300 GHz outdoor short-range scope, but A.T.O.M retains its existing 100 GHz runtime ceiling and does not claim full P.1411 implementation. A research sub-THz profile is explicitly outside both standards-based profiles.

The isolated Concept 4F.2 single-edge diagnostic is aligned with [ITU-R P.526-16 (2025-11), §4.1 equations (26) and (31)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.526-16-202511-I!!PDF-E.pdf). It uses FSPL plus explicit diffraction as an alternative view; it is not summed with canonical UMa NLOS. Explicit `height` and `building:levels` evidence are required, while the generic 9 m fallback is unavailable geometry. User-selected material, atmospheric-gas, and rain terms are informed by [ITU-R P.2040-4](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf), [ITU-R P.676](https://www.itu.int/rec/R-REC-P.676/en), and [ITU-R P.838](https://www.itu.int/rec/R-REC-P.838/en), respectively. They are not automatic implementations driven by surveyed construction or current meteorological data.

The isolated Concept 4I.2B candidate reference evaluates three non-canonical P.1411-13 §4.1.1 Table 4 rows at their strict frequency and distance envelopes: below-rooftop LoS (5–500 m at 140 GHz), urban high-rise NLoS (20–150 m), and urban low-rise/suburban NLoS (10–150 m). It requires explicit morphology, both-below-rooftop relation, LoS/NLoS state, and provenance. It returns the Table 4 median and sigma metadata only; P.525, atmospheric, research wall, diffraction, material, and receiver terms remain comparisons or separate diagnostics. The endpoint is not called by canonical simulation, coverage, interference, building entry, radio quality, or optimization. See [Concept 4I.2B](concept-4i2b-p1411-reference.md).

Concept 4I.3 adds an isolated measurement-evidence ledger at `/api/sub-thz-validation`. It requires explicit campaign, quantity, antenna-basis, calibration, geometry, weather, and label provenance before normalizing observations into path loss. Its residual is measured minus predicted path loss; censored and directional-incompatible observations remain visible but do not enter ordinary metrics. P.525, the atmospheric reference, P.1411 rows, the comparison-only research profile, and the P.526 diagnostic are evaluated through a shared adapter contract. Constant-bias calibration and deterministic spatial/site/campaign holdouts are diagnostic only, and the response has no production-candidate state. The repository registers external literature metadata without importing or inventing numeric samples. See [Concept 4I.3](concept-4i3-measurement-validation.md).

Concept 4I.4 adds a separate `p2040_material_slab_reference_v1` endpoint at `/api/sub-thz-material-reference`. It evaluates one explicitly declared homogeneous slab with P.2040-4 complex material properties, TE/TM Fresnel coefficients, internal reflections, power fractions, and strict Table 3 frequency ranges. Thickness, angle, polarization, exterior media, and property provenance are required; metal without a covered row, multilayer construction, OSM material physics, P.2109 extrapolation, and whole-building entry are excluded. Its side-by-side 80 dB/event comparison is never summed and the result remains `reference_only`. See [Concept 4I.4](concept-4i4-material-facade-reference.md).

Concept 4I.5B adds the isolated `single_bounce_specular_reflection_reference_v1` endpoint at `/api/sub-thz-reflection-reference`. It requires explicit Tx/Rx geometry and heights, a finite vertical planar facade with normal/geometry/height provenance, TE or TM polarization, explicit P.2040 interface or coherent finite-slab material inputs, and a declared terrain mode. Image-source geometry is evaluated in metric ENU coordinates; Tx-to-reflector and reflector-to-Rx visibility are checked independently; the only spreading term is P.525 FSPL over `L=d1+d2`; and the P.2040 field coefficient power is applied exactly once. Roughness, Fresnel footprint, and physical-aperture far-field are evidence gates, not invented corrections. Direct paths, coherent multipath, diffuse scattering, atmosphere, P.1411/P.526 composition, the research 80 dB wall heuristic, canonical RF, and optimization remain excluded. The result is `reference_only` and may be `applicable_reference`, `qualified_reference`, or `inapplicable`. See [Concept 4I.5B](concept-4i5b-specular-reflection-reference.md).

The reference catalog also records [3GPP TR 38.901 V19.4.0 (2026-06-23)](https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3173) as a comparison scope for 0.5–100 GHz channel evaluation. The runtime dispatches the documented deterministic UMa path-loss subset as `urban_short_range`, without claiming full 3GPP channel-model conformance. Measurement and calibration behavior is represented by `/api/measurements/evaluate`; there is no standalone calibration endpoint in this matrix.

Concept 4H.1 adds inspectable interference bookkeeping, but it remains a planning approximation: total-carrier propagation power is normalized to a common reference-resource basis, LTE/NR signal-resource density and scheduler timing are not modeled, adjacent-channel/partial-overlap selectivity is deferred, and each cell's configured radius is only a finite analysis horizon. The declared power ledger separates serving admission from non-serving interference eligibility, while exact co-channel rules, thermal-noise bandwidth, serviceability thresholds, and failure reasons are returned so results are auditable. See the [Concept 4H.1 interference and radio-quality note](concept-4h1-interference-radio-quality.md).

Concept 4H.2 optionally couples that contract to optimization through the
`radio_quality` objective. The utility is the fraction of a deterministic
fixed sampled union domain that meets the combined RSRP/SINR/RSRQ planning
policy. No-carrier samples remain failures in the denominator, and the domain
does not change with azimuth, coverage, serviceability, or Pareto membership.
The domain is sampled rather than a continuous-area integral. Its interference
is bounded by each cell's effective `rf_profile.radius_m`; this is a declared
compatibility horizon, not physical zero power outside the radius and not a
claim of network-wide interference completeness. Radio quality is disabled by
default, does not change the existing optimizer when its priority is zero, and
does not redefine demand, residential, building-entry, or raw signal-surface
semantics. The 140 GHz research profile is unavailable for this objective with
reason `unsupported_radio_quality_model`. See the
[Concept 4H.2 optimization note](concept-4h2-radio-quality-optimization.md)
for the fixed-domain contract, Pareto/reranking behavior, performance
architecture, policy/horizon limitations, and canonical enabled experiment.

## Reference and Applicability Foundation

Concept 4B adds an independent, human-auditable fixture corpus at `backend-go/raytracer/testdata/rf-reference-fixtures.json` and the corresponding contract tests in `backend-go/raytracer/rf_reference_fixtures_test.go`. The corpus covers FSPL, slant-distance link budgets, antenna-pattern attenuation and beam boundaries, dBm/mW and thermal-noise arithmetic, RSRP/SINR arithmetic, Fresnel radius, knife-edge loss, exact polygon boundary cases, sensitivity termination, raw received-power surfaces, and point-sampled path-profile behavior. Concept 4G.2 adds independent receiver fixtures and a gated 2.6/28 GHz sensitivity matrix in `backend-go/raytracer/receiver_noise_test.go`, including bandwidth, noise-figure, SNR, margin, per-cell, surface, building, propagation, and interference separation checks. Expected values are independently calculated fixtures; the tests compare them with the existing implementation without changing its equations.

The metadata catalog in `backend-go/raytracer/reference_foundation.go` exposes explicit applicability states and failure reasons for frequency, path length, scenario, terrain, building data, and LOS/NLOS requirements. Failure results use identifiers such as `frequency_out_of_range`, `distance_out_of_range`, `unsupported_environment`, `required_terrain_missing`, `required_building_data_missing`, `required_los_or_nlos_missing`, `research_profile_only`, and `unsupported_endpoint`. Its capability matrix records 4G/2.6 GHz, 5G/28 GHz, and 6G/140 GHz across static, surface, network, azimuth/network optimization, interference, path profile, and measurement/calibration endpoints. Current support is not uniform: static, surface, and network RF evaluation accept 6G profiles; interference, measurement evaluation, and site recommendations remain restricted; path-profile 6G is research-only. Interference serviceability uses separate RSRP/SINR/RSRQ thresholds, not receiver sensitivity or building service. Receiver sensitivity is a strict carrier-admission/usability gate and is not added as another interference-noise term. This catalog is descriptive and does not dispatch a new propagation model.

Network responses intentionally expose separate score representations. `stats.network_score` is the legacy raw aggregate of weighted domain metrics; it may be much larger than 100. `stats.objectives` contains normalized utilities, `stats.composite_score` is their weighted 0–1 composite, and `stats.score` is the authoritative 0–100 presentation score. `optimization.objective_score` and recommendation `marginal_network_score` remain raw compatibility values and must not be formatted as /100 scores.

## Appropriate Interpretation

Use A.T.O.M to compare configurations, find deterministic coverage gaps, understand co-channel relationships, inspect communication-path fallbacks, and communicate planning assumptions. Validate deployment decisions with calibrated propagation models, current operator data, spectrum assumptions, link-budget engineering, and field measurements.

## Related References

- [System architecture](./architecture.html)
- [RF algorithms](./algorithms.md)
- [REST API](./api.md)
- [Concept 4G.2 receiver noise and sensitivity](./concept-4g2-receiver-noise-sensitivity.md)
