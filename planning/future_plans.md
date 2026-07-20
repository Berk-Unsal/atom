# Product Roadmap Status

This file tracks the scoped planning-product roadmap. A.T.O.M remains deterministic, local-first, and explainable; it is not expanding into a general-purpose telecom simulator.

Read [Product Compass](product-compass.md) before proposing new capabilities. It defines the enduring product strengths, feature-admission test, capability horizons, and deliberate non-goals behind this roadmap.

## Implemented Foundation

| Capability | Status | Product boundary |
|---|---|---|
| Project and scenario lifecycle | Implemented | Browser IndexedDB plus versioned project import/export; no accounts or shared backend storage |
| Two-scenario comparison | Implemented | KPI deltas and A/B map switch, not simultaneous competing surfaces |
| Result explainability | Implemented | Contextual Inspector explanations and persistent planning-estimate notice |
| Runtime reproducibility | Implemented | `/api/meta`, exact scenario requests, model/dataset metadata, reports, and OpenAPI 3.1 |
| Candidate site recommendation | Implemented | Bounded deterministic scoring from known candidate records; no site-availability claim |
| Validated dataset packs | Implemented | Startup-selected manifests and CLI validation; no browser ingestion |
| Measurement validation | Implemented | Residual analysis and holdout-tested global bias correction; not full calibration |

## Release Completion Work

| Capability | Priority | Exit condition |
|---|---:|---|
| Multi-architecture tagged images | P0 | GHCR publishes immutable version and commit metadata for AMD64 and ARM64 |
| Browser workflow coverage | P0 | Playwright verifies principal desktop/mobile workflows, project persistence, and conditional controls |
| Additional dataset-pack fixture | P1 | A second small pack validates portability without distributing another full city dataset |
| Measurement reference set | P1 | A documented, redistributable sample demonstrates residual and holdout behavior |

## Research-Gated Model Depth

| Candidate | Gate before implementation | Reason for deferral |
|---|---|---|
| 3GPP urban micro/macro profile | Standards-specific applicability checks, tests, and comparison against measurement evidence | Adding an equation without validated ranges would reduce credibility |
| Terrain-aware line of sight | Licensed GeoTIFF data declared by a dataset manifest plus bounded sampling design | Terrain files and CRS handling materially change pack validation and memory use |
| Material-specific penetration | Authoritative material properties and enough measurements to validate them | OSM tags alone are too sparse and inconsistent for confident coefficients |
| Equity, emergency, cost, or backhaul scoring | Dataset packs with authoritative population, priority, cost, or infrastructure inputs | A.T.O.M will not manufacture operational recommendations from guessed data |

## Explicitly Deferred

- Full 3D ray tracing, reflections, diffraction, fading, MIMO scheduling, and UE mobility.
- Live operator-network control, LTE/EPC modeling, and 6G Core integration.
- In-app arbitrary-city OSM/OpenCellID ingestion.
- Cloud accounts, permissions, shared editing, and hosted project storage.
- Plugin infrastructure or additional permanent navigation tools.

The current v1 completion target is a reproducible planning workflow: create a project, compare scenarios, explain results, recommend bounded options, validate against measurements, and export evidence with exact runtime metadata.
