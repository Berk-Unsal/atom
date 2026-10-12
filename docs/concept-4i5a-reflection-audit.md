# Concept 4I.5A — 140 GHz Specular Reflection Geometry & Composition Audit

Status: read-only scientific and architectural audit. No production reflection evaluator, network coupling, canonical propagation change, or `research_sub_thz` change is introduced here.

The defensible conclusion is deliberately narrow:

> A single reflected-path diagnostic is defensible only with explicitly supplied facade/material geometry.

The smallest useful follow-up is therefore an isolated, opt-in reference for one finite planar facade and one reflected path. It is not a ray tracer, a whole-building model, a P.1411 replacement, or a direct-plus-reflected network-power result.

The machine-readable evidence is in [the applicability contract](concept-4i5a-reflection-applicability.json), [the controlled derivation](concept-4i5a-controlled-derivation.json), [the Ankara readiness audit](concept-4i5a-ankara-readiness.json), and [the pre-change baseline](concept-4i5a-pre-change-baseline.json).

## 1. Source/reference audit

The physical reference boundary is assembled from authoritative ITU-R material plus a geometry reference and 140 GHz measurement evidence:

- [ITU-R P.2040-4 (2025-09)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf), §2.2.1–§2.2.2 and equations (34)–(44): planar homogeneous-interface and finite-slab complex TE/TM coefficients. Its plane-wave coefficient methods do not include free-space spreading.
- [ITU-R P.1411-13 (2025-09)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-13-202509-I!!PDF-E.pdf), §3.2, §4, §5 and §6: site-data accuracy, urban scenario applicability, statistical transmission loss, multipath, and polarization boundaries. It does not turn an arbitrary footprint edge into a deterministic 140 GHz facade solver.
- [ITU-R P.525-5 (2024-11)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.525-5-202411-I!!PDF-E.pdf), §4–§6: free-space field behavior and `L_FS=20 log10(4πd/λ)`.
- [ITU-R P.1410-4 (2007-02)](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1410-4-200702-S!!PDF-E.pdf), §2.1.2 and equations (1)–(14): an official urban single-bounce reflection option, ideal-mirror image-path power, and a separate finite-facet diffuse-scatter treatment. This is a geometry/spreading analogue, not a calibrated 140 GHz facade standard.
- [ITU Radiocommunication Handbook (1996)](https://www.itu.int/dms_pub/itu-r/opb/hdb/R-HDB-27-1996-PDF-E.pdf), reflection/scattering roughness discussion around pp. 87–89: Rayleigh roughness parameter `g=4πσ_h sin(φ_g)/λ` and the coherent/diffuse boundary.
- [Application of exact image theory to electromagnetic wave propagation](https://academic.oup.com/gji/article/151/2/534/616767): planar-interface image construction. It is used for geometry/boundary reasoning, not as a complete finite-facade power model.
- [Xing et al., Indoor Wireless Channel Properties at Millimeter Wave and Sub-Terahertz Frequencies](https://arxiv.org/abs/1908.09765): measured 28/73/140 GHz material reflection/scattering behavior. The evidence is indoor and material-specific, so it cannot be transplanted to Ankara exteriors without measurements.

The source roles are kept separate: P.2040 supplies `Γ`, P.525 supplies ideal path spreading, P.1410 supplies a useful official urban-reflection analogue, and P.1411/P.526/4I.2A remain alternative or separately integrated model families.

## 2. Image-method geometry

Use a local ENU coordinate system and a declared vertical plane:

```text
plane:          n · (x - p0) = 0,       |n| = 1
mirrored Tx:    Tx_i = Tx - 2 n [n · (Tx - p0)]
intersection:   S = Tx_i + t (Rx - Tx_i)
t:              -n · (Tx_i - p0) / n · (Rx - Tx_i)
d1:             |Tx - S|
d2:             |S - Rx|
L:              d1 + d2 = |Tx_i - Rx|
```

The denominator must be finite and non-zero, `0 ≤ t ≤ 1`, and the point must lie on the finite facade segment. With the actual three-dimensional vectors, `acos(|k_i·n|)` equals `acos(|k_r·n|)`. The controlled tests verify this for normal and oblique cases.

The image construction is a candidate path geometry. It does not, by itself, prove that a finite facade is large, smooth, or visible enough to support the ideal-plane field approximation.

## 3. Correct spreading formulation

For an ideal infinite or sufficiently large planar specular reflector with a dimensionless field coefficient, the defensible first reference is:

```text
E_ref ∝ Γ exp(-j k L) / L
P_ref ∝ |Γ|² (λ / (4πL))²
FSPL_ref = 20 log10(4πL/λ),  L=d1+d2
```

`FSPL(d1)+FSPL(d2)` is rejected for this scope. It applies two independent point-to-point power factors, duplicates the free-space constants, and produces a `1/(d1 d2)^2` dependence without a finite-area or RCS normalization. It can belong to a different finite-facet/diffuse/RCS formulation only when that model supplies the missing area and scattering normalization.

The finite-facet case is not silently folded into the image method. If the relevant Fresnel footprint is not covered by a known facade, the result is qualified or inapplicable rather than “corrected” by an arbitrary reflector area.

## 4. P.2040 `Γ` composition

The coefficient enters once:

```text
field: E_ref = E_propagation(L) Γ_TE/TM exp(-j k L) × directional terms
power: P_ref = P_propagation(L) |Γ_TE/TM|² × directional power terms
```

A future implementation must not apply a complex coefficient and then subtract a separate reflection-loss dB value again. If direct and reflected paths are ever combined, the fields—not the already-reduced powers—must be added.

`Γ` is selected from the actual incidence angle, medium properties, and polarization. The first implementation should accept explicit TE or TM. Arbitrary user polarization requires vector decomposition and transport; H/V labels are not intrinsically TE/TM.

## 5. Interface versus slab reflection

Use the front-interface coefficient when the declared surface is effectively semi-infinite/opaque or the rear interface cannot be supported coherently. Use the finite-slab total coefficient only when thickness, rear medium, layer stack, incidence angle, polarization, phase convention, and coherence are all explicit.

At 140 GHz, millimetre-scale thickness and roughness are not negligible. Construction variation, moisture, coatings, air gaps, multilayers, and thickness variation can make a nominal slab phase meaningless. The diagnostic must therefore expose `interface_only` or `slab_coherence_unknown`; it must never silently choose the 4I.4 slab path for an unlabeled footprint.

## 6. Field/power semantics

The isolated reference output is a single reflected-path received-power estimate:

```text
Pr_ref_dBm = Pt_dBm + Gt_dBi(S) + Gr_dBi(S)
             - FSPL(L) + 10 log10(|Γ|²)
             + explicitly declared, non-duplicated terms
```

The expression is a reference power for one path. It is not whole-building entry loss, not a P.1411 median, not a P.526 excess loss, and not total received power in a multipath channel.

## 7. Antenna departure/arrival treatment

The direct-path bearing must not be reused. The directions are:

```text
Tx departure: normalize(S - Tx)
Rx look/arrival: normalize(S - Rx)
```

The future adapter would evaluate the Tx pattern at the departure azimuth/elevation and the Rx pattern at its look direction, with separate relative pattern loss and absolute gain terms. Concept 4G.1 provides bounded analytic pattern behavior, but it does not provide a measured 140 GHz aperture, array codebook, or beamforming model. The diagnostic must report those limitations rather than infer a 3D array response.

## 8. TE/TM basis

For incident direction `k_i=normalize(S-Tx)` and normal `n`, the incidence plane is `span(k_i,n)`. A deterministic basis is:

```text
s / TE = normalize(cross(n, k_i))
p / TM = normalize(cross(s, k_i))
```

The sign convention is arbitrary but must be stable. At normal incidence the plane is not unique; select a documented projected ENU axis and note that TE/TM amplitudes are equal. An arbitrary polarization vector must be decomposed against this basis and transported across reflection; the smallest honest first scope requires explicit TE or TM.

## 9. Facade-plane assumptions

A 2D building footprint edge supplies a horizontal tangent and a candidate horizontal normal. It does not prove a physical vertical wall plane, a base elevation, a trusted top elevation, a setback, an overhang, an opening/window plane, a material surface, a thickness, or a roughness spectrum.

Treating an edge as a facade therefore requires an explicit declaration that it is an exterior wall line, vertical and locally straight over the relevant Fresnel zone, with a selected reflecting side and a known or declared vertical extent. The current loader also retains outer rings only and does not retain hole boundaries as facade semantics.

## 10. Normal orientation

Project the ring to local ENU metres and calculate signed shoelace area. For an exterior ring with positive (CCW) area, the outward normal of edge `(dx,dy)` is `(dy,-dx)`; for a negative (CW) exterior ring it is `(-dy,dx)`. Validate the result against an interior point and reject ambiguous or degenerate rings.

Holes are not exterior facade segments. MultiPolygon components are tested independently. The test-only audit fixture covers clockwise and counter-clockwise rings and keeps holes/multipart behavior explicit; no production geometry loader is changed here.

## 11. Vertical reflection point

For a vertical facade, mirroring changes horizontal position but preserves the mirrored source `z`. The three-dimensional line intersection produces `S.z`; the candidate is valid only if:

```text
base_z ≤ S.z ≤ top_z
```

with both bounds trusted or explicitly declared. If height is missing, return `vertical_extent_status=unknown`. The current display fallback of 9 m is never accepted as proof.

## 12. Finite segment and height checks

The infinite-plane intersection is insufficient. The horizontal segment parameter must satisfy `[0,1]`; otherwise return `specular_point_outside_facade_segment`. A known height must similarly contain `S.z`; otherwise return `specular_point_outside_vertical_extent`. The controlled derivation includes:

- A: normal incidence;
- B: oblique reflection;
- C: point outside the segment;
- D: wall too short vertically;
- E: unknown wall height;
- H: TE/TM contrast;
- I: zero reflection;
- J: high reflection.

F and G are independent-leg obstruction fixtures described in the derivation artifact and are reserved for the same audit-only visibility harness; neither is a production path implementation.

## 13. Two-leg visibility

Check both `Tx→S` and `S→Rx` independently using deterministic 4F.1-style interval and grazing semantics. The reflecting building may be exempted only at the endpoint `S`. A positive-length penetration behind `S`, a non-endpoint tangent/grazing contact, or an unrelated building crossing either leg blocks the candidate. Direct-path visibility is not a substitute for either reflected-leg test.

This audit defines the visibility contract but does not add a production obstruction walker or reflection route.

## 14. Terrain requirement

Terrain affects the facade base, endpoint heights, and obstruction tests. The current Ankara manifest has no terrain layer, so the result is explicitly `terrain_unavailable`. A later controlled reference may use `flat_ground_relative_datum` only when the caller declares it; that is an assumption, not measured elevation.

## 15. Roughness/specularity at 140 GHz

At 140 GHz, `λ=2.1413747 mm`. The Rayleigh-style audit criterion is:

```text
g = 4π σ_h / λ × sin(grazing angle)
  = 4π σ_h / λ × cos(incidence angle)
```

The smooth reference is `g<0.3`, with RMS height measured within the relevant first Fresnel zone. The corresponding approximate RMS limits are 0.0511 mm at 0°, 0.0723 mm at 45°, 0.1022 mm at 60°, and 0.1975 mm at 75° incidence. These are criteria, not Ankara measurements.

RMS height alone is not enough for a diffuse partition: correlation length/texture, surface tilt, curvature, and construction variation may matter. If roughness is unknown, return `specularity_evidence=unknown` and qualify the result. Do not invent roughness from OSM building type.

## 16. Diffuse-scattering boundary

Diffuse scattering is not implemented. It may become material when roughness violates the smooth-surface criterion or when the facade is corrugated, porous, textured, or composed of unresolved facets. A future diffuse model would require at least RMS height, correlation length or surface PSD/BRDF, finite facet dimensions, incident/observation geometry, and a polarization-aware or explicitly scalar model.

P.1410 provides a useful separate scalar diffuse-scatter discussion but warns that phase and polarization are not retained; it cannot be added to a coherent total-power result without an explicit incoherent/bandwidth policy. The audit contract therefore reports `diffuse_scattering_modelled=false`.

## 17. Reflector size and Fresnel zone

For the image path, a first scalar Fresnel radius is:

```text
r_F = sqrt(λ d1 d2 / (d1+d2))
```

At 140 GHz this gives 0.2314 m for 50/50 m, 0.3272 m for 100/100 m, 0.4627 m for 200/200 m, 0.2121 m for 30/70 m, and 0.1388 m for 10/90 m. The real footprint is an angle-dependent elliptical/phase zone. A future diagnostic should compare known facade segment and vertical extent with the relevant zone and qualify finite-edge cases; it should not invent a universal minimum surface area.

## 18. Far-field assumptions

P.525’s spherical-wave `1/r` behavior and the geometric-optics plane-wave coefficient require an appropriate distance regime. For a physical antenna aperture `D`, a standard bound is approximately `R_ff=2D²/λ`. At 140 GHz the bounds are 9.34 m for `D=0.1 m`, 37.36 m for `D=0.2 m`, and 84.06 m for `D=0.3 m`.

If physical aperture is unknown, antenna far-field validity cannot be proven. Gain must not be reverse-engineered into an aperture unless that is an explicit controlled bound. The facade must also be locally planar and sufficiently extended; curvature is a separate gate.

## 19. Atmospheric composition

The 4I.2A specific-loss ledger can be applied to a later reflected reference only as a separately declared path component. Integrate leg 1 and leg 2 independently:

```text
A_atm_total = A_leg1 + A_leg2
```

For homogeneous conditions this equals the specific attenuation times `d1+d2`; for variable profiles, each leg needs its own path integration. The direct Tx–Rx atmospheric ledger must not be silently reused for a broken path. No atmospheric integration is added in 4I.5A.

## 20. P.1411 separation

P.1411’s statistical median/basic-transmission-loss family and a deterministic single-bounce facade path are alternative model branches. The statistical measurement basis may already contain reflection and multipath effects. A future UI may show side-by-side values, but must not add a deterministic reflected path to a P.1411 median without calibration evidence.

## 21. P.526 separation

P.526 diffraction remains an alternative mechanism. Do not add a P.526 diffraction loss to the same isolated reflected ray. A total urban multipath model would need a separate field-based mechanism that owns both paths and their phase/coherence rules; that is explicitly outside 4I.5B’s first scope.

## 22. Coherent-multipath limitation

If direct and reflected paths are combined, the correct expression is:

```text
E_total = E_direct + E_reflected
```

not a power sum. It requires path-length phase, reflection phase, antenna phase, polarization vectors, spatial coherence, and bandwidth averaging. At 140 GHz, a 1 mm path error changes phase by approximately 168.1°. A 1 GHz bandwidth has a free-space coherence-length scale of about 0.3 m, but averaging is not automatic.

This is a stop for canonical coherent multipath. The first safe architecture is an isolated `reflected_path_reference_power` result.

## 23. Controlled 140 GHz derivation

The full hand-checkable fixture uses:

```text
facade: x=0, outward normal +x, exterior x>0
segment: y∈[-10,10] m, z∈[0,20] m
Tx: (50,-50,10) m
Rx: (50,50,10) m
f: 140 GHz, Pt=30 dBm, isotropic Tx/Rx, no other losses
material: user-declared lossless semi-infinite εr=4, air incident medium
```

The mirrored Tx is `(-50,-50,10)`, so `S=(0,0,10)`, `d1=d2=70.710678 m`, `L=141.421356 m`, and both angles are 45°. P.525 spreading is 118.380644 dB. The rejected two-FSPL sum is 224.720088 dB.

For TE, `Γ=-0.4514162296451364`, `|Γ|²=0.20377661238703051`, reflection loss is 6.9084566181195415 dB, and the isolated reference received power is -95.28910051020749 dBm. For TM, `Γ=0.20377661238703063`, `|Γ|²=0.04152490775593412`, reflection loss is 13.81691323623908 dB, and the isolated reference received power is -102.19755712832702 dBm.

This controlled material is not a calibrated Ankara facade and the result is not direct-plus-reflected power.

## 24. Ankara readiness

The current pack contains 161,784 loader-visible footprints and 936,651 outer-ring segments. Only 6,074 footprints (3.75%) have observed or levels-derived height evidence, covering 49,137 segments (5.25%). Material tags are absent; thickness, roughness, terrain, surveyed facade planes, and morphology/rooftop relations are absent.

An audit-only sample of six known towers, 72 full-azimuth rays each, and 400 m radius found 6,368 mathematical finite-edge image intersections across 430 of 432 paths and 2,113 footprint IDs. Only 777 candidates had height evidence under a declared flat relative datum; zero were terrain-anchored and zero had material evidence.

These counts are readiness evidence only. They are not viable reflected links, coverage, or specularity evidence. The details and reproducible command are in [the readiness JSON](concept-4i5a-ankara-readiness.json).

## 25. Measurement requirements

A reflection campaign intended to promote the reference would need, per observation:

- exact Tx/Rx coordinates and heights, time, orientation, and coordinate uncertainty;
- facade segment coordinates, plane normal, base/top height, curvature/setback, and reflector extent;
- material identity, layer stack, thickness, moisture/state, and electrical-property provenance;
- RMS roughness within the relevant Fresnel zone plus texture/correlation information;
- Tx/Rx antenna patterns, apertures, boresight, beam direction/codebook state, polarization, and cable/system calibration;
- carrier frequency, bandwidth, waveform, phase reference, dynamic range, and averaging policy;
- direct-path suppression or spatial/temporal separation method, with a measured reflected-path power quantity definition;
- weather and atmospheric state sufficient for a separate P.676/P.838/P.840 path ledger;
- repeated angles/distances and spatial holdouts so a material/facade result is not fit and evaluated on the same sample.

No campaign is invented by this audit. The existing 4I.3 validation foundation is the appropriate place for its versioned evidence once measurements exist.

## 26. 4I.5B go/no-go decision

Decision: **GO with hard gates for an isolated reference-only diagnostic; NO for canonical or network-coupled reflected propagation.**

The path-spreading equation is unambiguous for the declared ideal-planar branch, and P.2040 `Γ` composes cleanly once in field/power form. The model is useful as an inspectable reference when facade geometry and material inputs are explicit. It is not ready to auto-populate from the current Ankara pack.

The following remain hard stops: missing finite facade evidence, fallback-only height, unknown terrain when terrain matters, unknown material/thickness for the selected mode, unknown roughness when a specular claim is made, unproven two-leg visibility, missing TE/TM basis, and any request to produce direct-plus-reflected coherent network power.

## 27. Proposed 4I.5B contract if promoted

```text
model_id: single_bounce_specular_reflection_reference_v1
status: opt-in, reference_only
scope: one planar vertical facade, one finite segment, one reflected path
inputs: Tx/Rx ENU positions and heights, facade point/normal/segment/base/top,
        explicit interface or slab material contract, incidence polarization TE/TM,
        antenna direction/pattern inputs, terrain/flat-datum declaration
geometry: image-method S, d1, d2, L with finite segment and height gates
spreading: P.525 FSPL(L) / image-source field
material: one P.2040 complex field coefficient, |Γ|² once in power
visibility: independent Tx→S and S→Rx checks with endpoint exemption only
output: isolated reflected_path_reference_power plus applicability/reason ledger
excluded: diffuse scattering, curvature solver, multi-bounce paths, direct+reflected
          coherent sum, P.1411/P.526 addition, 80 dB heuristic addition,
          automatic OSM material inference, network/optimizer coupling
```

The first implementation should reject or qualify missing evidence rather than substitute generic values.

## 28. Invariance validation

The required exact invariance set is:

1. 2.6 GHz canonical propagation;
2. 28 GHz canonical propagation;
3. `research_sub_thz` 140 GHz dispatch and 80 dB/event heuristic;
4. 4I.2A atmospheric reference;
5. 4I.2B P.1411 reference;
6. 4I.3 measurement validation;
7. 4I.4 material/slab reference;
8. P.526 diagnostic;
9. building entry;
10. interference;
11. radio quality;
12. 4H.2 optimizer and Pareto outputs.

4I.5A changes only documentation, generated reference-page metadata, changelog/index text, and a test-only audit harness. No production RF file is changed by this concept.

## 29. Files changed

New audit artifacts:

- `docs/concept-4i5a-pre-change-baseline.json`
- `docs/concept-4i5a-reflection-audit.md`
- `docs/concept-4i5a-reflection-applicability.json`
- `docs/concept-4i5a-controlled-derivation.json`
- `docs/concept-4i5a-ankara-readiness.json`
- `backend-go/raytracer/concept_4i5a_reflection_audit_test.go` (test-only geometry/readiness fixtures)

Documentation registration, if generated, is limited to the reference-page build list, documentation index/changelog, and generated HTML/search artifacts. No production evaluator, route, UI control, or RF engine is added.

## 30. Remaining scientific limitations

This audit does not establish facade curvature, finite-aperture physical optics, edge diffraction, diffuse BRDF, multilayer/moisture variability, measured 140 GHz antenna phase, spatial coherence, or Ankara material transferability. It does not establish that a footprint edge is a physical reflector, and it does not convert sparse OSM/levels height tags into surveyed wall geometry.

The conclusion is therefore intentionally bounded: 4I.5B is scientifically defensible only as a separately labeled, evidence-gated, single reflected-path reference with explicit facade/material geometry. It must remain outside canonical propagation, `research_sub_thz`, P.1411, P.526, atmosphere, building entry, interference, radio quality, and optimization until independent validation justifies any broader composition.
