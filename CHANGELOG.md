# Changelog

All notable changes to A.T.O.M are recorded here. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and this file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

[Unreleased]: https://github.com/Berk-Unsal/atom/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Berk-Unsal/atom/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Berk-Unsal/atom/releases/tag/v0.1.0
