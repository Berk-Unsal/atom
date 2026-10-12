# Concept 8G — Inventory working sets and editing

Concept 8G changes the normal Inventory workflow from browsing the loaded dataset to working with a bounded set. The three entry scopes are **Network**, **Map area**, and **Search / Filter**. A Cell row opens a separate single-Cell editor; Back returns to the same query or scope. The map inspector remains the spatial discovery surface and hands off an exact Cell ID to the editor.

## Contract

- **Network** resolves the current `selectedNetworkTowerIds` in their existing request order. Empty Network has an explicit empty state and a map selection action. That action enters Network selection mode without silently adding the active transmitter.
- **Map area** captures the IDs of Cells whose point coordinates are in the current Leaflet bounds. The snapshot stays fixed while the map moves; the UI reports “Map moved” until the user refreshes it. Loaded Cell records remain live, deleted IDs disappear, and moving a Cell does not retarget the captured identity.
- **Search / Filter** searches displayed Cell ID and internal record ID, with optional resolved technology filtering. Empty criteria show no inventory rows. Exact IDs rank before prefixes and substrings; ties sort deterministically by Cell identity.
- All scopes show 50 rows initially. “Show next 50” reveals another bounded page. Inventory UI state lives in App memory and is not saved to a ScenarioRevision or included in RF request fingerprints.
- Opening a row only changes `inventoryTargetCellId`. It does not change the active transmitter, Network membership, Map Focus, or inspection target and does not start RF work.

## Editing and bulk safety

EDIT ONE replaces Browse with the existing Planning / Advanced profile hierarchy. It retains coordinate, technology, receiver-threshold, Reset RF overrides, Duplicate, and Delete behavior. Inspector → Edit in Inventory opens the exact inspected Cell without requiring Search. Position and RF profile edits continue through App's existing invalidation path; they never trigger an RF run automatically.

Batch editing is **GO** for three validated common scalars only: conducted TX power, radius, and beam width. The edit selection is local to the Inventory working set. Mixed values are labelled as mixed and the input begins blank. A review step previews enabled changes. Validation checks every Cell before any mutation; a successful batch updates all selected Cells atomically and invalidates plan results once. It does not run RF work or change Network membership.

Technology, carrier/channel, antenna/link-budget, receiver, position, identity, source, and lifecycle fields are not batch editable in this phase. The field classification is in [concept-8g-bulk-field-safety.json](concept-8g-bulk-field-safety.json).

## Audit and evidence

The normal Ankara GeoJSON has 451 point Cells. Before the change, an empty query rendered the first 250 Cells in loaded order, with the editor below the list in the same scroll surface. After the change, the actual 451-Cell fixture returns 451 explicit 5G filter results while Browse mounts 50 rows; a 10,000-Cell synthetic component fixture confirms the same 50-row initial bound and 100 rows after one explicit page increase.

The existing map still creates a CircleMarker for each loaded Cell and uses Leaflet canvas rendering. Propagation result features are passed through without decimation; both areas were audited and left unchanged. This phase adds no backend pagination, map clustering, or production-scale guarantees.

Evidence and decisions:

- [Pre-change baseline](concept-8g-pre-change-baseline.json) and [behavior audit](concept-8g-inventory-behavior-audit.json)
- [Working-set contract](concept-8g-working-set-contract.json), [Network](concept-8g-network-scope.json), [Map area](concept-8g-map-area-scope.json), and [Search / Filter](concept-8g-search-filter-contract.json)
- [Cell editor flow](concept-8g-cell-editor-flow.json), [selection semantics](concept-8g-selection-semantics.json), and [full-inventory decision](concept-8g-full-inventory-decision.json)
- [Scale fixture](concept-8g-scale-fixture.json), [marker-density audit](concept-8g-marker-density-audit.json), [result-density audit](concept-8g-result-density-audit.json), and [density evidence](concept-8g-density-evidence.json)
- [Responsive evidence](concept-8g-responsive-evidence.json), [accessibility evidence](concept-8g-accessibility-evidence.json), [request invariance](concept-8g-request-invariance.json), [test evidence](concept-8g-test-evidence.json), and [post-change comparison](concept-8g-post-change-comparison.json)
- Screenshots: [`before`](assets/concept-8g/before/) and [`after`](assets/concept-8g/after/)

## Limits and next step

Search still evaluates the currently loaded inventory in the browser, so its work is O(N) even though the rendered list is bounded. The 10,000-Cell fixture is a UI/DOM bound check, not a backend or million-Cell support claim. If the application adopts a genuinely larger external inventory, measure search latency and memory first, then define a server query contract with dataset revision and stable sorting. Otherwise return to Ankara measurement collection and Concept 6A evidence work; propose map or ray density work only after real evidence demonstrates a rendering problem.
