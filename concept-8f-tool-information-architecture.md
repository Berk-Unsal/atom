# Concept 8F — Tool Information Architecture & Density Cleanup

Concept 8F restructures tool interiors while preserving the established workspace shell: the stage rail, tool drawer, map, read-only spatial inspector, and map chrome remain in their 8C/8E ownership.

## Shared information hierarchy

Each tool now leads with the task, required configuration, important state/result, and next action. Supporting metrics and refinements sit below those essentials. Provenance, implementation IDs, hashes, and developer controls remain available in labeled details disclosures. Shared UI primitives in `ToolPrimitives.jsx` cover semantic sections, key/value rows, subview selection, empty states, and technical details; they are presentation primitives, not a new framework.

Use bordered containers for a distinct workflow, result object, ownership boundary, or attention state. Single metrics and metadata live in rows or groups. State badges communicate current/stale/historical/unavailable/unsupported or execution status. Actions appear only when meaningful in the current state.

## Tool changes

| Stage | Tool | 8F hierarchy |
| --- | --- | --- |
| Plan | Setup | Active plan configuration only; Scenario management has moved out. |
| Plan | Scenarios | Active Scenario and draft, Save Version, Scenario list, compact Version history and selected-Version detail; comparisons, secondary actions, associations, and lineage are lower priority. |
| Plan | Inventory | Existing cell browsing/editing ownership is unchanged. |
| Simulate | Propagation | Objective priorities use compact rows; objective meanings are grouped; constraints remain a separate section. |
| Simulate | Experiments | One current job state is foregrounded; Cancel and Download definition appear only when applicable. Blank sweep values are explicitly described as inherited. |
| Analyze | RF Diagnostics | Canonical RF and path-profile actions remain primary. Research/reference contains Validation, Materials, and Reflection subviews, with only the selected heavy workflow mounted. |
| Analyze | Building Entry | One clear building-entry workflow; material and reflection reference forms use semantic groups. |
| Analyze | 5G Core | Core Lab task and status lead; commands and adapter detail are secondary. |
| Review | Results | RF, Optimization, Interference, Compare, and Candidates stay within Results. The selected result view distinguishes evaluation from optimization, highlights objective-aligned outcomes, and puts supporting metrics/configuration/provenance below. |
| Review | Run History | List and selected Run detail are separate states in the same drawer; Back returns focus to the selected row. |
| Review | Data | Planning quality and counts lead; pack QA, provenance, model detail, research evidence, and developer commands are progressively disclosed. |
| Review | Report | Source and generation/download actions lead; definition options and artifact identifiers stay secondary. |

## Preserved semantics

This change is confined to tool presentation and local view state. It does not alter RF equations or outputs, request construction, optimizer objective values/scoring/search/Pareto identity, Run/Scenario/Report persistence, fingerprints, dataset parsing/loading, backend APIs, freshness rules, or result ownership. Scenario source links continue to select the exact source Version without replacing the active draft. Same-Scenario selection remains unguarded; selecting a different Scenario while the draft is unsaved remains protected.

The three RF Diagnostics research panels stay separately lazy-loaded. Changing research subview does not trigger canonical RF computation. Their independent validation/material/reflection contracts and transient input ownership remain intact.

## Evidence

- Starting checkout and baseline commands/results: [concept-8f-pre-change-baseline.json](concept-8f-pre-change-baseline.json).
- Before/after DOM density and section evidence: [concept-8f-density-evidence.json](concept-8f-density-evidence.json).
- Responsive measurements: [concept-8f-responsive-evidence.json](concept-8f-responsive-evidence.json).
- Request/schema invariance: [concept-8f-request-invariance.json](concept-8f-request-invariance.json).
- Bundle/lazy import measurements: [concept-8f-lazy-loading-evidence.json](concept-8f-lazy-loading-evidence.json).
- Validation totals: [concept-8f-test-evidence.json](concept-8f-test-evidence.json).
- Screenshots: `docs/assets/concept-8f/before/` and `docs/assets/concept-8f/after/`.

Measurements are evidence, not arbitrary height targets. At 1440px the extracted Scenario list is 874px tall and selected-Version detail is 920px, versus 1866px for the former expanded Scenario-in-Setup surface. Optimization Priorities measures 1752px versus 1917px. The largest RF Diagnostics research state changes from a combined 2795px view to 1499px for Reflection; Validation and Materials measure 1110px and 945px. Run History list/detail measure 766px each rather than the old 1051px combined state. The responsive evidence records 1024px, 768px, and 390px drawer measurements and document overflow.

## Remaining product debt and next phase

Phase 107 review found:

- Inventory still combines a searchable cell list with a long per-cell editor. The editor covers numerous profile values, and the list is capped at 250 matches; no bulk selection/edit flow is visible. See the [Inventory review screenshot](assets/concept-8b/1440-inventory.jpg) and `frontend-react/src/components/InventoryPanel.jsx`.
- The current Report form has a clear source, two export actions, and a report list/empty state. Its definition flow does not provide stronger evidence for another phase.
- `MapCanvas.jsx` renders one marker per cell. The Concept 8F fixture has too few cells to validate city-scale marker density, so clustering/performance work needs representative data and remains out of scope.
- The command bar keeps RF context, run freshness, and the primary action in the established shell; existing 390px and stale-result E2E checks pass. No specific 8F regression surfaced.
- Startup JavaScript remains a measurable debt: 803,438 raw / 227,842 gzip bytes for the initial entry and the existing Vite warning above 500 kB. Concept 8F adds only 1,609 raw / 1,218 gzip bytes to that entry.
- First-run onboarding has no evidence-backed blocker in this review. Existing empty states name their next action.
- Keyboard E2E covers stage/tool flow, disclosures, Scenario Version selection/save, research subviews, Results tabs, Run actions, and Run History Back focus. Source semantics provide labels, headings, pressed/expanded states, and status announcements; a manual screen-reader audit remains unperformed.
- Measurement validation remains a distinct research workflow with campaign/model inputs. Its scientific readiness and real Ankara measurement availability remain governed by the existing validation work; 8F changed its navigation only.

Recommend **Concept 8G — Inventory & Bulk Editing UX**, scoped to cell browsing, selection, edit density, and safe batch operations with current Inventory ownership and RF semantics preserved. Do not add marker clustering as part of that recommendation.
