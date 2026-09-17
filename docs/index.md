# A.T.O.M Documentation

A.T.O.M, the Ankara Telecom Optimization Model, is a deterministic, planning-grade RF analysis application for 4G LTE, 5G mmWave, and an explicitly experimental 6G research profile at 140 GHz.

Use the [documentation hub](index.html) for the maintained browser experience. It links to the current workspace, installation steps, model limits, and printable technical references.

## Start Here

- [Architecture](architecture.html): browser-to-backend request paths, spatial indexing, RF engines, reliability controls, and 5G communication paths.
- [Download and use](download.html): Git LFS cloning, Docker Compose, local development, readiness checks, and first workflows.
- [Capabilities](features.html): current supported planning workflows and technology boundaries.
- [Modeling limits](modeling-limits.html): what the deterministic model includes and excludes.
- [Concept 4D urban propagation](concept-4d-urban-propagation.md): selectable model modes, UMa equations, LOS/NLOS rule, fallback policy, and baseline artifact. The [canonical comparison](concept-4d-canonical-comparison.json) records the real Ankara legacy-versus-urban run.
- [Concept 4E building entry](concept-4e-building-entry.html): deterministic facade-entry semantics, TR 38.901 O2I loss profiles, material audit, API contract, caching, and canonical Ankara ledger.
- [API reference](api.html) and [OpenAPI contract](openapi.yaml): documented REST interfaces and response behavior.
- [Bug-fix register](bug-fixes.html): confirmed defects, priority, correction, and regression evidence.

## Release Status

The current source version is [`0.6.0`](../VERSION). User-visible changes are published in the documentation [changelog](changelog.html), generated from the canonical root `CHANGELOG.md`. A matching `vX.Y.Z` tag validates metadata, publishes the container images, and creates the GitHub Release announcement from that changelog section.

## Model Boundary

Results are deterministic planning estimates based on static dataset packs, an explicit propagation mode, configured antenna behavior, beam eligibility, and shared footprint geometry. The separate 2.5D path profiler can also use optional COG/GeoTIFF terrain, building height, LOS/Fresnel geometry, and selected sensitivity components. None of these outputs are drive-test, UE, PHY, or live-network measurements. See [modeling limits](modeling-limits.html) before using outputs for engineering decisions.
