# Concept 4I.5B Single-Bounce Specular Reflection Reference

Concept 4I.5B adds an isolated, opt-in diagnostic for one explicitly declared specular reflection from one finite vertical planar facade. It is a reference ledger for RF engineers and reviewers, not a new propagation mode. The public model ID is `single_bounce_specular_reflection_reference_v1`, the readiness is `reference_only`, and the route is `POST /api/sub-thz-reflection-reference`.

## Model identity and boundary

The response always exposes `schema_version: 1`, `model_id`, `model_version: v1`, `readiness: reference_only`, `canonical: false`, `network_coupled: false`, `multipath_combined: false`, and `coherent_multipath_combined: false`. The evaluator is called only by the new route and direct unit tests; it is not dispatched by `/api/simulate`, coverage, interference, radio quality, building entry, recommendation, or either optimizer.

The route evaluates one declared Tx, Rx, facade segment, material declaration, polarization, terrain mode, and link budget. It does not select a reflector, search for a best path, create a direct path, sum multipath, or promote a result into a canonical/network profile.

## Applicability and status

`applicable_reference` means the explicit geometry, material, visibility, antenna, and evidence gates pass without a qualification. `qualified_reference` means a reflected-path result is available but one or more evidence items remain qualified, such as unknown roughness, unknown antenna far-field status, local-ENU visibility assumptions, or surveyed terrain not being available in the active dataset. `inapplicable` means a required gate fails; examples include a specular point outside the finite facade segment, an unknown vertical extent, a blocked leg, unsupported material frequency, or zero reflection at the numeric floor.

The response keeps the reason and qualification arrays separate. A qualification is not silently converted into a measured fact, and an inapplicable result does not manufacture received power.

## Explicit input contract

The request requires:

- frequency in `0.001–450 GHz`;
- Tx and Rx metric positions or WGS84 longitude/latitude plus explicit height;
- antenna mode and absolute gain, either on each antenna or as an explicit link-budget fallback;
- a finite facade `start`/`end`, geometry provenance, and either a unit outward normal or a polygon context from which the exterior normal can be derived;
- optional but explicit facade `base_z` and `top_z`; omitting either preserves an `inapplicable` vertical-extent result;
- material source, media, polarization (`TE` or `TM` only), terrain mode, and conducted transmitter power;
- an interface or finite-slab material mode.

No material default, facade height, antenna aperture, roughness, or atmosphere is invented. Generic `H`/`V` labels are rejected rather than silently mapped to TE/TM.

## Metric coordinate frame

Image geometry is never performed in longitude/latitude degrees. A `local_enu` request uses the supplied metric coordinates directly. A geographic request is transformed into a local ENU frame using an explicit WGS84 origin (or the Tx point when no origin is supplied), with east/north distances derived from the local latitude and Earth radius; endpoint heights remain the vertical coordinate. The response records the coordinate-system, projection, origin, transform description, and origin provenance.

## Image-source geometry

For a facade plane point `P0`, unit outward normal `n`, Tx point `T`, and Rx point `R`, the evaluator forms the mirrored transmitter

```text
T' = T − 2 n (n · (T − P0))
```

and intersects `T' → R` with the plane. The returned `image_intersection_t`, facade-segment parameter, reflection point, mirrored Tx, `d1`, `d2`, total path length, image path length, and image/path difference make the construction auditable. The point must be on the finite horizontal facade segment and within the declared vertical bounds. A point outside the segment, outside the vertical extent, or a degenerate/non-finite leg is inapplicable.

The incident vector is `k_i = normalize(S − T)` and the reflected vector is `k_r = normalize(R − S)`. The implementation checks `k_r = k_i − 2(k_i · n)n` and reports the specular equality error. Incidence and reflection angles are measured from the facade normal with `acos(abs(k · n))`; both are returned in degrees.

## TE/TM basis and phase

The deterministic local basis is:

```text
s = normalize(n × k_i)       (TE)
p = normalize(s × k_i)       (TM)
```

At normal incidence, TE uses projected ENU up (falling back to projected ENU north if necessary), then TM follows from the cross product. The response returns both basis vectors, the convention, and the normal-incidence flag. The complex P.2040 field coefficient is preserved as real part, imaginary part, magnitude, phase in radians/degrees, and power fraction. Phase is evidence; it is not discarded and is not combined with another path.

## P.2040 interface and finite slab

`material.mode: interface` evaluates the front interface coefficient once. `material.mode: finite_slab` requires explicit thickness, thickness provenance, coherent phase treatment (`coherent` or `coherent_total_slab`), incident medium, and exit medium. The finite slab reuses the isolated P.2040 material ledger and includes internal reflections in the total complex coefficient. The response exposes both the total coefficient and the first-interface coefficient.

The P.2040 material source may be an explicit covered reference row or an explicit user-declared electrical-property form. User properties retain their source and provenance. Inferred properties are rejected. A P.2040 row outside its documented frequency range is reported as inapplicable; it is never extrapolated.

The returned reflection power term is exactly `10 log10(|Γ|²)` and is applied once. The historical `research_sub_thz` wall heuristic is excluded and is never added to the P.2040 coefficient or link budget.

## Roughness and specularity

Optional RMS roughness produces the qualitative Rayleigh-style parameter

```text
g = 4π · rms_roughness / λ · cos(incidence_angle)
```

`g < 0.3` is reported as `supported_smooth`; larger values produce `rough_surface_warning`; omitted roughness produces `unknown`. This is a qualification only. Diffuse scattering, BRDF, edge diffraction, curvature, and a diffuse power budget are not modeled; `diffuse_scattering_modelled` is always false.

## Fresnel evidence

The response reports the scalar first-zone radius

```text
r_F = sqrt(λ d1 d2 / (d1 + d2))
```

and compares it qualitatively with available horizontal and vertical reflector extent. It reports whether both extents are known and whether the finite facade is smaller than the scalar zone. No hard aperture rule or hidden edge-diffraction loss is introduced.

## Antenna far-field evidence

Physical aperture is accepted only when explicitly supplied. The diagnostic computes, per relevant leg,

```text
R_ff ≈ 2D² / λ
```

and compares `d1` with the Tx bound and `d2` with the Rx bound. Gain is never reverse-engineered into aperture. Missing aperture produces `far_field_status: unknown`; a failing explicit aperture comparison produces a warning qualification.

## Two-leg visibility

The Tx-to-reflector and reflector-to-Rx legs are evaluated independently. The route accepts explicit ENU obstruction polygons for controlled or user-scoped checks and can inspect the active dataset when the request is geographic. Positive-length interior penetration blocks a leg. A zero-length contact at the selected reflector endpoint is exempt only when the object is explicitly marked as the reflector; a reflector polygon that penetrates a leg remains blocking. Unknown building height produces unknown visibility rather than an invented roof height.

The local-ENU controlled fixture has no dataset projection, so its response records a visible result with an explicit local-ENU visibility qualification. Surveyed terrain records dataset availability or an explicit unavailable qualification; flat mode records the relative-datum assumption.

## Spreading and FSPL

The reflected path is one physical path with `L = d1 + d2`. The only spreading term is

```text
FSPL(L) = 20 log10(4π L / λ)
```

The response sets `two_leg_fspl_composition: false` and records the image-path equivalent. It never computes `FSPL(d1) + FSPL(d2)`, never applies two independent inverse-square factors, and never uses a wall-event heuristic as spreading.

## Antenna directions

Tx output contains departure azimuth/elevation toward the reflection point. Rx output contains the arrival/look azimuth/elevation from Rx toward the reflection point. Directional modes use the existing deterministic antenna pattern evaluator, while isotropic/omni modes retain zero pattern attenuation. The response exposes absolute gains, pattern attenuation, hard-beam eligibility, and the reason for any directional exclusion.

## Reflected-path link budget

The diagnostic returns all ledger terms even when the reflection coefficient is zero or below the numeric floor:

```text
Pr_ref_dBm = Pt_conducted
           + Gt_absolute − A_tx_pattern
           + Gr_absolute − A_rx_pattern
           − L_system − L_polarization
           + calibration
           − FSPL(L)
           + 10 log10(|Γ|²)
```

The reflected-path reference power is omitted when `|Γ|²` is zero/below the numeric floor or the resulting value is non-finite. This avoids `−Inf`/`NaN` in JSON while preserving the reason in applicability. There is no receiver-sensitivity, serviceability, interference, or radio-quality decision in this ledger.

## Exclusions and non-combination rules

The response explicitly excludes direct-plus-reflected coherent summation, multi-bounce reflection, diffuse scattering, curvature, finite-edge diffraction, automatic OSM material inference, atmosphere composition, P.1411 composition, P.526 composition, the research 80 dB wall addition, and all canonical/network/optimizer coupling. `canonical`, `network_coupled`, `multipath_combined`, `coherent_multipath_combined`, `direct_path_calculated`, and `atmosphere_composition_supported` remain false.

## Controlled 140 GHz fixture

The regression fixture uses local ENU coordinates, a facade on `x=0` from `y=-10 m` to `y=10 m`, `z=0–20 m`, Tx `(50,-50,10)`, Rx `(50,50,10)`, unit normal `(1,0,0)`, 30 dBm conducted power, isotropic 0 dBi antennas, air on both sides, user-declared lossless `εr=4`, zero conductivity, flat relative-datum terrain, and no roughness or aperture assumption.

The reflection point is `(0,0,10)`, `d1=d2=70.71067811865476 m`, `L=141.4213562373095 m`, and both angles are `45°`. At 140 GHz, the total-path FSPL is `118.38064389208795 dB`. TE returns `Γ=-0.4514162296451364`, `|Γ|²=0.20377661238703051`, and `Pr_ref=-95.28910051020749 dBm`; TM returns `Γ=0.20377661238703063`, `|Γ|²=0.04152490775593412`, and `Pr_ref=-102.19755712832702 dBm`.

The rejected two-leg comparison would be `FSPL(d1)+FSPL(d2)=224.72008795761664 dB`; it is included only as a regression guard and is not used by the evaluator.

## API and frontend surface

The route returns `400` for malformed or underspecified input, `429`/`504` through the shared RF route handling, and a JSON ledger for valid requests, including inapplicable reference outcomes. The OpenAPI contract names the request and response schemas. The RF Diagnostics panel uses progressive disclosure: geometry and facade evidence first, material/polarization next, then roughness, antenna evidence, terrain, and link budget. Its identity and subtitle visibly state that the evaluator is isolated and not used by network simulation.

The frontend payload builder emits explicit local ENU coordinates, antenna assumptions, facade geometry/provenance, medium properties, TE/TM, flat terrain, and link-budget terms. It does not silently bind the panel to the active network propagation model.

## Validation and invariance

The backend has controlled TE/TM, total-path FSPL, geometry/height gate, visibility/self-contact, zero-reflection finite-JSON, fingerprint, and finite-slab alias tests. Route tests verify the isolated identity and RF protection. The frontend has payload-builder and panel tests. The pre-change baseline and post-change comparison artifacts record canonical snapshot invariants, including the existing 2.6 GHz, 28 GHz, and research 140 GHz identities and values.

The expected quality commands are:

```text
cd backend-go && go vet ./... && go test -race ./...
cd frontend-react && npm run lint && npm test -- --run && npm run build
python3 docs/validate_docs.py
python3 scripts/versioning.py check
```

## Scalability and promotion gate

One evaluation is a bounded constant-size geometry/material/visibility calculation. Explicit obstruction checks are limited to the supplied scope; dataset checks use the existing spatial index and do not search candidate reflectors. The result is appropriate for a diagnostic request or controlled fixture, not for per-pixel network rasterization. No result is promoted to canonical propagation or a network optimizer. Promotion would require measured specular-path validation, material/facade evidence, roughness and aperture distributions, visibility/terrain evidence, direct-path and multipath policy, and a separately approved canonical integration contract.

## Deferred work

Deferred items are explicit: automatic facade candidate selection, image geometry over arbitrary non-planar/curved surfaces, edge diffraction, diffuse/BRDF scattering, atmospheric composition, coherent direct-plus-reflected channels, polarization conversion, frequency-dependent roughness statistics, dataset material classification, and any canonical/network integration. These are not hidden behind the current reference-only status.

## Required artifacts

The corresponding audit package is:

- [`concept-4i5b-pre-change-baseline.json`](concept-4i5b-pre-change-baseline.json)
- [`concept-4i5b-controlled-fixtures.json`](concept-4i5b-controlled-fixtures.json)
- [`concept-4i5b-reference-comparison.json`](concept-4i5b-reference-comparison.json)
- [`concept-4i5b-post-change-comparison.json`](concept-4i5b-post-change-comparison.json)
- this design note

Together they preserve the pre-change identity/value snapshots, independently describe the controlled 140 GHz TE/TM fixture, compare the reflected-path reference with direct/P.525/P.1411/research alternatives without combining them, and record post-change tests plus the unchanged canonical/network contract.
