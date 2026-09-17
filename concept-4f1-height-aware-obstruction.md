# Concept 4F.1 — Height-aware centerline obstruction

Concept 4F.1 upgrades the `urban_short_range` LOS/NLOS branch from a footprint-boundary event to a deterministic geometric Tx-to-Rx centerline test. The path-loss equations, 3GPP UMa applicability envelope, legacy wall model, 140 GHz research profile, Fresnel diagnostics, diffraction work, terrain import, and optimizer objective definitions are unchanged.

The measured pre-change urban baseline is preserved in [`concept-4f1-pre-change-baseline.json`](concept-4f1-pre-change-baseline.json). The post-change transition, height-evidence, optimization, and performance ledger is [`concept-4f1-canonical-audit.json`](concept-4f1-canonical-audit.json). The earlier Concept 4D comparison remains the source for the controlled RF links.

## Scope and model boundary

The height-aware classifier applies only when the requested model is `urban_short_range` at the supported planning frequencies 2.6 GHz and 28 GHz. `legacy_fspl_walls` keeps its historical 2D wall-event behavior, and `research_sub_thz` keeps its research-only behavior. The production branch does not add Fresnel clearance, diffraction, reflection, DEM/DSM fusion, or sampled vertical profiles.

The current Ankara dataset has no terrain layer. Every height-aware network result therefore reports `terrain_status: "terrain_unavailable"` and compares building roofs against flat-ground relative Tx/Rx heights. This is explicit metadata, not a measured zero-elevation claim. A future terrain provider must declare whether its heights are DTM or DSM before terrain and building heights are fused; DSM heights must not be added to building roof heights a second time.

## Height evidence contract

Building loading preserves the display height used by existing APIs while adding separate roof-evidence provenance:

| Input | Display height | Roof evidence | Evidence source |
| --- | ---: | --- | --- |
| reliable OSM `height` | parsed metres | usable | `observed_tag` |
| `building:levels` | levels × 3 m | usable | `derived_from_levels` |
| no reliable height | existing 9 m fallback | unavailable | `unavailable` |

The generic 9 m `default-3-storey` value remains available for display and legacy behavior, but it is never treated as a roof measurement. `BuildingDemandSummary` and `AuditBuildingHeightEvidence` expose counts and percentages for observed, levels-derived, fallback-only, and unavailable footprints. Building feature responses expose `height_evidence_m`, `height_evidence_source`, `height_evidence_tag`, and `logical_building_id`.

## Centerline rule

For every footprint interval `[t_entry, t_exit]` along the complete Tx-to-Rx path, the classifier uses the flat-ground line

```text
h_los(t) = h_tx + (h_rx - h_tx) t,    0 <= t <= 1
```

The known roof blocks when it reaches or exceeds the line anywhere in the interval. In the implementation this is equivalent to testing the minimum endpoint line height for the linear height function, with a tiny deterministic geometric epsilon only for equality. Exact roof touch is therefore NLOS; there is no Fresnel margin. A known roof below the line throughout the interval is recorded as cleared and does not force NLOS.

The shared result identifies the classifier as `footprint-height-los-v1` and carries:

- `state`, `endpoint_case`, `classification_basis`, and `terrain_status`;
- blocking, cleared, and unknown-height building evidence;
- `t_entry`, `t_exit`, LOS heights, roof height, minimum clearance, and logical/part IDs for each reported obstruction.

Unknown-height intersections are conservative NLOS with `classification_basis: "conservative_2d_unknown_height"`. A path containing both a known blocker and an unknown-height intersection reports `known_obstruction_with_unknown_height_conservative`. No-footprint and known-cleared paths remain LOS. Indoor transmitter/receiver and unavailable building-data cases remain explicit non-outdoor endpoint/applicability cases.

The interval construction retains multiple crossings, concave/multipart crossings, zero-length grazing contacts, and endpoint-inside behavior. When the source feature supplies a logical identity, multipart rings are grouped into one physical-building evidence record with multiple intervals; a building-entry target excludes all of its logical parts from the outdoor leg. Sources without logical identity use the footprint ID as their physical identity.

## Shared engine integration

The same classifier and `PropagationResult` metadata are used by:

- segmented direct rays and their GeoJSON ray properties;
- coverage-surface grid centers and surface model metadata;
- interference carrier powers and serving-cell properties;
- network coverage/reach/overlap scoring and optimizer evaluations;
- building-entry outdoor legs, with the target facade excluded from the outdoor obstruction search.

Ray segmentation remains representational: each endpoint is evaluated from its physical path distance, and splitting a path cannot add propagation loss. The height-aware result is diagnostic/classificatory only; the existing `urban_short_range` LOS/NLOS formulas are unchanged. Optimizer objectives and weights are unchanged, so any score movement is measured shared-RF classification impact.

## Canonical Ankara audit

The gated test `TestCanonicalAnkaraHeightAwareClassificationAuditWhenDatasetIsEnabled` runs the six-cell, 28 GHz, 400 m, 72-ray Ankara scenario against the real 161,784-footprint dataset. The current height-evidence audit is:

```text
observed_tag:          1,108 (0.68%)
derived_from_levels:   4,966 (3.07%)
fallback-only:       155,710 (96.25%)
unavailable:               0 (0.00%)
```

The 432 audited paths are deterministic: 29 `los → los`, 248 `nlos → nlos`, and 155 `unknown → unknown`, with no canonical `nlos → los` or `los → nlos` transition because the intersected Ankara paths are dominated by fallback-only evidence and mixed known/unknown cases. The representative bases include no-footprint LOS, conservative unknown-height NLOS, known obstruction plus unknown-height conservative NLOS, transmitter/receiver indoor cases, and unchanged old/new state pairs. Controlled ledgers cover known roof blocking, known roof clearing, exact roof touch, tangent contact, multipart grouping, target-facade exclusion, legacy numerical invariance, and direct/surface/interference consistency.

The urban optimizer remains the same six-cell objective workload. In the post-change ledger, baseline/optimized network scores are `13,509,330.8`/`32,568,641.1`, composite scores are `0.391373`/`0.489145`, propagation reach is `18,330.7658`/`22,141.1276`, and overlap buildings are `10`/`0`; the optimized azimuths are `[150, 300, 110, 300, 290, 100]`. The height-aware optimizer timer is 18.484 s versus the preserved 17.78 s pre-change reference. The measurements use different harness boundaries (full canonical wall time versus optimizer-only timer), so they are a bounded ledger rather than a strict apples-to-apples percentage.

## Limitations

This is a deterministic centerline visibility branch, not a full 3D ray tracer. It does not model roof-edge diffraction, Fresnel clearance, reflections, materials, terrain occlusion, foliage, clutter, or interior room/floor paths. Unknown building heights intentionally bias toward NLOS. A future DTM/DSM-aware extension must publish its vertical reference and validation evidence before changing this contract.

## Operational references

- [Concept 4F.1 pre-change baseline](concept-4f1-pre-change-baseline.json)
- [Concept 4D urban propagation reference](concept-4d-urban-propagation.md)
- [API reference](api.md)
- [Modeling limits](modeling-limits.md)
