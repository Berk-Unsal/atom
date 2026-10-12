# Concept 8E — Contextual Inspector

## Implemented

- Added a right-side contextual inspector for map-linked entities, with a stable entity heading, source and freshness context, direct actions, and collapsed details/provenance.
- Map clicks inspect by default. **Select cells** explicitly enables the existing plan-selection behavior; area selection, cell placement, and path-endpoint modes keep priority over inspection.
- Kept map Focus separate from inspection and from active-transmitter or cluster selection. Inspector actions can focus a cell, open that exact cell in Inventory, or open its Path Profile without creating an endpoint or starting analysis.
- Reused existing detail renderers for Cells, Buildings, coverage gaps, communication paths, interference samples, measurement samples, and site recommendations. Cell, Building, and Interference sample are the primary inspector families; Pareto candidates, Runs, and Reports remain with their existing tools.
- Kept Interference inspection evidence-backed: absent fields stay unavailable, sample freshness is tied to the exact retained local analysis context, and the marker layer refreshes its hit behavior when switching between Inspect and Select cells so a nearby tower cannot mask a sample.
- Preserved source identity and freshness in the inspector. A plan edit marks a Run-backed inspection stale without recomputing. Switching Project or Scenario clears the inspected entity. Keyboard open, Escape close, and focus return are covered.
- Kept the persisted workspace schema unchanged. Draft-to-Version matching now compares object keys independent of property order and excludes map-only focus/ray-scope values; actual plan-input changes still detach the active Version.
- Adapted panel coexistence at the seven reference widths. At 1440px the inspector overlays the map without covering Map Focus controls; at smaller widths it uses the existing panel slot or sheet behavior.

## Verification

- `npm run lint` — passed.
- `npm test` — 295 tests passed across 56 files.
- `npm run build` — passed (1,707 modules). Vite reports the existing large entry-chunk warning.
- `npm run test:e2e -- --workers=1` — 100 passed, 60 skipped, 160 total. The suite covers Inspect/Select behavior, all three edit-mode priorities, Building and Interference evidence, Inventory and Path Profile handoffs, keyboard lifecycle, stale source handling, Scenario/Project switching, the saved-Version optimization journey, and the seven-width responsive sweep.
- `go vet ./... && go test -race ./...` — passed in `backend-go/` and `core-lab-adapter/`.
- `sh docs/build-reference-pages.sh` and `PYTHONPATH=/tmp/urban-ray-tracer-docs-validator-deps python3 docs/validate_docs.py` — passed; 41 HTML pages and 41 API paths validated. The reference generator emitted existing Pandoc `--mathml` deprecation warnings.
- `python3 scripts/versioning.py check` — passed; metadata remains consistent at 0.9.0.
- `git diff --check` and JSON parsing of the 8E evidence files — passed.
- Responsive screenshots and measured geometry are in [concept-8e-responsive-evidence.json](concept-8e-responsive-evidence.json) and [docs/assets/concept-8e](assets/concept-8e/).
- The requirement-by-requirement test map is in [concept-8e-test-evidence.json](concept-8e-test-evidence.json). Browser/ARIA keyboard checks passed; no manual screen-reader run was captured. The browser had no basemap tiles, so captures verify interface geometry and interactions with deterministic map fixtures.

The browser environment did not provide base-map tiles during capture. RF layers and map controls remained available; the captures therefore verify panel geometry and interaction, not live basemap quality.
