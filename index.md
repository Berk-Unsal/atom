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
- [Concept 4F.1 height-aware obstruction](concept-4f1-height-aware-obstruction.md): height provenance, deterministic centerline roof blocking, conservative unknown-height behavior, terrain status, multipart identity, and canonical audit.
- [Concept 4F.2 diffraction diagnostic](concept-4f2-diffraction-diagnostic.md): P.526-16 single-edge reference math, obstruction ledgers, known-height applicability, canonical comparison, and diagnostic-only boundaries.
- [Concept 4G.1 antenna and link-budget foundation](concept-4g1-antenna-link-budget.md): conducted-power/EIRP semantics, absolute gain versus relative pattern attenuation, shared antenna evaluation, explicit RX/polarization terms, reference single-element behavior, diagnostics, and compatibility evidence.
- [Concept 4G.2 receiver noise and sensitivity](concept-4g2-receiver-noise-sensitivity.html): deterministic `kTB`-based thresholds, manual compatibility mode, strict link margin, bandwidth provenance, per-cell integration, interference separation, and canonical comparison evidence.
- [Concept 4H.1 interference and radio quality](concept-4h1-interference-radio-quality.html): inspectable carrier/reference-resource power, serving selection, exact co-channel eligibility, thermal noise, planning RSRP/RSRQ/SINR semantics, outage diagnostics, and scenario fingerprints.
- [Concept 4H.2 interference-aware optimization](concept-4h2-radio-quality-optimization.html): opt-in fixed-domain radio-quality serviceability objective, denominator/no-carrier semantics, Pareto and reranking behavior, finite horizon, compatibility evidence, and canonical enabled experiment.
- [API reference](api.html) and [OpenAPI contract](openapi.yaml): documented REST interfaces and response behavior.
- [Bug-fix register](bug-fixes.html): confirmed defects, priority, correction, and regression evidence.

## Release Status

The current source version is [`0.7.0`](../VERSION). User-visible changes are published in the documentation [changelog](changelog.html), generated from the canonical root `CHANGELOG.md`. A matching `vX.Y.Z` tag validates metadata, publishes the container images, and creates the GitHub Release announcement from that changelog section.

## Model Boundary

Results are deterministic planning estimates based on static dataset packs, an explicit propagation mode, configured antenna behavior, beam eligibility, and shared footprint geometry. The separate 2.5D path profiler can also use optional COG/GeoTIFF terrain, building height, LOS/Fresnel geometry, and selected sensitivity components. None of these outputs are drive-test, UE, PHY, or live-network measurements. See [modeling limits](modeling-limits.html) before using outputs for engineering decisions.
