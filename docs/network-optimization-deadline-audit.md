# Network optimization deadline audit

Audit dated 2026-10-03. Goal: explain and correct `RF analysis exceeded its request deadline` without changing scientific/search semantics, request accounting, or progress UI.

## Starting baseline

- Branch `main`, HEAD `9617f37dd74de1843731cbefefd3c00a83c07f13`, VERSION `0.10.0`.
- Checkout already contained the RF request-budget audit: 10 tracked files, 192 insertions / 21 deletions, plus its backend test, frontend E2E and Markdown/HTML audit. These edits are preserved.
- Baseline `go test ./...`: pass (main 1.093 s, raytracer cached); `go test -race ./...`: pass (main 1.874 s, raytracer cached); `go vet ./...`: pass.
- Baseline frontend: 65 files / 357 tests pass (8.06 s). Focused retained-Pareto E2E: 1 pass (2.2 s). Initial broad E2E filter: 1 pass / 1 real-backend test skipped, recorded rather than treating the skip as coverage.
- Focused optimizer/fingerprint baseline: `go test ./raytracer -run 'TestOptimizeNetwork|TestNetworkSearch|TestNetworkScenario' -count=1` passes (0.558 s).

## Deadline ownership

`main.go` reads `RF_REQUEST_TIMEOUT_SECONDS` through `envInt` (missing, malformed, nonpositive values use 60). `protectExpensiveRFRoutes` owns `context.WithTimeout` for protected POST routes, including network and single-cell optimization, evaluation, simulation, sector analysis, interference, surfaces, experiments and reference diagnostics. The timer begins after API-key validation, before limiter admission and body decoding. Admission does not queue; it accepts or immediately rejects. The derived context is passed through the production network handler into optimizer/domain preparation and deep RF loops.

`writeRFResponse` returns HTTP 504 with exactly `{"error":"RF analysis exceeded its request deadline"}` on `context.DeadlineExceeded`; canceled clients return without a result. No partial recommendation is serialized. The limiter releases global/client slots when synchronous handler work unwinds. The HTTP server separately has 120 s WriteTimeout; this is not the source of the quoted JSON error.

Frontend `optimizeNetwork` makes one `postJSON('/api/optimize-network', ...)`. `apiClient.requestJSON` throws the response's `error`; App's catch displays that text. Sequential per-cell map simulations begin only on success. Durable-run setup precedes this request, so UI elapsed time can exceed the backend deadline; it is not proof of a longer RF deadline. No frontend auto-retry or additional candidate HTTP calls occur.

## Reproduction protocol

`node scripts/network-optimization-deadline-fixtures.mjs /tmp/atom-deadline-fixtures` uses the unchanged actual frontend request builder, defaults, and canonical Ankara tower positions. It generates 2–6-cell cases at 28 and 2.6 GHz, 120 rays, 400 m, 30 dBm, 120-degree beam, current default priorities, no positive radio-quality objective, and no explicit search-policy override. This is a closest deterministic reproduction; the user's exact selected-cell payload was not supplied.

The gated `TestNetworkOptimizationDeadlineWallClockAudit` uses the same extracted production route registration, decoding, validation, RF protection and serialization. Deadline zero is controlled-test-only. Detailed request-local timing stays outside responses/fingerprints. Natural timings are run without competing test workloads. Dataset loading is recorded separately from admitted-request runtime.

## Confirmed affected case and reproduction

The user clarified that the affected network has **six**, rather than five, cells: `9664800`, `26390`, `9664790`, `9664795`, `9664791`, `9664794`, in that order. Their coordinates are taken from the existing Ankara tower dataset. The user confirmed 5G / 28 GHz; ray count, radius, azimuth overrides and priorities were not supplied, so the reproduction uses current UI defaults: 120 rays, 400 m per cell, 30 dBm, 120-degree beam, starting azimuth 90 degrees, default priorities 50/50/50/50/0, no hard constraints. Although the inventory source tags say LTE, the UI's resolved RF profile is 5G / 28 GHz; the fixture uses the frontend builder and does not infer a different RF profile from those tags.

- Existing running `atom-app`: affected payload returns **504 after 60.008531 s**, exact quoted deadline error. An earlier five-cell canonical control also returns 504 after 60.006305 s.
- Controlled audit container using the same `atom:local` runtime image, original instrumented backend test binary, same dataset and no outer deadline: affected payload naturally completes in **112.731062 s**.
- Two subsequent isolated natural runs: **94.706742 s**, **95.015039 s**. Min/median/max across the three: **94.707 / 95.015 / 112.731 s**. The first run overlapped host control measurements; this can explain part of its larger time. All three are above 60 s. These are tiny-sample observations, not population percentiles.
- The full successful response SHA-256 is `651d3a97c8b3dec6c67d580dfeccd8f74cca9dbe6faf5d2261b9b6182290eed0`; scenario fingerprint `network-d7a9f6c9a1b34208e5eceb368960fc61`; recommendation `220.0,220.0,350.0,120.0,90.0,90.0`.
- Environment: Apple M4, 10 logical CPUs; Go module-selected toolchain **go1.26.6** on darwin/arm64 and linux/arm64, GOMAXPROCS=10. The shell reports go1.27.1 but the module selects 1.26.6. Docker `cpu.max` is `max 100000`, with no container CPU/memory quota. Observed original process RSS was approximately 835 MiB (RSS 855008 KiB), live container memory approximately 822 MiB. These are samples, not measured peaks.

## Active policy and exact search budget

The unchanged frontend payload omits `search_policy`, `max_search_passes` and `max_unique_evaluations`. Therefore production selects **`legacy_two_pass_coordinate`**, not either opt-in policy. It has one start, two unconditional passes, each selected cell in request order, and 36 absolute azimuth candidates (0 through 350 degrees, step 10). It does not stop until stable. For N cells it proposes **72N + 2** network evaluations, including baseline and final incumbent recomputation. Its budget is a fixed loop count independent of wall time; configured opt-in bounds do not replace these loops.

For comparison, `deterministic_multistart_coordinate_v1` uses four starts (baseline and uniform rotations 90/180/270), up to 8 default passes per start, and a default 5000 **unique expensive network-state evaluations** shared across the request; memo hits do not consume that unique budget. It terminates on stability, repeated state or a configured bound. `deterministic_pareto_archive_search_v1` also seeds four starts, defaults to 5000 unique RF states / 128 expanded states / 16 rounds, and preserves its priority-independent FIFO/archive rules. Neither opt-in policy was changed by the runtime fix.

## Candidate accounting and memoization

For the affected six-cell legacy case:

| Counter | Before | After |
|---|---:|---:|
| Proposed / aggregated network candidates | 434 | 434 |
| Unique complete network states | 421 | 421 |
| Duplicate network proposals / aggregations | 13 | 13 |
| Feasible / infeasible proposal evaluations | 434 / 0 | 434 / 0 |
| Unique feasible states scored for Pareto processing | 421 | 421 |
| Non-dominated states ranked before public truncation | 50 | 50 |
| Ranked solutions returned | 25 | 25 |
| Independent per-cell RF contribution requests | 2604 | 2604 |
| Per-cell memoization hits / misses | 0 / 2604 | 2424 / 180 |
| Duplicate expensive per-cell computations | 2424 | 0 |

The last two lines count **cell contributions**, not network states. Before the fix all 434 network calls repeated RF work, including repeated complete states; afterward each network proposal is still aggregated and checked. A candidate can reuse all contributions, or compute just its newly changed cell. Every cache miss still executes the existing reach and building-coverage functions; this task did not combine those RF algorithms or change their equations. Final compatibility per-tower summaries are still recomputed independently and are outside the 2604/180 counters.

There are only five distinct spatial/profile combinations among the six affected cells: `9664791` and `9664794` are co-located with identical resolved RF profiles. Thus 5 × 36 = **180** distinct cell configurations suffice. Cells remain distinct during network aggregation, including overlap and interference; only their identical independent RF contribution is shared.

Legacy had no whole-state cache. The new map is request-scoped inside its prepared context and keyed by the complete comparable `StaticSimulationRequest`: coordinates, exact normalized azimuth, ray count, calibration, and full resolved profile (including frequency, antenna, radius, channel and receiver inputs). No floating-point rounding or truncated hash is used. Pointer-valued PCI fields can cause a conservative missed reuse when equivalent values use different pointers, but cannot alias unequal RF inputs. No state is shared between requests or persisted. At most 37 entries per cell cover the 36 grid angles plus an off-grid baseline: **at most 222 entries** for six cells. Entries retain reach scalars and building-power maps, not ray geometry.

Existing opt-in whole-state memoization remains intact: sorted cell-ID/normalized-azimuth JSON, six-decimal azimuth normalization and a 96-bit SHA-256 prefix, scoped to invariant request physics. Tower ordering normalizes identically in that key; collision probability is negligible but not mathematically zero. Existing deterministic ledger tests verify hit/miss and budget behavior. This audit found no broken opt-in memoization; it did not redesign that key.

## Wall-clock phases and per-candidate cost

First affected controlled-container natural run, before correction:

| Phase | Wall time | Share of 112.731 s |
|---|---:|---:|
| Setup including fixed domain preparation | 1.188 ms | 0.001% |
| Domain preparation (nested in setup) | 1.024 ms | 0.001% |
| Search initialization | 0.004917 ms | <0.001% |
| Baseline network evaluation | 300.158 ms | 0.266% |
| Search | 111956.710 ms | 99.313% |
| Candidate generation | 0.084670 ms | <0.001% |
| Objective / constraint acceptance | 3.672 ms | 0.003% |
| RF reach evaluations | 72447.711 ms | 64.266% |
| Building coverage evaluations | 39872.544 ms | 35.370% |
| Prepared-domain aggregation | 52.376 ms | 0.046% |
| Pareto/archive processing | 31.339 ms | 0.028% |
| Ranking / recommendation (includes archive and dataset quality summary) | 103.945 ms | 0.092% |
| Final compatibility tower summaries | 151.953 ms | 0.135% |

**Nested phase timings must not be summed.** Each start/pass/coordinate duration is retained in the JSON measurement ledger. First pass 57.580 s; second pass 54.377 s. Coordinates ranged approximately 7.753–10.132 s. No initialization/search explosion was hidden in setup.

Candidate elapsed distributions (434 calls, empirical order statistics; includes baseline/final):

| Affected container case | Min | Median | p90 | p95 | Max |
|---|---:|---:|---:|---:|---:|
| Before | 199.515 ms | 265.543 ms | 277.382 ms | 287.820 ms | 394.505 ms |
| After, first same-container run | 0.081 ms | 0.135 ms | 38.874 ms | 44.977 ms | 205.846 ms |

Afterward the distribution mixes full-cache network aggregations and new-cell RF evaluations; it is not the latency distribution of 180 cache misses alone. The post-fix baseline was 205.871 ms, initialization 0.020750 ms, Pareto/archive 33.245 ms, ranking/recommendation 105.062 ms, serialization 0.392 ms, decoding/validation 0.201 ms, cell memo lookup 1.218 ms total. RF reach/building coverage fell to 4.042/2.363 s. The final detailed run separately measured admission, dominance and ranking; those values are in the ledger.

## RF subsystem, spatial data and CPU findings

Ankara `ankara-open-planning` version 2026.07 has **161626 GeoJSON building features / 161784 indexed polygon footprints**, and 451 inventory cells. Multipart polygons explain the differing building counts. The affected selected-radius union contains 801 relevant building entities, 9 demand entities and 759 residential entities. The default radio-quality objective has weight zero, so this case prepares no interference sampling domain and performs no radio-quality candidate evaluation. Coverage is building-based; it does not secretly add a spatial coverage grid.

Before: **10636560** spatial queries, **63202457** accumulated candidate checks, maximum 125 candidates per query; mean approximately 5.94. After: **746640** queries and **4387073** candidate checks, same maximum 125, approximately 14.25× fewer queries. These include full-path geometry and short segment queries across the reach and building-coverage passes, plus compatibility summaries. Spatial access is indexed; it does not scan all 161784 footprints for every ray. The dataset adds real geometry work, but the repeated invocation count magnifies it.

Controlled empty-building-index comparison with the same affected cells, ray/radius settings and legacy proposal count: **27.341 s before / 2.202 s after**, versus the production dataset's isolated baseline approximately 95 s and corrected approximately 6.75 s. The empty fixture changes objective availability and recommendation naturally; it is a cost control, not scientific equivalence to Ankara. The existing controlled-building regression fixture additionally proves cached/uncached output equality. Production geometry is roughly 3.5× slower than the empty-index baseline in these runs; this does not establish a pathological spatial-index defect.

A host CPU profile of the original five-cell canonical run sampled 91.57 CPU seconds over 45 s including dataset setup (~204% average CPU). Cumulative ray simulation consumed 29.10 sampled CPU seconds; propagation-link evaluation 10.63 s, RTree search approximately 3.97 s; considerable samples were in GC scanning and scheduler signaling. These CPU values overlap and are not wall-clock phase shares. The profile supports repeated RF calculation/allocation and GC pressure; it does not isolate a unique defective intersection formula.

Candidate/network-cell evaluation is sequential. Reach rays are sequential; building-coverage profiles use `min(4, NumCPU, rays)` workers with disjoint indexed result slots, shared feature-budget atomics and context cancellation. The dispatcher closes jobs and joins every worker before returning. No candidate parallelism, worker count, scheduling, antenna math, LOS/NLOS classification, link budget, interference or objective calculation was changed. New per-cell memoization is accessed only by the existing synchronous candidate loop; spatial debug counters use a mutex because ray workers can report them concurrently.

## Frequency and selected-cell scaling

Comparable canonical frontend payloads, same dataset / 120 rays / 400 m / legacy policy:

| Selected cells | Proposals | Unique states at 28 GHz | Before 28 GHz host | After 28 GHz host |
|---:|---:|---:|---:|---:|
| 2 | 146 | 106 | 7.666 s | 1.776 s |
| 3 | 218 | 176 | 19.913 s | 2.861 s |
| 4 | 290 | 246 | 36.113 s | 3.813 s |
| 5 | 362 | 316 | 43.044 s | 4.732 s |
| 6 | 434 | 386 | 64.587 s | 5.028 s |

Host timing controls partly overlapped the initial live/container reproduction, and one six-cell outlier overlapped cross-compilation; treat this as descriptive scaling rather than a clean fitted benchmark. The loop accounting establishes the important trend independently: before, N coordinates × N cells per candidate produces roughly quadratic RF repetition; after, 36 independent RF settings per distinct cell gives approximately linear expensive RF work, while all original network aggregation/Pareto processing remains.

| Frequency / count | Before host | After host | After controlled container |
|---|---:|---:|---:|
| 2.6 GHz / canonical 5 cells | 45.839 s | 4.085 s | — |
| 28 GHz / canonical 5 cells | 43.044 s | 4.732 s | — |
| 2.6 GHz / canonical 6 cells | 70.383 s | 4.625 s | 5.948 s |
| 28 GHz / canonical 6 cells | 64.587 s | 5.028 s | — |
| 2.6 GHz / affected 6 cells | — | 5.516 s | — |
| 28 GHz / affected 6 cells | 94.707–112.731 s container | 5.414 s | 6.721–6.761 s |

Both comparable frequency cases use the same urban-short-range propagation implementation, ray/segment loops and indexed geometry handling. Frequency changes propagation/receiver terms and outcomes, not candidate policy or the number of spatial passes. Measurements do not support a special 28 GHz computational explosion. The affected cluster differs spatially from canonical controls, so cross-cluster timings should not be attributed to frequency.

## History, deadline intent and workload classification

Protection commit `a6234d8` (2026-07-26) introduced the 60-second context ceiling and already listed `optimize-network`, evaluation, simulation, optimization-azimuth and interference. Its docs described bounded expensive RF work and concurrency/resource protection. There is no evidence that it excluded optimization or promised modern optimization workloads a longer ceiling. Reference, surface and experiment routes were added later under that shared protection.

A safe historical comparison exists for **v0.9.3**, commit `9db0e9baa5c333be0fa0efcd2e694de908f98a05`: RF/search files, main route, RF protection, dataset and relevant frontend payload/default code are identical to HEAD. Only unrelated backend security-header changes differ. An archived v0.9.3 checkout, same affected frontend payload/dataset and no outer deadline, naturally completed on the host in **74.821749 s** with the **same full response hash** as current uncached and corrected code. Thus this is **not a new v0.10.0 RF/search regression relative to v0.9.3**. Regression status relative to materially older RF models is unknown; comparing their different equations would be invalid.

Workload classes differ: analyze-sector shares one propagation/gap execution; evaluate-network evaluates one network plus compatibility summaries; interference builds a bounded sampling domain; optimize-network traverses candidate networks; optimize-azimuth evaluates 36 orientations using its existing worker pool; diagnostics/reference routes compute their respective bounded analyses; coverage surfaces evaluate samples; experiment execution uses its manager's bounded contexts. That difference alone is not evidence to split deadlines. Removing demonstrated redundant RF work gives the normal network optimizer substantial headroom under the existing ceiling. No deadline classes or request budgets were changed.

## Root cause and chosen correction

**Classification I — Other: accidental repeated independent per-cell RF work in the default legacy network scorer.** This is not an excessive candidate-generation defect, broken opt-in state memoization, an established recent regression, or evidence that this normal workload inherently needs a longer deadline.

Each coordinate proposal changes one cell, yet the original scorer reran both reach and building-coverage RF work for all selected cells. Only 180 independent cell configurations were needed for the affected case, but the scorer computed 2604. Cache those independent contributions inside one legacy request, while preserving every original network proposal, exact floating-point addition order, demand/residential denominators, network aggregation, radio-quality evaluation, constraints, tie-breaking, feasible Pareto candidate set, public 25-solution truncation, ranking and recommendation.

**Deadline before/after: 60 / 60 seconds.** The existing env override, malformed/nonpositive fallback, API key, global/client concurrency, 20/min fixed-window budget, cancellation and timeout message remain unchanged. No timeout increase or unbounded production path is required. New cache size is structurally bounded by the unchanged legacy grid. No scientific inputs were reduced.

## Acceptance, cancellation and invariance

- Affected six-cell defaults: first same-container corrected run **6.720739 s**, repeats **6.760776 s / 6.749160 s** (exact ledger values authoritative). All are successful under the real 60-second middleware. Min/median/max for this three-run sequence: **6.721 / 6.749 / 6.761 s**. A subsequent final detailed run overlapped the host middleware-disabled control and took **7.441 s**; it is also recorded in the ledger. The normal HTTP E2E with production spatial diagnostics disabled took **5.380 s**.
- Original requested five-cell acceptance: first five supplied cells, 28 GHz, **6.650231 s** controlled container, success.
- Representative six-cell 2.6 GHz: **5.947744 s** controlled container, success.
- Two-cell canonical control: **1.776 s** host, success.
- Same affected corrected payload with RF middleware disabled only in the test: **5.977124 s** host; identical response hash. The small timing difference from protected controls is not evidence that admission is material.
- Intentionally excessive opt-in multistart case: same six cells and RF settings, 64-pass / 100000-unique-state limits. It returned the exact 504 error after **60.006989 s**. Context deadline was 60.000004 s; the observer noticed cancellation at 60.006806 s and response/cleanup completed **0.182918 ms** later. Overall deadline overshoot was **6.984751 ms**, including scheduling, deep-loop unwind and serialization. Three goroutines remained (the harness baseline), global/client slots were empty, and the response contained no recommendation, fingerprint or partial success. Opt-in candidate totals are unknown on this canceled path because completed search metadata is not returned; the diagnostic zero placeholders in the raw run are normalized to null in the ledger. RF subsystem counters show 1650 cell contribution attempts before cancellation.
- Deterministic fast regression sends 360 rays / 1500 m through the actual handler with a 10 ms deadline, confirms exact 504 and no partial payload, joined workers, empty global/client slots and one budget debit; a subsequent protected request immediately reacquires the slots. A direct optimizer 5 ms deadline test also requires a zero response and prompt deep-work termination. A canceled context must fail even for a memo hit.
- Seven measured canonical full before/after JSON responses are byte-identical. The affected response is identical across all three original natural runs, corrected repeats and historical v0.9.3. Controlled regressions compare complete JSON and candidate-state proposal multiplicities with mixed 4G/5G profiles, off-grid azimuths, calibration, impossible constraints, radio-quality enabled and standard urban propagation.
- Cache-key regressions change azimuth by 1e-8, ray count, calibration, coordinates, transmit power and frequency and require distinct misses. Cache-hit/candidate bounds are deterministic; existing opt-in search/ledger tests remain required.
- The only frontend code added is a focused **test**: real backend optimization using the actual unchanged frontend builder, exact original response hash and `RateLimit-Remaining: 19`. No application/request builder, scientific payload, fingerprint or persistence code was modified.
- Rate accounting remains one protected optimization request; later successful map-ray requests retain one debit each. Internal cell/candidate evaluation consumes no HTTP budget. The existing RF-budget real E2E verifies Evaluate → Interference → Re-evaluate → deliberate abuse separately.

## Observability and future optimization progress UX opportunities

The production route emits **one structured completion summary**, including operation, normalized search policy, selected-cell count, proposal/unique-state counts, cell memo hits/misses, elapsed/deadline milliseconds and completion reason. No scenario payload, cell location/ID, building geometry or per-candidate production log is emitted. Canceled opt-in search counts without completed ledger metadata are reported as unknown (-1), rather than false zero. Detailed timings, candidate distributions, start/pass/coordinate events and mutex-protected spatial counts are confined to the explicit audit collector; detailed spatial counters are disabled in normal production.

The legacy loop has a truthful baseline phase, one start, two passes, N coordinates/pass, and 72N+2 proposed evaluation calls. A current azimuth vector and best candidate exist internally; each completed coordinate/pass is meaningful, but canceled phase timings do not imply phase completion. Independent RF misses have a known upper bound (37N), not an exact known total when profiles/locations duplicate. Pareto archive size and ranking/recommendation are distinct end phases. Opt-in metadata already exposes four starts, accepted updates, completed starts, evaluation requests, unique evaluations, cache hits, archive sizes and termination reasons; until-stable and archive-growth phases do **not** have an exact completion percentage.

These can support later truthful phase/candidate/count reporting. A proposal fraction is not an elapsed-time estimate because memo hits and misses have very different costs. This task returns no incumbent/best-so-far or partial recommendation and implements no event stream, fake percentage, progress UI or spinner redesign. **Progress UX: NOT IMPLEMENTED.**

## Re-running the audit

```sh
node scripts/network-optimization-deadline-fixtures.mjs /tmp/atom-deadline-fixtures
cd backend-go
ATOM_RUN_DEADLINE_AUDIT=1 \
ATOM_DEADLINE_FIXTURES=/tmp/atom-deadline-fixtures \
ATOM_DEADLINE_CASES=user-6-28,user-5-28,6-2.6,pathological-6-28 \
ATOM_DEADLINE_SECONDS=60 ATOM_DEADLINE_STAGE=verification \
ATOM_DEADLINE_OUTPUT=/tmp/atom-deadline-results \
go test . -run '^TestNetworkOptimizationDeadlineWallClockAudit$' -count=1 -v -timeout=15m
```

A controlled natural run uses `ATOM_DEADLINE_SECONDS=0`; production configuration is not changed. `ATOM_DEADLINE_UNPROTECTED=1` removes the protected middleware only in the gated harness; `ATOM_DEADLINE_SYNTHETIC=1` selects the existing empty building-index fixture. Raw phase/count/hash measurements are retained in [the measurement ledger](network-optimization-deadline-measurements.json).

## Validation and limitations

Final check results are listed below. The fix is in this checkout and has been verified in isolated test containers; the user's existing `atom-app` was **not rebuilt or replaced**. Exact ray/radius/azimuth/priority overrides from the original session were not available, so the confirmed IDs are tested with current defaults. Extremely large/opt-in workloads remain deadline-bounded; this task does not promise every combination of supported maxima finishes in 60 s. Historical regression conclusions extend only to the equivalent v0.9.3 baseline. Hardware, concurrent load and detailed instrumentation affect timing; candidate accounting and full response hashes provide the strongest invariance evidence.



### Final validation results

| Check | Result |
|---|---|
| Backend `go test ./... -count=1` | Pass: main 0.574 s, raytracer 10.026 s |
| Backend `go test -race ./... -count=1` | Pass: main 1.758 s, raytracer 16.887 s |
| Backend `go vet ./...` | Pass |
| Gated detailed collector + deadline observer under `-race`, 20 ms cancellation | Pass: 24.692 s including dataset loading; cancellation at 20.327 ms, cleanup 0.363 ms later, 3 remaining harness goroutines |
| Core Lab adapter `go vet ./...`, `go test -race ./... -count=1` | Pass: tests 1.443 s |
| Focused optimizer/memoization/scenario tests, `-count=1` | Pass: 0.689 s |
| Frontend `npm test` | Pass: 65 files / 357 tests, 11.41 s |
| Focused request-builder/workflow tests | Pass: 2 files / 42 tests, 4.83 s |
| Frontend lint | Pass |
| Production build | Pass: 4.93 s; existing large-chunk advisory |
| Real backend affected-six-cell E2E | Pass: 1 test, 5.4 s request/test, 10.5 s including server setup; production summary 5380 ms, original full response hash and one budget unit |
| Real backend RF-budget workflow E2E | Pass: 1 test, 5.3 s test, 9.6 s including setup; explicit abuse still denied at attempt 21 |
| Focused UI E2E | Pass: retained Pareto + visible RF-budget errors, 2 tests / 3.3 s; the real-backend-only test is skipped in this mocked-server invocation and executed separately above |
| Docs build | Pass; existing Pandoc MathML deprecation advisories |
| Docs validation | Pass: 45 HTML pages / 41 API paths |
| Dataset validator | Pass: 451 towers / 161784 footprints |
| Version metadata check | Pass: 0.10.0 |
| `git diff --check` | Pass |

The default `python3 docs/validate_docs.py` initially failed because that Python lacks PyYAML. Reusing the existing `/tmp/atom-rf-budget-docs-venv/bin/python docs/validate_docs.py` (with the repository's pinned docs dependencies, created by the prior budget audit) passed. No repository dependency or global Python environment was changed.

The new live-backend E2E calls the normal HTTP route with the actual frontend request builder; existing App workflow tests and retained-Pareto browser tests cover UI dispatch/sequence and local reranking. It is not presented as a new full browser click-through of the supplied cells.

Files added: `backend-go/network_optimization_route.go`, `backend-go/network_optimization_route_test.go`, `backend-go/network_optimization_deadline_audit_test.go`, `backend-go/raytracer/optimization_cell_cache.go`, `backend-go/raytracer/optimization_cell_cache_test.go`, `backend-go/raytracer/optimization_timing.go`, `frontend-react/e2e/network-deadline.spec.js`, `scripts/network-optimization-deadline-fixtures.mjs`, this Markdown/HTML report and `network-optimization-deadline-measurements.json`. Existing files changed by this task: `backend-go/main.go`, raytracer `static_simulation.go`, `optimization_context.go`, `optimization_config.go`, `propagation_model.go`, `CHANGELOG.md`, API Markdown/HTML, reference-page build/link mapping, generated changelog/search index. Preexisting RF-budget audit files and unrelated dark-mode/source-test edits were preserved.

**Resolution:** the reproduced default workload now completes with unchanged output and the original 60-second bound. Rebuild/restart the existing local app when ready to adopt the code. Truthful progress UX remains a separate task.
