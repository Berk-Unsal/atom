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
- [Concept 4F.3A spatial evidence foundation](concept-4f3a-spatial-evidence-foundation.md): DTM/DSM semantics, vertical-datum gates, windowed raster sampling, building base/roof evidence, external-height matching, provenance ledgers, Ankara readiness, and the 4F.3B promotion gate.
- [Concept 4F.3A.1 external height pilot](concept-4f3a1-external-height-source.md): bounded Microsoft GlobalMLBuildingFootprints acquisition, exact Ankara tile QA, normalized height matching, source agreement, provenance, diagnostic impact, and the 4F.3B GO/NO-GO decision.
- [Concept 4F.3A.2 GBA.Height Ankara pilot](concept-4f3a2-gba-height-source.md): official GlobalBuildingAtlas raster acquisition, license/semantics audit, footprint sampling, height agreement, precedence comparison, readiness impact, and the 4F.3B NO-GO decision.
- [Concept 4G.1 antenna and link-budget foundation](concept-4g1-antenna-link-budget.md): conducted-power/EIRP semantics, absolute gain versus relative pattern attenuation, shared antenna evaluation, explicit RX/polarization terms, reference single-element behavior, diagnostics, and compatibility evidence.
- [Concept 4G.2 receiver noise and sensitivity](concept-4g2-receiver-noise-sensitivity.html): deterministic `kTB`-based thresholds, manual compatibility mode, strict link margin, bandwidth provenance, per-cell integration, interference separation, and canonical comparison evidence.
- [Concept 4H.1 interference and radio quality](concept-4h1-interference-radio-quality.html): inspectable carrier/reference-resource power, serving selection, exact co-channel eligibility, thermal noise, planning RSRP/RSRQ/SINR semantics, outage diagnostics, and scenario fingerprints.
- [Concept 4H.2 interference-aware optimization](concept-4h2-radio-quality-optimization.html): opt-in fixed-domain radio-quality serviceability objective, denominator/no-carrier semantics, Pareto and reranking behavior, finite horizon, compatibility evidence, and canonical enabled experiment.
- [Concept 4I.1 140 GHz applicability audit](concept-4i1-140ghz-audit.html): exact `research_sub_thz` baseline, clause-level ITU/3GPP applicability, independent atmospheric/material fixtures, transferability, double-counting, and the 4I.2 roadmap.
- [Concept 4I.2A atmospheric reference](concept-4i2a-atmospheric-reference.html): opt-in `sub_thz_atmospheric_reference_v1`, componentized P.525/P.676/P.838/P.840 ledgers, controlled fixtures, and canonical isolation.
- [Concept 4I.2B P.1411 candidate reference](concept-4i2b-p1411-reference.html): strict Table 4 applicability gates, 140 GHz envelopes, provenance, median-only statistics, side-by-side comparisons, and Ankara readiness.
- [Concept 4I.3 measurement validation](concept-4i3-measurement-validation.html): versioned measurement campaigns, quantity semantics, applicability-first reference adapters, deterministic calibration/spatial holdouts, metadata-only external evidence, and the Ankara campaign gap.
- [Concept 6A canonical RF validation](concept-6a-canonical-rf-validation.html): source-independent 2.6/28 GHz observations, canonical primitive reuse, quantity-safe residuals, deterministic matching, spatial/site/campaign holdouts, and conservative no-data readiness.
- [Concept 6A.1 campaign tooling](concept-6a1-campaign-tooling.html): Ankara receive-side acquisition, Signal Collector V6 raw preservation, transmitter truth mapping, quantity-specific readiness, dry-run validation, and the Concept 6B gate.
- [Concept 7C durable local run history](concept-7c-run-history.md): separate local IndexedDB storage, exact draft execution snapshots, compact simulation and optimization records, lifecycle recovery, lineage, deletion, and history UI behavior.
- [Concept 4I.4 material and facade reference](concept-4i4-material-facade-reference.html): isolated P.2040-4 homogeneous slab evaluation, explicit electrical properties and provenance, TE/TM complex coefficients, applicability, numerical floors, controlled fixtures, and separate 80 dB comparison.
- [Concept 4I.5A specular reflection audit](concept-4i5a-reflection-audit.html): image-method geometry, ideal-plane spreading, P.2040 coefficient composition, finite facade/height/roughness/visibility gates, Ankara readiness, and the isolated 4I.5B contract.
- [Concept 4I.5B specular reflection reference](concept-4i5b-specular-reflection-reference.html): explicit one-bounce image geometry, finite facade and vertical gates, P.2040 TE/TM interface or slab coefficients, two-leg visibility, evidence qualifications, reflected-path link budget, and reference-only boundaries.
- [API reference](api.html) and [OpenAPI contract](openapi.yaml): documented REST interfaces and response behavior.
- [Bug-fix register](bug-fixes.html): confirmed defects, priority, correction, and regression evidence.

## Release Status

The current source version is [`0.8.0`](../VERSION). User-visible changes are published in the documentation [changelog](changelog.html), generated from the canonical root `CHANGELOG.md`. A matching `vX.Y.Z` tag validates metadata, publishes the container images, and creates the GitHub Release announcement from that changelog section.

## Model Boundary

Results are deterministic planning estimates based on static dataset packs, an explicit propagation mode, configured antenna behavior, beam eligibility, and shared footprint geometry. The separate 2.5D path profiler can also use optional COG/GeoTIFF terrain, building height, LOS/Fresnel geometry, and selected sensitivity components. None of these outputs are drive-test, UE, PHY, or live-network measurements. See [modeling limits](modeling-limits.html) before using outputs for engineering decisions.
