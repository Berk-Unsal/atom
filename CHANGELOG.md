# Changelog

All notable changes to A.T.O.M are recorded here. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and this file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Reorganize the frontend into four labeled workflow stages with contextual tool navigation and run actions, a unified map key, stronger text contrast and focus states, visible local-save status, and recoverable deletions.
- Standardize RF unit and unavailable-value formatting, replace side-stripe status treatments, and align drawer, layer, and result transitions to one reduced-motion-safe timing system.

### Fixed

- Keep drawer headers and tool tabs fixed while long tool bodies scroll, preventing active-tab borders from being clipped by the content boundary.
- Keep every workspace destination reachable in a single mobile navigation row without pushing tools below the viewport.
- Pin documentation generation to Pandoc 3.10 so CI reproduces the committed reference pages exactly.
- Copy every Core Lab adapter Go source into the container build so lifecycle helpers are linked into the release image.

## [0.5.0] - 2026-07-31

### Added

- Add an inspectable 2.5D point-to-point path profiler with optional COG/GeoTIFF terrain, building heights, LOS/Fresnel classification, single knife-edge diffraction, material-aware penetration, environmental sensitivity terms, uncertainty ranges, and an interactive vertical cross section.
- Add asynchronous batch experiment matrices with cancellation, deterministic dataset/model fingerprints, bounded caching, a headless CLI, progress UI, scenario tables, and Pareto evidence.
- Add configurable network objectives, weights, hard constraints, feasibility evidence, and non-dominated azimuth solutions while keeping unsupported tilt, power, candidate-site, cost, fiber, and permitting inputs explicit.
- Add spatially blocked five-fold calibration validation, spatial-diversity rejection, per-cell/per-band and distance/obstruction residual summaries, robust outlier flags, uncertainty quantiles, confidence intervals, and campaign provenance/expiration support.
- Add regular-grid analytical coverage surfaces, marching-square isolines, opacity and display-threshold controls, plus GeoTIFF, contour GeoJSON, and CSV exports.
- Add OGC API Features-style, viewport-bounded building queries with pagination and GeoJSON/CSV representations so clients need not transfer the full building dataset.
- Add a persistent cell Inventory workspace with manual map placement, dragging, duplication, deletion, bounded CSV/GeoJSON import, search, validation, and independent per-cell RF profiles across propagation, network, interference, recommendation, measurement, and report workflows.
- Add Dataset Pack Studio for arbitrary-region source inspection, geometry repair, reprojection/cropping, schema-v2 manifests, hashes, provenance/licenses/confidence, QA evidence, and optional terrain, clutter, building-height, and material layers.
- Add a local installed-dataset catalog and atomic manifest-ID switching that retains the active immutable pack on validation failure, with optional administration-key protection.

### Security

- Upgrade `brace-expansion` to 5.0.8, require Go 1.26.5 for both services, and align container builder tags with the patched toolchain.
- Reject measurement CSV files above 2 MiB before reading them into browser memory while retaining the independent 5,000-sample limit.
- Add weekly npm dependency updates, a high-severity frontend advisory gate, and matching `govulncheck` coverage for the Core Lab adapter.
- Require constant-time API-key authorization for Core Lab scenario mutation at both the public backend route and the private adapter hop.
- Run the Core Lab adapter as a non-root user with a read-only filesystem, no Linux capabilities, no privilege escalation, and no host-published port.
- Bound imported project files to 16 MiB and deeply validate scenario counts, nesting, collection sizes, strings, and nested snapshot types before persistence.
- Limit recommendation search polygons to 256 coordinates before candidate point-in-polygon evaluation.
- Add restrictive browser security headers, HTTPS-aware HSTS, and an opt-in transport requirement for deployments behind a TLS gateway.
- Keep adapter response bodies, dataset filesystem paths, and detailed load failures in server logs instead of returning them to API clients.
- Reject unknown or trailing JSON input across backend RF routes and Core Lab scenario mutation without exposing parser diagnostics.
- Bound frontend JSON response parsing to 32 MiB using both `Content-Length` checks and streaming byte accounting.
- Stream building GeoJSON features into the spatial index instead of retaining the full encoded file and decoded collection together, with explicit manifest, tower, and building file ceilings.
- Resolve dataset file symlinks before containment checks so manifests cannot escape the configured dataset directory.

### Removed

- Remove duplicate root copies of propagation screenshots and keep the documentation asset paths canonical.

### Changed

- Upgrade project files and dataset manifests to schema v2 with backward-compatible v1 import/loading migrations.
- Include resolved per-cell RF profiles and dataset QA/provenance in reproducibility outputs and planning reports.
- Extract frontend workspace formatting/state helpers and backend RF/segment geometry math from the application and simulation monoliths into focused, tested modules.
- Refresh Open5GS reachability outside the adapter cache mutex, serve stale probe state during refresh, and treat HTTP client/server failures as disconnected.
- Remove redundant RF convenience APIs that created background contexts and silently discarded computation errors.
- Drain in-flight backend and Core Lab adapter requests on interrupt or termination signals with a bounded graceful-shutdown window.
- Consolidate report escaping, numeric/Markdown formatting, and printable table construction behind one tested utility.

### Fixed

- Keep focused-drawer actions in normal layout flow so the propagation optimizer cannot overlap the vertical path-profile panel.

## [0.4.0] - 2026-07-30

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

[Unreleased]: https://github.com/Berk-Unsal/atom/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Berk-Unsal/atom/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Berk-Unsal/atom/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Berk-Unsal/atom/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Berk-Unsal/atom/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Berk-Unsal/atom/releases/tag/v0.1.0
