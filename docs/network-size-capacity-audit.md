# Network size capacity audit

Audit date: 2026-10-03. **Recommendation: keep the production cap at six selected Cells.** Twelve-cell RF computation was demonstrated with substantial deadline headroom, but the full workflow does not qualify for a cap increase under current policies. Evaluate → Interference → Re-evaluate first exceeds the request budget at nine Cells. Saved-result export/import and Scenario delete → Undo → reload fail already at the six-cell baseline.

Eight Cells is the largest budget-compatible candidate for that repeated workflow in a fresh window, with only one remaining attempt. It is a future candidate, not supported production behavior. No tested size passed every critical audit condition. This distinction prevents the optimizer improvement from being mistaken for full-workflow support.

This is an audit only. Production constants, validation, request/deadline limits, RF equations, optimizer/search/Pareto policy, marker semantics, request builders, schemas and selection UX were not changed. All repository additions are documentation, screenshots and test tooling. Six-cell assumptions remain intact.

## Baseline and evidence

Starting checkout: clean `main`, HEAD `d6251b26126807027cba6ef55d47d97f7bcb7002`, VERSION `0.10.2`, empty diffstat. Host: macOS, Apple M4, 10 logical CPUs, 24 GiB RAM, Go 1.27.1 arm64, Node 26.8.1, GOMAXPROCS 10. Tests ran serially for measurement isolation, using the real Ankara building index (161,784 buildings).

The [measurement ledger](network-size-capacity-measurements.json) contains individual timings, CPU, sampled memory endpoints/maxima, request/response byte counts and hashes, live browser runs, counters, validation outcomes, persistence observations and decisions. The [cap reference inventory](network-size-capacity-cap-inventory.json) provides file/line/evidence classifications. Raw multi-megabyte RF responses remain in `/tmp/atom-network-capacity`; the checked-in ledger retains their hashes and the tooling reproduces them. Standalone printable HTML is packaged in an archive so it does not become a documentation website page. Reports and screenshots are retained under [assets/network-capacity-audit](assets/network-capacity-audit/planning-reports.zip).

Memory measurements are representative, not precise peaks: RSS/Go heap were sampled every 200 ms and at endpoints. CPU is process user+system time, including small instrumentation overhead. Handler timings include response serialization but exclude pack loading, explicit pre-request GC, network transport and rendering. The eight live browser cases separately cover local Evaluate from click to Ready, with real RF HTTP responses and guards. This is a native, single-user benchmark, not a multi-user/container SLA or slow-link/device guarantee.

## Current six-cell ownership and history

The reference inventory records 165 references in 68 files and classifies hard safety limits, product UX limits, test fixture assumptions, documentation-only references and incidental constants. It covers canonical production sources and tests/docs; generated HTML mirrors are represented by their Markdown/OpenAPI sources. Literal sixes in geographic coordinates, RF math, unrelated UI dimensions and data arrays are not six-cell enforcement.

| Owner / subsystem | Current behavior | Classification / significance |
|---|---|---|
| `policy/rf-policy.json` and generator | Network max 6; measurement max 6; recommendation baseline max 5 | Hard validation boundaries, separate policies |
| `backend-go/raytracer/policy_generated.go` | Generated `MaxNetworkTowers=6`, measurement 6, recommendations 5 | Hard safety limit |
| `frontend-react/src/generated/policy.js` | Generated network max 6 | Shared policy |
| `frontend-react/src/utils/networkSelection.js` | Separate `MAX_NETWORK_CELLS=6`; normalization clamps and deduplicates | Product UX limit |
| `frontend-react/src/App.jsx` | Selection, nearest polygon subset, hydration, autosave, restore, undo, payload selection and promotion use capped normalization | Product UX limit; changing only a label would be insufficient |
| `ControlPanel.jsx` | Count/max summary; literal “two to six” interference copy | Product UX limit and copy |
| `backend-go/main.go` | Evaluate and Optimize require 2–6 | Hard validation, inherited network policy |
| `interference.go`, `building_entry.go`, `network_explanation.go` | Interference 2–6, building entry 1–6, explanation baseline 2–6 | Hard validation, inherited network policy |
| `measurements.go` | Measurement towers 1–6 | Independent hard boundary, must be separately considered |
| `recommendations.go` / frontend candidates | Baseline 2–5 then one candidate can produce 6 | Intentional coupling to final network max; not an accidental off-by-one |
| `docs/openapi.yaml` | Schemas/descriptions encode network/building/measurement max 6 and recommendation max 5 | API contract / documentation |
| Tests, README, changelog and guide/reference sources | Six-sized examples and limit assertions | Fixture assumptions / documentation; line inventory retained |
| Map numbering and batch editing | General array rendering; 18 px marker badge and 12 px font | No six-cell cardinality constraint found |
| Project schema and reports | General arrays; production App normalization still clamps selection to six | No schema max-six; independent artifact limits apply |

The introducing commit is `abcd33abbbaaffd5b6dfffe099604a5e1789d2b0` (2026-07-02), “feat: Implement network optimization features in frontend and backend”. Its patch introduced backend `len > 6`, frontend `current.length >= 6`, and nearest-six area selection. Its description establishes the feature, not why six was chosen. Subsequent baseline, selection-consolidation (`b6d3929`) and policy-extraction (`b427bd1`) history preserve the cap. **The original rationale is unknown.** History does not establish compute, UI, scientific applicability, payload size, product scope, or an arbitrary conservative choice as the reason. The historical rationale must not be retroactively inferred from today's performance.

## Fixture and workload construction

The fixture generator uses real `ankara_5g_nodes.geojson` inventory. It preserves the recent deadline reproduction's six IDs in original order, then appends nearest distinct Cell IDs by cosine-adjusted squared coordinate distance, with numeric Cell-ID tie-break. Prefixes of one coherent list form 6/8/10/12. Center is longitude 32.8278, latitude 39.92555. No fabricated locations, random city-wide distribution, or workload reduction was used.

| Order | Cell ID | Longitude | Latitude |
| 1 | 9664800 | 32.8274 | 39.9255 |
| 2 | 26390 | 32.8272 | 39.9267 |
| 3 | 9664790 | 32.8276 | 39.9251 |
| 4 | 9664795 | 32.8282 | 39.9254 |
| 5 | 9664791 | 32.8282 | 39.9253 |
| 6 | 9664794 | 32.8282 | 39.9253 |
| 7 | 12261147 | 32.8291 | 39.9254 |
| 8 | 9664785 | 32.8283 | 39.9265 |
| 9 | 9664780 | 32.8284 | 39.9265 |
| 10 | 9664784 | 32.8283 | 39.9267 |
| 11 | 26394 | 32.8281 | 39.927 |
| 12 | 26381 | 32.8283 | 39.927 |

Cells 9664791 and 9664794 are distinct IDs at exactly the same location with matching effective RF profiles. They legitimately share contribution-cache work. Therefore these fixtures' expensive misses are `36(N−1)`, not a universal `36N` rule. This geographic/profile reuse is disclosed; different networks may have fewer hits. Additional nearby Cells increase marker crowding. The chosen fixtures were not altered to obtain better timings.

Both canonical 2.6 and 28 GHz profiles used 120 rays, 400 m radius, 30 dBm, 120° beam, Urban propagation and the existing legacy default optimization domain. Interference uses ordinary 70% load and reuse 1 (these are the same default configuration, so both conditions are covered by identical-settings repeats). Bandwidth remains the canonical 20/100 MHz. Interference spacing is 40 m and its existing 3,000-sample ceiling is unchanged. 140 GHz research mode was outside this normal-cap decision.

Only disposable `/tmp/atom-network-capacity` copies enabled N>6: backend `MaxNetworkTowers` and the frontend selection/generated network max were set to 12 in those copies. Canonical request builders and all other RF/resource/persistence rules stayed unchanged. The production validators were tested separately and rejected the larger requests. Sixteen and twenty were not expanded because twelve already failed the full-workflow gate. Isolated 16/20 badge-text checks are not 16/20-network tests.

## Optimizer timing, counters and deadline

Three isolated measurements per profile at 6, 10 and 12; one primary measurement at 8. A separate counter-confirmation run at every size/profile matched the complete primary response hash. Tiny samples are descriptions, not statistical distributions. Times below are seconds; one-value eight-cell rows are not repeatability distributions.

| Cells | GHz | Samples | Min | Median | Max | Worst deadline consumed | Headroom |
| 6 | 2.6 | 3 | 5.829 | 5.886 | 6.090 | 10.15% | 53.910 s |
| 6 | 28 | 3 | 5.696 | 5.745 | 5.759 | 9.60% | 54.241 s |
| 8 | 2.6 | 1 | 8.374 | 8.374 | 8.374 | 13.96% | 51.626 s |
| 8 | 28 | 1 | 8.249 | 8.249 | 8.249 | 13.75% | 51.751 s |
| 10 | 2.6 | 3 | 9.491 | 9.511 | 9.514 | 15.86% | 50.486 s |
| 10 | 28 | 3 | 9.319 | 9.373 | 9.394 | 15.66% | 50.606 s |
| 12 | 2.6 | 3 | 12.120 | 12.120 | 12.509 | 20.85% | 47.491 s |
| 12 | 28 | 3 | 11.860 | 11.980 | 11.995 | 19.99% | 48.005 s |

| Cells | Proposals `72N+2` | Unique network states | Cache misses | Cache hits | Pareto before trim (2.6 / 28) | Returned solutions |
| 6 | 434 | 421 | 180 | 2424 | 29 / 50 | 25 |
| 8 | 578 | 561 | 252 | 4372 | 47 / 63 | 25 |
| 10 | 722 | 701 | 324 | 6896 | 30 / 56 | 25 |
| 12 | 866 | 841 | 396 | 9996 | 66 / 80 | 25 |

All runs completed both legacy passes. Feasible archive counts equal the unique states above. The response frontier remains intentionally limited to 25; pre-trim counts are separately instrumented through the existing timing callback. Expensive contribution work grows roughly linearly for these fixtures, although cache lookups/aggregate work still grow with the network-state/cell combination. Optimizer latency increased from about 5.7–6.1 s to 11.9–12.5 s. The worst 12-cell run consumed 20.85% of the unchanged 60 s deadline, leaving 47.49 s. This is meaningful compute headroom but does not remove the workflow blockers.

## Evaluate, interference and browser workflow

| Cells | GHz | Network evaluator (s) | Main + per-cell map handlers (s) | Live browser click → Ready (s) | Interference (s) | Samples / features | Serving-cell groups |
| 6 | 2.6 | 0.397 | 0.508 | 1.353 | 0.039 | 421 / 421 | 5 |
| 6 | 28 | 0.396 | 0.489 | 0.824 | 0.037 | 421 / 421 | 5 |
| 8 | 2.6 | 0.517 | 0.662 | 1.402 | 0.045 | 459 / 459 | 7 |
| 8 | 28 | 0.527 | 0.615 | 0.826 | 0.047 | 459 / 459 | 7 |
| 10 | 2.6 | 0.559 | 0.726 | 1.380 | 0.052 | 417 / 417 | 8 |
| 10 | 28 | 0.565 | 0.663 | 0.869 | 0.051 | 417 / 417 | 8 |
| 12 | 2.6 | 0.702 | 0.912 | 1.487 | 0.058 | 355 / 355 | 8 |
| 12 | 28 | 0.659 | 0.781 | 1.358 | 0.057 | 355 / 355 | 8 |

Every live Evaluate issued one `/api/evaluate-network` plus N `/api/simulate` protected POSTs, all successful with expected budget headers. The production frontend performs sequential map follow-ups. The ledger preserves each per-cell handler duration and response size. Real browser runs used a fresh backend per case, the real dataset and unchanged admission/body/deadline guards. Inventory was controlled for deterministic display; RF responses were live. Other visual workflows replay recorded real responses, so their replay times must not be interpreted as RF timings.

Interference repeats matched complete response hashes at all sizes/bands. Sample counts need not grow monotonically: the existing domain/spacing/coverage geometry determines retained samples. Every sample appeared as a feature; serving-cell summaries include only Cells that serve sampled locations, so fewer than N summaries are expected. No loss of output was observed. Lazy per-cell explanation also completed at all eight size/profile combinations; the 12-cell 28 GHz example took 0.342 s, requested 23,684 bytes and returned 3,046 bytes. Each uncached explanation costs one protected request.

## Request budget: the first new size boundary

The unchanged policy is **20 protected attempts in a fixed 60-second client-IP window**, with global concurrency 2, client concurrency 1 and 60-second computation timeout. Attempts consumed by cancellation/validation/admission do not create free budget. Internal optimizer proposals are not HTTP requests.

| Cells | A: Evaluate | B: Evaluate + Interference | C: Evaluate + Interference + Evaluate | D: Optimize + N map follow-ups + Review | C remaining / deficit |
| 6 | 7 | 8 | 15 | 7 | remaining 5 |
| 8 | 9 | 10 | 19 | 9 | remaining 1 |
| 9 | 10 | 11 | 21 | 10 | deficit 1 |
| 10 | 11 | 12 | 23 | 11 | deficit 3 |
| 12 | 13 | 14 | 27 | 13 | deficit 7 |

A is N+1; B N+2; C 2N+3; D N+1 before lazy explanations. Review, map focus and ordinary inspection issue no extra RF requests. An uncached cell explanation adds one; opening previously cached evidence may reuse it. At eight, C leaves just one request; pre-existing protected activity or multiple explanations can still exhaust the window. Shared client-IP/NAT users further reduce practical headroom.

The fixed-clock real limiter test covers A/B/C/D at 6/8/9/10/12 and verifies request 21 is denied. Real RF-handler C executions completed 15 and 19 requests at 6/8; at 10/12, 20 responses succeeded and attempt 21 returned 429, stopping the workflow. Nine is the inexpensive refined first failure (`2×9+3=21`), not a nine-cell RF benchmark. These native measured workflows finish within one window; waiting for expiry would alter the interaction being tested. No budget/deadline/concurrency policy was changed.

## Requests, responses and memory

All byte sizes below are uncompressed JSON; MB in prose means decimal million bytes, MiB means 1,048,576 bytes. The 1 MiB server request ceiling is remote from these inputs.

| Cells | GHz | Network request | Interference request | Largest simulation request | Evaluate response | Optimize response | Interference response | All per-cell map responses |
| 6 | 2.6 | 5438 | 5340 | 944 | 29084 | 98180 | 4698126 | 40336307 |
| 6 | 28 | 5425 | 5328 | 941 | 29046 | 98162 | 4667640 | 13865459 |
| 8 | 2.6 | 7145 | 7047 | 944 | 34392 | 108131 | 6272282 | 55475690 |
| 8 | 28 | 7128 | 7031 | 941 | 34387 | 108057 | 6235039 | 19023546 |
| 10 | 2.6 | 8851 | 8753 | 944 | 39739 | 118067 | 7080588 | 63156485 |
| 10 | 28 | 8830 | 8733 | 941 | 39726 | 118047 | 7039536 | 21074802 |
| 12 | 2.6 | 10551 | 10453 | 944 | 45110 | 127063 | 7666295 | 76733783 |
| 12 | 28 | 10526 | 10429 | 941 | 45046 | 127003 | 7629971 | 25872284 |

Largest individual map response was 7,925,628 bytes (2.6 GHz) or 2,901,705 bytes (28 GHz). Each response passed the frontend's 32 MiB bounded JSON parser; the aggregate 12-cell 2.6 GHz map response volume is about 76.7 MB, so a slow connection remains material even though per-response parsing bounds pass. The separate blob ceiling is 64 MiB. No remote-link bandwidth/latency or low-memory handset benchmark was performed.

| Cells | Optimizer sampled RSS max (MiB, both-band worst) | First 2.6 / 28 CPU seconds |
| 6 | 760.3 | 17.31 / 16.22 |
| 8 | 735.1 | 24.34 / 23.14 |
| 10 | 764.5 | 27.67 / 25.81 |
| 12 | 767.3 | 36.00 / 32.94 |

The real pack dominates process baseline memory (roughly 400–450 MB RSS before requests). Across representative runs optimization sampled at most 767.3 MiB, evaluation about 703–740 MiB, and interference about 484–536 MiB. Endpoints, sampled heap maxima and cumulative allocations are retained individually in the ledger; cumulative allocated bytes are not retained-memory peaks. Memory did not explode with N through 12 on this host. These measurements do not establish safety under competing datasets/users or container memory limits (the existing compose configuration specifies no memory/CPU limit).

CPU durations correspond to roughly 2.7–2.9 equivalent cores during optimization. Twelve requires more total CPU and longer sustained work, but no unacceptable host exhaustion was demonstrated in these isolated runs. Global concurrency remains two; simultaneous heavy requests were not benchmarked. Browser JS heap snapshots after real Evaluate were about 67.6/104.0/119.6/126.2 MiB at 2.6 GHz for 6/8/10/12, versus 34.5/48.4/58.4/55.1 MiB at 28 GHz. These are CDP snapshots, not peaks; GC makes them non-monotonic.

## Cancellation, guards and determinism

At 12 Cells / 28 GHz, a 20 ms cancellation interrupted Optimize, Evaluate and Interference. Observed returns were 22.2, 20.4 and 22.0 ms respectively; response bodies were empty, contexts canceled, workers joined and active slots returned to zero. Post-run goroutine count was two, including the normal test runtime. The RSS sampler also joined. Canceled httptest recorders retain their default 200 without a write; that default is not an actual successful HTTP response or partial success. The same cancellation workload passed the race detector. Budget charges remained consumed.

At 6/10/12 in both bands, three isolated same-request optimizations produced byte-identical complete responses, including recommendation, objectives, Pareto ordering, configurations and scenario fingerprint. The independent counter-confirmation run matched every primary hash, including eight. No scientific/search semantics were changed. Production body/admission/deadline/rate guards remained active in the harness and live browser server.

## Selected state and persistence: existing baseline blockers

Pure production project/Scenario/Version helpers preserve stable IDs, order, active Cell and Map Focus in input-only round-trips for all tested sizes when normalization is explicitly allowed N in the test. Production default normalization keeps six, as intended. Browser tests covered selected badges, inspecting the focused last Cell, changing Map Focus, Scenario/Version saves and reload of ordinary saved selections; those ordinary reload cases passed at 6/8/10/12 in the temporary frontend copy.

Two critical limitations were reproduced separately:

1. Actual UI Save Version → Export produced result-bearing projects of 31,151,189 / 48,112,562 / approximately 58.1 million bytes at 6/10/12. Calling the production import helper on those downloaded files rejected each with “Project file must be no larger than 16 MiB”. Thus exported retained results do not reliably round-trip under the existing import ceiling even at six. These actual exports differ from the constructed baseline+interference snapshots below.
2. Scenario Delete → Undo restored Network context immediately, but reload returned to Single mode with zero selected Cells at 6/10/12. Delaying both delete and Undo by 750 ms did not resolve it. [Recorded observations](assets/network-capacity-audit/undo-observations.json) distinguish the facts from an unproven asynchronous persistence hypothesis. No root-cause or fix is claimed. This is demonstrated at the existing baseline, not established as a size regression.

| Cells | Input-only project bytes | Scenario revision bytes | Version bytes | Combined map-result bytes | Constructed full-result project bytes | Input import / IDs | Full-result import |
| 6 | 29147 | 9275 | 9309 | 14282683 | 39170000 | preserved | rejected: 16 MiB |
| 8 | 37333 | 11591 | 11625 | 19591375 | 53525977 | preserved | rejected: 16 MiB |
| 10 | 45509 | 13898 | 13932 | 21713948 | 59103678 | preserved | rejected: 16 MiB |
| 12 | 53621 | 16164 | 16198 | 26651640 | 70597324 | preserved | rejected: 16 MiB |

The constructed full snapshots include baseline rays, optimization and interference, with pretty project serialization; actual UI exports retain a different result bundle. Neither is a claim that every project export has this size. Input-only projects safely import. Other unchanged importer ceilings include depth 40, 250,000 nodes, 25,000 array elements, 100 scenarios and 1 MiB strings; five recent Scenario results are retained. Cardinality is not the schema blocker; large retained artifacts and lifecycle persistence are.

## Visual workflow and report review

The dedicated recommendation Candidates workflow is intentionally unavailable for a six-or-more-cell baseline because recommendation validation permits at most five before adding one candidate. Larger recommendation execution was therefore not certified; this coupling is a release prerequisite. The optimized Solutions tab was reviewed separately.

The current UI remains operable for larger fixtures, but these are qualified usability findings, not a formal user study. Screenshots use the production renderer in a temporary max-12 copy. No clustering, marker change, layout fix or selection redesign was added. Automated Impeccable detection reported no listed static findings; manual review identified density and lifecycle issues beyond that detector.

| Surface | Finding | Evidence |
|---|---|---|
| Desktop map, 6/8/10/12 | Active/selected/focus/inspected styles and legend remain comprehensible. Nearby/co-located numbers overlap, already present at six and worse in the northern cluster at 12. Zoom, focus and Inventory remain necessary for individual identification. | [6 map](assets/network-capacity-audit/6-desktop-1440-map.png), [8 map](assets/network-capacity-audit/8-desktop-1440-map.png), [10 map](assets/network-capacity-audit/10-desktop-1440-map.png), [12 map](assets/network-capacity-audit/12-desktop-1440-map.png) |
| Two-digit order | Actual 10/11/12 labels and isolated existing-style 16/20 labels fit: text width 16.125 px in an 18 px container, font 12 px. No intrinsic clipping. Spatial overlap is distinct from text geometry. | [DOM geometry](assets/network-capacity-audit/12-desktop-1440.json), [12 inspector](assets/network-capacity-audit/12-desktop-1440-inspector.png) |
| Setup | Selected summaries are readable at 8/10/12, using test-only maximum 12. Literal “two to six” interference copy remains inconsistent with the temporary expanded fixture and would need coordinated review before any future release. | [12 Setup](assets/network-capacity-audit/12-desktop-1440-setup.png) |
| Selection / Inventory | Select cells → four-point polygon → Finish selected 12, with 12 distinct ordered working-set rows. All 12 batch-edit checkboxes opened the existing editor. Polygon selection order is retained separately; it need not equal the original fixture prefix order. | [selection](assets/network-capacity-audit/inventory-selection-12.png), [order](assets/network-capacity-audit/inventory-selection.json), [batch](assets/network-capacity-audit/12-desktop-1440-batch.png) |
| Results | RF, Interference, Optimization, Compare and Solutions (the optimized result's candidate tab) render. Existing horizontal tab overflow and vertical lists remain operable. No hidden six-row truncation found. | [RF](assets/network-capacity-audit/12-desktop-1440-rf-results.png), [interference](assets/network-capacity-audit/12-desktop-1440-interference-results.png), [compare](assets/network-capacity-audit/12-desktop-1440-compare.png), [Solutions](assets/network-capacity-audit/12-desktop-1440-candidates.png) |
| Optimized configuration / explanations | All 12 azimuth rows and per-cell solution rows render. Lazy marginal effect panel renders with a real recorded explanation. Ten-plus Cells increase reading/scrolling effort; no layout failure was observed. | [azimuths](assets/network-capacity-audit/12-desktop-1440-azimuth-list.png), [per-cell detail](assets/network-capacity-audit/12-desktop-1440-per-cell-detail.png), [explanation](assets/network-capacity-audit/12-desktop-1440-cell-explanation.png) |
| Responsive 12-cell review | Tested at 1440/1024/768/390. Setup count readable; Results use vertical scrolling and horizontal tabs. At 390 the command bar truncates Network/run text, drawers consume much of the map, attribution overlays content, and crowding is severe at fitted overview. Inspector was closed before stage changes. | [1024](assets/network-capacity-audit/12-desktop-1024-rf-results.png), [768](assets/network-capacity-audit/12-tablet-768-rf-results.png), [390 Setup](assets/network-capacity-audit/12-mobile-390-setup.png), [390 map](assets/network-capacity-audit/12-mobile-390-map.png), [390 Solutions](assets/network-capacity-audit/12-mobile-390-candidates.png) |
| Undo reload | Baseline and larger selection lost on reload after Undo, despite immediate visible restoration. | [6](assets/network-capacity-audit/6-desktop-1440-undo-reload.png), [10](assets/network-capacity-audit/10-desktop-1440-undo-reload.png), [12](assets/network-capacity-audit/12-desktop-1440-undo-reload.png) |

Ray maps rendered from full per-cell responses; dense geometry makes individual rays difficult to follow, while map focus remains available. No remote basemap availability guarantee is implied. Mobile used emulated Chromium, not a physical phone or manual touch study. At 16/20 only text geometry was tested; selection/map/results at those sizes remain untested.

Existing report helpers generated Markdown and printable HTML for every tested size. At 6/10/12, Chromium print-media captures at 1440 px had no overflowing table cells, one map SVG, and 136/147/151 table rows; configuration, RF profile and available serving-cell tables retained all relevant IDs. Long source/evidence values wrapped. The report map is explicitly a representative sample: at most 600 rays, 600 interference points, 260 gap points, and five Pareto alternatives. These existing presentation bounds are not lost selected Cells. The map is crowded with 12 but all configuration rows remain present. Physical printer/PDF pagination is not certified.

| Cells | Generate (ms) | HTML bytes | Markdown bytes | Printable / source / capture |
| 6 | 18.56 | 128162 | 119232 | [HTML archive](assets/network-capacity-audit/planning-reports.zip), [Markdown](assets/network-capacity-audit/6.md), [capture](assets/network-capacity-audit/report-6.png) |
| 8 | 7.31 | 132618 | 123430 | metrics retained; generated during audit |
| 10 | 7.08 | 131374 | 121971 | [HTML archive](assets/network-capacity-audit/planning-reports.zip), [Markdown](assets/network-capacity-audit/10.md), [capture](assets/network-capacity-audit/report-10.png) |
| 12 | 7.88 | 128620 | 119045 | [HTML archive](assets/network-capacity-audit/planning-reports.zip), [Markdown](assets/network-capacity-audit/12.md), [capture](assets/network-capacity-audit/report-12.png) |

## Production validation and candidate decisions

Unmodified checkout validation accepted six-cell Evaluate/Optimize/Interference/building-entry/explanation inputs and rejected 8/10/12. Recommendations rejected six as a baseline because its intentional maximum is five. Measurement validation remains independently capped at six. Reports are client generated, not a separate RF endpoint. These are current enforced product/API boundaries; no measured larger workload bypasses them in production. Nothing in the history establishes six as an RF scientific applicability cutoff; that is not grounds to weaken validation automatically.

“Comfortable” requires substantial deadline headroom, interactive evaluation, reliable interference, an ordinary workflow compatible with the request budget, bounded memory/payloads, usable current UI, safe persistence, deterministic output and cancellation/guards. Native RF criteria pass through 12; the full conjunction does not.

| Candidate cap | Decision | Concrete reason |
|---|---|---|
| 6 | **PASS WITH BLOCKER** | Existing production/RF ceiling, C costs 15; result-rich export/import and Undo reload already fail. Dense co-located markers remain a usability limitation. |
| 8 | **PASS WITH BLOCKER** | RF compute has ~51.6 s optimizer headroom, C costs 19. Production validators/selection reject above six; persistence blockers remain; one spare request is thin practical headroom. |
| 10 | **NO-GO under current policies** | C costs 23, real attempt 21 denied; validation/persistence also block despite ~50.5 s headroom. |
| 12 | **NO-GO under current policies** | C costs 27, real attempt 21 denied; validation/persistence and denser map remain despite ~47.5 s headroom. |
| 16 / 20 | **NOT TESTED / not certified** | Expansion stopped once lower candidates failed critical workflow gates; no runtime/support inference from isolated marker text tests. |

The literal first production boundary is seven Cells (current validation/selection cap). Setting that intentional boundary aside solely in disposable tests, the first **new size-dependent workflow blocker** is request budget at nine. The strict full-workflow audit finds persistence blockers already at six, so there is **no all-criteria-certified size** in this audit. Maximum technically demonstrated RF size is 12; maximum fresh-window C budget-compatible tested candidate is 8; current product cap remains 6. Neither eight's budget arithmetic nor twelve's optimizer timing certifies full support.

Before any cap increase: resolve and regression-test retained-result persistence/export/import and undo/restore; agree on ordinary request-budget behavior including retry/explanation and shared-IP headroom; coordinate validators, generated policy, independent measurement/recommendation limits, frontend normalization, API contract and copy; repeat the full workflow at the proposed cap with representative spatial/profile diversity and appropriate deployment/device/load measurements. These are future prerequisites, not changes performed here.

**Single recommended next action:** create a separate bounded saved-result persistence/export/import and undo/restore repair task, with regression coverage at the existing six-cell baseline; then re-audit eight. No production cap increase is recommended now.

## Reproduction and validation

From the repository root, these explicit audit commands use disposable copies (the Go measurement gate refuses larger inputs against the unchanged production constant):

```sh
python3 scripts/network-capacity-audit/run.py --run
python3 scripts/network-capacity-audit/followup.py
python3 scripts/network-capacity-audit/counters.py
python3 scripts/network-capacity-audit/prepare-ui.py
```

Then run the copied frontend with `ATOM_RUN_CAPACITY_UI=1`, an absolute `ATOM_CAPACITY_SCREENSHOTS` pointing to this checkout's documentation assets, and the copied Playwright configuration. Ordinary UI captures use the default mode; `ATOM_CAPACITY_DETAILS=1` captures downloaded export failures and Undo reload observations at 6/10/12. The observed failure is recorded rather than silently asserted to pass. `ATOM_RUN_CAPACITY_LIVE=1` enables the separate live Evaluate suite; it needs a built copied frontend and copied server binary (see the test source). Do not run timing workloads concurrently. `inventory.py` regenerates source classifications and `collect.py` assembles the ledger after evidence runs. Audit tooling uses the default `/tmp/atom-network-capacity` workspace; input fixtures are generated from the unchanged repository dataset.

Completed checks:

- Backend `go vet ./...`, `go test -race ./...`, ordinary tests and fixed-clock 6/8/9/10/12 budget regressions.
- Gated full-pack measurements, independent counter/hash and explanation confirmation, real C workflows, production validation, and gated 12-cell cancellation with `-race`.
- Frontend lint, all 377 tests in 67 files, production build; focused audit E2E for desktop/responsive, reports, polygon/batch selection, lazy explanation, export/Undo observations, and eight live RF Evaluate cases.
- `sh docs/build-reference-pages.sh`; docs validation (45 HTML files, 41 API paths); `python3 scripts/versioning.py check` (0.10.2); whitespace/diff and unchanged tracked-production checks.

The documentation validator required PyYAML, installed only into an audit virtualenv because neither system nor bundled Python supplied it. Existing build warnings (Pandoc mathml deprecation, frontend chunk size and Node color/localStorage messages) did not fail checks. No dependencies or production source were changed for those warnings.

The additions are `backend-go/network_capacity_audit_test.go`, the two gated frontend E2E specs, `scripts/network-capacity-audit/`, this report, measurement/cap-inventory JSON, and documentation evidence assets. No tracked file changed from the starting commit. No blockers were fixed, and all production guards remain unchanged.
