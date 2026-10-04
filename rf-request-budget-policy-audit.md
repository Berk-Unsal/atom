# RF Request-Budget Policy Audit

Completed 2026-10-04, Europe/Istanbul. **Audit only; production remains 20 protected attempts / client IP / 60-second fixed window, global concurrency 2, per-client concurrency 1, computation deadline 60 seconds, Cell cap 6.**

**Recommendation: keep the current policy unchanged for now.** Request count is demonstrably a poor RF cost proxy, but these default-fixture measurements cannot establish safe replacement budgets for deployment hardware and maximum supported inputs. Do not raise the Cell cap or simply increase the request limit on the strength of this audit. The single next action is a bounded deployment-calibrated resource admission study, including server-verified workflow reservations and asynchronous experiment work.

Machine-readable evidence: [measurement ledger](rf-request-budget-policy-measurements.json). Reproduction: [audit runner](../scripts/rf-request-budget-policy-audit/run.py), [isolated harness](../scripts/rf-request-budget-policy-audit/harness.go.txt), [collector](../scripts/rf-request-budget-policy-audit/collect.py). No external scientific claims or new RF model were introduced.

## Baseline, method and evidence boundaries

Start: branch `main`, HEAD `c48ef63c9ce064a72058e2b72c3cd095c7deb904`, VERSION `0.11.0`, clean `git status --short`, empty `git diff --stat`. No pre-existing changes needed preservation. No tracked production file was edited.

Fresh disposable Go copies use the real Ankara pack (161,784 building footprints, 451 inventory Cells). The canonical six IDs are 9664800, 26390, 9664790, 9664795, 9664791, 9664794; eight appends the capacity audit's nearest distinct inventory Cells in its deterministic order. Existing production payload builders generate fixtures: 120 rays, 400 m, 30 dBm, 120-degree beam, 2.6/28 GHz; interference uses 20/100 MHz respectively, load 0.7, reuse 1, 40 m samples. Only the disposable copy overrides MaxNetworkTowers to eight. Measurement validation remains independently capped at six and recommendation baseline at two (within its unchanged five-Cell maximum).

Each endpoint/case has one observation, not a distribution. Wall time includes handler, JSON serialization and httptest recorder writes; process CPU is user+system getrusage, including sampler overhead. Dataset loading and explicit pre-measurement GC/FreeOSMemory are excluded. Atomic counters in the disposable copy count every BuildingIndex.SearchBounds invocation, candidate returned by its R-tree, segmented ray trace, PointInPolygon call and coverage-profile build. The counters add overhead but do not change scientific computation. Spatial queries include attempted queries on empty indexes; zero means no index query, not no computation.

RSS is sampled every 200 ms plus endpoints; heap and goroutines every 50 ms plus endpoints. These are approximate sampled maxima, not exact peaks. Recorder buffers and copied responses inflate measurement memory relative to streamed HTTP. Before/after RSS and heap are retained in the ledger; absolute RSS includes the dataset and Go runtime. Concurrent CPU/work counters describe the whole two-request process, never each request individually. JSON timing wraps encoding and recorder writes, not pure encoder CPU. Network transport, WAN latency and browser rendering are excluded from backend timings. Browser/parse evidence below is separate.

Endpoint extras are deliberately bounded contract fixtures: one measurement sample; 140 GHz atmospheric and P.1411 reference cases; one synthetic controlled Sub-THz validation measurement; explicit material/reflection cases; a 10 m surface grid; four azimuth experiment runs; recommendation over a fixed rectangle with two baseline Cells. They are not maximum-cost samples. Eight-row extras do not imply every endpoint accepts eight Cells. Frozen clocks make fresh-window workflow/admission tests deterministic; abusive cadence uses real clocks.

## Current limiter semantics and historical intent

Source: [rf_protection.go](../backend-go/rf_protection.go), [main.go](../backend-go/main.go), [budget regressions](../backend-go/rf_budget_audit_test.go).

The window is client-anchored: first attempt creates windowStart; the first attempt at or after start+60 s sets start=now and requests=0. This is a fixed window per key, not a calendar-aligned window or rolling sliding window. Defaults are environment-configurable, but no deployment environment was modified or claimed inspected here.

Key is Gin ClientIP. With TRUSTED_PROXIES unset, main explicitly trusts no forwarding proxy: the socket peer is authoritative. Explicitly trusted proxy CIDRs allow forwarded identity. IPv4-mapped IPv6 normalizes to the same IPv4 bucket. Tabs, projects and users behind the same resolved IP share both attempts and per-client concurrency. State and two global slots are process-local, lost on restart, independent across replicas. At 4,096 tracked keys, the oldest inactive entry may be evicted even before its window expires; all-active overflow uses a shared fallback state. Identity churn and multiple IPs prevent this from being a global sustained-work bound.

Authentication is checked before RF admission. The timeout context is attached before limiter admission. acquire checks exhaustion first, then increments attempts, then checks active per-client requests. The global channel is checked last, without queueing. Consequently success, JSON/body/validation errors, internal error, cancellation, deadline, per-client rejection and global-capacity rejection all retain one charge if the bucket was not already exhausted. Exhausted-budget denials add zero, and API-key rejection adds zero. Body-limit middleware wraps the reader earlier, but decoding detects oversized input after admission (413 still costs one).

Headers RateLimit-Limit, Remaining and Reset reflect admission, including any charge on concurrency denial. Reset is relative seconds, rounded up and at least one. Exhaustion returns 429 with Retry-After=Reset; client/global concurrency denial uses Retry-After=1, which is a retry hint, not a capacity guarantee. Denials are no-store. Release is idempotent, decrements active only and never refunds attempts. Denials do not extend the window. A new window does not clear active work. HTTP reads/writes have their separate server timeouts; the 60-second RF context is cooperative compute cancellation, not a forced goroutine kill or serialization deadline.

Introducing commit: `a6234d8ade37eb005797f57a1c1ab2c0179f5125` (2026-07-26), “Enhance RF request handling with per-client limits and API key authentication”. Its deployment documentation says “process-wide expensive RF admission”, one concurrent job per identity and 20 expensive-route attempts/minute, and asks operators to measure CPU, memory and tail latency before raising concurrency. This supports HTTP-frequency/abuse control around expensive CPU work and capacity fairness. Memory safety is an indirect benefit, not a measured byte bound. **No numeric derivation for 20/min was found.** The later `a6c6d74` audit fixed rounded retry timing and optimized request-local RF reuse without changing the budget. It established mechanical correctness; this audit examines accounting fidelity.

## Protected inventory

All entries are POST, currently one attempted HTTP request = one unit after authentication. “Follow-up” means normal frontend ownership, not free work. G=RF/ray or obstruction geometry; B=building coverage; I=interference/radio quality; S=optimization/search; P=primarily presentation transport. “Direct” denotes a scientific tool action rather than an automatic network-run follow-up.

| Endpoint `/api/…` | Handler / compute | Scientific purpose | Owner | Internal fan-out | Work dimensions |
| --- | --- | --- | --- | --- | --- |
| simulate | main inline / SimulateStaticRaysContext | ray map and simulation KPIs | direct + network follow-up | 120 rays | G B P |
| analyze-sector | main inline / AnalyzeSectorContext | shared rays, simulation and gap analysis | direct | shared profiles | G B P |
| coverage-gaps | main inline / FindCoverageGapsContext | unserved demand/building points | direct | ray profiles | G B |
| optimize-azimuth | main inline / OptimizeAzimuthContext | best single-Cell orientation | direct | 36 headings + result | G B S |
| evaluate-network | main inline / EvaluateNetworkContext | one network configuration | direct | N contributions + N summary RF passes | G B; I if objective enables |
| optimize-network | registerNetworkOptimizationRoute / OptimizeNetworkContext | network configurations and Pareto solutions | direct | 434 / 578 proposals | G B S; I if enabled |
| explain-network-cell | main inline / ExplainNetworkCellContext | marginal changed-Cell effect | lazy result follow-up | counterfactual scoring | G B; I if enabled |
| interference | registerInterferenceRouteProvider / AnalyzeInterferenceContext | serving signal and radio quality grid | direct | samples × Cells | G I P |
| building-entry-analysis | main inline / AnalyzeBuildingEntryContext | indoor/entry loss and service | direct | buildings × Cells | G B |
| path-profile | registerPathProfileRoute | link terrain/obstruction ledger | direct | path samples / footprint intersections | G |
| coverage-surface | registerCoverageSurfaceRoute / GenerateCoverageSurfaceContext | signal raster and contours/export | direct | grid points | G P |
| sub-thz-reference | registerSubTHZReferenceRoute | isolated atmospheric reference | direct | one link | G (obstruction), no B/I/S |
| sub-thz-p1411-reference | registerSubTHZP1411ReferenceRoute | candidate reference path loss | direct | bounded reference models | G (obstruction), no B/I/S |
| sub-thz-validation | registerSubTHZValidationRoute | controlled measurement/model comparison | direct | measurements × models | no map rays/B/I/S |
| sub-thz-material-reference | registerSubTHZMaterialReferenceRoute | material slab calculation | direct | one slab | no index/B/I/S |
| sub-thz-reflection-reference | registerSubTHZReflectionReferenceRoute | isolated specular ledger | direct | one facade/link | G, no canonical B/I/S |
| measurements/evaluate | registerMeasurementRouteProvider / EvaluateMeasurementsContext | predicted/measured residuals | direct | samples × Cells | G I prediction, no map rays |
| recommend-sites | registerRecommendationRouteProvider / RecommendSitesContext | marginal candidate-site utility | direct | candidate sweeps + network scores | G B S |
| processes/batch-experiment/execution | registerExperimentRoutes / manager.Start | enqueue parameter matrix | direct | 4 observed; up to 64 runs/job | G B after POST returns |

GET downloads/jobs/meta and `/api/spatial-evidence/path-profile` are not in expensiveRFRoutes and are not charged by this RF bucket. They must not be confused with the protected `/api/path-profile`. Building downloads/feature queries have separate existing admission policies. Experiment polling is unprotected by the RF bucket.

## Resource cost per current unit

Every table row costs one unit. Ranges below span the two six-Cell frequency cases (one sample each); units are milliseconds, decimal MB, and counts. Other route inputs remain the bounded fixture just described. Full eight-Cell rows, heap, goroutines, candidates and request bytes are retained in JSON.

| Operation | Wall ms/unit | CPU ms/unit | Index queries/unit | Ray traces/unit | Response MB/unit |
| --- | --- | --- | --- | --- | --- |
| simulate | 13.138–32.165 | 38.317–68.804 | 25,388–25,388 | 120–120 | 2.123–7.326 |
| analyze-sector | 16.168–44.286 | 41.787–84.036 | 25,389–25,389 | 120–120 | 2.129–7.331 |
| coverage-gaps | 11.382–21.120 | 36.873–56.834 | 25,389–25,389 | 120–120 | 0.005–0.005 |
| optimize-azimuth | 391.608–632.247 | 1862.695–2475.754 | 890,304–897,540 | 4,320–4,320 | 0.005–0.005 |
| evaluate-network | 398.521–612.644 | 733.185–1223.696 | 382,470–388,509 | 2,160–2,160 | 0.029–0.029 |
| optimize-network | 5770.895–7052.096 | 16198.472–19200.746 | 7,519,549–7,601,236 | 43,920–43,920 | 0.098–0.098 |
| explain-network-cell | 195.844–199.647 | 515.218–536.179 | 254,732–257,796 | 1,440–1,440 | 0.003–0.003 |
| interference | 40.108–54.640 | 57.540–82.783 | 4,376–4,376 | 0–0 | 4.668–4.698 |
| building-entry-analysis | 48.533–49.627 | 47.623–49.700 | 2,016–2,016 | 0–0 | 2.265–2.267 |
| path-profile | 0.671–0.749 | 0.699–0.781 | 12–12 | 0–0 | 0.019–0.019 |
| coverage-surface | 37.893–38.244 | 37.949–38.297 | 5,028–5,028 | 0–0 | 0.786–0.814 |
| sub-thz-reference | 0.620–0.718 | 0.655–0.763 | 3–3 | 0–0 | 0.008–0.008 |
| sub-thz-p1411-reference | 0.705–0.751 | 0.738–0.786 | 3–3 | 0–0 | 0.019–0.019 |
| sub-thz-validation | 0.683–0.697 | 0.711–0.726 | 0–0 | 0–0 | 0.004–0.004 |
| sub-thz-material-reference | 0.575–0.641 | 0.605–0.668 | 0–0 | 0–0 | 0.005–0.005 |
| sub-thz-reflection-reference | 0.865–0.934 | 0.894–0.972 | 0–0 | 0–0 | 0.007–0.007 |
| measurements/evaluate | 0.715–0.723 | 0.742–0.756 | 0–0 | 0–0 | 0.016–0.016 |
| recommend-sites | 5678.410–5910.888 | 25628.520–27031.744 | 11,104,955–11,317,483 | 60,960–60,960 | 0.022–0.022 |
| processes/batch-experiment/execution | 44.739–62.458 | 141.712–164.740 | 99,741–100,411 | 480–480 | 0.001–0.001 |

Experiment timing includes completion of all four asynchronous runs, while response bytes are the small POST admission response. Submission alone is cheaper and cannot represent job cost. Cached POST responses include the result and still spend one unit. Recommendation has a supported two-Cell baseline; it is often more expensive than six-Cell Optimize despite the same HTTP charge. Tiny reference/measurement fixtures do not establish worst-case cost for their endpoints.

## Ratios, internal fan-out and caching

| Cells | GHz | Numerator / denominator | Wall × | CPU × | Spatial-query × | Response × |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | 2.6 | optimize-network / interference | 129.1 | 231.9 | 1718.4 | 0.021 |
| 6 | 2.6 | optimize-network / simulate | 219.2 | 279.1 | 296.2 | 0.013 |
| 6 | 2.6 | evaluate-network / simulate | 19.0 | 17.8 | 15.1 | 0.004 |
| 6 | 2.6 | simulate / sub-thz-material-reference | 56.0 | 113.7 | undefined (0 denominator) | 1470.400 |
| 6 | 2.6 | recommend-sites / optimize-network | 0.8 | 1.4 | 1.5 | 0.221 |
| 6 | 2.6 | explain-network-cell / simulate | 6.2 | 7.8 | 10.0 | 0.000 |
| 8 | 2.6 | optimize-network / interference | 172.2 | 349.4 | 1942.8 | 0.017 |
| 8 | 2.6 | optimize-network / simulate | 345.8 | 485.2 | 435.6 | 0.015 |
| 8 | 2.6 | evaluate-network / simulate | 21.1 | 21.5 | 20.6 | 0.005 |
| 8 | 2.6 | simulate / sub-thz-material-reference | 42.6 | 85.2 | undefined (0 denominator) | 1470.400 |
| 8 | 2.6 | recommend-sites / optimize-network | 0.7 | 1.1 | 1.0 | 0.200 |
| 8 | 2.6 | explain-network-cell / simulate | 10.7 | 12.4 | 13.8 | 0.000 |

Evaluate actually traces 2,160/2,880 rays at six/eight (3N×120 including contribution and summary work), not just one 120-ray pass per Cell. Explanation traces 1,440/1,920 (2N×120). Optimize traces 43,920/61,440 after reuse; observed miss counts are not interchangeable with traced-ray counts. Recommendation evaluates 12 shortlisted candidates and traces 60,960 rays in the two-Cell fixture. One Optimize charge hides 434 proposals at six and 578 at eight (`72N+2`). Memo hits/misses are 2,424/180 and 4,372/252 respectively for the fixture; returned best-configuration summaries add work beyond proposal cache misses. The measured ray/coverage counters are the actual work after reuse, not proposal count multiplied by N. Single-Cell azimuth search evaluates 36 headings with up to four candidate workers; each coverage profile can itself use up to four ray workers. Network search is sequential over candidates with ray workers inside each miss. Recommendation first optimizes shortlisted candidate azimuths (36 each), then scores baseline/augmented networks; response candidates_evaluated and actual query/ray counts are retained. Interference performs a fixed spatial sample domain across serving/co-channel Cells, not an optimizer sweep.

The optimizer cache is request-local, keyed by the full resolved static request; it does not make a repeat HTTP Optimize free. Prepared domains avoid repeated domain construction inside a request. Sector reuses profiles for its two outputs. Empty/no-building cases and small diagnostic fixtures are much cheaper but still charged. A completed identical experiment hits the process cache: the observed cached cost/work counters are in the ledger. Frontend explanation caching avoids the POST entirely after a successful same-key explanation; map focus, scope, layer toggles and Review use retained results and cost zero. A new Evaluate still repeats geometry and map serialization.

**Asynchronous exception:** experiment jobs use context.Background with their own cancellation, worker/queue controls (default one worker, queue 16, max 64 runs/job, 128 retained jobs, 16 cache entries). The POST's RF slot and 60-second context end at submission. Background RF is not bounded by the two RF HTTP slots or that request deadline. Its separate worker/queue bounds help, but any future unified RF resource model must account for job admission and retained work. This is existing behavior, not changed here.

## Frontend follow-up ownership

[App.jsx](../frontend-react/src/App.jsx) Evaluate posts evaluate-network, then [runNetworkSimulationQueue](../frontend-react/src/utils/networkSimulationQueue.js) serially posts simulate for each selected Cell with its effective azimuth/profile. combineNetworkSimulations attaches stable IDs and builds retained GeoJSON/stats; map rendering reads those results. One current-request/cancellation scope owns the whole operation; results commit only when current. No gap/interference HTTP call is hidden in this Evaluate sequence.

Optimize posts optimize-network, uses optimized_towers to select each optimal azimuth, then runs the same serial per-Cell simulations and combines their map data. Review renders retained outputs. Inspecting Pareto alternatives does not resimulate the map. Lazy changed-Cell explanation may post explain-network-cell and caches success; unchanged Cells return before dispatch. Evaluate alone explicitly has no Pareto alternatives to explain.

**Classification D, mixed, for both sequences:** deterministic presentation transport and compatibility summary work (B/C) owned by one logical action, backed by real new geometry/coverage and large serialization. They are not separate user-initiated scientific decisions (A), but making them unbounded/free would remove real cost protection. Optimize map costs depend on optimized headings, so the D measurements use the actual optimizer output, not baseline simulations.

## Six/eight workflow measurements

A=Evaluate; B=Evaluate→Interference; C=Evaluate→Interference→Re-evaluate; D=Optimize→maps→Review; E=Evaluate→inspect. E-extra is Optimize→maps→one uncached changed-Cell explanation→inspect. Plain inspection/Review costs zero. E does not invent an explanation POST for unchanged Evaluate results.

| Cells | GHz | Workflow | Units | Remaining | Wall s | CPU s | Response MB | Queries |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 2.6 | two-C-1-IP | 21 | 0 | 1.585 | 3.800 | 111.122 | 1,485,558 |
| 6 | 2.6 | two-C-2-IP | 30 | 5 | 2.222 | 5.756 | 170.858 | 2,048,584 |
| 6 | 2.6 | shared-IP-two-Evaluates | 14 | 6 | 1.091 | 2.828 | 80.731 | 1,019,916 |
| 6 | 2.6 | shared-IP-Optimize-Evaluate-Interference | 15 | 5 | 6.623 | 18.983 | 85.885 | 8,160,970 |
| 6 | 2.6 | A-evaluate | 7 | 13 | 0.546 | 1.397 | 40.365 | 509,958 |
| 6 | 2.6 | B-evaluate-interference | 8 | 12 | 0.587 | 1.426 | 45.064 | 514,334 |
| 6 | 2.6 | C-evaluate-interference-reevaluate | 15 | 5 | 1.106 | 2.876 | 85.429 | 1,024,292 |
| 6 | 2.6 | D-optimize-map-review | 7 | 13 | 6.001 | 17.594 | 40.821 | 7,646,636 |
| 6 | 2.6 | E-evaluate-inspect | 7 | 13 | 0.556 | 1.426 | 40.365 | 509,958 |
| 6 | 2.6 | E-optimize-explanation-inspect | 8 | 12 | 6.182 | 17.931 | 40.824 | 7,901,368 |
| 6 | 28 | two-C-1-IP | 21 | 0 | 1.419 | 3.500 | 40.548 | 1,508,374 |
| 6 | 28 | two-C-2-IP | 30 | 5 | 2.019 | 5.112 | 64.913 | 2,080,792 |
| 6 | 28 | shared-IP-two-Evaluates | 14 | 6 | 0.960 | 2.307 | 27.789 | 1,036,020 |
| 6 | 28 | shared-IP-Optimize-Evaluate-Interference | 15 | 5 | 6.277 | 17.761 | 33.038 | 8,252,044 |
| 6 | 28 | A-evaluate | 7 | 13 | 0.477 | 1.182 | 13.895 | 518,010 |
| 6 | 28 | B-evaluate-interference | 8 | 12 | 0.516 | 1.225 | 18.562 | 522,386 |
| 6 | 28 | C-evaluate-interference-reevaluate | 15 | 5 | 0.999 | 2.492 | 32.457 | 1,040,396 |
| 6 | 28 | D-optimize-map-review | 7 | 13 | 5.778 | 16.173 | 14.476 | 7,729,658 |
| 6 | 28 | E-evaluate-inspect | 7 | 13 | 0.494 | 1.167 | 13.895 | 518,010 |
| 6 | 28 | E-optimize-explanation-inspect | 8 | 12 | 5.947 | 16.708 | 14.479 | 7,987,454 |
| 8 | 2.6 | two-C-1-IP | 21 | 0 | 1.954 | 4.688 | 117.327 | 1,922,653 |
| 8 | 2.6 | two-C-2-IP | 38 | 1 | 2.893 | 7.257 | 234.585 | 2,799,688 |
| 8 | 2.6 | shared-IP-two-Evaluates | 18 | 2 | 1.395 | 3.676 | 111.020 | 1,394,152 |
| 8 | 2.6 | shared-IP-Optimize-Evaluate-Interference | 19 | 1 | 9.461 | 27.502 | 117.539 | 11,936,184 |
| 8 | 2.6 | A-evaluate | 9 | 11 | 0.684 | 1.738 | 55.510 | 697,076 |
| 8 | 2.6 | B-evaluate-interference | 10 | 10 | 0.735 | 1.942 | 61.782 | 702,768 |
| 8 | 2.6 | C-evaluate-interference-reevaluate | 19 | 1 | 1.430 | 3.765 | 117.292 | 1,399,844 |
| 8 | 2.6 | D-optimize-map-review | 9 | 11 | 8.561 | 25.359 | 55.757 | 11,233,416 |
| 8 | 2.6 | E-evaluate-inspect | 9 | 11 | 0.701 | 1.845 | 55.510 | 697,076 |
| 8 | 2.6 | E-optimize-explanation-inspect | 10 | 10 | 8.865 | 26.036 | 55.760 | 11,583,600 |
| 8 | 28 | two-C-1-IP | 21 | 0 | 1.802 | 4.438 | 44.385 | 1,969,117 |
| 8 | 28 | two-C-2-IP | 38 | 1 | 2.594 | 6.514 | 88.702 | 2,867,272 |
| 8 | 28 | shared-IP-two-Evaluates | 18 | 2 | 1.253 | 3.353 | 38.116 | 1,427,944 |
| 8 | 28 | shared-IP-Optimize-Evaluate-Interference | 19 | 1 | 9.151 | 25.839 | 45.345 | 12,118,354 |
| 8 | 28 | A-evaluate | 9 | 11 | 0.635 | 1.643 | 19.058 | 713,972 |
| 8 | 28 | B-evaluate-interference | 10 | 10 | 0.680 | 1.680 | 25.293 | 719,664 |
| 8 | 28 | C-evaluate-interference-reevaluate | 19 | 1 | 1.319 | 3.315 | 44.351 | 1,433,636 |
| 8 | 28 | D-optimize-map-review | 9 | 11 | 8.350 | 23.704 | 20.052 | 11,398,690 |
| 8 | 28 | E-evaluate-inspect | 9 | 11 | 0.618 | 1.559 | 19.058 | 713,972 |
| 8 | 28 | E-optimize-explanation-inspect | 10 | 10 | 8.595 | 24.845 | 20.055 | 11,753,790 |

All A–E fresh-window measurements completed without 429. Six uses 7/8/15/7/7 units respectively; E-extra uses eight. C leaves five; prior Evaluate plus C needs 22 and is not comfortable in the same window. Two Eval tabs consume 14; two independent C workflows consume 30. “Comfortable” here means one fresh supported workflow, not unlimited re-runs or shared-IP isolation.

Eight uses 9/10/19/9/9; E-extra ten. C leaves one. A retained inspect leaves it unchanged; one additional protected action reaches 20; two reach 21 and the latter fails. An uncached applicable explanation plus a protected action therefore fails; explanation plus ordinary retained inspection fits exactly at 20. An explanation is not normally available after an unchanged Evaluate alone. One earlier protected failure or other action removes the spare. Eight is RF-feasible on this host but fragile under this attempt policy and remains unsupported in production.

Nine is arithmetic and middleware-only confirmation: `2×(9+1)+1=21`. Each single-IP C admits at most 20; the 21st is denied. No nine-Cell RF capacity run or production validator change was performed.

## Failures, cancellation and duplicate clicks

Existing body/authentication, response-invariance, failure, concurrency and IPv4/IPv6 tests passed. New isolated semantics tests execute real RF with already-cancelled and expired contexts: cancellation yields no response body, releases active state, retains the charge; httptest's default 200 is not scientific success. An expired deadline produces 504 and retains the charge. Malformed JSON produces 400 and consumes one. Existing unit coverage also confirms 413, 422/500 writer outcomes and busy/global 429 charges. No spontaneous reproducible scientific 500 was found; controlled failure/writer tests are not claimed as a naturally observed internal RF fault.

Stale/superseded requests are aborted by the shared frontend controller, and only current results commit. Started requests still cost one; undispatched serial follow-ups cost zero. No refunds or automatic retries exist. Buttons disable during owned work; workflow tests cover cancellation/supersession and activity cleanup. This limits ordinary repeated-click dispatch, while independent tabs/users can still submit. Malformed/early-cancel charges can surprise users but prevent infinite free admission probes and abort/restart exploitation; per-client/global busy charges can amplify NAT contention before compute starts.

## Memory, transport and concurrency

| Cells | GHz | Single Optimize wall/CPU s | Single sampled RSS / heap MiB | Two Optimize wall/CPU s | Two sampled RSS / heap MiB | Two equivalent cores |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | 2.6 | 7.05 / 19.20 | 839.1 / 623.3 | 7.52 / 39.79 | 815.9 / 671.6 | 5.29 |
| 6 | 28 | 5.77 / 16.20 | 761.7 / 608.1 | 7.33 / 37.09 | 824.4 / 691.2 | 5.06 |
| 8 | 2.6 | 8.49 / 24.96 | 807.5 / 623.6 | 11.10 / 57.58 | 805.7 / 655.0 | 5.19 |
| 8 | 28 | 8.30 / 23.53 | 771.3 / 614.6 | 10.79 / 54.99 | 813.1 / 695.0 | 5.10 |

Both allowed distinct-IP optimizers completed in each case, with no leaked active slots. The single request consumes multiple equivalent CPU cores; “global=2” does not mean two CPU cores. Compare batch wall time against its matching isolated request to estimate contention; single samples cannot establish p95 tails. The observed CPU occupancy remains below this 10-logical-CPU host's full capacity, with substantial 60-second headroom. This is not certification for a smaller CPU/memory-limited deployment, sustained multi-IP load or concurrent async jobs. RSS comparisons are non-monotonic because allocation, collection and retained pages differ; neither a lower two-request sample nor subtraction of sampled maxima proves a true peak difference. Sampled goroutines show worker fan-out; they return to runtime/experiment-worker baseline.

CPU, concurrent allocations/working sets, geometry and output bytes all matter. A 2.6 GHz six-Cell map bundle is about 40 MB and the repeat workflow about 85 MB; eight maps about 55 MB and C about 117 MB. 28 GHz emits less map data despite similar geometry query counts. Tiny Optimize result JSON hides expensive CPU; map payloads hide substantial bandwidth/parse/memory cost behind apparently cheap CPU. On a hypothetical 10 Mbit/s link, 85 MB takes at least 68 seconds before protocol overhead; this is arithmetic, not a measured network or timeout failure. Serialization duration is captured separately in every row. Browser parsing is a separately measured local Chromium microbenchmark when present in the ledger; it excludes rendering and low-memory mobile behavior. Median local Chromium parse observations were 6.7–7.0 ms for the 7.33 MB representative 2.6 GHz map, 1.8–1.9 ms for the 2.12 MB 28 GHz map, 3.2–4.4 ms for interference, and 1.4 ms for the 0.79–0.81 MB surface. These five-repeat microbenchmarks are not full workflow parsing/rendering peaks.

## Shared-IP, distinct-IP and multi-tab fairness

| Cells | GHz | Real RF sequence | Accepted | 429s | Wall s | CPU s | Last remaining |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 2.6 | two-C-1-IP | 20 | 1 | 1.585 | 3.800 | 0 |
| 6 | 2.6 | two-C-2-IP | 30 | 0 | 2.222 | 5.756 | 5 |
| 6 | 2.6 | shared-IP-two-Evaluates | 14 | 0 | 1.091 | 2.828 | 6 |
| 6 | 2.6 | shared-IP-Optimize-Evaluate-Interference | 15 | 0 | 6.623 | 18.983 | 5 |
| 6 | 28 | two-C-1-IP | 20 | 1 | 1.419 | 3.500 | 0 |
| 6 | 28 | two-C-2-IP | 30 | 0 | 2.019 | 5.112 | 5 |
| 6 | 28 | shared-IP-two-Evaluates | 14 | 0 | 0.960 | 2.307 | 6 |
| 6 | 28 | shared-IP-Optimize-Evaluate-Interference | 15 | 0 | 6.277 | 17.761 | 5 |
| 8 | 2.6 | two-C-1-IP | 20 | 1 | 1.954 | 4.688 | 0 |
| 8 | 2.6 | two-C-2-IP | 38 | 0 | 2.893 | 7.257 | 1 |
| 8 | 2.6 | shared-IP-two-Evaluates | 18 | 0 | 1.395 | 3.676 | 2 |
| 8 | 2.6 | shared-IP-Optimize-Evaluate-Interference | 19 | 0 | 9.461 | 27.502 | 1 |
| 8 | 28 | two-C-1-IP | 20 | 1 | 1.802 | 4.438 | 0 |
| 8 | 28 | two-C-2-IP | 38 | 0 | 2.594 | 6.514 | 1 |
| 8 | 28 | shared-IP-two-Evaluates | 18 | 0 | 1.253 | 3.353 | 2 |
| 8 | 28 | shared-IP-Optimize-Evaluate-Interference | 19 | 0 | 9.151 | 25.839 | 1 |

Middleware-only confirmation gives two six-Cell C users: shared key accepts 20 of 30 attempts; distinct keys accept all 30. At eight, shared accepts 20 of 38; distinct accepts all 38. Real RF tests stop a follow-up sequence on its first denial, so their number of attempted requests differs from exhaustive middleware arithmetic. Two fresh Evaluates share 14 (six) or 18 (eight) and both finish; Optimize→Evaluate→Interference shares 15 or 19 and finishes. Adding a repeat/action is sensitive. The same activity in two tabs/projects has identical server identity and accounting. Concurrent same-IP requests admit one, deny one, charge both, and advertise retry in one second. A third identity while both global slots are occupied receives 429 and spends one unit.

This is concrete false contention for independent users, not observed deployment prevalence. It is unacceptable **if** the product promises independent per-user service behind NAT; the current policy promises an IP aggregate instead. Raising or reweighting a shared bucket postpones starvation but never isolates users. Per-user identity is a separate future product/security decision; no IP key was changed.

## Fixed-window boundary and what rate limiting adds

With a priming attempt at window start, 19 more at 59.999 s plus 20 at 60 s admit 39 in one millisecond. The two-window total is 40, including the earlier priming request. **The short straddling burst bound here is 39, not the generic calendar-window 40**: the attempt that starts this client-anchored window already consumes one unit, leaving at most 19 near its end and 20 after reset. Starting all 20 near an arbitrary calendar boundary instead anchors expiry 60 seconds after their first attempt. These counts include charged busy attempts, not necessarily executed work. Active counts survive reset and global slots still cap concurrent HTTP work at two, per key one. Actual expensive work cannot execute 39 instantaneous jobs: concurrency rejects overlap and CPU/wall time constrain sequential cadence.

The 20/min rule uniquely bounds rapid repeated admissions, small/cheap RF/transport work, bad requests and busy retries per retained IP bucket. It reduces sustained cheap operation/response frequency after concurrent slots release. It does not directly bound CPU seconds, RSS, bandwidth or background job work, and multiple IPs or eviction/restart/replicas weaken aggregate frequency bounds. For measured multi-second optimizers, one client's sequential cadence can be below 20/min already; concurrency and compute time do much of that immediate protection. A budget denial nevertheless cuts further work once enough prior cheap/protected attempts have accumulated. This is evidence for keeping an abuse-frequency layer, not for removing rate limiting.

## Bounded abuse observations

No uncontrolled stress or production service traffic was used. Cheap mode attempts 21 small material diagnostics; heavy mode runs eight sequential six-Cell optimizers; alternating uses 12 (six heavy/six cheap); two-IP heavy alternates eight requests across two keys. All use real limiter clocks and default concurrency/deadline. They are bounded maximum-sequential-cadence observations, not throughput distributions. Some sequences may span a window; the ledger records actual denial counts, not a fictitious 20-job-in-60-seconds assumption.

| Pattern | Attempted | Accepted | 429s | Wall s | CPU s | Sampled RSS MiB | Response MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cheap | 21 | 20 | 1 | 0.00 | 0.00 | 457.5 | 0.100 |
| expensive | 8 | 8 | 0 | 46.74 | 137.46 | 753.3 | 0.785 |
| alternating | 12 | 12 | 0 | 35.56 | 103.14 | 755.9 | 0.619 |
| two-IP-expensive | 8 | 8 | 0 | 46.77 | 135.81 | 756.2 | 0.785 |

## Alternative policy simulations

These are offline models, not changes, safe deployment capacities, or recommended configuration values. A numeric fit to normal workflow convenience is not abuse-resistance proof.

### Higher fixed limits

| Limit/min | Six C spare | Eight C spare | Eight paid gate spare | Two six C shared spare | Two eight C shared spare | Attempt/byte envelope multiplier |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 5 | 1 | -1 | -10 | -18 | 1.0× |
| 24 | 9 | 5 | 3 | -6 | -14 | 1.2× |
| 30 | 15 | 11 | 9 | 0 | -8 | 1.5× |
| 40 | 25 | 21 | 19 | 10 | 2 | 2.0× |

24 fits the conservative 21-attempt eight gate with three spare but still denies shared repeat workflows. 30 exactly fits two six C, still fails two eight C. 40 fits both eight C with two spare. Compute-cost and bandwidth allowance can rise 1.2/1.5/2× for rapid sequential work; concurrency/deadline remain unchanged. This is not a prediction of proportional peak CPU. The worst observed resource/unit endpoint determines the offline envelope L×max measured CPU/query/bytes; it may be physically impossible to consume that CPU within a minute on one key, and maximum supported inputs were not measured. Exact vectors are retained in the ledger. A higher number fixes arithmetic only and enlarges cheap/expensive abuse envelopes without solving NAT identity.

### Weighted endpoint costs

After measurements, the illustrative integer model uses ceil(max observed endpoint CPU / 100 ms), with minimum one; map weight also uses all current per-Cell map observations rather than only the first Cell. It is deliberately conservative across six/eight and both bands. It is not an arbitrary preselected weighting.

| Operation | Illustrative 100-CPU-ms units |
| --- | --- |
| /api/analyze-sector | 1 |
| /api/building-entry-analysis | 1 |
| /api/coverage-gaps | 1 |
| /api/coverage-surface | 1 |
| /api/evaluate-network | 13 |
| /api/explain-network-cell | 7 |
| /api/interference | 1 |
| /api/measurements/evaluate | 1 |
| /api/optimize-azimuth | 25 |
| /api/optimize-network | 250 |
| /api/path-profile | 1 |
| /api/processes/batch-experiment/execution | 2 |
| /api/recommend-sites | 271 |
| /api/simulate | 1 |
| /api/sub-thz-material-reference | 1 |
| /api/sub-thz-p1411-reference | 1 |
| /api/sub-thz-reference | 1 |
| /api/sub-thz-reflection-reference | 1 |
| /api/sub-thz-validation | 1 |
| cached-experiment | 1 |

Illustrative capacity 265 is the minimum fitting all modeled single eight-Cell workflows plus the conservative two-extra-action gate. This is a UX-derived test number, **not a production recommendation**; it even falls below the measured recommendation endpoint weight of 271, demonstrating that fitting this network UX subset does not establish a complete endpoint policy. A 20-token bucket would break ordinary heavy six-Cell work; merely replacing attempts with these weights at the same number is invalid.

| Cells | Workflow | HTTP attempts | Illustrative cost | Illustrative remaining |
| --- | --- | --- | --- | --- |
| 6 | A | 7 | 19 | 246 |
| 6 | B | 8 | 20 | 245 |
| 6 | C | 15 | 39 | 226 |
| 6 | D | 7 | 256 | 9 |
| 6 | E | 7 | 19 | 246 |
| 6 | D_explain | 8 | 263 | 2 |
| 6 | gate_paid_action | 17 | 47 | 218 |
| 8 | A | 9 | 21 | 244 |
| 8 | B | 10 | 22 | 243 |
| 8 | C | 19 | 43 | 222 |
| 8 | D | 9 | 258 | 7 |
| 8 | E | 9 | 21 | 244 |
| 8 | D_explain | 10 | 265 | 0 |
| 8 | gate_paid_action | 21 | 51 | 214 |

CPU, wall and spatial weights disagree: optimizer CPU/Interference ratios are hundreds, query ratios thousands, payload ratios below one. A single integer vector cannot fit all resources. Geometry-heavy optional settings, radius/rays/grid/sample cardinality, caches and optimizer policies change within-endpoint cost. Static weights need cost classes based on validated input envelopes plus periodic versioned recalibration, and minimum attempt charging to keep cheap/invalid abuse bounded. Integer CPU weights are technically possible; an operationally safe capacity is not established.

### Logical workflow / reservation

If every complete action counts once, A/D/E cost one, B two, C three, and the conservative explanation+paid-action gate five. A 20-workflow budget therefore fits six/eight easily, but can admit 20×(N+1) underlying requests: 140 at six, 180 at eight, plus optimization search, compared with today's 20. This is a resource expansion, not harmless deduplication. A server-verified reservation instead precharges an input-bounded cost for primary work and at most N exact follow-ups. Reserving today's raw N+1 units alone changes completion predictability but not 15/19/21 arithmetic. A cost reservation could improve fidelity, but no safe resource rate is known.

Any future receipt must bind authoritative configuration, Cell set, effective profiles, dataset/model version, allowed follow-up count/content, expiry and client identity, and be single-use for each allowed request. User-supplied workflow IDs alone are forgeable. Admission must reject an unaffordable complete reservation before spending expensive partial work. Failures/cancellation cannot automatically refund already used compute; undispatched reserved work requires explicit semantics. Retry may reuse only unspent verified capacity, never re-run expensive work for free. Backend/frontend coupling, stale revisions, mixed settings and partial UI completion make implementation risk high. No IDs, reservations or endpoint consolidation were added.

### Separate classes

Heavy search, map transport and diagnostics have different dominant costs, but classes overlap. analyze-sector includes both map and scientific coverage, surface costs vary by resolution, and experiments hide heavy work behind a cheap POST. Independent full budgets add up and allow alternating classes to increase total admission. A shared aggregate resource envelope plus a minimum request-frequency layer would still be needed. Separate diagnostic capacity could reduce diagnostic starvation, but it cannot distinguish users on one IP and makes headers/retry semantics harder to explain. An intentionally naive offline split retains 20 attempts in each of three classes: heavy search/evaluation, map/interference transport, and other diagnostics. The conservative eight gate uses heavy=2, map=18, diagnostic=1 and fits, but aggregate permission rises from 20 to as many as 60 across classes; two eight C workflows require 34 map requests and still contend. Six C uses heavy=2, map=13. Exact class counters and remaining values are in JSON. These are a bypass illustration, not recommended class capacities.

### General cost/token budget

A measured cost debit could estimate CPU/geometry and bytes before execution and reconcile conservatively afterwards. Fractional tokens can avoid coarse endpoint rounding; multiple resource dimensions need either separate ceilings or conservative combined admission. A rolling replenishment model could reduce fixed-window burst, but burst capacity and refill rate require deployment calibration and abuse tests. Post-hoc CPU charging alone allows an initial overspend; cancellation/refunds, input extremes and async queues must be covered. Per-process getrusage cannot assign simultaneous request CPU accurately. Endpoint/input estimates, request-local work counters and resource buckets are more practical observability inputs. This carries substantial calibration, test, header, support and implementation-drift costs. The fractional CPU example takes the largest observed eight-Cell workflow CPU as its illustrative capacity; the byte example reserves eight C plus the largest observed map payload and an explanation. Their numerical values are in JSON and establish a normal-workflow fit only. They are not deployment-safe refill rates or burst allowances. No token bucket was implemented.

## Policy comparison and security review

Qualitative scores are relative, constrained by measured default cost variation and the exact accounting tests; they are not security certification. “Good eight UX” assumes a sufficiently funded model, not a proven safe numeric budget.

| Model | Resource fidelity | Six UX | Eight UX | Shared-IP fairness | Abuse resistance | Simplicity / risk | Scalability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Current 20 | Low cost fidelity; clear attempts | Good fresh C; 5 spare | Thin C; 1 spare | Coupled | Good retained-key frequency; concurrency intact | Simple / existing | Cell-count pressure |
| Higher fixed | Same low fidelity | More spare | 24+ fits paid gate | Coupled; 40 fits two eight C | Larger frequency envelope | Simple / numeric safety unknown | Repeated retuning |
| Weighted | Better CPU estimate; payload mismatch | Needs new calibration | Fits modeled budget | Still coupled | Minimum charge + aggregate required | Medium complexity / medium-high | Weights drift |
| Logical actions | Low unless verified cost reservation | Predictable whole-action admit | Good if funded | Still coupled | Bare IDs/free follow-ups unsafe | High complexity / high | Better with server verification |
| Separate classes | Partial; mixed-cost routes | Less cross-class starvation | Depends on capacities | Still coupled | Aggregate prevents additive bypass | High complexity / medium-high | More knobs/classes |
| General cost tokens | Potentially highest multidimensional | Depends on estimates | Depends on funded envelopes | Still coupled | Precharge, min attempt, no free retry needed | Highest calibration / high | Potentially strongest |

Current strengths: one small shared map/lock and global channel, route-agnostic attempted-frequency limit, predictable remaining/reset headers, idempotent release, no workflow state, authentication-first admission, no free cancellation/retry refunds, privacy-preserving denial-key hash, and bounded client state. These are directly visible in implementation.

Current weaknesses: equal charge for orders-of-magnitude-different RF work; N deterministic map follow-ups dominate HTTP count; internal optimizer/recommendation/job fan-out is hidden; cheap failure/busy contention spends the same units as compute; large map bandwidth differs from tiny heavy-search responses; NAT/tabs share frequency and concurrency; fixed boundaries allow adjacent-window bursts; LRU churn/process scope prevent a deployment-global resource bound.

Bypass comparison: splitting heavy work into cheap-looking scientific endpoints can defeat simplistic endpoint weights/classes; verified input envelopes and shared ceilings are prerequisites. Forged workflow ownership must never exempt an arbitrary POST. Cached/cheap results still need minimum frequency charging; they can become expensive after cache miss/eviction. Retrying and cancelling must not erase consumed work. Multiple IPs bypass per-IP aggregate allocation in every proposed model. A same-IP abusive peer can starve others in every model retaining that key. Separate authenticated fairness identity would address a different problem and requires its own security/product decision.

## Resource target, classification and recommendation

The protection target should explicitly include **admitted RF CPU/geometry, concurrent working sets, response bandwidth and an abuse-frequency floor**. Per-user fairness is an independent identity objective that IP accounting alone cannot promise. Current concurrency/deadline provide valuable instantaneous and per-computation bounds, while 20/min uniquely curtails rapid cheap/bad/busy attempts on a retained key. Neither is a total CPU or byte quota, and background jobs require separate admission accounting.

**Root cause E — multiple: B HTTP attempt is a poor cost unit, C frontend deterministic follow-ups amplify count, D IP sharing creates fairness pressure.** A is arithmetically true for the defined expanded paid-action gate (21>20), but “numerically too low” is not demonstrated relative to safe server capacity. F is false as a broad policy characterization: the limiter is mechanically correct but the unit mismatches resource cost/workflow ownership. No optimizer/RF bug is inferred.

The exact problem is that an IP-shared frequency guard is also used as the practical workflow admission ceiling: inexpensive large map requests spend N units, while internally expensive search/job requests spend one. Eight's fresh C leaves one; nine crosses 20 deterministically; supported six is comfortable only for one fresh ordinary workflow and becomes coupled under prior/NAT/tab activity. Raising 20 alone treats workflow symptoms while enlarging the aggregate attempt allowance.

**One recommended direction: retain 20/60/IP and all current guards unchanged until a deployment-calibrated resource admission study establishes a safe replacement envelope.** No numeric policy change is recommended. The audit proves mismatch but not the correct CPU/byte refill/burst parameters, maximum-input cost or acceptable tail/memory load on production hardware. Keeping the existing guards preserves demonstrated protection while these gaps are measured.

The single next action is that bounded study, using prepaid input-bound CPU/geometry and response-cost estimates and evaluating server-verified workflow reservations, including the async experiment queue. This is a study recommendation, not an approved implementation or cap expansion. Future implementation risk is **high** for verified multidimensional reservation/token accounting; a purely numeric increase is a small code diff but has uncalibrated resource/security risk.

Expected future change surface: backend admission/accounting; route/input cost metadata including jobs; frontend coordination only if verified reservations are selected; headers and Retry-After contract; admission/cancellation/stale/retry tests; OpenAPI and deployment/user docs; observability. All remain unchanged now. Preconditions: deployment CPU/memory/network envelopes; maximum supported RF inputs and optional search policies; bounded sustained/concurrent/async load; quantitative six/eight UX target and NAT identity promise; anti-forgery/replay/refund semantics; versioned cost calibration and compatibility tests. The Cell cap remains six throughout.

Minimal future metrics: operation and input-envelope class; accepted/denied/reason; process-local hashed key, request sequence and remaining budget; reserved/used cost by dimension; wall bucket and request-local geometry/serialization/response bytes; active RF requests and async jobs/queue depth; sampled process CPU/RSS for capacity calibration. CPU attribution must be labeled estimated under concurrency. Verified receipt ID would be needed only if that future design is selected; do not log raw IPs, credentials or location payloads. Existing successful Gin access logs and structured denial logs lack the dimensional evidence needed for cost calibration. No production telemetry was added.

## Production invariance, validation and reproduction

Only these audit files/tooling were added. Git-tracked production sources match HEAD: limiter 20, 60-second anchored window, ClientIP keying, global/per-client 2/1, 60-second context, all 19 protected routes, Cell cap six, RF equations, search/caching and frontend request sequences unchanged. The isolated counter/JSON wrappers and eight cap exist only under /tmp; the tracked Go harness is inert text, never built as production Go.

Completed validation: backend go test ./..., go test -race ./..., go vet ./...; all 423 frontend tests in 68 files, lint and build; real-backend network-deadline and RF-budget browser tests with fresh server isolation; existing shared-key/IP/auth/body/failure limiter tests; new fixed-clock boundary/NAT/distinct-key tests; new full-pack endpoints/workflows/two-client runs; audit semantics race check; docs build, docs validation, version check and git diff --check. See ledger validation for exact outcomes. The initial combined browser invocation passed the optimizer case but failed the budget case because it inherited one real IP charge; the budget case passed with a fresh server. The extra full-pack, counter-instrumented eight-Cell concurrency race run hit the unchanged 60-second deadline for both requests (504); its success-only harness failed at 80.43 s including dataset loading. No race was reported before that timeout. This is recorded as a failed extra stress check, not a native-capacity result; the ordinary production race suite and isolated semantics race check passed. No test/production expectation was weakened. Existing Node localStorage, chunk-size, color and Pandoc deprecation warnings are retained as non-failing warnings.

Reproduce from repository root (timing workloads must run in isolation):

```sh
python3 scripts/rf-request-budget-policy-audit/run.py --run
python3 scripts/rf-request-budget-policy-audit/run.py --run --modes map-costs,shared-workflows
node scripts/rf-request-budget-policy-audit/parse.cjs
python3 scripts/rf-request-budget-policy-audit/collect.py
python3 scripts/rf-request-budget-policy-audit/report.py
```

The runner requires explicit --run, copies backend into /tmp/atom-rf-policy and refuses to alter the production tree. Additional modes append observations to the same raw output directory. The finalized ledger includes all runs and semantic evidence; raw large responses remain disposable, not checked in. Cleanup may remove that temporary directory after retaining the two documents. Scientific/cardinality limits outside the test-only override were preserved, including the independent measurement six-Cell and recommendation five-baseline ceilings.
