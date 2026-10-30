# Product Roadmap Status

Reconciled 26 October 2026 against source VERSION **0.13.0** and the current public issue backlog. Status describes the implemented scope below, not a release commitment or a claim of measured RF accuracy. Live issues remain authoritative for work ownership and prerequisites.

Read the public [capability inventory](../docs/features.md), [modeling limits](../docs/modeling-limits.md) and [product roadmap](../docs/product-roadmap-post-audit.md) before proposing new capabilities. No maintainer-local Product Compass file is required. A.T.O.M remains deterministic, local-first and explainable.

## Implemented foundation

| Capability | Status | Current evidence and boundary |
| --- | --- | --- |
| Project and Scenario lifecycle | Implemented | [Project store](../frontend-react/src/utils/projectStore.js) and [portable format](../docs/project-format.md): browser-local drafts, immutable Versions, bounded retained Scenario evidence and import/export; no accounts or shared backend storage. |
| Plan comparison | Implemented | [Compare helper](../frontend-react/src/utils/spatialComparison.js) and [API](../docs/api.md): retained KPI/input comparisons and A/B surfaces; an explicit compatible-network request can map served/lost/overlap changes. |
| Result explainability | Implemented | [Results](../frontend-react/src/App.jsx), [report reader](../docs/report-guide.md) and [modeling limits](../docs/modeling-limits.md): current/historical/stale context, quantities, provenance and explicit evidence limits. |
| Runtime reproducibility | Implemented | [API routes](../backend-go/main.go), [OpenAPI](../docs/openapi.yaml) and [reports](../frontend-react/src/utils/reportModel.js) retain request, model, dataset and generator identity. Hashes verify identity/integrity, not physical accuracy. |
| Candidate Cell recommendation | Implemented | [Recommendation engine](../backend-go/raytracer/recommendation.go): bounded deterministic scoring of existing planning records, with at most five existing input Cells; no ownership or site-availability claim. |
| Validated dataset packs | Implemented | [Dataset runtime](../backend-go/dataset_runtime.go) and [Pack Studio](../docs/dataset-pack-studio.md): local pack generation/validation, startup selection and safe installed-pack switching; no live browser ingestion. |
| Measurement evaluation tooling | Implemented | [Measurement engine](../backend-go/raytracer/measurements.go) and [field-validation scope](../docs/concept-6a-canonical-rf-validation.md): residual/holdout tooling and explicit scalar-bias review exist; this does not establish a usable canonical field reference set or full calibration. |

## Release and test work already delivered

These rows replace the former release-completion queue; they must not be recreated as unfinished product features.

| Capability | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Multi-architecture tagged images | Implemented | [Release workflow](../.github/workflows/release.yml) verifies VERSION/tag consistency and builds Linux AMD64/ARM64 with OCI version/commit labels, SBOM and provenance; [v0.13.0](https://github.com/Berk-Unsal/atom/releases/tag/v0.13.0) is published. A new release still requires its own successful workflow. |
| Browser workflow coverage | Implemented | [Playwright configuration](../frontend-react/playwright.config.js), [workspace E2Es](../frontend-react/e2e/workspace.spec.js) and [Quality CI](../.github/workflows/quality.yml) cover desktop/tablet/mobile workflows and persistence. Mocked workflows, real-backend qualification and native desktop qualification have distinct scopes. |
| Additional dataset-pack fixture | Implemented | The [small sample pack](../backend-go/raytracer/testdata/sample-pack/manifest.json) and [pack tests](../backend-go/dataset_runtime_test.go) exercise portability without shipping another city. It is a synthetic tooling fixture, not field measurements. |
| Measurement reference set | Blocked | Synthetic measurement/holdout fixtures demonstrate tooling only. [#87](https://github.com/Berk-Unsal/atom/issues/87), [#88](https://github.com/Berk-Unsal/atom/issues/88), [#89](https://github.com/Berk-Unsal/atom/issues/89) and [#90](https://github.com/Berk-Unsal/atom/issues/90) require authoritative serving identity, transmitter/resource truth, compatible licensed observations and independent receiver/LOS evidence before canonical real-world validation. More rows or guessed defaults do not close these gates. |

## Model depth and desktop dependencies

| Candidate | Status | Implemented subset and gate before more work |
| --- | --- | --- |
| 3GPP urban micro/macro profiles | Partial | [Canonical UMa median path loss](../docs/modeling-limits.md) is implemented at its declared 2.6/28 GHz scope. A separate UMi profile, full channel model or measured-accuracy claim is not implied; external validation remains gated by #87–#90. |
| Terrain-aware line of sight | Partial | [Point-to-point path diagnostics](../docs/modeling-limits.md) can consume a declared supported terrain layer. Fast sector/network/optimization engines do not. Extending canonical terrain behavior needs a separate scoped design, licensed data and bounded applicability/validation evidence. |
| Material-specific penetration | Partial | [Building entry](../docs/concept-4e-building-entry.md) and [isolated material references](../docs/concept-4i4-material-facade-reference.md) exist in their stated scopes. OSM tags and configured controls do not establish surveyed material properties or measured canonical penetration accuracy. |
| Equity, emergency, cost or backhaul scoring | Deferred | [Modeling limits](../docs/modeling-limits.md) exclude guessed operational scoring. Authoritative population, priority, cost and infrastructure inputs and an admitted objective would be required. |
| Native desktop delivery | Blocked | [Desktop roadmap #147](https://github.com/Berk-Unsal/atom/issues/147) and [qualification #148](https://github.com/Berk-Unsal/atom/issues/148) retain explicit gates. The Electron spike and opt-in sidecar protocol do not constitute a production shell, installer or accepted native Wayland dialog check. |

## Explicitly deferred

| Candidate | Status | Scope evidence |
| --- | --- | --- |
| Full 3D/multipath RF, multi-obstacle diffraction, fading, MIMO scheduling and UE mobility | Deferred | [Modeling limits](../docs/modeling-limits.md); isolated diffraction/reflection reference endpoints are not combined canonical propagation or a complete simulator. |
| Live operator-network control, LTE/EPC modeling and 6G Core integration | Deferred | [Core Lab scope](../docs/features.md); the existing optional 5G overlay does not supply these capabilities. |
| In-app arbitrary-city live OSM/OpenCellID ingestion | Deferred | [Dataset Pack Studio](../docs/dataset-pack-studio.md) remains an explicit local pack-generation workflow. |
| Cloud accounts, permissions, shared editing and hosted project storage | Deferred | [Local project contract](../docs/project-format.md); local review packages do not create hosted collaboration. |
| Plugin infrastructure or more permanent navigation tools | Deferred | [Current workspace inventory](../docs/features.md) has 14 tools in four stages; no new tool or plugin system is promised. |

The [API contract](../docs/openapi.yaml) is version **1.0.0**. Application releases follow root [VERSION](../VERSION); neither this roadmap nor an API version identifies a future application milestone. There is no admitted webhook/custom-model release commitment here. Preserve dated research and qualification records with their original scopes.
