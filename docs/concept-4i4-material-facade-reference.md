# Concept 4I.4 — 140 GHz Material & Facade Interaction Reference Model

Concept 4I.4 adds an isolated, non-canonical reference evaluator for one finite homogeneous material slab. Its model identifier is p2040_material_slab_reference_v1, and its only production-facing interface is:

    POST /api/sub-thz-material-reference

The UI lives under RF Diagnostics and states, prominently: **Material reference only — not used by network simulation.**

## Boundary and invariance

The evaluator is a research/reference ledger. It is not called by canonical propagation, research_sub_thz, P.1411, P.526, atmospheric, building-entry, interference, radio-quality, coverage-surface, or optimization code. It does not change the existing research_sub_thz rule of 80 dB per wall event at sub-THz frequencies, and it never adds a P.2040 result to that heuristic.

The pre-change behavior is frozen in [concept-4i4-pre-change-baseline.json](concept-4i4-pre-change-baseline.json). The post-change evidence is in [concept-4i4-post-change-comparison.json](concept-4i4-post-change-comparison.json). The target is exact invariance for canonical 2.6 GHz and 28 GHz, the 140 GHz research_sub_thz profile, 4I.2A, 4I.2B, P.526, building entry, interference/radio quality, and the 4H.2 optimizer.

There is no automatic material physics from OSM tags. A building-material label can remain useful metadata, but the endpoint requires an explicit material row or a user-defined electrical property and an explicit thickness. There is no universal wall default.

## Authoritative source audit

The implementation is based on the current in-force [ITU-R P.2040-4 recommendation page](https://www.itu.int/rec/R-REC-P.2040-4-202509-I/en) and its [official 2025-09 PDF](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf). P.2040-4 covers 1 MHz–450 GHz, but a material row is only applicable over its own Table 3 range.

The audited clauses are:

- Annex 1 §2.1.2, equations (9)–(16): complex permittivity, loss, conductivity, loss tangent, and complex refractive index.
- Annex 1 §2.1.4, equations (28)–(29): frequency-dependent empirical property forms.
- Annex 1 §2.2.1, equations (30)–(38): Snell geometry, TE/TM interface field coefficients, and power-flux correction.
- Annex 1 §2.2.2.1, equations (39)–(42): recursive multilayer formulation and internal reflections.
- Annex 1 §2.2.2.2, equations (43a)–(44): simplified single-layer slab formulation.
- §3, equations (57)–(59) and Table 3: material-row coefficients and the conductivity/complex-loss conversion.

The response carries these clauses, the revision, and both official URLs so a result cannot be mistaken for an unreferenced empirical wall number.

## Smallest auditable scope

The implemented scope is a plane wave incident on a single finite, homogeneous, isotropic, non-magnetic slab between explicitly declared incident and exit media. Both exterior media are inputs; air is not silently assumed by the API, although the UI provides explicit air defaults.

Normal and oblique incidence are supported for TE and TM polarization. The UI uses the source terminology directly: TE means electric field perpendicular to the plane of incidence; TM means electric field parallel to it. The API does not map “horizontal” or “vertical” labels to TE/TM.

Multilayer construction is deferred. Roughness, diffuse scattering, air gaps, frames, coatings, moisture corrections, spatially varying thickness, and multiple slabs are not inferred. This keeps the returned ledger auditable and prevents an apparent material result from becoming a whole-facade claim.

## Electrical-property contract

P.2040 Table 3 rows are represented by separate stable IDs when frequency ranges overlap. The full supported catalog, coefficients, and ranges are in [concept-4i4-material-applicability.json](concept-4i4-material-applicability.json). It includes the concrete, brick, plasterboard, wood, glass, clear acrylic, ceiling-board, chipboard, and plywood rows that cover at least one requested frequency. Metal is not included as a preset because this implementation does not accept a metal row without explicit 140 GHz coverage.

For a Table 3 row, the evaluator applies:

    εr′ = a fGHz^b
    σ  = c fGHz^d
    εr″ = 17.98 σ / fGHz
    εrc = εr′ − j εr″
    tanδ = εr″ / εr′

For user-defined materials, exactly one of these forms is accepted:

1. real relative permittivity plus conductivity;
2. real relative permittivity plus loss tangent; or
3. complex relative permittivity expressed as real part plus positive imaginary-loss magnitude.

The response stores the signed complex value as real − j imaginary_loss, while the input JSON calls the magnitude imaginary_loss to avoid a sign-convention ambiguity. Redundant inconsistent forms are rejected. User-defined output is classified as user_assumption, even when its property source says measured or manufacturer; the property-source field remains visible.

Every returned electrical property has provenance through the material source/property source, the Table 3 row and coefficients when applicable, or the user-declared source and provenance note. User-provided incident and exit media also retain their property source. No OSM tag is treated as a physical measurement.

## Thickness and geometry

Thickness is required in the request and is never defaulted to “one wall.” It is bounded, finite, non-negative, and returned with thickness_provenance. The controlled fixtures use controlled_reference_fixture; ordinary user runs use user_declared.

Incidence angle is measured from the interface normal. 0° is normal incidence. Values at or above grazing incidence are rejected. A user-declared angle can run without map geometry. A geometry_derived angle is accepted only when facade_normal_provenance documents a reliable normal; otherwise validation fails. The current UI intentionally remains user-angle-only because reliable ray/facade intersection selection is a separate workstream.

The geometry ledger contains frequency, free-space wavelength, angle convention, angle source, polarization, facade-normal provenance, and geometry mode. It does not claim a building intersection or a selected ray unless a future adapter supplies that evidence.

## Complex interface and slab implementation

For the selected polarization, the evaluator computes complex refractive indices, Snell angles, and the two interface reflection coefficients. At the first interface, the TE field coefficient is:

    rTE = (n1 cosθ1 − n2 cosθ2) / (n1 cosθ1 + n2 cosθ2)

The TM coefficient uses the source-consistent admittance form:

    rTM = (n2 cosθ1 − n1 cosθ2) / (n2 cosθ1 + n1 cosθ2)

For slab phase thickness:

    q = k0 d n2 cosθ2

The returned slab reflection includes the internal round trip:

    R = (r01 + r12 exp(−2j q)) /
        (1 + r01 r12 exp(−2j q))

The field transmission coefficient is evaluated with the corresponding two-interface numerator and the same internal-reflection denominator. The implementation keeps complex coefficients until power conversion; it does not replace a lossy material with a real refractive index or an attenuation-only scalar.

## Field, power, reflection, and absorption ledger

The response distinguishes:

- complex reflection coefficient R;
- complex transmission coefficient T;
- first-interface reflection power;
- total reflected power |R|²;
- transmitted power after the declared exterior-medium power-flux correction;
- absorbed power as 1 − reflected − transmitted when the passive balance is within tolerance;
- transmission loss −10 log10(transmitted_power_fraction).

The first-interface reflection is intentionally not presented as total slab reflection. Interference and internal reflections can change total reflected power, especially for thin slabs and oblique incidence. A power-balance warning is returned if the finite calculation falls outside the passive tolerance.

The response includes complex propagation constant and normal phase thickness, plus the angles in the incident, slab, and exit media. multiple_internal_reflections_included is explicit. This prevents a field coefficient, a reflected fraction, and a transmission-loss number from being conflated.

## Numerical stability

All complex intermediates and exported scalar values are checked for finite values. The internal round-trip exponential is evaluated from its logarithmic magnitude and phase. When a transmission amplitude is below the representable numeric floor, the response does not emit zero, NaN, or Inf; it returns status=below_numeric_floor and a lower-bound transmission loss. The comparison object keeps this lower bound distinct from a finite slab_transmission_loss_db.

The controlled numeric fixture is a 10 m concrete slab at 140 GHz. It must return a finite lower-bound state and JSON-marshallable values. A zero-thickness slab between identical media is a regression identity: reflected power is zero, transmitted power is one, and absorbed power is zero within tolerance.

## Controlled fixtures and sensitivity

[concept-4i4-controlled-fixtures.json](concept-4i4-controlled-fixtures.json) records:

- 140 GHz concrete, brick, glass, and wood single-slab rows;
- frequency points 28, 60, 100, 140, and 200 GHz where the selected row is valid;
- explicit out-of-range brick behavior at 60 GHz;
- 140 GHz glass thicknesses from 1 mm through 200 mm;
- TE/TM angle sweeps at 0°, 15°, 30°, 45°, 60°, and 75°;
- user-defined property sensitivity for relative permittivities 2, 4, and 8;
- zero-thickness, numeric-floor, metal, and geometry-provenance boundary cases.

The earlier 4I.1 audit has an independent material fixture with different slab-loss values. Those values are preserved in the artifact as a comparison-only discrepancy. 4I.4 does not silently promote them to equation goldens; it exposes the signed-complex property conversion, Fresnel coefficients, power correction, and internal-reflection ledger used by the new evaluator. This makes reconciliation reviewable.

## Comparison to the unchanged 80 dB heuristic

[concept-4i4-reference-comparison.json](concept-4i4-reference-comparison.json) compares one declared slab loss beside the historical research_sub_thz value of 80 dB per wall event. The comparison is explicitly combined=false. It is not added to the slab loss, not added to the research profile, not used as a calibration target, and not sent into a network path-loss budget.

The illustrative 140 GHz equation-ledger values are approximately 12.65 dB for 10 mm glass, 99.10 dB for 100 mm wood, 228.06 dB for 200 mm brick, and 456.97 dB for 200 mm concrete. These are plane-wave slab values, not building-entry predictions. They demonstrate why material, thickness, angle, and construction structure must remain explicit.

## API contract

A minimal request is:

    {
      "schema_version": 1,
      "frequency_ghz": 140,
      "material_source": "p2040_reference",
      "material_id": "glass_100_400",
      "thickness_m": 0.01,
      "thickness_provenance": "user_declared",
      "incidence_angle_deg": 0,
      "polarization": "TE",
      "incident_medium": {
        "name": "air",
        "relative_permittivity": 1,
        "conductivity_s_per_m": 0,
        "property_source": "user_declared"
      },
      "exit_medium": {
        "name": "air",
        "relative_permittivity": 1,
        "conductivity_s_per_m": 0,
        "property_source": "user_declared"
      }
    }

Valid material-range failures are returned as an auditable 200 response with status=material_frequency_out_of_range, no slab ledger, and no extrapolated properties. Invalid schema, angle, polarization, medium, or redundant-property inputs return 400. The endpoint is RF-protected and subject to the existing request deadline/concurrency controls.

## 4I.3 measurement adapter

The optional MaterialCharacterizationRecord adapter accepts a declared measured coupon/slab transmission-loss record and computes measured-minus-predicted residuals against this isolated evaluator. It is not a MeasurementCampaign, is not added to the shared propagation adapter list, and cannot alter measurement RMSE, calibration, readiness, radio quality, or optimization. No fabricated campaign or numeric field campaign is included.

The material adapter returns readiness=reference_only and promoted=false. A future material campaign would need traceable coupon geometry, thickness, frequency, angle, polarization, exterior media, moisture/temperature, fixture calibration, uncertainty, and repeatability before it could support any broader inference.

## Fingerprint and performance

The deterministic material fingerprint includes schema version, model ID/version, P.2040 revision, frequency, material source and row or user properties, thickness and thickness provenance, incidence angle, polarization, incident/exit media, and supplied geometry provenance. It excludes timestamps, runtime, UI state, file paths, and server identity. The material-characterization adapter adds record ID, measured value, measurement source, and measurement provenance to a separate fingerprint.

A single evaluation and small controlled sweeps are the intended workload. The endpoint does not run in a network hot loop, on every ray, or inside optimization. Multilayer and geometry-backed facade integration remain future work with separate performance and evidence contracts.

## Readiness and gaps

Readiness remains reference_only. No promotion path is implemented. The principal gaps are:

- no Ankara 140 GHz material-coupon or facade-entry campaign in the repository;
- no validated moisture, temperature, roughness, scattering, frame, coating, or air-gap model;
- no reliable automatic facade-normal/ray-interaction selector;
- no multilayer or whole-building transfer model;
- no P.2109 extrapolation;
- no evidence that a Table 3 row represents a particular Ankara construction product;
- no device/antenna/receiver validation attached to slab coefficients.

The correct next step is traceable measurement and independent review, not replacing the 80 dB planning heuristic or silently summing this reference into network simulation.
