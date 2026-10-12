# Conservative fixed deployment profile certification

Certification date: **2026-10-05**, A.T.O.M **0.11.0**, source `e5c4cb60d0427e5feb5d4895c6d9ebf3124247a8` on `main`. Starting Git status and diff were clean. Original command logs, including the excluded skipped/shared-client E2E invocations and successful isolated replacements, are retained in `scripts/fixed-deployment-profiles/baseline-evidence.json`.

Completed **2704/2704** locked groups. A: **NOT CERTIFIED**; B: **NOT CERTIFIED**; C: **NOT CERTIFIED**. Minimum certified reference: **none**. Recommended certified reference: **none**. These findings apply to the exact tested Ankara pack, RF inputs, runtime and production policy. They are not universal minimum hardware requirements.

API-valid input and certified interactive workload are explicitly distinct. Selected W3 inputs remain valid and available as best effort, heavy or offline-style workloads. A W3 timeout at the unchanged 60-second safety boundary does not invalidate a passing W1 reference. Estimator-driven adaptive admission remains paused; Auto remains observation-only.

## Immutable evidence

Main contract SHA256: `96e96a59445b9c94c39fc2bd88366a38eb25a9027ce0ac019d20985206274b0b`. Complete Optimize → explanation supplement SHA256: `77f63b943a3b9c9046eec6a1b26668b02322332141f821af9766e4fe87d8941d`. The supplement was frozen before its measurements and preserves the main gates, RF settings, domain/repeat assignment and original evidence. The original main explanation row measures explanation after an actual Optimize prerequisite; the supplement captures both calls inside the measured workflow.

The stopped bootstrap contract and three completed preliminary rows are preserved under `scripts/fixed-deployment-profiles/invalid-bootstrap/` and excluded. The bootstrap incorrectly expected a Linux container marker from Auto and omitted the intended pre-RF verification call. A corrected successor was frozen before successor measurements. Numerical gates, workloads, repetition count and run seed were unchanged. Linux Auto environment remains unknown; independent known Docker image/HostConfig inspection establishes container provenance. Unknown observations never satisfy a requirement by themselves.

Valid Surface supplement SHA256: `131a10db477c6bedbe8f4c6bc87d6355fe3096e4d6486b0f23693343d9e74b81`. Primary [machine-readable findings](./fixed-deployment-profile-certification.json), immutable [contract](../scripts/fixed-deployment-profiles/certification-lock.json), [workflow supplement](../scripts/fixed-deployment-profiles/workflow-supplement-lock.json), [domain manifest](../scripts/fixed-deployment-profiles/domain-manifest.json), [run plans](../scripts/fixed-deployment-profiles/run-plans.json), and [reproduction protocol](../scripts/fixed-deployment-profiles/README.md). Raw ledgers, logs, Auto/startup snapshots and async time series have SHA256-indexed deterministic gzip copies in `scripts/fixed-deployment-profiles/evidence/`. The [completion audit](../scripts/fixed-deployment-profiles/completion-audit.json) independently reconciles all 2,704 plan/fixture identities, verifies archived digests, preserves quality logs and covers every requested phase.

## Dataset and resource scope

The exact `ankara-open-planning` **2026.07** pack has **161,784 indexed footprints**, **936,651 polygon vertices** and **451 inventory Cells**. It is planning-grade OpenStreetMap/OpenCellID-derived evidence with synthetic enrichment, not an operator inventory. No second legitimate real pack or safe generic dataset complexity ceiling was established.

- `ankara_5g_nodes.geojson`: `c460c254d8748df52305d141b2f5e5147757a00b9d0581d8670084aa29ee3bd8`

- `ankara_buildings.geojson`: `d952a853b1146fe4e4136c2d8bac1b8e2c7152b33d78b0d9f82399350bfd50fc`


| Reference | CPU quota | Hard memory | Role |
|---|---:|---:|---|
| A | 2 CPU | 4 GiB | minimum candidate |
| B | 4 CPU | 8 GiB | recommended candidate |
| C | 8 CPU | 10 GiB | higher bounded candidate |
| D | unbounded | unbounded | development control, never certified |

Profiles are resource floors subject to all other assumptions, rather than exact machine identities. The tested candidate envelope includes the exact eight nearest-six inventory Cell layouts and default optimization priorities/constraints in the frozen fixtures. It does not cover arbitrary six-Cell combinations, custom per-cell RF profiles, an enabled radio-quality optimization objective, or every location in the pack. Other API-valid layouts/settings remain outside measured certification. C was measured at 8 CPU / 10 GiB; no 16 GiB extrapolation. No candidate is certified. The development VM has 10 CPUs and 12,600,156,160 bytes (~11.735 GiB) on an Apple M4 host with 24 GiB host RAM. The pinned image and Go toolchain are recorded in the contract/Auto snapshots. The measured backend binary uses Go 1.27.1 with CGO disabled; the observations are limited to this tested runtime and cannot qualify an unmeasured release-image binary or compiler version. The shipping Dockerfile and backend Go directive pin Go 1.26.6. That default shipping runtime has not been qualified here; it does not inherit the Go 1.27.1 reference verdict. CPU quota is a consumption ceiling, not dedicated physical-core reservation; shared host contention and CPU architecture/speed remain operational assumptions.

## Frozen workload classes

W1 uses 120 rays, 400 m radius, 30 dBm, 120° beam, six Cells where applicable, both 2.6 and 28 GHz, normal interference bandwidths 20/100 MHz, and the unchanged legacy two-pass network search. It includes Simulate; Evaluate + six maps; Interference; Evaluate + maps → Interference → Re-evaluate + maps (15 protected attempts); Optimize + six optimized maps; Optimize + actual solution explanation; Optimize Azimuth; 25 m Coverage Surface; Building Entry; and a five-Cell Recommendation over the six-inventory-Cell enclosing polygon plus 20 m. Production/frontend payload builders generate all core fixtures.

W2 uses 240 rays and 600 m radius with the same six-Cell/frequency/power/beam assumptions. It includes Simulate, Evaluate + maps, Optimize + maps, Interference and 25 m Surface. Its bounded alternate Optimize search uses deterministic multi-start, 2 passes and 192 unique evaluations. This practical heavier envelope includes both legacy and that alternate; a failing alternate cannot be silently removed to make W2 certify.

W3 uses selected valid 360-ray / 1,500 m edge inputs, a separately preregistered 10 m Surface grid (90,601 cells) and bounded Pareto archive search with 3 passes / 768 unique evaluations, on sparse/dense domains and both frequencies. It probes Simulate, Optimize, Surface, Building Entry and Recommendation. The original 5 m / 1,500 m surface has 361,201 cells and is API-invalid under the unchanged 100,000-cell cap. The 5 m size also violates the unchanged 10 m minimum, and is rejected before the grid-count check. All 42 locked original requests remain validation negative controls. The frozen supplement annotation incorrectly expected HTTP 422; the production validator returns HTTP 400. That expectation mismatch is retained as a methodology violation, without altering the annotation or forcing qualification. The valid 10 m supplement was frozen before any W3 timing; it adds evidence without replacing controls or changing gates. W3 does not require interactive certification or promise API maxima such as 100,000 search evaluations, 720 rays / 5,000 m, huge polygons/surfaces or large experiment matrices.

## Frozen gates and measurement method

Both the original monotonic timer and UTC start/end intervals are retained. Where they disagree, the longer observed interval scores the unchanged 45 s elapsed gate; interrupted observations are retained and reported, with no replacement or timing exclusion. Every certified interactive response must be HTTP 200, complete its streamed read, and finish within **45 s**, retaining **15 s** (one quarter) of the existing 60 s deadline for variability, contention and transfer. A mere 59.9 s success cannot pass. Any failed repeat counts; there is no averaging away failures, favorable early stopping or post-measurement gate adjustment.

Kernel `memory.peak` must stay at or below **75% of the hard cgroup limit**, with no `oom`, `oom_kill` or `max` events. At least **25%** hard-memory headroom is retained for the loaded dataset, runtime, async retained state, buffers and cgroup page cache. `memory.current`, kernel lifetime peak, process RSS and Go heap are recorded; sampled RSS is never a memory reservation. The primary memory gate includes startup and retained W2 state in W1/W2/mixed batches. W3 process histories are separate and reported. Missing required memory/CPU files fail the batch.

CPU usage, quota periods, throttled periods and throttle duration are observed. Quota saturation/throttling alone is allowed; observable HTTP completion and headroom determine certification. Mixed process CPU includes both interactive/background computation and instrumentation and is not attributed as individual request pricing.

Requests use a real Linux TCP loopback listener, production Gin routes/body/attempt/concurrency/deadline middleware, real serialization and streamed `io.Copy`/SHA256 reads. Distinct loopback source IPs create distinct production ClientIP buckets; forwarded proxy headers are disabled. Primary performance runs stream large response bodies. The separate science-only Building Entry supplement retains JSON for canonical comparison; its latency/memory are excluded from performance scoring. Optimize/job responses are retained only for actual follow-ups. Entity bytes are uncompressed and exclude HTTP framing; no network SLO is invented.

Three Latin-order profile segments balance profile order, with pre-generated seeded shuffles across geometry/frequency/operation. Main services are warmed by one unmeasured valid Simulate, with no forced GC or OS-cache eviction. A fresh process starts each segment; within-segment state is long-running. Fresh-process first Optimize on sparse/dense at 2.6 GHz has three repeats per profile, with startup/index time separately recorded. The 120-workflow explanation supplement uses separately warmed services. GOMAXPROCS, GOGC and GOMEMLIMIT remain Go defaults.

Five W1 repeats per critical operation/profile/band/frequency alternate two domains (3 and 2 observations). W2 has three, W3 three where planned, and each mixed scenario/domain/frequency/profile has three. Mixed-load launch is blocked until five matching isolated Evaluate/Optimize references exist for that exact profile, domain, RF and search fixture. The completeness guard and keys were frozen before the valid measurements.

## Geometry domains

Deterministic inventory anchors select the nearest six distinct Cells, rank 400 m enclosing-box vertex density, and target sparse/medium/dense/very-dense quantile strata. Two disjoint 802 m enclosing envelopes per band exclude every earlier fitting domain. Excluding all earlier validation areas as well exhausted the inventory during geometry-only selection; reuse of validation areas was permitted before freeze. Band labels are selection strata, not universal density thresholds. Enlarged W3 envelopes may overlap.

| Domain | Footprints in 400 m enclosing domain | Vertices/km² | Selection rank |
|---|---:|---:|---:|
| very-dense-certification-1 | 327 | 2958.6 | 310 |
| very-dense-certification-2 | 1828 | 2725.9 | 284 |
| dense-certification-1 | 641 | 2137.9 | 223 |
| dense-certification-2 | 7366 | 2024.4 | 217 |
| medium-certification-1 | 1968 | 1603.3 | 184 |
| medium-certification-2 | 1838 | 1555.1 | 182 |
| sparse-certification-1 | 337 | 226.8 | 23 |
| sparse-certification-2 | 332 | 300.1 | 31 |

## Certified envelope matrix

| Envelope | A | B | C |
|---|---|---|---|
| W1 single | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| W1 concurrency=2 | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| W1 async overlap | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| W2 single | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| W2 concurrency | NOT TESTED | NOT TESTED | NOT TESTED |
| W2 async overlap | NOT TESTED | NOT TESTED | NOT TESTED |
| W3 | BEST EFFORT | BEST EFFORT | BEST EFFORT |

## Profile comparison

| Profile | W1 max seconds | Concurrency max seconds | Async max seconds | Operational memory headroom | W2 certified |
|---|---:|---:|---:|---:|---|
| A | 10.840 | 8.442 | 8.647 | 70.597% | False |
| B | 12.893 | 16.419 | 17.885 | 87.016% | False |
| C | 6079.510 | 13.538 | 14.133 | 90.347% | False |

Among fully W1-certified references, prefer the smallest larger reference with no over10percent regression in worst W1/concurrency/async latency, non-decreasing memory headroom, and either W2 extension or at least20percent worst concurrency/async latency improvement. Interpretation of measured operational headroom, not a new certification gate. No recommendation merely for a larger allocation or isolated benchmark speed. Minimum reference: **none**; recommended larger reference: **none**. The JSON records each eligible comparison. C's W2 result does not imply interactive support for W3 maxima.


## Profile A: NOT CERTIFIED

W1 single: 480 groups; 0 HTTP failures; max request 10.840s; minimum headroom 49.160s; peak cgroup 1.176 GiB.

W2 single: 144 groups; 17 HTTP failures; max request 60.016s; minimum headroom -0.016s; peak cgroup 1.176 GiB.

W3 valid probes: 60 groups; 12 HTTP failures; max request 60.023s; minimum headroom -0.023s; peak cgroup 1.200 GiB.

W3 validation negative controls: 12 groups; 12 HTTP failures; max request 0.001s; minimum headroom 59.999s; peak cgroup 1.200 GiB.

| Scenario | Groups | HTTP failures | Max request seconds | Minimum deadline headroom seconds |
|---|---:|---:|---:|---:|
| two-optimizers | 12 | 0 | 8.442 | 51.558 |
| optimize-evaluate | 12 | 0 | 6.002 | 53.998 |
| two-evaluates | 12 | 0 | 0.570 | 59.430 |
| async-optimize | 12 | 0 | 4.912 | 55.088 |
| async-evaluate | 12 | 0 | 0.539 | 59.461 |
| sustained-optimize | 12 | 0 | 8.647 | 51.353 |
| sustained-evaluate | 12 | 0 | 0.668 | 59.332 |


Primary operational memory headroom: 70.597%. Cancellation/release: PASS (12 cases). Across all measured classes, peak RSS 1.193 GiB, peak cgroup 1.200 GiB. Throttle duration 8.936s across 3533 throttled periods.

Observed gates (separate from formal certification): W1 single numerical PASS; concurrency numerical/overlap PASS; normal async numerical/overlap PASS; sustained async numerical/overlap FAIL; fresh first-request numerical PASS. Fresh: 6 groups; 0 HTTP failures; max request 4.346s; minimum headroom 55.654s; peak cgroup 0.855 GiB. Formal qualification also requires complete evidence, scientific invariance and no methodology violation; the retained negative-control status mismatch prevents every candidate's formal qualification.

Largest matching-reference latency inflation: **2.597×**, sustained-evaluate / /api/evaluate-network on sparse-certification-1 at 2.6 GHz (0.456s vs isolated median 0.176s).

Non-cancellation numerical gate failures by class: `{"W2-alt": 19, "W3": 24}`. Full failure cases and async/cancellation evidence remain in JSON/evidence; W3 failures are retained rather than reassigned to W1/W2.


## Profile B: NOT CERTIFIED

W1 single: 480 groups; 0 HTTP failures; max request 12.893s; minimum headroom 47.107s; peak cgroup 0.996 GiB.

W2 single: 144 groups; 16 HTTP failures; max request 564.245s; minimum headroom -504.245s; peak cgroup 0.996 GiB.

W3 valid probes: 60 groups; 12 HTTP failures; max request 60.016s; minimum headroom -0.016s; peak cgroup 1.207 GiB.

W3 validation negative controls: 12 groups; 12 HTTP failures; max request 0.000s; minimum headroom 60.000s; peak cgroup 1.207 GiB.

| Scenario | Groups | HTTP failures | Max request seconds | Minimum deadline headroom seconds |
|---|---:|---:|---:|---:|
| two-optimizers | 12 | 0 | 16.419 | 43.581 |
| optimize-evaluate | 12 | 0 | 15.306 | 44.694 |
| two-evaluates | 12 | 0 | 1.424 | 58.576 |
| async-optimize | 12 | 0 | 12.526 | 47.474 |
| async-evaluate | 12 | 0 | 1.467 | 58.533 |
| sustained-optimize | 12 | 0 | 17.885 | 42.115 |
| sustained-evaluate | 12 | 0 | 2.198 | 57.802 |


Primary operational memory headroom: 87.016%. Cancellation/release: PASS (12 cases). Across all measured classes, peak RSS 1.203 GiB, peak cgroup 1.207 GiB. Throttle duration 1.797s across 541 throttled periods.

Observed gates (separate from formal certification): W1 single numerical PASS; concurrency numerical/overlap PASS; normal async numerical/overlap PASS; sustained async numerical/overlap FAIL; fresh first-request numerical PASS. Fresh: 6 groups; 0 HTTP failures; max request 4.197s; minimum headroom 55.803s; peak cgroup 0.770 GiB. Formal qualification also requires complete evidence, scientific invariance and no methodology violation; the retained negative-control status mismatch prevents every candidate's formal qualification.

Largest matching-reference latency inflation: **7.841×**, optimize-evaluate / /api/evaluate-network on sparse-certification-1 at 2.6 GHz (1.393s vs isolated median 0.178s).

Non-cancellation numerical gate failures by class: `{"W2": 1, "W2-alt": 18, "W3": 24}`. Full failure cases and async/cancellation evidence remain in JSON/evidence; W3 failures are retained rather than reassigned to W1/W2.


## Profile C: NOT CERTIFIED

W1 single: 480 groups; 1 HTTP failures; max request 6079.510s; minimum headroom -6019.510s; peak cgroup 0.965 GiB.

W2 single: 144 groups; 17 HTTP failures; max request 60.007s; minimum headroom -0.007s; peak cgroup 0.965 GiB.

W3 valid probes: 60 groups; 12 HTTP failures; max request 60.011s; minimum headroom -0.011s; peak cgroup 1.079 GiB.

W3 validation negative controls: 12 groups; 12 HTTP failures; max request 0.001s; minimum headroom 59.999s; peak cgroup 1.079 GiB.

| Scenario | Groups | HTTP failures | Max request seconds | Minimum deadline headroom seconds |
|---|---:|---:|---:|---:|
| two-optimizers | 12 | 0 | 13.538 | 46.462 |
| optimize-evaluate | 12 | 0 | 10.338 | 49.662 |
| two-evaluates | 12 | 0 | 0.868 | 59.132 |
| async-optimize | 12 | 0 | 10.213 | 49.787 |
| async-evaluate | 12 | 0 | 1.114 | 58.886 |
| sustained-optimize | 12 | 0 | 14.133 | 45.867 |
| sustained-evaluate | 12 | 0 | 2.353 | 57.647 |


Primary operational memory headroom: 90.347%. Cancellation/release: PASS (12 cases). Across all measured classes, peak RSS 1.025 GiB, peak cgroup 1.079 GiB. Throttle duration 0.000s across 0 throttled periods.

Observed gates (separate from formal certification): W1 single numerical FAIL; concurrency numerical/overlap PASS; normal async numerical/overlap PASS; sustained async numerical/overlap FAIL; fresh first-request numerical PASS. Fresh: 6 groups; 0 HTTP failures; max request 4.211s; minimum headroom 55.789s; peak cgroup 0.745 GiB. Formal qualification also requires complete evidence, scientific invariance and no methodology violation; the retained negative-control status mismatch prevents every candidate's formal qualification.

Largest matching-reference latency inflation: **6.693×**, sustained-evaluate / /api/evaluate-network on dense-certification-1 at 28 GHz (2.353s vs isolated median 0.351s).

Non-cancellation numerical gate failures by class: `{"W1": 1, "W2-alt": 18, "W3": 24}`. Full failure cases and async/cancellation evidence remain in JSON/evidence; W3 failures are retained rather than reassigned to W1/W2.


## Profile D: DEVELOPMENT CONTROL — NOT CERTIFIED

W1 single: 100 groups; 0 HTTP failures; max request 14.902s; minimum headroom 45.098s; peak cgroup 0.989 GiB.

W2 single: 36 groups; 0 HTTP failures; max request 33.748s; minimum headroom 26.252s; peak cgroup 0.989 GiB.

W3 valid probes: 12 groups; 0 HTTP failures; max request 1.693s; minimum headroom 58.307s; peak cgroup 1.041 GiB.

W3 validation negative controls: 6 groups; 6 HTTP failures; max request 0.000s; minimum headroom 60.000s; peak cgroup 1.041 GiB.

| Scenario | Groups | HTTP failures | Max request seconds | Minimum deadline headroom seconds |
|---|---:|---:|---:|---:|
| two-optimizers | 0 | — | unknown | unknown |
| optimize-evaluate | 0 | — | unknown | unknown |
| two-evaluates | 0 | — | unknown | unknown |
| async-optimize | 0 | — | unknown | unknown |
| async-evaluate | 0 | — | unknown | unknown |
| sustained-optimize | 0 | — | unknown | unknown |
| sustained-evaluate | 0 | — | unknown | unknown |


Primary operational memory headroom: unknown%. Cancellation/release: NOT TESTED/FAIL (0 cases). Across all measured classes, peak RSS 0.969 GiB, peak cgroup 1.041 GiB. Throttle duration 0.000s across 0 throttled periods.

Observed gates (separate from formal certification): W1 single numerical PASS; concurrency numerical/overlap FAIL; normal async numerical/overlap FAIL; sustained async numerical/overlap FAIL; fresh first-request numerical NOT TESTED/FAIL. Fresh: NOT TESTED Formal qualification also requires complete evidence, scientific invariance and no methodology violation; the retained negative-control status mismatch prevents every candidate's formal qualification.

Non-cancellation numerical gate failures by class: `{"W3": 6}`. Full failure cases and async/cancellation evidence remain in JSON/evidence; W3 failures are retained rather than reassigned to W1/W2.

Surface negative controls: locked expected HTTP **422**; observed statuses `{"400": 42}`. Source validation rejects 5 m because cell size must be 10–250 m and the route emits HTTP 400. Recorded response-body SHA256 agrees with the source error JSON: **True**. The incorrect preregistered status assumption remains failed; it is not converted into a passing control.

Methodology violations prevent formal certification: Frozen Surface negative-control annotation expected422; actual production validator returns400 for cell_size_m5 below10m minimum. Original expectation and observations retained; no qualification forced.

## Operational findings

Concurrency uses two distinct clients for Optimize + Optimize, Optimize + Evaluate and Evaluate + Evaluate, on sparse/dense and both frequencies. Both replies must succeed and no global/per-client slot may leak. A profile lacking this guarantee is not generally supported under the unchanged global concurrency 2.

Normal async overlap keeps worker **1** and queue **16**, with uncached 16-run jobs. Sustained overlap refills four active/queued uncached 64-run jobs for approximately 30 seconds, bounded by 64 submissions, and then cancels/drains. Every interactive request must have temporal overlap with actual computation. Sustained evidence requires at least 95% active-worker samples during the first 30 seconds. Sustained cases passing this behavioral gate: **51/72**. Submission/queue depth alone is insufficient; per-case fractions/durations are published.

Some async observations lack the locked per-request overlap evidence. This prevents general W1 certification for the affected profile even when its HTTP latency and memory pass. The bounded 64-submission source can exhaust before 30 seconds on faster configurations. A final call after the 30-second refill window may also find the background queue drained; this is an evidence/protocol failure, not proof that hardware compute capacity is insufficient. Failed cases remain included, with no replacement or exclusion.

- A-mixed-0 / index 9: no actual background overlap for response index 8, start 2026-10-05T13:54:34.611133175Z; no actual background overlap for response index 9, start 2026-10-05T13:54:37.892612093Z; no actual background overlap for response index 10, start 2026-10-05T13:54:41.090161453Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 52: no actual background overlap for response index 8, start 2026-10-05T14:03:01.410643865Z; no actual background overlap for response index 9, start 2026-10-05T14:03:04.674822797Z; no actual background overlap for response index 10, start 2026-10-05T14:03:07.890326672Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 12: no actual background overlap for response index 8, start 2026-10-05T13:55:40.435087747Z; no actual background overlap for response index 9, start 2026-10-05T13:55:43.661227548Z; no actual background overlap for response index 10, start 2026-10-05T13:55:46.880074317Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 49: no actual background overlap for response index 8, start 2026-10-05T14:02:27.893744685Z; no actual background overlap for response index 9, start 2026-10-05T14:02:31.088952675Z; no actual background overlap for response index 10, start 2026-10-05T14:02:34.328308201Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 3: no actual background overlap for response index 3, start 2026-10-05T13:53:48.436017303Z

- A-mixed-0 / index 35: no actual background overlap for response index 7, start 2026-10-05T14:00:08.245183609Z; no actual background overlap for response index 8, start 2026-10-05T14:00:11.441193398Z; no actual background overlap for response index 9, start 2026-10-05T14:00:14.655661088Z; no actual background overlap for response index 10, start 2026-10-05T14:00:17.917645518Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 23: no actual background overlap for response index 4, start 2026-10-05T13:57:14.474722232Z; no actual background overlap for response index 5, start 2026-10-05T13:57:19.908258724Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 34: no actual background overlap for response index 4, start 2026-10-05T13:59:42.654090087Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 79: no actual background overlap for response index 4, start 2026-10-05T14:07:54.8760956Z; active worker samples below95percent during first30seconds

- A-mixed-0 / index 10: no actual background overlap for response index 7, start 2026-10-05T13:55:04.126098061Z; no actual background overlap for response index 8, start 2026-10-05T13:55:07.338365509Z; no actual background overlap for response index 9, start 2026-10-05T13:55:10.5417652Z; no actual background overlap for response index 10, start 2026-10-05T13:55:13.760601268Z; active worker samples below95percent during first30seconds

- B-mixed-0 / index 56: no actual background overlap for response index 9, start 2026-10-05T13:28:08.620368365Z

- C-mixed-0 / index 56: no actual background overlap for response index 4, start 2026-10-05T13:46:37.438848893Z; no actual background overlap for response index 5, start 2026-10-05T13:46:43.096829768Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 76: no actual background overlap for response index 7, start 2026-10-05T13:51:27.610671143Z; no actual background overlap for response index 8, start 2026-10-05T13:51:30.834160889Z; no actual background overlap for response index 9, start 2026-10-05T13:51:34.053781939Z; no actual background overlap for response index 10, start 2026-10-05T13:51:37.249906763Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 36: no actual background overlap for response index 4, start 2026-10-05T13:42:19.500957042Z; no actual background overlap for response index 5, start 2026-10-05T13:42:24.988398176Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 41: no actual background overlap for response index 7, start 2026-10-05T13:42:58.18779962Z; no actual background overlap for response index 8, start 2026-10-05T13:43:01.403437693Z; no actual background overlap for response index 9, start 2026-10-05T13:43:04.601569512Z; no actual background overlap for response index 10, start 2026-10-05T13:43:07.801975258Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 82: no actual background overlap for response index 7, start 2026-10-05T13:52:12.840320452Z; no actual background overlap for response index 8, start 2026-10-05T13:52:16.063383315Z; no actual background overlap for response index 9, start 2026-10-05T13:52:19.291317519Z; no actual background overlap for response index 10, start 2026-10-05T13:52:22.503235509Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 74: no actual background overlap for response index 4, start 2026-10-05T13:50:23.70265818Z; no actual background overlap for response index 5, start 2026-10-05T13:50:29.175802153Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 72: no actual background overlap for response index 7, start 2026-10-05T13:49:47.677517941Z; no actual background overlap for response index 8, start 2026-10-05T13:49:50.901212424Z; no actual background overlap for response index 9, start 2026-10-05T13:49:54.134887171Z; no actual background overlap for response index 10, start 2026-10-05T13:49:57.353419667Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 45: no actual background overlap for response index 4, start 2026-10-05T13:44:41.322122693Z; no actual background overlap for response index 5, start 2026-10-05T13:44:46.926746831Z; active worker samples below95percent during first30seconds

- C-mixed-0 / index 24: no actual background overlap for response index 9, start 2026-10-05T13:39:17.310186186Z

- C-mixed-0 / index 65: no actual background overlap for response index 7, start 2026-10-05T13:47:54.94530751Z; no actual background overlap for response index 8, start 2026-10-05T13:47:58.168935437Z; no actual background overlap for response index 9, start 2026-10-05T13:48:01.410145669Z; no actual background overlap for response index 10, start 2026-10-05T13:48:04.615689663Z; active worker samples below95percent during first30seconds

Cancellation sends a real client cancellation 100 ms into expensive Optimize, awaits handler completion, requires release within 2 seconds, then verifies same-client and other-client Evaluate success, zero global/per-client activity, and two charged same-client attempts (canceled Optimize + subsequent Evaluate). Attempt charging, the anchored 20/60 s window and ClientIP identity remain unchanged.

Evaluate + maps costs **7 attempts**; Optimize + maps **7**; Optimize + explanation **2**; Evaluate + maps → Interference → Re-evaluate + maps **15**. Two consecutive map workflows cost 14. A third rapid Evaluate/map workflow reaches the existing 20-attempt boundary and its 21st protected attempt is denied. Separate real budget E2E verifies successful output/repeated scientific hashes, preserved UI inspection without RF requests, and unchanged abuse behavior. This does not solve an eight-Cell budget issue.

Building Entry scientific supplement SHA256: `b827acc66c729701303725cc5095a9cdf9858fef6580c873ccaffc794f5bfebe`. The main contract incorrectly assumed RF responses had no runtime fields; auditing identified `diagnostics.elapsed_ms`. This explicit correction preserves scientific values and all headroom gates. Its 156 requests repeat all original ABC W1/W3 Building Entry cases. Complete response canonicalization excludes only `diagnostics.elapsed_ms`; raw hashes remain in the evidence. Canonicalizer regression checks preserve numeric precision, array order, scientific values and all other diagnostics. Supplemental memory/latency does not score deployment headroom.

Scientific response invariance: **PASS**, 584 exact request/endpoint groups, 584 compared across resource profiles. Deterministic scientific response hashes include existing fingerprints; Auto diagnostic/runtime logs are excluded. No equations, search traversal, Pareto semantics or fingerprints were changed.

Recorded clock discontinuities are consistent with VM pause or clock interruption, with cause not independently verified. After discovering them, a host `caffeinate -i` assertion prevents idle sleep until the finisher exits; its start timestamp is recorded in JSON. User-forced suspension remains possible. This observer-side intervention does not change RF settings, quotas, repeats or gates. They are not evidence of intrinsic RF compute cost. Failed/interrupted observations remain in their original workload/profile, and the longer elapsed interval cannot pass the unchanged headroom gate.

- B-single-0 / W2 / optimize-maps: HTTP 200; monotonic 21.373s; timestamp interval 564.245s; process CPU 40.185s.

- C-single-1 / W1 / azimuth: HTTP 0; monotonic 103.454s; timestamp interval 6079.510s; process CPU 1.780s.

Largest single response: **46,130,626 bytes** (simulate, W3, A, sparse-certification-1). Largest measured W1/W2 logical workflow: **115,086,637 bytes** (evaluate-maps, W2, A, dense-certification-2). Its entity-byte transfer alone would take ~92.07s at an illustrative 10 Mbps or ~9.21s at 100 Mbps, before protocol overhead. Larger transfers can dominate interactive experience on slower links; this arithmetic is not a network SLO.

Across all measured classes: peak observed RSS **1.203 GiB**, peak kernel cgroup memory **1.207 GiB**, OOM events **0**, OOM kills **0**. Minimum headroom including W3/unqualified inputs is -6019.510s; W1/W2 headroom is reported separately per profile; qualification requires at least 15 s, and none of the candidates qualifies.

## Decisions and product boundary

No complete fixed-reference certification yet; retain Auto-only development with explicit best-effort boundaries. Docker/self-hosted installers may later show descriptive eligibility for the tested reference and exact pack. Native builds need separate runtime evidence; no packaging or resource selector added. The operator controls deployment capacity and verifies the same workload/worker/concurrency envelope; no end-user hardware selector.

Future Auto may describe resource-floor eligibility only with known effective CPU, known hard memory ceiling, verified runtime/container assumptions, exact dataset identity/hashes/counts, worker/queue settings and fixed concurrency policy. Transient free RAM is not profile identity. Linux environment unknown requires independent known container evidence. The tested Go toolchain/binary and supported Cell layout/workload assumptions must also be verified; unknown or untested facts keep descriptive eligibility unverified. Resource floors alone never imply certification. No matcher, CPU/RAM selector, profile selector, performance preset or workload rejection is installed.

The reusable production Auto dataset representation already distinguishes unavailable metadata (nil/null) from real zero counts. The frozen historical preflight prototype's nil-safe index query can return zero for unavailable geometry. Historical evidence is preserved. The corrected audit-only successor `fixedGeometryObservation` returns unknown/null for nil and known zero for an empty index, with malformed/null/empty regression tests. No production diagnostic surface changed.

A separate preregistered eight-Cell operational and request-budget re-audit may be justified only if W1 reference profiles certify. Six remains the product cap; this study does not establish eight-Cell safety or solve the attempt budget. Estimator fitting, coefficients, margins and admission design remain paused. No eight-Cell product configuration was tested or enabled here.

## Validation and freeze

Backend tests/race/vet, frontend tests/lint/build, separately isolated RF budget/deadline E2E, Auto resource-profile tests, certification/lock/mixed-reference/resource-floor/cancellation/async gate tests, docs build/validation, version consistency and whitespace checks are recorded in JSON. The initial combined E2E collision is retained as a test-invocation issue; independently fresh backends passed without production changes.

| Check | Result |
|---|---|
| backend_tests | PASS |
| backend_race | PASS |
| backend_vet | PASS |
| frontend_tests | PASS |
| frontend_lint | PASS |
| frontend_build | PASS |
| rf_budget_e2e | PASS |
| rf_deadline_e2e | PASS |
| auto_resource_profile_tests | PASS |
| scientific_canonicalizer_tests | PASS |
| fixed_profile_protocol_and_gate_tests | PASS |
| geometry_calibration_preservation_tests | PASS |
| locked_validation_preservation_tests | PASS |
| dataset_validation | PASS |
| docs_build | PASS |
| docs_validation | PASS |
| version_consistency | PASS |
| diff_whitespace | PASS |
| docs_final_build | PASS |
| docs_final_validation | PASS |
| final_diff_check | PASS |
| post_audit_tooling_tests | PASS |
| post_audit_docs_build | PASS |
| post_audit_docs_validation | PASS |
| post_audit_version | PASS |
| post_audit_diff | PASS |

No VERSION bump or release; documentation and internal tooling only. Freeze empirical evidence and policy; publish only profiles meeting every locked W1 gate. No adaptive admission, resource UI, Cell cap or algorithm changes. **Single next action:** Preregister a successor qualification of the same W1 envelope on the shipping Go1.26.6 runtime, correcting the new contract to expect HTTP400 for the invalid Surface control and keeping background computation active through every interactive call, including the final tail; preserve all current failed/interrupted observations.

## Limitations

- Exact Ankara 2026.07 pack only; no safe generic complexity ceiling inferred.
- Two domains per geometry band; five repeats per band, frequency and critical operation alternate domains 3/2. Finite observations are not statistical tail guarantees.
- Recorded VM clock discontinuities are retained; their cause is not independently verified. The longer recorded request interval fails the unchanged elapsed gate.
- Apple M4 shared development host, 10 CPU / 11.7 GiB VM; the existing atom-app is retained. CPU quota constrains maximum consumption, not dedicated physical core reservation or host speed equivalence.
- Linux Auto environment is deliberately unknown; Docker inspection independently establishes container provenance.
- Building Entry raw hashes include elapsed_ms. The156-request science-only supplement removes only that field; its buffered JSON client measurements do not score performance.
- Actual HTTP uncompressed loopback streaming is not a WAN network SLO or browser rendering benchmark.
- Process CPU, RSS and heap include sampler, client and retained state; mixed CPU is aggregate. RSS is sampled every 50 ms; kernel memory.peak includes startup/cache. No memory reservation model.
- The main explanation row excludes its prerequisite; a separately preregistered 120-workflow supplement supplies complete Optimize plus explanation evidence.
- Profiles describe bounded tested reference floors; larger hardware, other architectures and runtime versions require operational verification. No monotonic scaling promise.
- W2 concurrency and async overlap are not tested. Finite W3 edge probes never guarantee all API-valid maxima. Original API-invalid Surface probes remain negative controls; separately frozen valid 10 m probes supply W3 Surface evidence.
- Unbounded D is never certified. Three invalid bootstrap preliminary rows are excluded and preserved.
