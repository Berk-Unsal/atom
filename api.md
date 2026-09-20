# API Reference

A.T.O.M exposes a comprehensive REST API for programmatic access to all simulation and optimization features.

## Base URL

```
http://localhost:8080/api
```

Or in production:

```
https://your-domain.com/api
```

## Authentication

Expensive RF routes can require a shared backend key by setting `RF_API_KEY`. Send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`; an invalid or missing key receives `401`. The setting is off for localhost-only development. Public deployments should authenticate users at a TLS gateway and inject this backend key rather than exposing it to browser JavaScript.

The full and bounded building-data routes can independently require `BUILDINGS_API_KEY` through the same headers. Keep this key at an origin gateway when using shared or public caches.

Dataset activation can independently require `DATASET_ADMIN_API_KEY`. `GET /api/datasets` remains readable so the Data tool can show installed packs; only `POST /api/datasets/switch` requires the credential when configured. Inject it at an origin gateway rather than storing it in browser JavaScript.

When Core Lab is enabled, `POST /api/core/scenario` requires `CORE_LAB_API_KEY` through the same headers. The backend validates the client credential and supplies the configured key on its private adapter hop. An enabled deployment without this key rejects scenario mutation with `503`.

## Response Format

Most responses are **JSON**. Explicit GIS export representations use GeoJSON, CSV, or GeoTIFF as documented below:

- `GET /healthz` returns a liveness status object
- `GET /readyz` returns dependency readiness
- `GET /api/meta` returns application, default propagation model catalog, RF semantic contract, capability matrix, and active dataset identity
- `GET /api/datasets` returns installed packs and the active manifest ID
- `GET /api/spatial-evidence` returns active-pack terrain semantics, height evidence counts, and the deterministic spatial-evidence fingerprint
- `GET /api/spatial-evidence/buildings/:id` returns a diagnostic-only building height/base/roof provenance ledger
- `POST /api/spatial-evidence/path-profile` returns diagnostic-only terrain samples plus the reusable radio-minus-terrain clearance result; canonical RF remains unaffected
- `GET /api/buildings` and `GET /api/towers` return raw GeoJSON; bounded clients should prefer `/api/collections/buildings/items`
- `GET /api/collections/buildings/items` returns viewport-bounded building GeoJSON or CSV
- `POST /api/analyze-sector` returns `{ simulation, coverage_gaps }` from one shared ray-profile computation
- `POST /api/path-profile` returns an inspectable 2.5D vertical profile, geometric/Fresnel evidence, an obstruction ledger, a P.526-aligned diffraction diagnostic, and an alternative canonical UMa comparison
- `POST /api/sub-thz-reference` returns the opt-in, non-canonical `sub_thz_atmospheric_reference_v1` ledger with P.525-5 FSPL, optional P.676-13 gas, optional P.838-3 rain, optional local-fog P.840-9 sensitivity, obstruction metadata, and an optional reference-only link budget
- `POST /api/sub-thz-material-reference` returns the isolated `p2040_material_slab_reference_v1` ledger with explicit complex material properties, TE/TM coefficients, slab power fractions, applicability, numeric state, and a separate 80 dB comparison
- `POST /api/sub-thz-reflection-reference` returns the isolated `single_bounce_specular_reflection_reference_v1` image-source geometry, TE/TM P.2040 coefficient, two-leg visibility, finite-facade evidence, and reflected-path link-budget ledger
- `POST /api/sub-thz-validation` returns isolated measurement-campaign validation, common-sample model comparisons, constant-bias diagnostics, deterministic holdouts, and readiness gates
- `POST /api/coverage-surface` returns a compact regular raster, isolines, statistics, and model assumptions, or an export representation
- `POST /api/simulate` returns `{ geojson, stats, rf_profile, rf_contract }`
- `POST /api/coverage-gaps` returns `{ geojson, stats, rf_contract }`
- `POST /api/building-entry-analysis` returns one batched, RF-derived facade-entry estimate for the selected buildings and cells
- `POST /api/interference` returns `{ geojson, demand_geojson, stats, model }`, with defaults, effective profiles, per-cell finite interference horizons, and threshold metadata in `model`
- `POST /api/optimize-azimuth` returns `{ optimal_azimuth, propagation_reach_score, coverage_score, demand_score, residential_score, rf_contract }`
- `POST /api/recommend-sites` returns a baseline plus ranked candidate records and GeoJSON
- `POST /api/measurements/evaluate` returns residual GeoJSON, subgroup diagnostics, uncertainty, and spatially validated bias guidance
- `/api/processes/batch-experiment` and `/api/jobs/{jobID}` expose asynchronous experiment execution, progress, results, and cancellation

Error responses use a simple object with an `error` message.

## Per-Cell RF Profile Contract

Single-sector requests accept `rf_profile` at the request root. Network, interference, recommendation, and measurement requests accept it independently inside every `towers[]` item. Legacy top-level fields remain defaults; an explicit nested property overrides its top-level/default counterpart only for that cell. Normalized simulation, optimized-tower, recommendation, measurement, and interference-model responses include resolved profiles for reproducibility. Network-shaped responses also expose `request_defaults` separately from `effective_cell_profiles`; a request default is not evidence that every cell used that value.

The request profile accepts `propagation_model: urban_short_range | legacy_fspl_walls | research_sub_thz`. The default is `urban_short_range` at 2.6/28 GHz and `research_sub_thz` at 140 GHz. `tx_power_dbm` is conducted transmitter power; `tx_antenna_gain_dbi` is the preferred absolute TX boresight gain field, while `antenna_gain_dbi` remains a stable compatibility alias. Pattern attenuation is relative to boresight and is never another gain. `rx_antenna_gain_dbi` is an explicit scalar receiver gain with a backward-compatible default of `0 dBi`; `polarization_loss_db` is an explicit deterministic mismatch loss with a default of `0 dB`. Positive calibration dB raises predicted received power. The signed link contract is `P_rx = P_tx_conducted + G_tx_boresight - A_tx_pattern + G_rx - L_system - L_polarization + calibration - L_propagation - L_building`. Boresight and directional EIRP are exposed separately in link-budget diagnostics; the historical `eirp_dbm` field is retained as an effective-transmit compatibility alias, not a replacement for conducted power.

Receiver sensitivity is a per-cell usability threshold. `receiver_sensitivity_mode` defaults to `manual` and preserves `receiver_sensitivity_dbm` (default `-115 dBm`). In opt-in `derived` mode, the effective threshold is `-174 dBm/Hz + 10 log10(receiver_noise_bandwidth_hz) + receiver_noise_figure_db + receiver_required_snr_db + receiver_margin_db`, using the rounded 290 K reference convention. `receiver_noise_bandwidth_hz` is independent of interference SCS/resource-element bandwidth. The response returns `receiver_threshold`, including the selected mode, effective threshold, derived terms when applicable, bandwidth provenance, assumptions, and applicability. `receiver_link_margin_db` is raw received power minus that threshold; strict `received_power_dbm > sensitivity_dbm` is required for serving admission. In `/api/interference`, a finite non-serving signal below sensitivity remains an eligible co-channel interferer; `eligible` and `serving_eligible` are separate ledger fields. See the [Concept 4G.2 receiver-noise note](concept-4g2-receiver-noise-sensitivity.md) for the complete equation and separation contract.

The analytic compatibility presets keep their established formulas and hard-sector eligibility. The optional `3gpp-single-element` preset is a full-azimuth, single-element reference shape based on 3GPP TR 38.901 §7.3/Table 7.3-1; it has no array factor, beamforming, codebook, sidelobe dataset, or MIMO behavior. Mechanical and electrical downtilt remain separate inputs but combine as `mechanical + electrical` for the current deterministic patterns; positive mechanical downtilt points the boresight downward. See the [Concept 4G.1 antenna and link-budget note](concept-4g1-antenna-link-budget.md) for the complete contract and comparison fixtures. The [Concept 4F.1 design note](concept-4f1-height-aware-obstruction.md) covers height evidence and terrain status; the [Concept 4D design note](concept-4d-urban-propagation.md) remains the propagation applicability and equation reference; and the [Concept 4E building-entry note](concept-4e-building-entry.md) covers facade-entry estimation.

For `urban_short_range`, explicit OSM `height` is reported as `observed_tag`, `building:levels` is derived at 3 m per level as `derived_from_levels`, and the existing generic 9 m display fallback is `unavailable` roof evidence. An intersected unknown-height footprint is conservatively NLOS. Ray GeoJSON properties expose `los_classifier_id`, `los_classification_basis`, and `terrain_status`; interference and building-entry responses expose the same serving/outdoor metadata, while coverage-surface model metadata identifies the shared classifier. The current Ankara pack reports `terrain_unavailable`; no zero terrain value is treated as measured obstruction evidence.

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "azimuth": 45,
  "rf_profile": {
    "schema_version": 1,
    "network_tech": "5g",
    "propagation_model": "urban_short_range",
    "frequency_ghz": 28,
    "band": "n257",
    "bandwidth_mhz": 100,
    "channel_id": "NR-634666",
    "duplex_mode": "tdd",
    "tx_power_dbm": 37,
    "tx_antenna_gain_dbi": 17,
    "antenna_gain_dbi": 17,
    "rx_antenna_gain_dbi": 0,
    "system_loss_db": 2,
    "polarization_loss_db": 0,
    "radius_m": 1200,
    "beam_width": 65,
    "antenna_height_m": 32,
    "mechanical_downtilt_deg": 2,
    "electrical_downtilt_deg": 4,
    "orientation_deg": 0,
    "horizontal_pattern_id": "cosine-sector",
    "vertical_pattern_id": "panel-10deg",
    "load_factor": 0.65,
    "reuse_factor": 1,
    "pci": 321,
    "receiver_height_m": 1.5,
    "receiver_sensitivity_dbm": -110,
    "receiver_sensitivity_mode": "manual"
  }
}
```

| Field group | Accepted values |
|---|---|
| Identity | schema `1`; technology `4g`, `5g`, or `6g`; non-empty band/channel up to 64 UTF-8 bytes; duplex `fdd`, `tdd`, `sdl`, or `sul` |
| Carrier | frequency `>0–300 GHz` and compatible with technology; bandwidth `0.1–2000 MHz` |
| Link budget | Conducted TX `0–60 dBm`; absolute TX boresight gain `-20–80 dBi`; scalar RX gain `-20–80 dBi`; system loss `0–100 dB`; polarization loss `0–40 dB` |
| Geometry | radius `25–5000 m`; beam `10–360°`; antenna height `0.5–300 m`; receiver height `0.1–100 m`; orientation `0–<360°` |
| Tilt/pattern | mechanical/electrical tilt `-30–90°`; horizontal `ideal-sector`, `cosine-sector`, `omni`, or `3gpp-single-element`; vertical `flat`, `panel-10deg`, or `panel-20deg` |
| Interference | load `>0–1`; reuse `1–12`; optional PCI `0–503` for LTE or `0–1007` for NR |
| Receiver | manual sensitivity `-180–-20 dBm`; or derived mode with noise bandwidth `1 Hz–2 GHz`, noise figure `0–20 dB`, required SNR `-100–100 dB`, and receiver margin `-100–100 dB` |

The profile pattern IDs are deterministic planning presets, not imported vendor radiation diagrams. `3gpp-single-element` is a bounded standards-derived reference cut, not a 3GPP array, beamforming, or MIMO model. No tabulated/vendor pattern upload is exposed in this phase. Interference analysis remains limited to 4G and 5G even though propagation accepts the 6G research profile. The selected receiver SNR and margin are planning inputs, not throughput, coding, modulation, or UE conformance parameters.

---

## Endpoints

### Health Check

**Endpoint**: `GET /healthz`

Check whether the HTTP process is alive. This endpoint remains `200` even while required datasets or the frontend bundle are unavailable.

**Response**:

```json
{
  "status": "ok",
  "backend": "static-in-memory",
  "buildingIndex": {
    "footprintCount": 161784,
    "treeCount": 161784
  },
  "rtreeFootprints": 161784,
  "towerCount": 451
}
```

**Status Codes**:
- `200 OK` - Process is alive

### Readiness Check

**Endpoint**: `GET /readyz`

Check whether the building index, tower dataset, and frontend bundle are available. Use this route for deployment readiness probes.

Readiness reports only generic dependency state. Detailed dataset paths and validation errors remain in server logs.

```json
{
  "status": "ready",
  "buildings": true,
  "towers": true,
  "frontend": true
}
```

**Status Codes**:
- `200 OK` - Instance is ready to receive traffic
- `503 Service Unavailable` - At least one required dependency is unavailable

### Reproducibility Metadata

**Endpoint**: `GET /api/meta`

Returns the running application and model versions, build commit, supported technology modes, and the validated dataset manifest. Store this response with planning scenarios and reports when exact reproduction matters.

```json
{
  "application_version": "1.0.0",
  "build_commit": "abc1234",
  "model_version": "urban_short_range",
  "model_id": "urban_short_range",
  "model_description": "3GPP TR 38.901 UMa median outdoor urban path loss with deterministic footprint LOS/NLOS classification",
  "supported_technologies": ["4g", "5g", "6g-research"],
  "propagation_models": ["urban_short_range", "legacy_fspl_walls", "research_sub_thz"],
  "rf_contract": {
    "building_service_threshold_dbm": -100,
    "propagation_reach_definition": "usable receiver-power reach",
    "surface_nodata_definition": "radius/beam geometry exclusion; below-sensitivity values remain numeric",
    "receiver_sensitivity_scope": "effective per-cell receiver threshold; mode and resolved terms are in receiver_threshold and rf_profile",
    "receiver_sensitivity_equation": "manual: configured receiver_sensitivity_dbm; derived: -174 dBm/Hz + 10log10(receiver_noise_bandwidth_hz) + receiver_noise_figure_db + receiver_required_snr_db + receiver_margin_db",
    "receiver_noise_semantics": "receiver noise-equivalent bandwidth is separate from interference SCS/resource-element noise and network interference",
    "interference_rsrp_threshold_dbm": -110,
    "interference_sinr_threshold_db": 0,
    "interference_rsrq_threshold_db": -20
  },
  "technology_capabilities": [],
  "dataset": {
    "id": "ankara-open-planning",
    "version": "2026.07",
    "crs": "EPSG:4326"
  }
}
```

---

### Get Buildings

**Endpoint**: `GET /api/buildings`

Retrieve all building geometries as GeoJSON. This legacy whole-file route can exceed 100 MB. Interactive maps should use the bounded collection endpoint below.

**Query Parameters**: None

**Response**:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "building": "concrete",
        "name": "Ankara Central Tower",
        "height": 45
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[33.8, 39.9], [33.801, 39.9], [33.8, 39.9]]]
      }
    }
  ]
}
```

**Caching and limits**: The approximately 117 MB response is identified by a strong SHA-256 `ETag` and served with `Cache-Control: public, max-age=3600, must-revalidate` by default. Revalidation with a matching `If-None-Match` returns `304` without consuming a download budget. Fresh transfers default to two globally, one concurrently per client, and two per minute per client. Configure these limits with `MAX_CONCURRENT_BUILDING_DOWNLOADS`, `MAX_CONCURRENT_BUILDING_DOWNLOADS_PER_CLIENT`, and `BUILDING_DOWNLOADS_PER_MINUTE`.

Set `BUILDINGS_API_KEY` to require `Authorization: Bearer <key>` or `X-API-Key: <key>`. Authenticated responses use a private cache policy so shared caches cannot bypass the origin credential check.

---

### Query Viewport Buildings

**Endpoint**: `GET /api/collections/buildings/items?bbox=minLon,minLat,maxLon,maxLat&limit=1000&offset=0`

The `bbox` parameter is mandatory in OGC CRS84 longitude/latitude order and its diagonal may not exceed 50 km. `limit` defaults to 1,000 and is capped at 5,000. Results are sorted by stable building ID and report `numberMatched`, `numberReturned`, `limit`, and `offset`; a further page includes an HTTP `Link` header with `rel="next"`.

The default representation is `application/geo+json`. Send `f=csv` or `Accept: text/csv` for CSV containing WKT polygon geometry, display height/source, height-evidence provenance (`height_evidence_m`, `height_evidence_source`, `height_evidence_tag`), normalized material, and demand fields. Discover the collection at `GET /api/collections`, inspect metadata at `GET /api/collections/buildings`, and inspect the standards declaration at `GET /api/conformance`. Its `conformsTo` list is deliberately empty because this project does not claim a complete OGC conformance class.

This interface follows OGC API Features collection and bounding-box concepts. It is not a vector-tile endpoint.

The bounded query shares the `BUILDINGS_API_KEY` policy but uses an independent interactive budget: four globally, two concurrently per client, and 120 per minute per client by default. Configure it with `MAX_CONCURRENT_BUILDING_FEATURE_QUERIES`, `MAX_CONCURRENT_BUILDING_FEATURE_QUERIES_PER_CLIENT`, and `BUILDING_FEATURE_QUERIES_PER_MINUTE`.

---

### Get Towers

**Endpoint**: `GET /api/towers`

Retrieve all 5G/4G tower locations.

**Query Parameters**: None

**Response**:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "cell_id": 20560152,
        "radio_type": "NR",
        "is_simulated": false
      },
      "geometry": {
        "type": "Point",
        "coordinates": [32.8541, 39.9208]
      }
    }
  ]
}
```

---

### Analyze Sector

**Endpoint**: `POST /api/analyze-sector`

This is the preferred browser workflow when both propagation rays and coverage gaps are needed. It accepts the same body as `/api/simulate`, computes ray profiles and building interactions once, and returns:

```json
{
  "simulation": { "geojson": {}, "stats": {}, "rf_profile": {} },
  "coverage_gaps": { "geojson": {}, "stats": {} }
}
```

The standalone `/api/simulate` and `/api/coverage-gaps` endpoints remain available when a client needs only one result.

---

### Analyze A 2.5D Path Profile

**Endpoint**: `POST /api/path-profile`

```json
{
  "transmitter": { "lon": 32.8541, "lat": 39.9208 },
  "receiver": { "lon": 32.861, "lat": 39.924 },
  "sample_spacing_m": 10,
  "model_profile": "urban-short-range",
  "azimuth": 45,
  "rf_profile": { "network_tech": "5g", "frequency_ghz": 28, "antenna_height_m": 30, "receiver_height_m": 1.5 },
  "fidelity": {
    "building_loss_mode": "screen-diffraction",
    "diffraction_model": "single-knife-edge",
    "default_wall_material": "concrete",
    "clutter_specific_attenuation_db_per_km": 0,
    "vegetation_depth_m": 0,
    "vegetation_specific_attenuation_db_per_m": 0,
    "gas_specific_attenuation_db_per_km": 0,
    "rain_specific_attenuation_db_per_km": 0,
    "shadow_sigma_db": 6
  }
}
```

The response contains sampled terrain/building elevations, endpoint height above ground, geometric LOS, separate 60% Fresnel evidence, a complete entry/exit obstruction ledger, the P.526-aligned `p526-single-edge-v1` diagnostic, canonical UMa comparison where applicable, component losses, P50 and shadow-sensitivity bounds, and an applicability statement. The diagnostic requires explicit or levels-derived obstruction height; generic fallback-height candidates return `obstruction_height_unavailable`. It carries `rf_contract.model_id: "path-profile-diagnostic-v1"` to make the isolated scope explicit; canonical UMa NLOS and FSPL plus explicit diffraction are alternative calculations and are never summed. It does not alter canonical network RF. `terrain-profile` accepts 0.03–6 GHz, `urban-short-range` accepts 0.3–100 GHz, and `research-sub-thz` is explicitly outside those ITU-R profile ranges; a 140 GHz knife-edge result is mathematical research diagnostic only.

COG/GeoTIFF support is limited to north-up EPSG:4326, one-band integer/float samples, none/DEFLATE compression, and supported integer predictors. Dataset packs may also declare standard signed big-endian 1-arc-second or 3-arc-second HGT postings; HGT has no embedded CRS or vertical datum and therefore requires explicit pack metadata. The response lists these limitations.

---

### Evaluate the Sub-THz Atmospheric Reference

**Endpoint**: `POST /api/sub-thz-reference`

This is a separate, opt-in, non-canonical reference endpoint. It requires explicit transmitter and receiver coordinates/heights and explicit atmosphere values when gas is enabled. Rain and local fog are disabled unless their blocks are enabled. The response reports `sub_thz_atmospheric_reference_v1`, a deterministic fingerprint, P.525 wavelength-form FSPL, separate P.676 oxygen/water/dry-continuum terms, P.838 rain coefficients and path loss, P.840 local-fog coefficient and path loss, total composition, component applicability, assumptions, limitations, and double-counting boundaries.

```json
{
  "frequency_ghz": 140,
  "transmitter": { "lon": 32.8541, "lat": 39.9208, "height_m": 25 },
  "receiver": { "lon": 32.861, "lat": 39.924, "height_m": 1.5 },
  "atmosphere": {
    "enabled": true,
    "pressure_hpa": 1013.25,
    "temperature_k": 288.15,
    "water_vapour_density_g_m3": 7.5
  },
  "rain": { "enabled": false },
  "local_fog": { "enabled": false }
}
```

The optional `link_budget` block calculates a reference received power from explicit conducted TX power, TX/RX gains, pattern/system/polarization losses, and calibration. It does not apply receiver sensitivity or serviceability. Building intersections are flagged when the active dataset is available, but no wall, material, diffraction, or roof-screen loss is added. See [Concept 4I.2A](concept-4i2a-atmospheric-reference.md) and the [controlled fixtures](concept-4i2a-controlled-fixtures.json).

---

### Evaluate ITU-R P.1411-13 Table 4 Candidate Rows

**Endpoint**: `POST /api/sub-thz-p1411-reference`

This isolated endpoint evaluates the three supported non-canonical P.1411-13 §4.1.1 Table 4 candidates: below-rooftop LoS, urban high-rise NLoS, and urban low-rise/suburban NLoS. The request must carry explicit frequency, flat Tx/Rx coordinates and heights, morphology, rooftop relation, LoS/NLoS state, and provenance. The current-frequency effective envelopes at 140 GHz are 5–500 m, 20–150 m, and 10–150 m respectively.

```json
{
  "frequency_ghz": 140,
  "transmitter": { "lon": 32.8541, "lat": 39.9208, "height_m": 25 },
  "receiver": { "lon": 32.861, "lat": 39.924, "height_m": 1.5 },
  "morphology": "urban_high_rise",
  "rooftop_relation": "both_below_rooftop",
  "los_state": "los",
  "candidate_model_id": "all",
  "provenance": {
    "frequency_ghz": "user_declared",
    "distance_m": "geometry_derived",
    "tx_height_m": "user_declared",
    "rx_height_m": "user_declared",
    "morphology": "user_declared",
    "rooftop_relation": "user_declared",
    "los_state": "user_declared"
  }
}
```

An unknown morphology, rooftop relation, or path state is inapplicable and has no median loss. The 25 m/1.5 m profile defaults are not rooftop evidence. The response reports the exact P.1411 median equation and intermediate terms, Table 4 sigma metadata with `random_sampling: false`, applicability reasons, exact wavelength-form P.525 FSPL comparison, obstruction/height evidence, limitations, and a deterministic fingerprint. P.525 is comparison-only; it is never added to the P.1411 value.

The optional `atmospheric_reference` block requests a same-path Concept 4I.2A comparison only. The optional `research_wall_event_count` requests the current 140 GHz `research_sub_thz` comparison only. Neither alternative is summed into P.1411, and this endpoint never changes canonical simulation, coverage, interference, radio quality, building entry, or optimization. See [Concept 4I.2B](concept-4i2b-p1411-reference.md), the [applicability contract](concept-4i2b-p1411-applicability.json), and the [controlled fixtures](concept-4i2b-controlled-fixtures.json).

---

### Validate Measurement Evidence and Spatial Holdouts

**Endpoint**: `POST /api/sub-thz-validation`

This isolated endpoint accepts versioned campaign JSON and evaluates a shared canonical path-loss quantity against `p525_fspl`, the opt-in atmospheric reference, P.1411 candidate rows, the comparison-only `research_sub_thz` profile, and the P.526 diagnostic when the requested evidence is meaningful. It is not connected to canonical propagation, coverage, building entry, diffraction, interference/radio quality, or optimization.

The residual is always `measured_path_loss_db - predicted_path_loss_db`. Received-power normalization requires explicit conducted TX power, antenna gains, cable losses, calibration state, and an isotropic-equivalent or synthesized-omni basis. Directional/best-beam observations remain ambiguous without that basis. Censored observations are counted but excluded from ordinary metrics.

The response includes count, mean bias, median, MAE, RMSE, standard deviation, p10/p90, strata by scenario/distance/frequency/campaign/site, residual trend diagnostics, common-sample comparisons, P.1411 sigma comparison, atmospheric availability, censored counts, a deterministic fingerprint, and a conservative readiness taxonomy. `calibrate_bias` fits only a constant bias on explicit deterministic calibration sets and reports `stable`, `unstable`, or `insufficient_validation_data`; `promoted` and `production_candidate` are always false. See [Concept 4I.3](concept-4i3-measurement-validation.md), the [schema contract](concept-4i3-validation-schema.json), and the [synthetic controls](concept-4i3-synthetic-validation.json).

---

### Evaluate the P.2040 Material and Facade Reference

**Endpoint**: `POST /api/sub-thz-material-reference`

This is an isolated, non-canonical material/interface reference. It evaluates one finite homogeneous slab between explicitly declared incident and exit media using the current [ITU-R P.2040-4](https://www.itu.int/rec/R-REC-P.2040-4-202509-I/en) property, interface, and slab equations. It does not infer physics from OSM material tags, apply a universal thickness, estimate whole-building entry loss, extrapolate P.2109, or contribute to network simulation.

```json
{
  "schema_version": 1,
  "frequency_ghz": 140,
  "material_source": "p2040_reference",
  "material_id": "glass_100_400",
  "thickness_m": 0.01,
  "thickness_provenance": "user_declared",
  "incidence_angle_deg": 0,
  "polarization": "TE",
  "incident_medium": { "name": "air", "relative_permittivity": 1, "conductivity_s_per_m": 0, "property_source": "user_declared" },
  "exit_medium": { "name": "air", "relative_permittivity": 1, "conductivity_s_per_m": 0, "property_source": "user_declared" }
}
```

Reference rows use their own enforced Table 3 frequency range; a row outside its range returns a 200 response with `status=material_frequency_out_of_range`, no slab ledger, and no extrapolated properties. User-defined materials are classified as `user_assumption`, retain property provenance, and must provide exactly one electrical-property form: real permittivity plus conductivity, real permittivity plus loss tangent, or real plus positive imaginary-loss magnitude. TE and TM are supported directly; horizontal/vertical labels are not silently mapped. Angle 0° is normal and grazing values are rejected. A geometry-derived angle requires reliable facade-normal provenance.

The response returns model/revision citations, resolved electrical properties, material range, thickness/provenance, geometry, complex reflection/transmission coefficients, first-interface and total reflected power, transmitted and absorbed fractions, transmission loss, internal-reflection state, finite/numeric-floor state, assumptions, limitations, and a deterministic fingerprint. The historical `research_sub_thz` 80 dB/event heuristic appears only as a side-by-side comparison with `combined=false`; it is never added to the slab result or any network result. See [Concept 4I.4](concept-4i4-material-facade-reference.md), the [applicability contract](concept-4i4-material-applicability.json), and the [controlled fixtures](concept-4i4-controlled-fixtures.json).

---

### Evaluate a Single-Bounce Specular Reflection Reference

**Endpoint**: `POST /api/sub-thz-reflection-reference`

This opt-in endpoint evaluates one explicitly declared specular reflection from one finite vertical planar facade. It is a reference-only image-source diagnostic with `model_id=single_bounce_specular_reflection_reference_v1`; it is not a propagation model and is not dispatched by canonical simulation, coverage, interference, radio quality, building entry, recommendation, or optimization.

The request must provide explicit Tx/Rx positions and heights, antenna modes/gains, facade start/end and geometry provenance, a unit normal or polygon context, material source/media, TE or TM polarization, terrain mode, and conducted transmitter power. Local ENU coordinates are preferred for controlled fixtures; geographic input is transformed to a documented local metric ENU frame. Facade base/top elevations are never invented. `reflection_mode` is accepted as an alias for `material.mode`.

```json
{
  "schema_version": 1,
  "frequency_ghz": 140,
  "coordinate_frame": {"mode": "local_enu"},
  "tx": {
    "position": {"x": 50, "y": -50, "z": 10},
    "antenna": {"mode": "isotropic", "absolute_gain_dbi": 0}
  },
  "rx": {
    "position": {"x": 50, "y": 50, "z": 10},
    "antenna": {"mode": "isotropic", "absolute_gain_dbi": 0}
  },
  "facade": {
    "start": {"x": 0, "y": -10, "z": 0},
    "end": {"x": 0, "y": 10, "z": 0},
    "plane_point": {"x": 0, "y": 0, "z": 0},
    "outward_normal": {"x": 1, "y": 0, "z": 0},
    "geometry_provenance": "user_declared",
    "normal_provenance": "user_declared",
    "height_provenance": "user_declared",
    "base_z": 0,
    "top_z": 20
  },
  "material": {
    "mode": "interface",
    "material_source": "user_defined",
    "user_material": {
      "name": "declared facade material",
      "property_source": "user_declared",
      "relative_permittivity": 4,
      "conductivity_s_per_m": 0
    },
    "incident_medium": {"name": "air", "relative_permittivity": 1, "conductivity_s_per_m": 0, "property_source": "user_declared"},
    "exit_medium": {"name": "air", "relative_permittivity": 1, "conductivity_s_per_m": 0, "property_source": "user_declared"}
  },
  "polarization": "TE",
  "terrain": {"mode": "flat_ground_relative_datum", "provenance": "user_declared"},
  "link_budget": {"pt_conducted_dbm": 30}
}
```

The image construction mirrors Tx across the facade plane and intersects the mirrored Tx-to-Rx line with the finite horizontal segment. The response exposes the reflection point, incident/reflected vectors and angles, TE/TM basis, `d1`, `d2`, `L=d1+d2`, scalar Fresnel evidence, optional roughness, optional physical-aperture far-field evidence, and independent Tx-to-reflector and reflector-to-Rx visibility. A reflector endpoint contact is exempt only at zero length; positive-length penetration remains blocking.

The only spreading term is `FSPL(L)=20log10(4πL/λ)`. The response sets `two_leg_fspl_composition=false`; `FSPL(d1)+FSPL(d2)` is not used. The link-budget ledger applies `10log10(|Γ|²)` once and returns all other terms even when reflection is zero. It never calculates a direct path, coherent multipath sum, atmosphere, P.1411/P.526 composition, diffuse scattering, or the historical `research_sub_thz` wall heuristic.

The controlled 140 GHz fixture returns a reflection point `(0,0,10)`, `d1=d2=70.71067811865476 m`, `L=141.4213562373095 m`, and `FSPL=118.38064389208795 dB`. TE returns `Γ=-0.4514162296451364`, `|Γ|²=0.20377661238703051`, and `-95.28910051020749 dBm`; TM returns `Γ=0.20377661238703063`, `|Γ|²=0.04152490775593412`, and `-102.19755712832702 dBm`. These are reference fixtures, not calibrated Ankara results. See [Concept 4I.5B](concept-4i5b-specular-reflection-reference.md), the [controlled fixtures](concept-4i5b-controlled-fixtures.json), the [comparison ledger](concept-4i5b-reference-comparison.json), and the [post-change comparison](concept-4i5b-post-change-comparison.json).

---

### Generate A Coverage Surface

**Endpoint**: `POST /api/coverage-surface`

Use the normal sector request fields plus `cell_size_m` from 10–250 and one to ten unique `thresholds_dbm`. The regular grid is capped at 100,000 cells.

The default JSON response contains a CRS84 row-major raster (`grid`), marching-square line segments (`contours`), bounds/statistics, and explicit model assumptions. For `urban_short_range`, `model.los_classifier_id` is `footprint-height-los-v1` and `model.terrain_status` is `terrain_unavailable` for the current Ankara pack. Export the same request using:

- `?f=geotiff` for an uncompressed float32 EPSG:4326 GeoTIFF with `-9999` nodata
- `?f=geojson` for isoline GeoJSON
- `?f=csv` for valid grid-center longitude, latitude, and received power

The surface uses the selected propagation model, antenna-pattern, and calibration terms. For `urban_short_range`, known roof heights can clear footprint intersections and unknown heights remain conservative NLOS; no legacy wall-event dB is added to the empirical NLOS formula. It is a raw single-cell received-power surface: valid below-sensitivity values remain numeric, `uses_sensitivity_mask` is false, and NoData means only radius/beam geometry exclusion. The response exposes the effective `receiver_threshold`; sensitivity changes the below-sensitivity statistic but does not clip the raw grid. It does not apply the terrain-profile or environmental sensitivity components.

---

### Simulate Propagation

**Endpoint**: `POST /api/simulate`

Run RF propagation simulation with given parameters.

**Request Body**:

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "azimuth": 45,
  "beam_width": 120
}
```

**Parameters**:

| Parameter | Type | Range | Required | Description |
|-----------|------|-------|----------|-------------|
| `tower_lon` | number | -180 - 180 | Yes | Tower longitude |
| `tower_lat` | number | -90 - 90 | Yes | Tower latitude |
| `rays` | number | 8 - 720 | No | Ray count used to sample the sector; defaults to 60 |
| `radius_m` | number | 25 - 5000 | No | Maximum requested simulation radius; defaults to 400 |
| `frequency_ghz` | number | > 0 - 300 | No | Network frequency in GHz; defaults to 28 |
| `tx_power_dbm` | number | 0 - 60 | No | Conducted TX power before antenna gain; defaults to 30 |
| `azimuth` | number | Any finite angle | No | Antenna direction, normalized to 0-360; defaults to 0 |
| `beam_width` | number | 10 - 360 | No | Sector width in degrees; defaults to 120 |

`rays` and `radius_m` also share a response budget: `rays × ceil(radius_m / 25)` must not exceed 25,000 estimated base features. The full browser range remains valid, including 360 rays at 1,500 meters. Building intersections can split a base segment, so the ray workers also enforce 25,000 as a hard ceiling on actual collected features.

**Response**:

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "ray_index": 0,
          "segment_index": 0,
          "signal_dbm": -78.4,
          "is_blocked": false
        },
        "geometry": {
          "type": "LineString",
          "coordinates": [[32.8541, 39.9208], [32.856, 39.922]]
        }
      }
    ]
  },
  "stats": {
    "blocked_pct": 42.5,
    "avg_rx_dbm": -88.2,
    "min_range_m": 24.7,
    "max_range_m": 398.1
  }
}
```

**Status Codes**:
- `200 OK` - Simulation completed successfully
- `400 Bad Request` - Invalid parameters
- `413 Content Too Large` - Request body exceeds 1 MiB
- `422 Unprocessable Content` - Building intersections would exceed the hard 25,000-feature response ceiling
- `429 Too Many Requests` - RF worker capacity is busy; inspect `Retry-After`
- `500 Internal Server Error` - Simulation error

**Performance**:
- Runtime depends on ray count, radius, and local building density.
- Individual bounds remain 720 rays and 5,000 meters, but combinations must stay within the 25,000-feature estimate.
- The reported 720-ray, 5,000-meter combination estimates 144,000 base features and is rejected before ray allocation.
- The server uses a 120-second write timeout and caps each RF job at four workers.

### Estimate Building Entry

**Endpoint**: `POST /api/building-entry-analysis`

Estimate service immediately inside one representative facade point for one to
six selected cells. This is a separate Concept 4E analysis, not a replacement
for `/api/coverage-gaps` or `/api/interference`. It is supported at 2.6 GHz
and 28 GHz only; 140 GHz returns a structured `unsupported_frequency`
applicability result and remains `research_sub_thz`.

The request uses the network RF defaults and per-cell `rf_profile` objects.
`building_ids` is optional; an empty list selects footprints in the effective
cell-radius union. `residential_only` is an optional filter.

```json
{
  "towers": [
    {
      "id": "cell-28-a",
      "tower_lon": 32.8541,
      "tower_lat": 39.9208,
      "azimuth": 45,
      "rf_profile": {
        "schema_version": 1,
        "network_tech": "5g",
        "propagation_model": "urban_short_range",
        "frequency_ghz": 28,
        "band": "n257",
        "bandwidth_mhz": 100,
        "channel_id": "NR-634666",
        "duplex_mode": "tdd",
        "tx_power_dbm": 30,
        "antenna_gain_dbi": 17,
        "system_loss_db": 2,
        "radius_m": 400,
        "beam_width": 120,
        "antenna_height_m": 25,
        "receiver_height_m": 1.5,
        "receiver_sensitivity_dbm": -115
      }
    }
  ],
  "rays": 72,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "calibration_offset_db": 0,
  "building_ids": [],
  "residential_only": false
}
```

The response includes `model`, `applicability`, `summary`, `results[]`,
per-cell summaries, effective profiles, `rf_contract`, and diagnostics. Each
result carries the representative and facade points, outdoor LOS/NLOS baseline,
the shared `outdoor_los_classifier_id`, `outdoor_los_classification_basis`,
`outdoor_terrain_status`, and detailed `outdoor_los_classification` evidence;
the target building is excluded from the outdoor leg,
`outdoor_rx_at_facade_dbm`, `outdoor_wall_loss_db: 0`, both entry losses, both
just-inside powers, the effective `receiver_threshold` and receiver link
margins, separate receiver-sensitivity and building-service thresholds, and
material evidence. `diagnostics.http_requests_required` is
`1`; the frontend caches the response under an RF-derived source key.

The low-loss and high-loss values are deterministic scenarios, not confidence
limits. OSM material tags are optional evidence only and never automatically
choose a scenario. See the [Concept 4E design note](concept-4e-building-entry.md)
for the equations, geometry rules, canonical audit, and invalidation policy.

---

### Find Coverage Gaps

**Endpoint**: `POST /api/coverage-gaps`

Find demand-weighted buildings inside the selected sector whose raw received power does not meet the building-service rule.

**Request Body**:

Uses the same payload as `POST /api/simulate`.

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "azimuth": 45,
  "beam_width": 120
}
```

**Response**:

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "building_id": "building-2841",
          "rx_dbm": -117.6,
          "total_demand": 42.5,
          "demand_weight": 20,
          "residential_demand": 22.5,
          "severity": "outage",
          "reason": "commercial + residential demand"
        },
        "geometry": {
          "type": "Point",
          "coordinates": [32.8562, 39.9211]
        }
      }
    ]
  },
  "stats": {
    "candidate_buildings": 128,
    "served_buildings": 97,
    "gap_buildings": 31,
    "returned_gaps": 31,
    "gap_pct": 24.2,
    "total_gap_demand": 618.5,
    "worst_rx_dbm": -126.4,
    "threshold_dbm": -100,
    "building_service_threshold_dbm": -100
  },
  "rf_contract": {
    "model_id": "urban_short_range",
    "building_service_rule": "building is served when modeled received power is strictly greater than the building-service threshold"
  }
}
```

**How it works**:

- Candidate buildings must have `demand_weight + residential_demand > 0`
- The building centroid must be inside the requested radius and beam sector
- Received power is estimated with the selected shared propagation evaluator, analytic pattern terms, and explicit applicability/fallback semantics
- The building-service threshold is `-100 dBm` and is separate from per-cell receiver sensitivity; outdoor service uses raw power while low/high entry serviceability uses the effective receiver threshold
- Returned point features are sorted by demand, then by weakest estimated signal

---

### Analyze Interference and Radio Quality

**Endpoint**: `POST /api/interference`

Calculate planning-grade LTE or NR RSRP, SINR, RSRQ, RSSI, serving-cell, and strongest-interferer estimates over a bounded spatial grid and demand-building centroids.

```json
{
  "network_tech": "5g",
  "towers": [
    { "id": "cell-1", "tower_lon": 32.8541, "tower_lat": 39.9208, "azimuth": 45 },
    { "id": "cell-2", "tower_lon": 32.8581, "tower_lat": 39.9218, "azimuth": 225 }
  ],
  "serving_cell_id": "cell-1",
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "bandwidth_mhz": 100,
  "load_factor": 0.7,
  "reuse_factor": 1,
  "noise_figure_db": 7,
  "sample_spacing_m": 40
}
```

The request accepts 2–6 unique cells. LTE bandwidths are `1.4`, `3`, `5`, `10`, `15`, or `20` MHz; 5G NR bandwidths are `50`, `100`, `200`, or `400` MHz. Reuse must be `1` or `3`. 6G is rejected because standardized project-level RSRP/RSRQ assumptions are not defined for the 6G research profile.

The response contains:

- `geojson`: up to 3,000 grid samples with radio KPIs and serving/interferer context.
- `demand_geojson`: up to 500 affected demand-building centroids.
- `stats`: average, P10, and median radio quality, serviceable area/fraction, interference-limited area, outage-by-reason counts, affected demand, and per-cell summaries. `valid_sample_count` reports the number of samples with usable measurements; aggregate fields are `null` when that count is zero.
- `model`: bandwidth, SCS, resource blocks, load, reuse, effective spacing, request defaults, effective per-cell profiles with receiver thresholds, and explicit modeling assumptions. It also reports the carrier-power/reference-resource conversion, exact co-channel rule, serving-selection mode, interference noise bandwidth/source, receiver admission rule, and separate per-RE noise semantics.
- Each sample exposes a power ledger with raw `received_carrier_power_dbm`, desired/interference/noise mW, normalized RSRP, eligibility/exclusion reasons, serviceability failures, and a deterministic scenario fingerprint. `serving_cell_id` is optional; when omitted, the strongest eligible RSRP cell is selected.

Results are deterministic planning estimates, not measurements reported by a UE or live radio network.

Optional numeric fields receive defaults only when omitted. Explicit zero values remain explicit: for example, `noise_figure_db: 0` is valid, while `load_factor: 0` is rejected by range validation.

---

### Optimize Antenna Placement

**Endpoint**: `POST /api/optimize-azimuth`

Automatically find the optimal antenna azimuth for maximum coverage.

**Request Body**:

```json
{
  "tower_lon": 32.8541,
  "tower_lat": 39.9208,
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "azimuth": 45,
  "beam_width": 120
}
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tower_lon` | number | Yes | Tower longitude |
| `tower_lat` | number | Yes | Tower latitude |
| `rays` | number | Yes | Ray count used to sample the sector |
| `radius_m` | number | Yes | Maximum requested simulation radius |
| `frequency_ghz` | number | Yes | Network frequency in GHz |
| `tx_power_dbm` | number | Yes | Conducted TX power before antenna gain |
| `azimuth` | number | Yes | Current azimuth seed value |
| `beam_width` | number | Yes | Sector width in degrees |

**Response**:

```json
{
  "optimal_azimuth": 42,
  "propagation_reach_score": 18320.5,
  "coverage_score": 18320.5,
  "demand_score": 140000,
  "residential_score": 86000,
  "hit_demand_buildings": 18,
  "data_quality": "good",
  "rf_contract": { "model_id": "urban_short_range" }
}
```

**Response Fields**:

| Field | Description |
|-------|-------------|
| `optimal_azimuth` | Recommended antenna direction (0-360°) |
| `propagation_reach_score` | Capped aggregate usable-ray reach score |
| `coverage_score` | Compatibility alias for `propagation_reach_score` |
| `demand_score` | POI/commercial/critical-building score |
| `residential_score` | Residential-density demand score |
| `hit_demand_buildings` | Unique demand-weighted buildings reached by the winning sector |
| `data_quality` | Summary of local demand metadata quality |

**Status Codes**:
- `200 OK` - Optimization succeeded
- `400 Bad Request` - Invalid parameters
- `413 Content Too Large` - Request body exceeds 1 MiB
- `429 Too Many Requests` - RF worker capacity is busy
- `500 Internal Server Error` - Optimization error

**Performance**:
- Typical response time: 3-5 seconds
- Parallelization: Up to four workers per RF request
- Server write timeout: 120 seconds

### Evaluate Or Optimize A Network

**Endpoints**: `POST /api/evaluate-network` and `POST /api/optimize-network`

Network requests contain two to six `towers` and may add an `optimization` object:

```json
{
  "towers": [
    { "id": "101", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90 },
    { "id": "102", "tower_lon": 32.86, "tower_lat": 39.93, "azimuth": 210 }
  ],
  "radius_m": 400,
  "frequency_ghz": 28,
  "optimization": {
    "objectives": [
      { "id": "coverage", "weight": 70 },
      { "id": "demand", "weight": 80 },
      { "id": "residential", "weight": 60 },
      { "id": "overlap", "weight": 35 }
    ],
    "constraints": {
      "min_unique_demand_buildings": 10,
      "max_overlap_buildings": 25
    }
  }
}
```

Objective IDs are `coverage`, `demand`, `residential`, and `overlap`; the legacy `coverage` ID represents **Propagation reach**, not spatial-area coverage. Each `weight` is a user-facing importance priority from 0 to 100. A zero priority removes that objective's influence on ranking, but all priorities cannot be zero. The backend preserves configured priorities and returns the effective available-objective weights as `optimization.normalized_weights` and `optimization.effective_weights`.

The legacy constraint field `min_coverage_score` is also a minimum propagation-reach score, not a spatial-coverage constraint. Its mathematics and wire name remain unchanged for compatibility.

Responses expose both stable normalized utilities and raw domain measurements. Every network request derives one deterministic `optimization_domain` from the logical union of maximum configured service-radius envelopes around the selected cells. The domain is fixed before candidate azimuth evaluation and is independent of antenna azimuth and simulated ray outcomes. The composite score is `100 * (demandWeight*demandUtility + residentialWeight*residentialUtility + coverageWeight*reachUtility + overlapWeight*overlapUtility)`, so it is always in the 0–100 range. Demand is served demand weight divided by relevant demand weight in the fixed domain; residential is covered residential footprints divided by relevant residential footprints intersecting that domain; propagation reach is the existing capped aggregate usable-ray-reach score divided by its configured reach maximum; and overlap utility is `1 - overlapRatio`, where overlap ratio is overlapping covered footprints divided by covered footprints. Utilities are clamped to `[0, 1]` and do not use candidate-set min/max values.

The score fields have intentionally different representations. `stats.network_score` is the legacy raw aggregate of the weighted domain metrics and is not bounded to 100. `stats.objectives` contains normalized utilities, `stats.composite_score` is the weighted 0–1 composite, and `stats.score` is the authoritative normalized score for UI and reports. `optimization.objective_score` and recommendation `marginal_network_score` are raw compatibility deltas; they are not /100 scores or normalized quality percentages.

If a domain has no relevant entities for an objective, that objective is reported as unavailable with `utility: null` and is excluded from effective weight normalization. Configured slider priorities are preserved separately from effective weights. If no positively weighted objective is available, scoring fails with a domain-scoping error. Hard constraints remain active independently; for example, a minimum residential-building constraint still fails when the domain contains no residential buildings.

The response also includes `stats.objective_breakdown` for compatibility and `objective_status`, where each objective exposes availability, configured priority, effective weight, and nullable utility/contribution metadata. The contribution sum equals `stats.composite_score` within floating-point tolerance for available objectives. Existing feasibility constraints remain independent of priorities: an infeasible candidate is excluded from the Pareto frontier and cannot be returned as the optimized recommendation. The Pareto frontier is based on available objective utilities rather than weighted composite score; changing priorities can re-rank the stored feasible frontier without another RF evaluation when those metrics are available. Up to 25 feasible non-dominated evaluated azimuth sets are returned. This version adjusts azimuth only.

The default optimizer remains the legacy two-pass coordinate search. `POST /api/optimize-network` accepts the explicit opt-in `search_policy: "deterministic_multistart_coordinate_v1"`, with optional `max_search_passes` (default `8`) and `max_unique_evaluations` (default `5000`) for candidate-state RF evaluations. The existing compatibility tower summaries still perform their final per-tower recomputation. The opt-in policy evaluates the baseline plus deterministic uniform global rotations, descends through the 10-degree azimuth grid until each start is stable or a bound is reached, memoizes states within the request, and builds the reported Pareto frontier from the union of unique evaluated states. Its `optimization.search` metadata reports starts, accepted updates, cache/evaluation counts, archive size, termination reasons, and an explicit `heuristic_local_search` guarantee; it does not claim exhaustive or globally optimal search. Because weighted priorities affect discovery, a priority change can alter which states are found even though the stored archive can still be re-ranked without repeating RF evaluation.

The separate experimental `search_policy: "deterministic_pareto_archive_search_v1"` is priority-independent during discovery. It seeds the same four deterministic starts, expands every cell's absolute 10-degree neighborhood from a FIFO evaluated Pareto archive, and uses only feasibility, objective availability, and exact normalized utilities for archive admission and expansion. User priorities are applied afterward for ranking and recommendation. `max_unique_evaluations` bounds RF states; `max_expanded_states` (default `128`) and `max_search_rounds` (default `16`) bound traversal. The response reports `discovery_fingerprint` (which excludes weights), `ranking_fingerprint`, objective availability/set, archive policy, active Pareto size, removed states, neighbor/cache counts, archive growth, and `budget_complete`. A budget-limited result is explicitly incomplete. The public 25-solution view is selected by stable state identity before ranking, so changing priorities can reorder or recommend a discovered solution but cannot change that bounded membership. This remains a bounded heuristic and must not be described as a complete or global Pareto frontier. See the [Concept 5C audit](concept-5c-pareto-search.md) and its JSON evidence artifacts.

`POST /api/optimize-network` additionally returns `baseline`, an authoritative compact snapshot of the exact normalized selected-cell configuration that entered that optimization execution. It includes each cell's coordinates, original azimuth, resolved RF profile, request-level RF parameters, prepared-domain raw metrics/utilities, and baseline constraint status. It also returns `optimization_run_id`, a stable identity for RF-affecting state that excludes objective priorities. Baseline and Pareto statistics are evaluated through the same prepared domain, so their demand denominator, residential denominator, propagation-reach maximum, overlap semantics, and objective availability are directly comparable. The frontend can re-score both sides with new effective priorities from the stored frontier without repeating RF evaluation. `POST /api/evaluate-network` does not claim an optimization baseline.

### Explain One Pareto Cell

**Endpoint**: `POST /api/explain-network-cell`

The endpoint is a lazy, one-cell follow-up to `POST /api/optimize-network`. Send the retained `baseline`, the currently inspected `solution`, its `solution_id`, the changed `cell_id`, and the current `optimization` priorities/constraints. `run_id` and `optimization_domain` should be copied from the optimization response when available:

```json
{
  "run_id": "network-opt-7d6e3b1f0a2c",
  "solution_id": "90.0,0.0",
  "cell_id": "101",
  "baseline": { "cell_configurations": [], "parameters": {}, "stats": {}, "constraints_satisfied": true },
  "solution": { "id": "90.0,0.0", "towers": [{ "id": "101", "azimuth_deg": 90 }, { "id": "102", "azimuth_deg": 0 }], "stats": {} },
  "optimization": { "objectives": [{ "id": "demand", "weight": 80 }, { "id": "overlap", "weight": 40 }], "constraints": {} },
  "optimization_domain": { "source": "selected_cell_radius_union", "selected_cell_count": 2, "radius_policy": "cell_rf_profile_radius_m_else_request_radius_m", "relevant_building_entities": 0, "relevant_demand_entities": 0, "relevant_residential_entities": 0 }
}
```

This is an illustrative shape, not a runnable payload: the abbreviated objects stand for the complete baseline and solution snapshots returned by `optimize-network`. The backend evaluates the selected solution's stored raw metrics as `actual`, then evaluates exactly one network with only the requested cell restored to its baseline azimuth as `counterfactual`. Every other cell, ray count, RF profile, denominator, target domain, and hard-constraint rule remains unchanged. It does not rerun optimization or rebuild a Pareto frontier.

The response returns the cell ID and both azimuths, raw actual/counterfactual metrics, selected-minus-counterfactual deltas for served demand, residential coverage, propagation reach, overlap buildings, overlap ratio, and covered units, plus feasibility and any counterfactual violations. An infeasible counterfactual remains inspectable; infeasibility is not represented as a zero preference score. Propagation reach and score are higher-is-better. Overlap buildings and overlap ratio are lower-is-better, so a positive overlap delta is a regression. Covered units are informational unless a separate product rule gives them preference semantics.

The frontend caches raw explanations by optimization run, solution ID, and cell ID. Priority-only changes reuse that RF result and recompute the composite score under the new effective weights locally. RF-affecting changes—including cell or baseline configuration, technology/frequency, power, radius, beam width, ray count, propagation settings, target domain, network selection, or hard constraints—clear the explanation state/cache. Explanations are requested only after the user clicks `Explain`; unchanged cells are labeled `Unchanged from baseline` and do not issue a counterfactual request.

This is a conditional marginal comparison, not causal attribution, an independent cell contribution, or an additive decomposition. Cell interactions remain, and the comparison does not explain why a particular azimuth was chosen over nearby alternatives.

---

## Planning Product Endpoints

### Recommend Candidate Cells

**Endpoint**: `POST /api/recommend-sites`

Ranks known, unselected tower records inside a search polygon for a 4G or 5G network containing two to five selected cells. The backend prefilters candidates by nearby unmet demand, optimizes only the candidate azimuth, and returns at most the requested number of deterministic recommendations.

```json
{
  "network_tech": "5g",
  "towers": [
    { "id": "101", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90 },
    { "id": "102", "tower_lon": 32.852, "tower_lat": 39.921, "azimuth": 180 }
  ],
  "rays": 120,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "search_polygon": [[32.84, 39.91], [32.87, 39.91], [32.87, 39.94], [32.84, 39.94]],
  "max_results": 5
}
```

The response stores complete candidate details only in `recommendations`. Each `geojson.features[]` entry contains its point geometry, an empty `properties` object, and a top-level `id` that references the canonical recommendation with the same `id`:

```json
{
  "recommendations": [
    {
      "id": "LTE-3",
      "cell_id": 3,
      "tower_lon": 32.851,
      "tower_lat": 39.92,
      "optimal_azimuth": 90,
      "marginal_network_score": 120,
      "stats": { "network_score": 8120 },
      "reason": "adds demand with limited overlap"
    }
  ],
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "LTE-3",
        "properties": {},
        "geometry": { "type": "Point", "coordinates": [32.851, 39.92] }
      }
    ]
  }
}
```

Candidate records are not approved deployment sites. `marginal_network_score` is a raw legacy compatibility delta; the normalized composite score is exposed separately in network optimization responses. Cost, backhaul, permitting, and interference are not included in candidate scoring; run `/api/interference` after applying a candidate.

### Evaluate Field Measurements

**Endpoint**: `POST /api/measurements/evaluate`

Compares one to 5,000 measured 4G or 5G RSRP points with the deterministic model. At least one selected cell is required. With 20 or more valid predictions, at least five distinct 50 m spatial areas, and a campaign span of at least 100 m, the response includes a robust global bias suggestion evaluated through deterministic spatially blocked five-fold validation.

```json
{
  "network_tech": "5g",
  "towers": [{ "id": "101", "tower_lon": 32.85, "tower_lat": 39.92, "azimuth": 90 }],
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "bandwidth_mhz": 100,
  "noise_figure_db": 7,
  "calibration_provenance": {
    "campaign_id": "ankara-drive-2026-07",
    "source": "drive-test.csv",
    "collected_at": "2026-07-01T10:00:00Z",
    "expires_at": "2027-01-01T00:00:00Z"
  },
  "samples": [
    { "id": "drive-001", "lon": 32.851, "lat": 39.921, "technology": "5g", "rsrp_dbm": -91, "cell_id": "101" }
  ]
}
```

The response separates valid predictions, no-signal samples, and requested-cell mismatches before reporting residual MAE/RMSE/bias, P50/P90 absolute error, per-cell and per-band summaries, distance/obstruction bins, robust MAD outliers, fold metrics, a 95% median-adjustment interval, and provenance/expiration state. It also returns request defaults, effective per-cell profiles, and the canonical RF contract. The correction remains a single dB path-loss offset, not full propagation calibration. When applied, send `calibration_offset_db` with compatible simulation, network, interference, recommendation, and measurement requests. Accepted range is `-40` to `40` dB.

### Run Batch Experiments

**Discovery**: `GET /api/processes/batch-experiment`

**Execution**: `POST /api/processes/batch-experiment/execution`

```json
{
  "name": "Azimuth and power sweep",
  "base": { "tower_lon": 32.8541, "tower_lat": 39.9208, "radius_m": 400, "frequency_ghz": 28, "tx_power_dbm": 30, "beam_width": 120 },
  "matrix": { "tx_powers_dbm": [27, 30, 33], "azimuths_deg": [0, 30, 60, 90] }
}
```

The Cartesian product is capped at 64 runs. Execution returns an asynchronous job with `job_id`, `status`, `progress`, `fingerprint`, and run counts. Poll `GET /api/jobs/{jobID}`; cancel an accepted or running job with `DELETE /api/jobs/{jobID}`. Successful results contain compact metrics, per-run fingerprints, Pareto labels/explanations, and cache state. The fingerprint includes the normalized definition, dataset identity/hashes, and model version.

Run the same definition headlessly:

```bash
cd backend-go
go run ./cmd/run-experiment -definition experiment.json -base-url http://localhost:8080
```

The process/job resource shape is inspired by OGC API Processes; this implementation does not advertise full standard conformance.

### Dataset Packs

The backend loads the initial validated pack from `ATOM_DATASET_DIR`. Schema-v1 packs remain compatible. Schema v2 adds per-layer provenance and confidence, geometry/missing-field/coverage QA, and optional terrain, clutter, building-height, and material layers. All referenced files require SHA-256 hashes. A supported terrain COG/GeoTIFF or explicitly declared HGT layer is consumed by `/api/path-profile`; other optional sidecar layers remain metadata until explicitly integrated.

`GET /api/datasets` lists packs discovered at `ATOM_DATASETS_ROOT` itself and its immediate child directories:

```json
{
  "active_id": "ankara-open-planning",
  "datasets": [
    {
      "id": "ankara-open-planning",
      "name": "Ankara Open Planning Dataset",
      "version": "2026.07",
      "schema_version": 2,
      "crs": "EPSG:4326",
      "bounds": [32.45, 39.55, 33.25, 40.25],
      "sources": ["OpenStreetMap"],
      "licenses": ["ODbL 1.0"],
      "confidence": "Planning dataset; not an operator inventory.",
      "files": { "towers": "towers.geojson", "buildings": "buildings.geojson" },
      "sha256": { "towers.geojson": "...", "buildings.geojson": "..." },
      "active": true,
      "available": true
    }
  ]
}
```

`POST /api/datasets/switch` accepts only an installed ID:

```json
{ "id": "izmir-planning-2026" }
```

The server resolves the ID inside the configured root, validates all hashes and required geometry, and swaps the immutable runtime snapshot only after success. It returns `404` for an unknown ID, `422` for a failed installed-pack validation, and keeps the old pack active in both cases. Configure `DATASET_ADMIN_API_KEY` to protect activation.

Validate a pack before starting the server:

```bash
cd backend-go
go run ./cmd/validate-dataset ../data-pipeline
```

Use [Dataset Pack Studio](dataset-pack-studio.html) to inspect, repair, reproject, and build arbitrary-region schema-v2 packs locally.

The complete machine-readable contract is available as [`openapi.yaml`](openapi.yaml).

### Spatial Evidence Diagnostics

Concept 4F.3A adds three read-only/diagnostic interfaces. They do not change canonical LOS/NLOS, propagation loss, interference, radio quality, building entry, or optimization.

`GET /api/spatial-evidence` reports the active terrain declaration (`dtm`, `dsm`, or `dem_unspecified`), vertical-datum compatibility, current explicit/levels/fallback counts, matching policy, source precedence, and `spatial_evidence_fingerprint`.

`GET /api/spatial-evidence/buildings/:id` returns `height_ledger`. The ledger keeps `selected_height_agl_m`, `selected_provenance`, evidence class, base `ground_elevation_m` statistics, compatible `roof_elevation_amsl_m` when an authoritative DTM is present, alternative sources, and conflict screening. A generic fallback remains `fallback_only`; DSM and unspecified DEM semantics cannot produce a ground base.

`POST /api/spatial-evidence/path-profile` accepts:

```json
{
  "transmitter": {"lon": 32.85, "lat": 39.92},
  "receiver": {"lon": 32.851, "lat": 39.92},
  "requested_spacing_m": 30,
  "interpolation": "bilinear",
  "tx_height_agl_m": 25,
  "rx_height_agl_m": 1.5
}
```

The response contains deterministic path-distance samples and exposes the same `clearance` object both as `profile.clearance` and at the top level. Its signed contract is `clearance_m = radio_elevation_m - terrain_elevation_m`; endpoints use source-local terrain plus the configured AGL heights, and strict-zero classification treats only a minimum below `0 m` as an `obstruction_candidate`. An optional `uncertainty_margin_m` is diagnostic policy only. Effective spacing is never finer than the largest declared raster resolution. Each sample distinguishes `measured_or_source`, `interpolated`, `outside_dataset`, `no_data`, and `unavailable`; no zero terrain is synthesized. The response includes source checksum, vertical datum, interpolation, spacing, fingerprint, and `canonical_activation: diagnostic_only_not_active`.

## Usage Examples

### Example 1: Get Health Status

```bash
curl -X GET http://localhost:8080/healthz
```

### Example 2: Simulate 5G Coverage

```bash
curl -X POST http://localhost:8080/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 120,
    "radius_m": 400,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 90,
    "beam_width": 120
  }'
```

### Example 3: Auto-Optimize Antenna

```bash
curl -X POST http://localhost:8080/api/optimize-azimuth \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 120,
    "radius_m": 400,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 90,
    "beam_width": 120
  }'
```

### Example 4: Find Coverage Gaps

```bash
curl -X POST http://localhost:8080/api/coverage-gaps \
  -H "Content-Type: application/json" \
  -d '{
    "tower_lon": 32.8541,
    "tower_lat": 39.9208,
    "rays": 120,
    "radius_m": 400,
    "frequency_ghz": 28,
    "tx_power_dbm": 30,
    "azimuth": 90,
    "beam_width": 120
  }'
```

### Example 5: Fetch All Towers

```bash
curl -X GET "http://localhost:8080/api/towers"
```

---

## Client Examples

### Go Standard Library

```go
package main

import (
    "bytes"
    "net/http"
)

func main() {
    payload := []byte(`{
      "tower_lon": 32.8541,
      "tower_lat": 39.9208,
      "frequency_ghz": 28,
      "tx_power_dbm": 30,
      "rays": 120,
      "radius_m": 400,
      "azimuth": 90,
      "beam_width": 120
    }`)
    request, _ := http.NewRequest(
        http.MethodPost,
        "http://localhost:8080/api/simulate",
        bytes.NewReader(payload),
    )
    request.Header.Set("Content-Type", "application/json")
    response, err := http.DefaultClient.Do(request)
    if err != nil {
        panic(err)
    }
    defer response.Body.Close()
}
```

### Python Client

```python
import requests

client = requests.Session()
response = client.post(
    'http://localhost:8080/api/simulate',
    json={
        'tower_lon': 32.8541,
        'tower_lat': 39.9208,
        'rays': 120,
        'radius_m': 400,
        'frequency_ghz': 28,
        'tx_power_dbm': 30,
        'azimuth': 45,
        'beam_width': 120
    }
)

data = response.json()
print(data['geojson'])
```

### JavaScript Client

```javascript
async function simulateRF(params) {
  const response = await fetch('http://localhost:8080/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  
  const data = await response.json();
  return data.geojson;
}

const coverage = await simulateRF({
  tower_lon: 32.8541,
  tower_lat: 39.9208,
  rays: 120,
  radius_m: 400,
  frequency_ghz: 28,
  tx_power_dbm: 30,
  azimuth: 45,
  beam_width: 120
});
```

---

## Capacity and Rate Limiting

The server allows two RF jobs globally but only one active job per client by default. A client also has a 20-request-per-minute budget. Configure these with `MAX_CONCURRENT_RF_REQUESTS`, `MAX_CONCURRENT_RF_REQUESTS_PER_CLIENT`, and `RF_REQUESTS_PER_MINUTE`.

Rejected requests return `429` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. Client identity comes from the socket peer unless `TRUSTED_PROXIES` explicitly lists the proxy CIDRs allowed to supply forwarding headers. These controls are process-local; a multi-replica deployment still needs a gateway-level shared budget.

Set `RF_REQUEST_TIMEOUT_SECONDS` to bound compute time; the default is 60 seconds and expiration returns `504`. Keep RF concurrency aligned with CPU allocation and set `RF_API_KEY` for any non-private backend hop.

`GET /api/buildings` has a separate transfer budget because each cache miss serves the complete dataset. Its conditional `304` responses bypass transfer admission, while uncached responses return the same `RateLimit-*` and `Retry-After` headers as RF routes when applicable. Configure a gateway-level bandwidth budget for multi-replica or internet-facing deployments.

---

## Versioning

**Current API Version**: `1.0`

Future versions will:
- Add webhook support for async simulations
- Support batch optimization requests
- Include terrain elevation models
- Add custom propagation model endpoints

Breaking changes will increment major version (e.g., `/v2`).

---

## Troubleshooting

### 503 Service Unavailable

**Cause**: Data not yet loaded at startup

**Solution**: Wait 5-10 seconds and retry

### 400 Bad Request

**Cause**: Invalid parameter values

**Solution**: Check parameter types and ranges in documentation

### 500 Internal Server Error

**Cause**: Computation timeout or backend crash

**Solution**: 
- Check logs: `docker logs atom-simulator`
- Reduce `rays` or `radius_m` for faster computation
- Increase timeout values if needed

### Slow Response Times

**Cause**: Overlapping concurrent requests

**Solution**:
- Reduce grid size (10 m → 20 m)
- Increase container resources (CPU/RAM)
- Implement client-side request batching

---

**Next**: See [Getting Started](getting-started.md) or [Deployment](deployment.md).
