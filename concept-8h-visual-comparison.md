# Concept 8H — Before/after visual comparison

The 24 pairs use the same deterministic Cell dataset, local RF fixtures, map coordinates, cached OSM tile images, and viewport sizes. Before is the production build of `ed7268f25a9faa4d1c76d6043a3b213147eada00`; after is the Concept 8H workspace. The baseline was rebuilt in a temporary checkout from that commit to apply the final tile-coverage capture check without changing baseline code. Run IDs, timestamps, and draft save timing are generated metadata and may differ between independent sessions. These are visual review artifacts, not scientific output comparisons.

## Findings

| Surface | Before | After |
| --- | --- | --- |
| Type | Many small sizes and unusually heavy weights | Six semantic roles; 18/14/13/12px and 400/500/600/700 |
| Header | Project, draft, status, and action compete; action disappears by tool | Neutral Unsaved, teal Run needed, reserved action column |
| Identity | Full expansion truncates | Deliberate short expansion; full expansion on wide displays |
| Menus | Competing native/CSS tooltip; inconsistent offsets | One flyout placement, predictable click/keyboard dismissal, suppressed tooltips |
| Setup | Inconsistent native controls and wrapped research technology label | Shared geometry, fitted label, factual TX bounds, structured network count |
| Results | Five categories wrap into a grid; passive empty state | One scrollable category row, keyboard access, contextual action |
| Panels | Different inspector/drawer titles and nested frames | Shared PanelHeader and quieter section boundaries |
| Map | Strong basemap and cluster fill; large available circles | Tile-only desaturation, pale selection polygon, quieter available Cells |
| Selected Cell | Order label floats away from marker | Centered number; active ring composes with selection |
| Key | Cell state mostly represented through color | Matching rings, dashed focus, smaller available circle, order number, text |
| Tablet | Map display controls overlap spatial controls | Two explicit toolbar rows with zoom below both |
| Network optimization | Amber button resembles a warning | Teal action treatment; availability and callback unchanged |

## Capture index

| State | Before | After |
| --- | --- | --- |
| default-map | [Before](assets/concept-8h/before/default-map.jpg) | [After](assets/concept-8h/after/default-map.jpg) |
| plan-menu | [Before](assets/concept-8h/before/plan-menu.jpg) | [After](assets/concept-8h/after/plan-menu.jpg) |
| setup | [Before](assets/concept-8h/before/setup.jpg) | [After](assets/concept-8h/after/setup.jpg) |
| simulate-menu | [Before](assets/concept-8h/before/simulate-menu.jpg) | [After](assets/concept-8h/after/simulate-menu.jpg) |
| analyze-menu | [Before](assets/concept-8h/before/analyze-menu.jpg) | [After](assets/concept-8h/after/analyze-menu.jpg) |
| review-empty-single | [Before](assets/concept-8h/before/review-empty-single.jpg) | [After](assets/concept-8h/after/review-empty-single.jpg) |
| selected-network | [Before](assets/concept-8h/before/selected-network.jpg) | [After](assets/concept-8h/after/selected-network.jpg) |
| active-selected-cell | [Before](assets/concept-8h/before/active-selected-cell.jpg) | [After](assets/concept-8h/after/active-selected-cell.jpg) |
| dense-sogutozu | [Before](assets/concept-8h/before/dense-sogutozu.jpg) | [After](assets/concept-8h/after/dense-sogutozu.jpg) |
| selection-polygon | [Before](assets/concept-8h/before/selection-polygon.jpg) | [After](assets/concept-8h/after/selection-polygon.jpg) |
| inventory | [Before](assets/concept-8h/before/inventory.jpg) | [After](assets/concept-8h/after/inventory.jpg) |
| propagation | [Before](assets/concept-8h/before/propagation.jpg) | [After](assets/concept-8h/after/propagation.jpg) |
| rf-diagnostics | [Before](assets/concept-8h/before/rf-diagnostics.jpg) | [After](assets/concept-8h/after/rf-diagnostics.jpg) |
| setup-network | [Before](assets/concept-8h/before/setup-network.jpg) | [After](assets/concept-8h/after/setup-network.jpg) |
| review-empty-network | [Before](assets/concept-8h/before/review-empty-network.jpg) | [After](assets/concept-8h/after/review-empty-network.jpg) |
| review-1366 | [Before](assets/concept-8h/before/review-1366.jpg) | [After](assets/concept-8h/after/review-1366.jpg) |
| review-1512 | [Before](assets/concept-8h/before/review-1512.jpg) | [After](assets/concept-8h/after/review-1512.jpg) |
| review-1728 | [Before](assets/concept-8h/before/review-1728.jpg) | [After](assets/concept-8h/after/review-1728.jpg) |
| review-1024 | [Before](assets/concept-8h/before/review-1024.jpg) | [After](assets/concept-8h/after/review-1024.jpg) |
| review-768 | [Before](assets/concept-8h/before/review-768.jpg) | [After](assets/concept-8h/after/review-768.jpg) |
| review-390 | [Before](assets/concept-8h/before/review-390.jpg) | [After](assets/concept-8h/after/review-390.jpg) |
| review-current | [Before](assets/concept-8h/before/review-current.jpg) | [After](assets/concept-8h/after/review-current.jpg) |
| review-stale | [Before](assets/concept-8h/before/review-stale.jpg) | [After](assets/concept-8h/after/review-stale.jpg) |
| analyze-disabled | [Before](assets/concept-8h/before/analyze-disabled.jpg) | [After](assets/concept-8h/after/analyze-disabled.jpg) |

## Manual acceptance review

Reviewed the default map, all stage menus, Setup in single and six-Cell Network modes, selected/active/inspected/focused Cells, dense Söğütözü, polygon drawing, Inventory, Propagation, RF Diagnostics, empty/current/stale Results, disabled Analyze items, and 390/768/1024/1366/1440/1512/1728 layouts.

The review found coherent title/label/helper roles, native controls aligned with the product, readable disabled reasons, stable primary actions, matching marker/key states, and no detached number badges. Roads, parks, and district labels remain readable after the base-map filter. Available Cells are visible but subordinate to selection. Selection fill preserves geographic context. Header brand and workflow action remain visible at every captured width. No document-level horizontal overflow is recorded. Result category overflow is intentional within its scroll strip; arrows/Home/End reveal and select every category.

Visual review caught and corrected a residual amber network Optimize action and a 768px toolbar overlap. Tile capture now waits for loaded, opaque tiles covering all map corners, eliminating resize-time gray bands. Regular surfaces no longer inherit floating shadows. Metric/inspector label capitalization and the Inventory outer frame were also normalized.

Stale provenance remains visible in the header, Results, and map; this safety information retains existing ownership. Current-result scientific summary palettes are retained. At true co-location, Cell symbols can still overlap; no geographic fan-out or new clustering behavior is introduced.

## Measured evidence

[Before computed primitives](assets/concept-8h/before/evidence.json) and [after computed primitives](assets/concept-8h/after/evidence.json) record typography, colors, heights, radii, padding/gaps, positions, selected marker counts, tile counts, map transforms, and viewport overflow. Contrast role pairs are recorded in [design tokens](concept-8h-design-tokens.json). Automated behavioral and invariance evidence is in [test evidence](concept-8h-test-evidence.json).

The JavaScript project's lack of a type-check script and the existing >500kB bundle warning remain. System-font rendering varies naturally by operating system; no external font or new runtime dependency was added. Final visual acceptance is appropriate for freezing 8H, with user acceptance review and release preparation as the next product step.
