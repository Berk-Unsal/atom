# Changelog

All notable changes to A.T.O.M are recorded here. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and this file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- Pin container base images by digest, lock Python dependencies and hashes, review pull-request dependency changes, scan production images, and publish release SBOM and provenance attestations.
- Upgrade backend and adapter builds to Go 1.26, frontend and CI builds to Node.js 24 LTS, and runtime containers to Alpine 3.24 so maintained toolchains provide current security fixes.
- Protect the full building-dataset response with strong ETag caching, conditional `304` responses, separate global and per-client transfer budgets, and optional origin API-key authentication.
- Bound segmented simulations to 25,000 estimated and actual GeoJSON features, reject oversized ray/radius combinations before allocation, and cancel parallel ray workers if building splits exhaust the shared feature budget.
- Pin every external GitHub Action to an immutable commit SHA, stop checkout from persisting release credentials, and enforce pinned workflow dependencies in CI.
- Upgrade `golang.org/x/net` to v0.57.0 and its security-sensitive transitive modules, add `govulncheck` to backend CI, and enable weekly Go module updates.

### Fixed

- Serialize browser workspace commits, arbitrate IndexedDB and fallback copies by persistence revision, and reserve local storage for failed primary writes instead of duplicating every payload.
- Store recommendation details once in the canonical response array and reference them from GeoJSON features by stable feature ID, including compaction of legacy scenario artifacts.
- Generate backend, Core Lab adapter, and frontend scenario/RF policy bindings from one canonical source, and share one tower input type across RF endpoints.

## [0.3.0] - 2026-07-26

### Fixed

- Compute sector propagation and coverage gaps from one shared ray-profile pass instead of launching duplicate frontend requests.
- Remove the tracked OSMnx response cache and exclude regenerated pipeline caches from Git and Docker build contexts.
- Protect expensive RF routes with per-client concurrency and request budgets, optional API-key authentication, computation deadlines, and deep-loop cancellation.

## [0.2.0] - 2026-07-24

### Added

- Add keyboard-accessible full-site search to the static documentation website.
- Publish the canonical project changelog as a searchable documentation page.

### Removed

- Remove the academic report PDF and its documentation-only source and build assets.

### Fixed

- Bound Core Lab cluster identifiers and scenario bodies to prevent topology, session, and event fan-out exhaustion.
- Bound RF tower identifiers to prevent small measurement and interference requests from amplifying into multi-gigabyte JSON responses.
- Persist the saved scenario a user opens, and detach the draft from that baseline when its planning inputs change.
- Prevent stale map layers from being stored with changed inputs or input-only recommendation scenarios.
- Assign new nested scenario IDs when projects are duplicated or imported so cache entries cannot collide.
- Restore the local-storage backup when IndexedDB is available but does not contain a workspace record.
- Mirror successful workspace saves to local storage so the fallback does not silently age behind IndexedDB.
- Compare dataset hash maps independently of JSON object key order.
- Score candidate recommendations from the active optimized per-cell azimuths instead of reverting to the global baseline azimuth.
- Invalidate old RF and residual layers when applying a measurement-derived calibration offset.
- Include dataset hashes in calibration compatibility checks so changed dataset content invalidates an old profile.
- Preserve per-cell azimuths through network evaluation, optimization, saved scenarios, and recommendation application.
- Align the Markdown documentation entry point with the maintained static docs hub, current version, and model limitations.

### Changed

- Establish a canonical `VERSION` file, automated version checks, release-note generation, and tag-driven GitHub Releases.
- Publish the `latest` container tag only for stable releases, never prerelease tags.

## [0.1.0] - 2026-07-17

### Added

- Deterministic sector, network, optimization, interference, recommendation, and measurement-validation workflows.
- Focused map workspace with projects, saved scenarios, comparison, reports, dataset metadata, and optional 5G Core communication paths.
- Go API resource controls, validated dataset packs, OpenAPI documentation, responsive browser tests, and multi-architecture container publishing.

[Unreleased]: https://github.com/Berk-Unsal/atom/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Berk-Unsal/atom/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Berk-Unsal/atom/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Berk-Unsal/atom/releases/tag/v0.1.0
