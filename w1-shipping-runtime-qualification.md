# W1 shipping-runtime reference qualification

Qualification completed **2026-10-05T18:24:59.989067+00:00**. Completed **1677/1677** locked groups. A: **CERTIFIED W1**; B: **CERTIFIED W1**; C: **CERTIFIED W1**. Minimum certified W1 reference: **A**. Recommended W1 reference: **B**.

Source `e5c4cb60d0427e5feb5d4895c6d9ebf3124247a8` on `main`, A.T.O.M **0.11.0**. The starting worktree contained the preceding fixed-profile study's uncommitted documentation/tooling; its 663 historical artifacts were hashed and preserved. Previous failed/interrupted observations, W2/W3 evidence, estimator validation and Auto calibration are not rewritten by this independent W1 successor.

Qualification lock SHA256: `d893436d6d89e52b4415f8f08a8ef675352d0fd90dfeb4d804e0e134da4b1a28`. Run-plan SHA256: `fc38549c1655e3b63c1a36dff39438e57b33f1469e16a87f351ab3d78cc715f7`. [Machine-readable findings](./w1-shipping-runtime-qualification.json), [immutable contract](../scripts/w1-shipping-runtime-qualification/qualification-lock.json), [run plans](../scripts/w1-shipping-runtime-qualification/run-plans.json), and [protocol/tooling](../scripts/w1-shipping-runtime-qualification/README.md).

## Actual shipping runtime

The unchanged production Dockerfile built primary image `sha256:06357dc91eae1bca7f32e0d5e3b790f13bd24b7fa8bb5647d093ed8ccee033b5`. Backend binary SHA256 `77a1ebd09950a7721c7d39a65290912e19dba7a18161c33c98a2ae1bf136c81f`. Actual build metadata and Auto show **Go 1.26.6**, **linux/arm64**, **CGO disabled**. The primary shipping server is unmodified; test/client/sampler code runs in a separate observer container/cgroup. The observer shares network/PID namespaces for real HTTP and read-only process/cgroup evidence.

A/B/C recreate exactly **2 CPU/4 GiB**, **4 CPU/8 GiB**, **8 CPU/10 GiB**. Docker inspection, Auto's existing CLI inside the actual candidate container, startup Auto logs and primary-process executable hashes verify every batch before RF. CLI dataset loading exits before RF but remains included in the lifetime cgroup memory peak. CPU quota is a consumption ceiling, not a dedicated physical-core reservation. Default scheduler/GC settings remain unchanged.

Standard `GODEBUG=gctrace=1` enables heap observability output on the actual shipping binary. It does not tune GOGC/GOMEMLIMIT/GOMAXPROCS. GC-event heap sizes have MiB resolution and do not establish a continuously sampled HeapAlloc maximum. Kernel `memory.peak` remains the frozen memory gate. Docker's Linux JSON logs directly witness Gin handler completion; a pre-freeze smoke test exposed delayed macOS bind-mount logs, and that failed harness observation remains preserved.

## Exact W1 and dataset scope

The exact **ankara-open-planning 2026.07** pack contains **161,784 indexed footprint parts**, **936,651 vertices**, **451 inventory Cells**. Both frozen GeoJSON hashes are verified; no alternative pack or generic complexity ceiling is inferred.

- `ankara_5g_nodes.geojson`: `c460c254d8748df52305d141b2f5e5147757a00b9d0581d8670084aa29ee3bd8`

- `ankara_buildings.geojson`: `d952a853b1146fe4e4136c2d8bac1b8e2c7152b33d78b0d9f82399350bfd50fc`

Same eight domain manifest SHA256: `6ba4dbf2445acc6c0960ff44db1229fdf5c66999a67820a0f31f678b3dfd57be`. Two sparse, medium, dense and very-dense domains are reused unchanged; no new favorable domain selection.

W1 retains **120 rays, 400 m, 30 dBm, 120° beam, both 2.6/28 GHz, six Cells where applicable, legacy two-pass search and 20/100 MHz interference bandwidths**. Simulate; Evaluate/six maps; Interference; Evaluate/maps → Interference → Re-evaluate/maps; Optimize/six optimized maps; complete Optimize/actual explanation; Optimize Azimuth; 25 m Coverage Surface; Building Entry; and five-Cell Recommendation all use the prior frontend-equivalent fixtures. The Recommendation polygon is the identical per-Cell 20 m enclosing envelope.

Five repeats per critical operation/profile/band/frequency alternate the same paired domains 3/2. Each profile has **440 single groups**: 400 critical workflows plus 40 exact isolated Evaluate/Optimize references. The complete two-call explanation replaces the old split main/supplement methodology without duplicating explanation groups. No W1 operation, RF/search configuration or required repeat is dropped. Three Latin profile segments and seed **20261005** balance the run order. One unmeasured valid Simulate warms every nonfresh service; no forced GC or cache eviction. Eighteen new-process sparse/dense 2.6 GHz first-Optimize cases retain separate startup time.

## Frozen qualification gates

Required interactive responses must return HTTP 200, complete their streamed reads, and finish within **45 seconds**, preserving **15 seconds** under the unchanged 60-second deadline. Kernel lifetime memory peak must be **≤75%** of the hard limit; `oom`, `oom_kill` and memory `max` events must remain zero. Distinct-client concurrency must overlap; every group has two declared concurrent Evaluate probes requiring success/overlap to establish both global slots and per-client slots remain usable. Probe intervals remain distinct from the primary workflow.

The new invalid 5 m Surface control uses W1 radio inputs and prospectively expects **HTTP 400** with the exact production error-body digest. It is a validation control, not a W3 workload. The old HTTP 422 mismatch remains unchanged. Actual shipping budget checks require 20 successful same-client requests followed by a denied 21st attempt. These exceptions never turn failed interactive requests into successes.

Both monotonic and UTC intervals are retained; the longer interval scores the elapsed gate. A discrepancy **>1 second** is prospectively an INVALID OBSERVATION, retained without replacement; the affected profile becomes INVALID/INSUFFICIENT. All locked groups continue. `caffeinate -i` began before protocol/qualification work and was asserted through terminal qualification validation and the independent audit; start/end timestamps and its limitations are recorded. It prevents automatic idle sleep, not user-forced suspension.

## Corrected sustained producer

Worker **1**, queue **16** remain unchanged. Normal background jobs have 16 uncached W1 runs. Sustained scenarios keep eight uncached active/queued 64-run jobs supplied, bounded by **1,024 submissions**, until **every interactive response finishes**. Each request launch must witness an uncached running incomplete job and begin inside an actual job's final recorded execution interval. Queue depth alone is insufficient.

The original up-to-12-round/3-second-gap loop remains bounded; an additional final interactive request always begins at least 30 seconds after the first and must overlap actual work. At least **95%** of first-30-second samples must show active worker execution. Afterward, outstanding jobs are canceled and an uncached one-run sentinel must complete; FIFO worker execution makes this an external actual-drain barrier.

Five non-scoring **180-second** producer checks covered all sparse/dense/frequency settings on C and the historically fast sparse/A setting before the final lock. Their raw source copies, progress, active/queued snapshots, submissions, denials, cache states, cancellations and final-tail witnesses are retained. Producer/transport behavior is verified against those exact source snapshots; no qualification performance scores resize the producer.

Host idle-sleep prevention: `caffeinate -i`, started **2026-10-05T15:39:00.668863+00:00**, ended **2026-10-05T18:26:23.295111+00:00**.

- producer-v3-C-sparse-certification-1-2.6: PASS, 596 submissions, 99.99% active samples, final-tail witness True.

- producer-v3-C-sparse-certification-1-28: PASS, 560 submissions, 99.99% active samples, final-tail witness True.

- producer-v3-C-dense-certification-1-2.6: PASS, 307 submissions, 99.97% active samples, final-tail witness True.

- producer-v3-C-dense-certification-1-28: PASS, 279 submissions, 99.99% active samples, final-tail witness True.

- producer-v3-A-sparse-certification-1-2.6: PASS, 529 submissions, 99.99% active samples, final-tail witness True.

## Results

| Profile | W1 single groups | HTTP failures | Max seconds | Minimum headroom | Memory headroom | Verdict |
|---|---:|---:|---:|---:|---:|---|
| A | 440 | 0 | 7.189 | 52.811 s | 69.04% | CERTIFIED W1 |
| B | 440 | 0 | 6.917 | 53.083 s | 85.95% | CERTIFIED W1 |
| C | 440 | 0 | 7.265 | 52.735 s | 88.79% | CERTIFIED W1 |

## Profile A

| Scenario | Groups | HTTP failures | Max seconds |
|---|---:|---:|---:|
| two-optimizers | 12 | 0 | 10.443 |
| optimize-evaluate | 12 | 0 | 7.799 |
| two-evaluates | 12 | 0 | 0.513 |
| normal_async | 24 | 0 | 6.582 |
| sustained_async | 24 | 0 | 13.661 |
| fresh | 6 | 0 | 4.455 |

Normal async behavioral/numerical pass **24/24**; sustained pass **24/24**, including final-tail checks. Cancellation **12/12**, maximum completion/release observation **0.012306 s**. Surface statuses `{'400': 16}`; shipping budget cases passed **1/1**.

## Profile B

| Scenario | Groups | HTTP failures | Max seconds |
|---|---:|---:|---:|
| two-optimizers | 12 | 0 | 6.897 |
| optimize-evaluate | 12 | 0 | 5.454 |
| two-evaluates | 12 | 0 | 0.455 |
| normal_async | 24 | 0 | 5.051 |
| sustained_async | 24 | 0 | 7.678 |
| fresh | 6 | 0 | 5.104 |

Normal async behavioral/numerical pass **24/24**; sustained pass **24/24**, including final-tail checks. Cancellation **12/12**, maximum completion/release observation **0.006606 s**. Surface statuses `{'400': 16}`; shipping budget cases passed **1/1**.

## Profile C

| Scenario | Groups | HTTP failures | Max seconds |
|---|---:|---:|---:|
| two-optimizers | 12 | 0 | 6.969 |
| optimize-evaluate | 12 | 0 | 5.298 |
| two-evaluates | 12 | 0 | 0.482 |
| normal_async | 24 | 0 | 6.191 |
| sustained_async | 24 | 0 | 9.763 |
| fresh | 6 | 0 | 4.962 |

Normal async behavioral/numerical pass **24/24**; sustained pass **24/24**, including final-tail checks. Cancellation **12/12**, maximum completion/release observation **0.006538 s**. Surface statuses `{'400': 16}`; shipping budget cases passed **1/1**.

## Invariance and operational observations

Scientific equality: **PASS**, 306 endpoint/request groups; 306 compared across all A/B/C. Building Entry streams to observer disk and canonicalizes afterward; only `diagnostics.elapsed_ms` is removed. All scientific numeric tokens, array order, fingerprints and other diagnostics remain. There is no extra buffered RF supplement.

Workflow charges remain Evaluate/maps **7**, Optimize/maps **7**, Optimize/explanation **2**, evaluation cycle **15**; the shipping 21st-attempt denial is tested directly. Cancellation is a real TCP shutdown 100 ms into expensive Optimize; stock Gin completion and simultaneous same/other-client follow-ups prove release, with canceled-client remaining budget 18.

Overall primary peak RSS **1,251,074,048 bytes**; cgroup peak **1,329,836,032 bytes**. Sampled RSS is not a memory reservation. Primary CPU and throttle counters exclude observer CPU but wall time includes client/observer-host contention. Per-batch GC-event heap evidence is recorded separately in JSON.

Largest exact-reference latency inflation **3.840×**: A two-optimizers sparse-certification-1-28-W1 /api/optimize-network, 10.443s versus isolated median 2.720s.

All declared required interactive requests, including slot probes: **8864**, HTTP failures **0**, incomplete streams **0**, minimum deadline headroom **46.339 s**. Maximum cumulative memory event counters across candidate processes: `{'oom': 0, 'oom_kill': 0, 'max': 0}`.

The first producer proof iteration exposed a stale readiness job ID at a worker handoff. Its successor exposed an atomic Docker log-rotation race. Both failures and their exact source versions remain preserved. The final v3 protocol passed all five proofs before qualification began; no qualification observation was resized or replaced.

Methodology violations: `[]`. Interrupted observations: **0**; all remain in their original groups. Missing evidence is reflected in each batch completeness record, never inferred from a plausible summary.

## Decisions and exact certification boundary

Prefer smallest fully certified reference; recommend a larger certified tier only with no>10percent observed worst-latency regression acrossW1/concurrency/normal/sustained, no worsememoryheadroom, and >=20percent improvement in at leastone contention category. Consider all measuredthrottling/stability/headroom; allocation size alone doesnot recommend. Otherwise recommended equals minimum. Minimum **A**; recommended **B**. A larger C, if qualified, is a larger **W1** reference only; it makes no heavier-workload claim.

| Profile | Throttled periods | Minimum required-request headroom | Worst within-fixture max/median |
|---|---:|---:|---:|
| A | 8.78% | 46.339 s | 5.895× |
| B | 0.34% | 52.322 s | 2.874× |
| C | 0.02% | 50.237 s | 3.577× |

Throttle counters cover measured workflows, including async submission/poll/drain work; zero throttling is not a qualification requirement. Within-fixture repeat spread is descriptive, not a tail guarantee. Reference selection is an operational interpretation of the locked results, separate from the unchanged qualification gates.

Any positive reference applies only to this A.T.O.M commit/version, the actual shipping Go 1.26.6 binary/image, tested Linux arm64/cgroup v2 and shared-host assumptions, exact Ankara pack, eight frozen Cell layouts and W1 inputs/objectives, six-Cell cap, worker 1/queue 16, global 2/per-client 1, 60-second deadline and 20-attempt/anchored-60-second/ClientIP policy. It does not certify arbitrary datasets, hardware, layouts, intermediate RF settings or larger workload classes.

Future Auto may describe verified/unverified W1 resource-floor eligibility only with known effective CPU, hard/effective memory, exact runtime/image/dataset identity and fixed policy evidence. Unknown never meets a requirement; transient free RAM does not identify a profile. No matcher, resource controls, preset, admission or packaging is implemented. Self-hosted/native deployments require the qualified assumptions; hosted capacity remains the operator's responsibility.

Estimator-driven admission remains paused. A clean W1 reference can justify a separate eight-Cell operational/request-budget re-audit; that is not eight-Cell certification or permission to raise the cap. Product Cell cap remains six.

## Validation and freeze

| Check | Result |
|---|---|
| baseline/backend_tests | PASS |
| baseline/backend_race | PASS |
| baseline/backend_vet | PASS |
| baseline/frontend_tests | PASS |
| baseline/frontend_lint | PASS |
| baseline/frontend_build | PASS |
| baseline/rf_budget_e2e | PASS |
| baseline/rf_deadline_e2e | PASS |
| baseline/auto_resource_profile_tests | PASS |
| final/backend_tests | PASS |
| final/backend_race | PASS |
| final/backend_vet | PASS |
| final/frontend_tests | PASS |
| final/frontend_lint | PASS |
| final/frontend_build | PASS |
| final/rf_budget_e2e | PASS |
| final/rf_deadline_e2e | PASS |
| final/auto_resource_profile_tests | PASS |
| final/qualification_protocol_tests | PASS |
| final/prior_study_preservation_tests | PASS |
| final/docs_build | PASS |
| final/docs_validation | PASS |
| final/version | PASS |
| final/diff | PASS |
| final/final_docs_build | PASS |
| final/final_docs_validation | PASS |
| final/final_diff | PASS |

[Independent terminal audit](../scripts/w1-shipping-runtime-qualification/completion-audit.json) reconciles all planned rows, actual identities, budget headers, failure verdicts and archived evidence against the 40-phase objective.

No release or VERSION bump; certification docs/tooling only. Keep immutable contract/results and existing fixedpolicy; publish only fully qualified exact-scope references.

**Single next action:** Preregister a separate eight-Cell operational and request-budget re-audit using the qualified minimum W1 reference; retain the six-Cell product cap until that separate study passes.

## Limitations

- Exact eight layouts and frozenRF/objective settings only; no arbitrary six-Cell layout or dataset claim.

- Shipping Linuxarm64/cgroupv2 on shared AppleM4 developmentVM; CPU quota is not dedicated physicalcore reservation.

- GC tracing logs heap atGCevents andMiB resolution; not continuousHeapAlloc peak. Observer memory/CPU are in a separatecgroup; its host contention and client-streaming costs remain in wall evidence.

- Cgroup lifetimepeak includes extraAutoCLI startup process and pagecache; conservative peak is not a reservation.

- Loopback uncompressed streaming is not aWAN/browser SLO.

- No W2/W3 qualification or eight-Cell product test.

- Finite repeats are not percentile/tail guarantees; no extrapolation toother architectures orruntimeversions.
