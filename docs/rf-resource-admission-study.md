# Deployment Resource-Admission Study

**Audit only — LOCAL MEASUREMENT ONLY.** Production remains 20 protected attempts per ClientIP per 60-second anchored fixed window, global concurrency 2, per-client concurrency 1, RF computation deadline 60 seconds, and maximum six selected cells. This study does not implement admission, reservations, weights, retries, caching, or RF changes.

The next-action classification is **F — More deployment data required**. Retain the current policy. No production numeric recommendation and no production numbers certified. Keeping the existing policy is a preservation decision, not a claim that unspecified deployments have certified capacity.

## Baseline and scope

Started on `main`, HEAD `c48ef63c9ce064a72058e2b72c3cd095c7deb904`, VERSION `0.11.0`. Tracked diffstat was empty. Existing untracked `docs/rf-request-budget-policy-audit.md`, `docs/rf-request-budget-policy-measurements.json`, and `scripts/rf-request-budget-policy-audit/` were preserved. Findings use the current checkout, its canonical six-cell fixture, and the normal Ankara pack; eight cells are isolated comparison tooling only.

## Method and limits

The companion JSON is the machine-readable ledger. Gated tooling is under `scripts/rf-resource-admission-study/`. It copies the backend to `/tmp`, injects atomic work counters and a JSON-writer timer, and calls the real registered handlers through their unchanged middleware. Test-only `RemoteAddr` identities admit distinct clients without weakening ClientIP semantics. The audit clock is fixed within a case; existing real-backend E2E independently checks the production window.

Native wall/CPU, equivalent cores (CPU seconds / wall seconds), sampled RSS, Go heap, cumulative allocation, goroutines, spatial queries/matches, segmented ray traces, coverage profile builds, polygon containment/intersections, edge intersection checks, request bytes, response bytes, and JSON-writer time are separate dimensions. Process CPU includes GC and instrumentation. Overlap CPU belongs to the complete scenario; it cannot be attributed independently to each request. Memory includes the static dataset and response-recorder buffers. Before each case, GC and FreeOSMemory run outside its CPU/wall interval; this is not steady-state service behavior. Heap/goroutines are sampled at 50 ms, RSS at 200 ms plus start/end, so short peaks can be missed. Spatial matches do not count internal R-tree node comparisons. Segmented-ray counts exclude independently evaluated point links. Geometry counters overlap; adding them does not produce a meaningful scalar cost.

Serialization time covers encoding and writing into a local recorder, and excludes slow network transfer. Workflow timers include test-side parsing to construct server-returned azimuth follow-ups. Async submission rows include job completion in their outer scenario timer but only the submission response in HTTP bytes; job-result bytes and completion times are recorded separately. Instrumentation perturbs performance; container HTTP checks use an unmodified image to assess that difference.

These are observed supported high-water marks, not certified maxima. Finite evidence-guided combinations do not cover every location, profile, polygon complexity, search state, or installed dataset. Timeout rows measure work actually performed before cancellation, not the full uncancelled work demand. No mobile certification, external network benchmark, replicated deployment certification, or portable production throughput is claimed.

## Deployment inventory

| Definition | Class | Evidence / capacity meaning |
|---|---|---|
| Root Dockerfile production stage | A: explicit supported deployment | Single non-root Alpine container; static React bundle and Gin backend; immutable Ankara dataset snapshot; Node 24 build, Go 1.26.6 build, Linux native binary. No CPU/memory quotas or hardware SKU. |
| Root docker-compose.yml | A: supported local deployment | Loopback port 8080, restart policy, same 20/60/2/1 guards, no resource reservations or quotas. |
| docs/deployment.md mount/catalog snippets | B: documented examples | Read-only dataset mounts and installed-pack catalog; no hardware sizing. |
| Internet gateway in deployment docs | B / D | TLS/authentication and trusted-proxy boundary required for public deployments; no supplied reverse-proxy config, worker count, measured capacity, or fleet-wide limiter. |
| docker-compose.core-lab.yml and adapter Dockerfile | B: optional lab | Private adapter, dropped capabilities/read-only filesystem; optional external Open5GS probes; distinct timeouts. No RF capacity sizing. |
| README native Go + Vite development | C: local/dev | Vite 5173; Go 8080; dev hosting is not production sizing. |
| Playwright mock/real server | C: test only | Vite 4173 or Go 18080; isolated fixtures/mock workflow tests. |
| .github/workflows/quality.yml, release.yml | C: build/release | Linux runners and amd64/arm64 published images; runner hardware does not define supported deployment hardware. |
| Actual production hardware / load / SLO / replica topology | D: unknown | No repository CPU/RAM target, link budget, headroom target, load forecast, authenticated tenancy, or certified simultaneous background/interactive envelope. |

The server timeouts are header 5 s, read 15 s, write 120 s, idle 60 s. Body cap is 1 MiB. RF loops use at most four ray/azimuth workers based on `runtime.NumCPU`; `GOMAXPROCS` and `GOMEMLIMIT` are not set by the repository. Go scheduler capacity is therefore environment-dependent. Normal experiments default to one worker and 16 queued jobs; configured workers clamp to 1–4. Queue-size environment configuration has no repository upper cap. Frontend projects remain browser IndexedDB state; admission cannot supply shared persistence or cross-user fairness.

Capacity-relevant environment variables include RF concurrency/attempt/deadline settings, experiment worker/queue settings, dataset directory/catalog, bind/port/frontend path, trusted proxies and HTTPS/API-key settings. Building downloads and viewport queries have independent 2/1/2-per-minute and 4/2/120-per-minute guards. Core Lab has its own timeout. All remain unchanged.

## Reservation feasibility, authoritative binding, and failure semantics

A future Evaluate reservation must be minted after validation by the server and cover one evaluation plus exactly N one-use simulation allowances. Bind a canonical exact cell set and ordering, effective per-cell profiles, rays, radii, input azimuths, domain/dataset hashes, model/algorithm versions, authenticated principal or current client scope, originating operation, expiry, and a random nonce. A string supplied by a browser is not authority. Reserve compute, potential response bytes, and admission state atomically before execution; still acquire the existing concurrency slots when each step actually runs.

An Optimize reservation must cover the declared search policy and budget plus N maps. Follow-up azimuths are unknown before optimization: reserve for conservative possible outputs, then bind exact returned server-verified azimuths/profile fingerprints to the receipt after successful primary completion. Do not let client-submitted explanations or optimization objects stand in for authoritative output. A failed or timed-out primary cannot mint valid map allowances.

Use opaque server-side records or authenticated signed receipts plus atomic server-side spent/revocation state. Bind tenant/client scope, dataset/model, profiles, cell IDs, final azimuths, operation and each sub-operation index. One-use consumption must be atomic across replicas; signing alone does not prevent replay. Reject forgery, changed RF data, extra maps, replay, cross-client use, expired receipts, and changed datasets/models before RF execution. Receipt expiry and partial use do not require a long-lived held compute slot.

Failed primary: retain charges for consumed work; invalidate dependent allowances and release genuinely unspent reservation. Failed follow-up: spend its attempt and actual work; no automatic reusable allowance. User cancellation, frontend abort, or stale work: cancel underlying work promptly, wait for release, keep consumed charges, and expire/revoke the remainder. Unsent follow-ups: release unspent capacity once authoritative state proves no work is active, with bounded expiry. Network ambiguity: do not refund based on client claims; an authenticated idempotent status query may recover the completed result or establish no execution. A retry that can execute again is a new charged attempt; future idempotency must have finite retention and payload binding, and is not implemented here. Refunds must never create more capacity than was reserved, or reward cheap cancellation probes. Separate reservation occupancy from cumulative resource debit to avoid double counting.

## Protected resources and future architecture

One scalar calibrated from defaults is insufficient. CPU-heavy search, geometry-dependent path work, response-volume-heavy maps/grids, async jobs, and cheap malformed/busy attempts need different protection. Candidate dimensions are compute/CPU envelope, conservative geometry envelope or trusted dataset-aware compute predictor, concurrent working set, response bytes, independent async active/queued/job-work capacity, and a low-cost request-frequency floor. Geometry may be folded into compute only after reliable conservative calibration; it cannot be omitted today.

The frequency floor remains necessary: parsing/validation, rejected busy attempts, cancellation probes, cheap reference endpoints, and retained admission state incur work even when RF cost is low. Preserve existing concurrency and deadline protections. Async jobs need independent accounting because HTTP completion releases interactive capacity while work continues. Keep the fixed policy until an actual deployment envelope is tested; do not invent a new floor value.

A minimal future design would perform cheap validation and abuse admission, dataset-aware multidimensional precharge, existing slot acquisition, server-authorized deterministic follow-up reservations, and separately budgeted async execution. It must bound estimate evaluation itself. Per-user fairness behind NAT requires a trustworthy user identity; multi-IP attacks require gateway/tenant controls; multi-replica process-local limits require coordinated enforcement. Resource admission alone solves none of those identity/topology problems.

Reject before expensive execution when frequency allowance, conservative compute/geometry/byte/working-set envelope, global/per-client slot capacity, async queue/work capacity, or reservation binding/expiry/one-use checks fail. Preserve existing validation and endpoint availability. This is a design study, not authorization to implement.

## Observability and next step

Future metrics should include operation, validated coarse cost class, estimated CPU/geometry/bytes, actual geometry counters, CPU/wall, allocation and sampled working set, response bytes and encoding time, completion/cancellation reason and release latency, active interactive jobs, async active workers/queue depth/job runs, reserved versus consumed versus released capacity, predictor underestimation, and admission reason. Use bounded-cardinality workload classes and per-process pseudonymous client correlation. Do not log raw IPs, credentials, full map payloads, or precise user locations. Server-authoritative reservation state must have bounded cardinality and expiry.

**Single next action:** define the deployment profile, load/SLO/headroom requirements, and dataset complexity envelope, then replay this bounded ledger on that target—including two interactive jobs plus its configured experiment workers—before choosing or implementing admission parameters. Implementation risk remains high until held-out predictor error, retained working set, background-job limits, and replica-wide one-use/refund semantics are verified. Expected future change surface spans middleware, cost estimation, job manager, authoritative reservation storage, API contracts, deterministic follow-up integration, frontend workflow state, cancellation/idempotency tests, metrics, and deployment/gateway configuration. None is changed by this study.

## Validated input bounds

“Default” distinguishes omitted API inputs from this study's requested canonical 120-ray fixture. No maximum below is inferred from a benchmark. The JSON contains the source constant/validation inventory, including RF profile scalar bounds.

| Dimension | Default | Minimum | Validated maximum / combined restriction | Validation owner; affected routes |
|---|---|---|---|---|
| Rays | API static 60, network 72; study 120 | 8 | 720 | main.go validateSimulationRequest / validateNetworkOptimizationRequest; simulate, sector/gaps, azimuth, evaluate/optimize, recommend, experiment runs |
| Radius | 400 m | 25 m | 5,000 m, including effective per-cell profile | main.go; profile validation; applicable RF routes |
| Segmented features | Derived | Derived | `rays × ceil(radius / 25) ≤ 25,000`; actual shared feature budget also 25,000 | static_simulation.go, route validation; runtime splits can still reject with 422 |
| Selected cells | Explicit input | 2 network, 1 measurement/building entry | 6 network/explanation/interference/measurement/building entry; recommendation baseline 5 (then candidate gives six) | policy_generated.go plus route-specific validators |
| Search policy | legacy two-pass coordinate | Named policies | legacy, deterministic multi-start, deterministic Pareto archive | optimization_search.go |
| Search passes | omitted opt-in budget 8 | 0 means default; positive 1 | 64 | ValidateNetworkOptimizationSearchOptions |
| Unique evaluations | omitted opt-in budget 5,000 | 0 means default; positive 1 | 100,000 | Same; budget is permission, not guaranteed work completed |
| Expanded states / rounds | 128 / 16 | 0 means default; positive 1 | 5,000 / 64 | Same; archive search |
| Optimizer Pareto response | Derived | 0 | 25 returned solutions | optimization_config.go internal return bound, not a client input |
| Radio-quality objective | disabled; objectives demand/residential/coverage/overlap weight 50 | priority 0 | 5 objectives, priority 100 each | optimization_config.go; optional interference-domain evaluation amplifies search work |
| Interference spacing | 40 m | 20 m | 200 m; coarsened automatically to ≤3,000 samples | interference.go, policy_generated.go |
| Interference sample / demand features | Derived | Derived | 3,000 samples / 500 demand features | Internal hard limits, not selectable sample-count maxima |
| Surface cell size | 25 m | 10 m | 250 m; `(ceil(2R / size)+1)^2 ≤ 100,000` | coverage_surface.go plus simulation validation |
| Surface thresholds | model defaults | 1 | 10 unique values in [-180, 0] dBm | coverage_surface.go |
| Measurement observations | Explicit | 1 | 5,000; total encoded body still ≤1 MiB | measurements.go |
| Recommendation polygon | Explicit | 3 vertices | 256 vertices; **no area cap** | recommendation.go |
| Recommendation candidates | Derived from installed inventory | Derived | 50 retained after scanning/ranking; 12 RF-evaluated | recommendation.go; candidate-potential work precedes truncation |
| Recommendation results | 5 | 1 | 10 | recommendation.go |
| Building entry ID filter | absent: select domain | 0 | 5,000 IDs; **not a 5,000-building output cap** | building_entry.go; whole dataset footprint scan before domain/filter result |
| Coverage-gap features | Derived | 0 | 500 | static_simulation.go; computation need not be limited to returned features |
| Experiment Cartesian runs | missing dimensions use base values | 1 | 64 validated simulation runs | experiment_jobs.go expandExperiment; all dimension products bounded |
| Experiment workers | 1 | 1 | 4 (clamped configured setting) | experiment_jobs.go; defaults preserved |
| Queued experiments | 16 | invalid value defaults to 16 | **no configurable upper cap**; channel capacity chosen at startup | newExperimentManager; normal measured queue capacity 16 |
| Retained jobs / cache | In-memory | 0 | targets 128 / 16; jobs prune terminal records only; no retention TTL | experiment_jobs.go; 128 is not universal hard admission cap for active jobs |
| Path-profile spacing / samples | 10 m | 2 m / path 1 m | spacing 100 m, 2,500 samples, path 5,000 m | path_profile.go; count includes endpoint |
| Validation diagnostics | strategy spatial size/separation 100 m | 1 campaign; ≥3 fit samples | 8 campaigns, 5,000 total measurements, 8 models; body cap still applies | measurement_validation.go |
| Diagnostic spatial size / separation | 100 m | 1 m | 10,000 m | validateValidationStrategy |
| Specular reflection obstructions / vertices | explicit or dataset-derived | polygon 3 vertices | **no independent array-count upper bound found**; 1 MiB body applies to client arrays | specular_reflection_reference.go; dataset-derived geometry has dataset-dependent complexity |
| Request body / identifiers | Explicit | Nonempty IDs where required | 1 MiB body; tower ID 128 bytes; RF profile text 64 bytes | main.go and request_inputs.go/profile validation |
| Frequency / power / beam | study 2.6 or 28 GHz / 30 dBm / 120° | frequency >0 / 0 dBm / 10° | general 300 GHz / 60 dBm / 360°; interference/recommend/measurement only 4G/5G (<100 GHz) | policy_generated.go, endpoint validators |
| Profile gains / losses / heights | study canonical profile | See JSON scalar inventory | gain -20…80 dBi; system loss 0…100 dB; polarization 0…40 dB; antenna 0.5…300 m; receiver 0.1…100 m; receiver threshold -180…-20 dBm | RF profile validators; can change range termination and geometry despite equal ray metadata |

The dataset itself has no certified ceiling on footprint count, vertex complexity, tower inventory, or geographic density established for arbitrary installed packs. The current Ankara file has 161,626 features expanded to 161,784 indexed footprints. Diagnostic/client geometry arrays limited only by encoded bytes are not certified as low-cost simply because a default reference response is tiny.

## Pre-execution prediction and certification boundary

Available metadata can bound the number of selected cells, rays, segment-budget estimate, grid dimensions, measurement samples, interference hard sample cap, optimizer budget/policy, and experiment matrix runs. It cannot alone bound actual CPU with a calibrated constant. Effective per-cell radius, beam, receiver threshold, antenna pattern/gain, propagation model, frequency, domain footprint/vertex density, search memo misses, early termination, and enabled radio-quality objectives affect work. Recommendation scans and ranks inventory candidates before its 50/12 truncation. Building entry can scan the complete dataset and return more buildings than the optional 5,000-ID filter limit.

The ledger explicitly trials ray-only, ray-times-radius, and ray-times-area CPU predictors against observed sweeps and high-cost combinations. These are exploratory predictors, not recommended charging rules. In-sample correlations do not certify tail bounds. Timing of censored 504 cases cannot establish their full work cost. A CPU estimate must be calibrated with held-out locations/profiles, repeated warmed measurements, a deployment/toolchain-specific upper residual margin, and deadline-aware behavior; it must not rely on a high correlation alone.

A theoretical dataset-aware geometry upper bound could use total/domain footprint count and vertex/edge counts, segment/path counts, maximum cell contributions and search evaluations. Such a bound is potentially enormous and needs a proof of all nested loops and runtime split budgets; this study does not provide that proof or a CPU conversion coefficient. Computing exact domain geometry as a “cheap” predictor must itself have bounded cost. Server-verified workflow preauthorization is architecturally feasible, but conservative numerical precharge is not calibrated sufficiently for production implementation.

Response feature caps do not imply a universal byte cap: per-feature properties, identifiers, polygon vertices, solution diagnostics, and encoding matter. Budget response bytes separately, use measured actual bytes for transfer modeling, and establish a conservative schema/dataset-specific bound before admitting an entire workflow. Avoid converting the observed largest response into a universal maximum.

## Async architecture and independent safety limits

Submission uses the protected batch-execution POST route, validates a Cartesian matrix of 1–64 simulation requests, and captures the current dataset snapshot. The manager creates a `context.WithCancel(context.Background())`; HTTP cancellation and the RF request's 60-second context do not bound the job after admission. The response is 202 for queued work or 200 for an existing fingerprint cache hit. A worker sequentially calls AnalyzeSector for each run, stores summary metrics rather than full map payloads, updates progress, marks Pareto status, and caches the result. Completed jobs do not hold interactive slots.

Default worker count is one; configuration is clamped to four. The default queue is a 16-entry channel. A full queue returns 429/Retry-After 2; default interactive concurrency rejection uses Retry-After 1. Jobs can be explicitly canceled by the job DELETE route; cancellation is checked within RF and between runs. Worker/job status and actual execution release are distinct, because Cancel marks dismissed immediately before the running RF loop unwinds.

Cache keys include definition, expanded parameters, dataset identity/hashes, and model version. Cache has 16 entries with oldest-created eviction. Terminal-job retention targets 128 records and evicts old terminal jobs on subsequent submission; no TTL, durable storage, per-client queued-work quota, or background computation deadline is supplied. The 128 target is not a hard active-job cap if a larger configured queue holds only active jobs. Different jobs retain captured dataset references, so dataset switching can retain multiple packs concurrently. In-flight duplicates are not coalesced merely because completed results are cached.

Default worker/queue/run limits bound simultaneous background execution and pending counts, but do not certify a safe total CPU/memory/time envelope on unspecified hardware. A queue of expensive 64-run jobs can consume substantial work independently of the HTTP slots and budget window. Async admission must reserve job work as well as queue occupancy, preserve cancellation, and account for retained snapshots/cache. Raising interactive request limits would not control that background work.

## Hypothetical deployment scenarios — modeled, not benchmarked

The requested 2 vCPU / 4 GiB, 4 vCPU / 8 GiB, and 8 vCPU / 16 GiB profiles have not been tested. A necessary idealized scheduling estimate is observed scenario CPU seconds divided by usable vCPUs, with no background load; parallel efficiency and actual processor speed can make wall time much worse. Observed CPU is instrumented local demand, not a transferable machine-independent instruction count. For two concurrent operations, use their measured aggregate CPU, not one request's CPU. Compare observed process working set to available memory only after reserving OS, runtime, retained snapshots/results, cache, and background work headroom. Never sum exclusive per-request heap deltas as though dataset memory were duplicated, or take one sample as an OOM-safe bound.

A supported request already consuming the full 60-second local deadline has no completion headroom on that host. Slower/weaker hypothetical hardware cannot be certified to complete it. Existing global concurrency two is locally useful for protecting against a third interactive request, but it does not bound the separately configured background workers or prove acceptable latency on an arbitrary 2-vCPU host. Capacity on the three hypothetical profiles remains unknown; no production concurrency change or production token capacity is recommended.

## Eight-cell readiness

Eight cells are comparison-only and require an isolated override of MaxNetworkTowers. Request-count arithmetic is unchanged: Evaluate + maps uses N+1 attempts; Optimize + maps also N+1; Evaluate + Interference + Re-evaluate uses 2N+3. Those are 7/7/15 at six and 9/9/19 at eight, leaving just one attempt for the eight-cell repeat workflow under the current 20-attempt policy. A further explanation and map action would exceed that window. A server-verified resource reservation could plausibly address this request-count mismatch after calibration, but cannot remove actual RF demand, bandwidth, memory, or background-job contention.

RF feasibility, admission-policy readiness, and persistence/UI/validation readiness are separate. Default eight-cell local completion is not a supported product guarantee and says nothing about high-input/deployment envelopes. Production validation, frontend selection, import/export and retained-result schema limits, report/map payloads, responsive usability, and cancellation must all be reviewed before a product cap change. This study makes no product-cap recommendation and leaves six unchanged.

## Browser and transport interpretation

Browser measurements use visible desktop Chromium with real captured JSON. Local loopback loading is outside the parse timer; five parse observations are recorded for individual responses and one for each retained six-map bundle. Forced-GC CDP heap compares retained parsed objects after dropping raw JSON strings. This excludes React/Leaflet layer construction, duplicated application/history objects, IndexedDB serialization, GPU/native memory, and browser rendering. It is a parser/object-retention lower slice, not an end-to-end workspace memory ceiling. A mobile viewport in Playwright is not mobile hardware and supplies no device certification.

Transfer estimates in the ledger are **MODELED**, using actual measured bytes × 8 / decimal Mbit/s at 10, 50, 100, and 1,000 Mbit/s. They exclude compression, protocol overhead, RTT, contention, per-request sequencing overhead, parse/render time, and retransmissions. No external network test was performed. Response volume can dominate logical workflow latency even when local RF CPU is modest; reservations would need expiry and unused-capacity rules compatible with a declared deployment link/SLO.

<!-- generated-measurement-tables -->

## Measured environment and high-water marks

The clean native default pass replaced an initial pass that overlapped the Docker image build; both initial ledgers remain in the JSON, explicitly excluded from comparison ratios. One clean observation per route/case is not a latency distribution. RSS/heap are whole-process samples, not exclusively charged request memory.

| Environment | CPU / physical or VM memory | Toolchain / scheduler | Storage / quotas |
| --- | --- | --- | --- |
| Native macOS arm64 | Apple M4; 10 logical CPUs; 24 GiB physical | Go 1.27.1; GOMAXPROCS 10 | APFS workspace; environment snapshot includes free/inactive/compressed pages and memory-pressure indicator |
| Normal Docker Linux arm64 | OrbStack VM; 10 logical CPUs; 12,600,156,160 bytes VM memory | Go 1.26.6 build; instrumented runtime GOMAXPROCS 10 | Overlay filesystem; cpu.max=max 100000; memory.max=max; no Compose quotas |
| Instrumented container test | Same image/dataset/runtime quotas | Cross-compiled Go 1.26.6; non-root host UID for writable test artifacts | Test binary only; normal production HTTP server measured separately |

| Native single-request dimension | Observed high-water | Case / result |
| --- | --- | --- |
| cpu_seconds | 302.36016399999994 | high-recommend (28 GHz; HTTP 504) |
| wall_seconds | 60.019227083 | high-recommend (2.6 GHz; HTTP 504) |
| rss_sampled_max_bytes | 1,390,215,168 | high-surface (28 GHz; HTTP 200) |
| heap_sampled_max_bytes | 1,252,105,496 | high-building (2.6 GHz; HTTP 504) |
| response_bytes | 64,122,209 | high-rays-radius (2.6 GHz; HTTP 200) |
| allocation_bytes | 185,344,068,272 | high-recommend (28 GHz; HTTP 504) |
| equivalent_cores | 6.065081037055153 | high-azimuth (28 GHz; HTTP 200) |
| completed_cpu_seconds | 63.378108999999995 | high-azimuth ( GHz; HTTP ) |

| Geometry counter | Observed single-request high-water | Case |
| --- | --- | --- |
| coverage_builds | 1,842 | deterministic_multistart_coordinate_v1-500 |
| edge_intersection_checks | 1,798,879,336 | high-interference |
| polygon_intersection_calls | 321,010,617 | high-interference |
| polygon_tests | 650,902,648 | high-interference |
| ray_traces | 442,080 | deterministic_multistart_coordinate_v1-500 |
| spatial_candidates | 160,936,952 | high-interference |
| spatial_queries | 78,265,948 | deterministic_multistart_coordinate_v1-500 |

Across complete native scenarios (including workflows), sampled RSS reached 2255.19 MiB in high-repeat-bundle; heap reached 1894.21 MiB in high-repeat-bundle. Maximum observed average equivalent cores was 8.092 in heavy-map-map, against ten available logical CPUs. These averages are not instantaneous peaks or a certified spare-core budget. The largest single-request CPU measurement includes a timeout; the largest completed single-request CPU is 63.378 CPU seconds. Worst interactive deadline overshoot was 0.019 seconds in this finite sample; cooperative cancellation does not prove universal zero overshoot.

## Default and high supported route measurements

Native canonical fixture: 120 rays, 400 m, 30 dBm, 120° beam; six selected network cells where applicable, 20/100 MHz at 2.6/28 GHz. Recommendation baseline uses two cells and a small polygon; measurement baseline has one observation; experiments have four azimuth runs. Surface endpoint baseline uses the prior canonical 10 m fixture; the true omitted 25 m surface default is measured separately in the sensitivity ledger. Diagnostic reference baselines remain their applicable 140 GHz contract fixtures, not fictitious 2.6/28 GHz versions.

| Route | GHz | Wall s | CPU s | RSS MiB | Heap MiB | Response MiB | JSON writer s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| simulate | 2.6 | 0.028 | 0.055 | 506.52 | 405.34 | 6.99 | 0.015 |
| simulate | 28 | 0.015 | 0.041 | 495.17 | 355.35 | 2.03 | 0.004 |
| evaluate-network | 2.6 | 0.429 | 0.978 | 797.42 | 554.89 | 0.03 | 0.000 |
| evaluate-network | 28 | 0.427 | 0.775 | 801.09 | 532.36 | 0.03 | 0.000 |
| optimize-network | 2.6 | 5.981 | 17.391 | 798.27 | 609.98 | 0.09 | 0.000 |
| optimize-network | 28 | 5.910 | 16.683 | 801.92 | 609.03 | 0.09 | 0.000 |
| interference | 2.6 | 0.042 | 0.064 | 797.47 | 388.66 | 4.48 | 0.010 |
| interference | 28 | 0.042 | 0.063 | 801.16 | 388.50 | 4.45 | 0.010 |
| explain-network-cell | 2.6 | 0.199 | 0.537 | 798.31 | 535.47 | 0.00 | 0.000 |
| explain-network-cell | 28 | 0.197 | 0.528 | 801.94 | 534.94 | 0.00 | 0.000 |
| optimize-azimuth | 2.6 | 0.396 | 1.874 | 796.75 | 601.73 | 0.01 | 0.000 |
| optimize-azimuth | 28 | 0.390 | 1.865 | 800.33 | 654.74 | 0.01 | 0.000 |
| building-entry-analysis | 2.6 | 0.049 | 0.048 | 798.34 | 354.23 | 2.16 | 0.005 |
| building-entry-analysis | 28 | 0.048 | 0.048 | 801.98 | 354.24 | 2.16 | 0.005 |
| coverage-surface | 2.6 | 0.040 | 0.039 | 798.38 | 352.92 | 0.78 | 0.002 |
| coverage-surface | 28 | 0.039 | 0.039 | 802.03 | 352.82 | 0.75 | 0.002 |
| recommend-sites | 2.6 | 5.719 | 25.737 | 815.34 | 684.22 | 0.02 | 0.000 |
| recommend-sites | 28 | 5.674 | 25.180 | 809.34 | 666.23 | 0.02 | 0.000 |
| measurements/evaluate | 2.6 | 0.001 | 0.001 | 798.55 | 310.91 | 0.01 | 0.000 |
| measurements/evaluate | 28 | 0.001 | 0.001 | 802.19 | 310.92 | 0.01 | 0.000 |
| processes/batch-experiment/execution | 2.6 | 0.065 | 0.169 | 815.34 | 449.26 | 0.00 | 0.000 |
| processes/batch-experiment/execution | 28 | 0.047 | 0.149 | 809.34 | 426.41 | 0.00 | 0.000 |

High settings: 125 rays / 5,000 m / 60 dBm / 360°; alternate map 720 rays / 850 m / 60 dBm / 360°; surface 1,575 m / 10 m grid (99,856 cells); recommendation five baseline cells, up to ten results, full Ankara polygon; measurements 5,000 observations with high effective profiles; optimizer archive budget reaches the validated 64/100,000/5,000/64 settings. Timeout responses are error bodies, not successful payload-size bounds.

| High case | GHz | HTTP | Wall s | CPU s | Spatial matches | RSS MiB | Heap MiB | Response MiB | JSON writer s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| high-simulate | 2.6 | 200 | 0.304 | 1.683 | 498,543 | 981.52 | 772.42 | 10.78 | 0.029 |
| high-simulate | 28 | 200 | 0.242 | 1.460 | 498,495 | 902.80 | 714.01 | 3.50 | 0.008 |
| high-rays-radius | 2.6 | 200 | 0.377 | 1.498 | 432,309 | 1217.67 | 710.20 | 61.15 | 0.161 |
| high-rays-radius | 28 | 200 | 0.206 | 0.965 | 434,060 | 964.95 | 632.00 | 19.89 | 0.051 |
| high-evaluate | 2.6 | 200 | 7.285 | 23.914 | 9,000,179 | 1217.80 | 762.45 | 0.03 | 0.000 |
| high-evaluate | 28 | 200 | 7.254 | 23.235 | 9,003,881 | 968.95 | 748.80 | 0.03 | 0.000 |
| high-optimize | 2.6 | 504 | 60.001 | 211.453 | 83,722,335 | 1183.09 | 807.28 | 0.00 | 0.000 |
| high-optimize | 28 | 504 | 60.001 | 209.716 | 84,476,389 | 969.61 | 792.83 | 0.00 | 0.000 |
| high-interference | 2.6 | 504 | 60.002 | 112.609 | 157,752,244 | 1182.97 | 621.09 | 0.00 | 0.000 |
| high-interference | 28 | 504 | 60.002 | 112.401 | 160,936,952 | 942.36 | 625.49 | 0.00 | 0.000 |
| high-azimuth | 2.6 | 200 | 10.546 | 63.378 | 17,927,740 | 1158.14 | 787.02 | 0.01 | 0.000 |
| high-azimuth | 28 | 200 | 10.157 | 61.605 | 17,931,769 | 938.89 | 772.26 | 0.01 | 0.000 |
| high-building | 2.6 | 504 | 60.001 | 101.796 | 144,289,200 | 1319.92 | 1194.10 | 0.00 | 0.000 |
| high-building | 28 | 504 | 60.002 | 100.940 | 148,322,171 | 1325.69 | 1181.42 | 0.00 | 0.000 |
| high-surface | 2.6 | 200 | 9.516 | 18.092 | 27,661,812 | 1320.48 | 613.97 | 21.07 | 0.061 |
| high-surface | 28 | 200 | 9.538 | 18.139 | 27,661,812 | 1325.81 | 613.55 | 21.04 | 0.060 |
| high-recommend | 2.6 | 504 | 60.019 | 301.619 | 122,567,245 | 1318.70 | 772.49 | 0.00 | 0.000 |
| high-recommend | 28 | 504 | 60.002 | 302.360 | 124,318,098 | 1277.44 | 785.12 | 0.00 | 0.000 |
| high-measurements | 2.6 | 200 | 0.389 | 0.601 | 672,406 | 1156.03 | 522.71 | 1.73 | 0.004 |
| high-measurements | 28 | 200 | 0.401 | 0.614 | 672,406 | 1095.61 | 531.61 | 1.73 | 0.004 |
| max-search-budget | 2.6 | 504 | 60.001 | 174.562 | 106,707,572 | 1156.16 | 627.70 | 0.00 | 0.000 |
| max-search-budget | 28 | 504 | 60.001 | 170.532 | 112,373,975 | 1095.61 | 624.21 | 0.00 | 0.000 |
| high-explanation | 2.6 | 200 | 0.590 | 1.617 | 1,120,094 | 775.92 | 608.75 | 0.00 | 0.000 |
| high-explanation | 28 | 200 | 0.590 | 1.631 | 1,150,774 | 750.86 | 609.41 | 0.00 | 0.000 |

| High/default comparison | GHz | Wall × | CPU × | Spatial matches × | RSS delta MiB | Heap delta MiB | Response × |
| --- | --- | --- | --- | --- | --- | --- | --- |
| high-simulate | 2.6 | 10.97 | 30.37 | 13.32 | 475.00 | 367.08 | 1.5428 |
| high-simulate | 28 | 16.44 | 35.63 | 13.57 | 407.62 | 358.66 | 1.7307 |
| high-rays-radius | 2.6 | 13.61 | 27.03 | 11.55 | 711.16 | 304.86 | 8.7532 |
| high-rays-radius | 28 | 13.96 | 23.54 | 11.81 | 469.78 | 276.65 | 9.8210 |
| high-evaluate | 2.6 | 16.97 | 24.45 | 15.55 | 420.38 | 207.56 | 1.0029 |
| high-evaluate | 28 | 16.97 | 29.97 | 15.14 | 167.86 | 216.44 | 1.0032 |
| high-optimize | 2.6 | 10.03 | 12.16 | 7.78 | 384.83 | 197.31 | 0.0005 |
| high-optimize | 28 | 10.15 | 12.57 | 7.72 | 167.69 | 183.80 | 0.0005 |
| high-interference | 2.6 | 1412.60 | 1768.97 | 2013.20 | 385.50 | 232.43 | 0.0000 |
| high-interference | 28 | 1413.85 | 1788.43 | 2053.84 | 141.20 | 236.99 | 0.0000 |
| high-azimuth | 2.6 | 26.61 | 33.81 | 14.93 | 361.39 | 185.29 | 0.9998 |
| high-azimuth | 28 | 26.01 | 33.03 | 14.75 | 138.56 | 117.53 | 1.0004 |
| high-building | 2.6 | 1229.39 | 2123.10 | 3050.90 | 521.58 | 839.87 | 0.0000 |
| high-building | 28 | 1238.92 | 2118.95 | 3136.17 | 523.70 | 827.18 | 0.0000 |
| high-surface | 2.6 | 239.94 | 463.00 | 362.72 | 522.11 | 261.05 | 27.1242 |
| high-surface | 28 | 246.17 | 467.59 | 362.72 | 523.78 | 260.73 | 28.0759 |
| high-recommend | 2.6 | 10.49 | 11.72 | 7.73 | 503.36 | 88.27 | 0.0024 |
| high-recommend | 28 | 10.58 | 12.01 | 7.70 | 468.09 | 118.89 | 0.0025 |
| high-measurements | 2.6 | 267.32 | 699.36 | n/a | 357.48 | 211.80 | 116.3584 |
| high-measurements | 28 | 271.35 | 694.87 | n/a | 293.42 | 220.68 | 116.4481 |

## Parameter sensitivity and dominant drivers

| Sweep at 2.6 GHz (28 GHz in ledger) | Wall s | CPU s | Spatial matches | Allocation MiB | Response MiB |
| --- | --- | --- | --- | --- | --- |
| rays-8 | 0.003 | 0.007 | 2,347 | 6.57 | 0.52 |
| rays-60 | 0.014 | 0.030 | 18,884 | 48.10 | 3.47 |
| rays-120 | 0.027 | 0.055 | 37,420 | 95.55 | 6.99 |
| rays-360 | 0.097 | 0.280 | 112,291 | 290.98 | 21.28 |
| rays-720 | 0.191 | 0.543 | 224,543 | 576.82 | 42.59 |
| radius-1000 | 0.041 | 0.098 | 70,041 | 151.07 | 6.99 |
| radius-2500 | 0.104 | 0.491 | 203,343 | 392.32 | 7.00 |
| radius-5000 | 0.348 | 2.027 | 729,713 | 1338.84 | 7.01 |
| cells-2 | 0.162 | 0.206 | 159,868 | 119.22 | 0.02 |
| cells-4 | 0.313 | 0.772 | 372,806 | 298.28 | 0.02 |
| cells-6 | 0.429 | 0.990 | 578,752 | 474.02 | 0.03 |
| surface-25 | 0.007 | 0.007 | 12,123 | 7.02 | 0.15 |
| surface-10 | 0.038 | 0.038 | 76,263 | 42.67 | 0.78 |
| interference-spacing-200 | 0.030 | 0.032 | 50,999 | 44.75 | 2.30 |
| interference-spacing-40 | 0.043 | 0.067 | 78,359 | 78.66 | 4.48 |
| interference-spacing-20 | 0.051 | 0.091 | 92,235 | 96.24 | 5.60 |
| measurements-1 | 0.001 | 0.001 | 0 | 0.28 | 0.01 |
| measurements-100 | 0.002 | 0.002 | 376 | 1.34 | 0.05 |
| measurements-1000 | 0.014 | 0.014 | 5,869 | 13.17 | 0.34 |
| measurements-5000 | 0.058 | 0.058 | 27,575 | 62.48 | 1.66 |
| experiment-1 | 0.016 | 0.043 | 35,011 | 34.30 | 0.00 |
| experiment-4 | 0.074 | 0.187 | 141,917 | 138.55 | 0.00 |
| experiment-16 | 0.309 | 1.173 | 546,758 | 539.71 | 0.00 |
| experiment-64 | 1.228 | 4.742 | 2,189,927 | 2160.95 | 0.00 |

Ray count, effective radius and footprint/vertex density dominate geometry. Model choice changes polygon/path work even at equal rays. Beam/power/frequency/receiver profile alter range termination and serialized map properties. Cell count multiplies contributions; search policy and unique-evaluation budget change reuse and discovery demand. High interference radius multiplies sample-by-cell path work even though sampling is capped. Surface resolution drives grid work and bytes; building-entry selection can scan the full dataset; recommendation candidate-potential scans precede its RF evaluation cap. Observation and experiment-run counts scale independent loops. Cumulative allocations can far exceed live heap: the worst observed single-request allocation was approximately 172.6 GiB in a 60-second request, indicating GC pressure rather than 172.6 GiB of resident memory.

## Concurrent clients, deadlines, and async overlap

| Native combination | GHz | Statuses | Wall s | Aggregate CPU s | Equivalent cores | RSS MiB | Heap MiB | Goroutines | Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opt-opt | 2.6 | 200,200 | 9.757 | 49.145 | 5.037 | 807.30 | 661.70 | 14 | 196,360 |
| opt-opt | 28 | 200,200 | 9.394 | 45.733 | 4.868 | 844.91 | 697.30 | 14 | 196,324 |
| opt-eval | 2.6 | 200,200 | 6.871 | 20.620 | 3.001 | 807.38 | 648.67 | 14 | 127,264 |
| opt-eval | 28 | 200,200 | 6.520 | 19.569 | 3.001 | 845.05 | 634.31 | 14 | 127,208 |
| opt-interference | 2.6 | 200,200 | 6.575 | 18.643 | 2.836 | 807.53 | 641.10 | 9 | 4,796,306 |
| opt-interference | 28 | 200,200 | 6.359 | 17.441 | 2.743 | 845.23 | 629.02 | 9 | 4,765,802 |
| eval-eval | 2.6 | 200,200 | 0.544 | 2.257 | 4.151 | 807.55 | 633.36 | 6 | 58,168 |
| eval-eval | 28 | 200,200 | 0.535 | 2.231 | 4.169 | 845.27 | 606.11 | 10 | 58,092 |
| recommend-opt | 2.6 | 200,200 | 11.455 | 65.803 | 5.744 | 918.08 | 788.98 | 14 | 119,860 |
| recommend-opt | 28 | 200,200 | 11.222 | 63.216 | 5.633 | 959.41 | 769.32 | 14 | 119,754 |
| heavy-map-map | 2.6 | 200,200 | 0.708 | 5.613 | 7.931 | 1256.78 | 906.81 | 14 | 22,603,660 |
| heavy-map-map | 28 | 200,200 | 0.657 | 5.318 | 8.092 | 1147.22 | 938.57 | 14 | 7,349,976 |
| same-IP | 2.6 | 429,200 | 6.637 | 18.994 | 2.862 | 1256.88 | 614.96 | 9 | 98,246 |
| same-IP | 28 | 200,429 | 6.379 | 18.026 | 2.826 | 1147.28 | 603.92 | 9 | 98,228 |
| three-IP | 2.6 | 200,429,200 | 9.929 | 49.732 | 5.009 | 1256.88 | 658.42 | 14 | 196,415 |
| three-IP | 28 | 429,200,200 | 9.515 | 47.021 | 4.942 | 1147.33 | 670.00 | 14 | 196,379 |
| cancel-high-optimize | 2.6 | 200 | 0.100 | 0.101 | 1.001 | 1186.14 | 401.00 | 5 | 0 |
| cancel-high-optimize | 28 | 200 | 0.102 | 0.102 | 1.002 | 1147.34 | 406.16 | 5 | 0 |
| cancel-high-evaluate | 2.6 | 200 | 0.102 | 0.102 | 1.002 | 1186.14 | 407.28 | 5 | 0 |
| cancel-high-evaluate | 28 | 200 | 0.102 | 0.102 | 1.001 | 1147.34 | 414.05 | 5 | 0 |
| high-opt-opt | 2.6 | 504,504 | 60.001 | 351.294 | 5.855 | 1258.39 | 989.90 | 14 | 106 |
| high-opt-opt | 28 | 504,504 | 60.000 | 346.249 | 5.771 | 1149.62 | 952.56 | 14 | 106 |
| largest-map-pair | 2.6 | 200,200 | 0.783 | 4.260 | 5.438 | 1769.50 | 1126.52 | 14 | 128,244,418 |
| largest-map-pair | 28 | 200,200 | 0.479 | 3.518 | 7.342 | 1344.58 | 813.24 | 14 | 41,707,080 |

At 2.6 GHz, two default optimizers inflated maximum per-request wall time by 1.63× against the clean solo sample. Same-IP admission executed one and rejected one (both charged, remaining 18); geometry matches were 10,760,202, versus 21,520,404 for two executed jobs. Three distinct clients executed two and rejected one; its geometry matches equal the two-job case (21,520,404). Cancellation at 100 ms returned after 0.0022 s of additional wall time, produced zero body bytes, and released slots. Recorder status 200 for canceled/no-body cases is not successful RF output.
At 28 GHz, two default optimizers inflated maximum per-request wall time by 1.59× against the clean solo sample. Same-IP admission executed one and rejected one (both charged, remaining 18); geometry matches were 10,949,251, versus 21,898,502 for two executed jobs. Three distinct clients executed two and rejected one; its geometry matches equal the two-job case (21,898,502). Cancellation at 100 ms returned after 0.0023 s of additional wall time, produced zero body bytes, and released slots. Recorder status 200 for canceled/no-body cases is not successful RF output.

| Background scenario | GHz | Wall s (all work) | Aggregate CPU s | Interactive request walls s | RSS MiB | Heap MiB | Sampled async active / HTTP slots |
| --- | --- | --- | --- | --- | --- | --- | --- |
| async-alone-16 | 2.6 | 0.263 | 0.854 | none | 718.78 | 571.94 | not sampled in initial harness / not sampled in initial harness |
| async-alone-16 | 28 | 0.192 | 0.756 | none | 727.89 | 580.94 | not sampled in initial harness / not sampled in initial harness |
| async-evaluate | 2.6 | 0.531 | 2.240 | 0.530 | 743.89 | 618.20 | not sampled in initial harness / not sampled in initial harness |
| async-evaluate | 28 | 0.512 | 2.147 | 0.511 | 735.97 | 594.74 | not sampled in initial harness / not sampled in initial harness |
| async-optimize | 2.6 | 6.701 | 20.489 | 6.701 | 761.16 | 629.88 | not sampled in initial harness / not sampled in initial harness |
| async-optimize | 28 | 6.401 | 18.976 | 6.400 | 783.75 | 615.35 | not sampled in initial harness / not sampled in initial harness |
| async-two-interactive | 2.6 | 7.419 | 28.471 | 7.419/0.865 | 822.03 | 698.54 | not sampled in initial harness / not sampled in initial harness |
| async-two-interactive | 28 | 7.113 | 26.257 | 7.112/0.856 | 857.45 | 677.97 | not sampled in initial harness / not sampled in initial harness |
| heavy-async-plus-two-interactive | 2.6 | 19.491 | 62.624 | 8.079/0.751 | 1023.53 | 877.49 | 1 / 2 |
| heavy-async-plus-two-interactive | 28 | 12.354 | 57.318 | 8.945/0.735 | 1026.08 | 849.20 | 1 / 2 |
| configured-four-workers-plus-two | 2.6 | 7.305 | 31.739 | 7.304/1.315 | 1029.38 | 901.64 | 4 / 2 |
| configured-four-workers-plus-two | 28 | 7.075 | 29.645 | 7.074/1.246 | 1018.80 | 859.96 | 4 / 2 |
| high-experiment-64 | 2.6 | 76.412 | 164.746 | none | 1077.17 | 780.83 | not sampled in initial harness / not sampled in initial harness |
| high-experiment-64 | 28 | 46.897 | 139.365 | none | 1093.19 | 802.65 | not sampled in initial harness / not sampled in initial harness |

At 2.6 GHz the completed high 64-run job used 164.746 aggregate CPU seconds and 76.412 wall seconds, averaging 2.574 CPU seconds and 1.194 wall seconds/run for that matrix. These averages include submission/manager sampling and vary with azimuth; they are not uniform per-run maxima.
At 28 GHz the completed high 64-run job used 139.365 aggregate CPU seconds and 46.897 wall seconds, averaging 2.178 CPU seconds and 0.733 wall seconds/run for that matrix. These averages include submission/manager sampling and vary with azimuth; they are not uniform per-run maxima.
Queue audit: 17 submissions accepted (one running, 16 waiting), next submission rejected 429 with remaining 2; no HTTP slot remained occupied. Canceling jobs drained queued work and the actual worker in 0.001313 s; 1024 queued runs were prevented. The four-worker row is a gated alternate configuration; default remains one.

## Six-cell workflows and test-only eight-cell delta

| Workflow | Cells | GHz | Attempts | Wall s | CPU s | Spatial matches | RSS MiB | Heap MiB | Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-evaluate | 6 | 2.6 | 7 | 0.553 | 1.362 | 770,152 | 881.94 | 639.58 | 40,365,391 |
| A-evaluate | 6 | 28 | 7 | 0.490 | 1.229 | 791,300 | 737.31 | 614.01 | 13,894,505 |
| A-evaluate | 8 | 2.6 | 9 | 0.844 | 2.084 | 1,016,225 | 847.30 | 687.29 | 55,510,082 |
| A-evaluate | 8 | 28 | 9 | 0.646 | 1.773 | 1,051,361 | 770.09 | 606.26 | 19,057,933 |
| B-evaluate-interference | 6 | 2.6 | 8 | 0.600 | 1.513 | 848,511 | 883.72 | 610.82 | 45,063,517 |
| B-evaluate-interference | 6 | 28 | 8 | 0.534 | 1.256 | 869,659 | 774.88 | 592.19 | 18,562,145 |
| B-evaluate-interference | 8 | 2.6 | 10 | 0.789 | 2.024 | 1,114,602 | 847.52 | 630.95 | 61,782,364 |
| B-evaluate-interference | 8 | 28 | 10 | 0.706 | 1.774 | 1,149,738 | 805.77 | 580.61 | 25,292,972 |
| C-evaluate-interference-reevaluate | 6 | 2.6 | 15 | 1.153 | 2.988 | 1,618,663 | 904.00 | 649.89 | 85,428,908 |
| C-evaluate-interference-reevaluate | 6 | 28 | 15 | 1.071 | 2.790 | 1,660,959 | 775.31 | 600.20 | 32,456,650 |
| C-evaluate-interference-reevaluate | 8 | 2.6 | 19 | 1.507 | 3.935 | 2,130,827 | 965.98 | 689.77 | 117,292,446 |
| C-evaluate-interference-reevaluate | 8 | 28 | 19 | 1.345 | 3.370 | 2,201,099 | 841.81 | 635.16 | 44,350,905 |
| D-optimize-map-review | 6 | 2.6 | 7 | 6.270 | 18.338 | 10,940,156 | 905.70 | 635.70 | 40,821,192 |
| D-optimize-map-review | 6 | 28 | 7 | 6.430 | 17.913 | 11,135,710 | 777.42 | 603.28 | 14,475,747 |
| D-optimize-map-review | 8 | 2.6 | 9 | 8.949 | 26.140 | 15,673,605 | 967.02 | 616.03 | 55,756,893 |
| D-optimize-map-review | 8 | 28 | 9 | 8.724 | 24.622 | 15,993,811 | 842.75 | 608.97 | 20,051,861 |
| E-optimize-explanation-inspect | 6 | 2.6 | 8 | 7.047 | 20.190 | 11,317,050 | 906.08 | 672.96 | 40,824,189 |
| E-optimize-explanation-inspect | 6 | 28 | 8 | 6.890 | 18.925 | 11,521,160 | 777.78 | 611.20 | 14,478,746 |
| E-optimize-explanation-inspect | 8 | 2.6 | 10 | 9.090 | 26.443 | 16,180,652 | 968.03 | 704.14 | 55,759,912 |
| E-optimize-explanation-inspect | 8 | 28 | 10 | 9.005 | 25.854 | 16,504,994 | 842.91 | 636.29 | 20,054,870 |

| 6 → 8 default comparison | GHz | CPU change | Wall change | Spatial-match change | Byte change |
| --- | --- | --- | --- | --- | --- |
| A-evaluate | 2.6 | 53.0% | 52.6% | 32.0% | 37.5% |
| A-evaluate | 28 | 44.3% | 31.8% | 32.9% | 37.2% |
| D-optimize-map-review | 2.6 | 42.5% | 42.7% | 43.3% | 36.6% |
| D-optimize-map-review | 28 | 37.5% | 35.7% | 43.6% | 38.5% |
| C-evaluate-interference-reevaluate | 2.6 | 31.7% | 30.7% | 31.6% | 37.3% |
| C-evaluate-interference-reevaluate | 28 | 20.8% | 25.6% | 32.5% | 36.6% |

Supported six-cell high-evaluate-map-bundle, 2.6 GHz: 7 sequential attempts, 18.601 CPU s, 6.397 wall s, 9,463,553 spatial matches, 360,659,611 bytes, sampled RSS 1988.62 MiB / heap 1325.77 MiB. All requests completed. Memory includes retained recorder copies across the whole workflow, not just one streamed server response.
Supported six-cell high-evaluate-map-bundle, 28 GHz: 7 sequential attempts, 17.478 CPU s, 5.525 wall s, 9,544,465 spatial matches, 113,443,106 bytes, sampled RSS 1174.47 MiB / heap 777.78 MiB. All requests completed. Memory includes retained recorder copies across the whole workflow, not just one streamed server response.
Supported six-cell high-repeat-bundle, 2.6 GHz: 15 sequential attempts, 34.575 CPU s, 12.957 wall s, 21,002,152 spatial matches, 726,378,275 bytes, sampled RSS 2255.19 MiB / heap 1894.21 MiB. All requests completed. Memory includes retained recorder copies across the whole workflow, not just one streamed server response.
Supported six-cell high-repeat-bundle, 28 GHz: 15 sequential attempts, 35.611 CPU s, 11.800 wall s, 21,163,976 spatial matches, 231,893,856 bytes, sampled RSS 1386.59 MiB / heap 1073.19 MiB. All requests completed. Memory includes retained recorder copies across the whole workflow, not just one streamed server response.

## Domain, dataset and predictor evidence

| Domain / dataset control | GHz | Wall s | CPU s | Spatial matches | Response bytes |
| --- | --- | --- | --- | --- | --- |
| domain-canonical | 2.6 | 0.026 | 0.053 | 37420 | 7325534 |
| domain-canonical | 28 | 0.015 | 0.041 | 36739 | 2123370 |
| domain-central | 2.6 | 0.027 | 0.053 | 36629 | 7338193 |
| domain-central | 28 | 0.015 | 0.043 | 39372 | 2009239 |
| domain-peripheral | 2.6 | 0.011 | 0.015 | 0 | 3262470 |
| domain-peripheral | 28 | 0.012 | 0.022 | 0 | 3270988 |
| controlled-synthetic | 2.6 | 0.011 | 0.017 | 500 | 3531567 |
| controlled-synthetic | 28 | 0.011 | 0.016 | 500 | 3538740 |

The peripheral fixture has zero local Ankara footprints and is a sparse-domain lower control. The synthetic dataset contains one controlled footprint (four vertices); its costs are not production-equivalent. Pre-handler R-tree square envelopes found canonical 772 footprints/3,206 vertices, central 614/3,665, peripheral zero. Lookup cost is recorded separately; it is not included in RF timings. More vertices with fewer buildings illustrates why counts alone are incomplete. At 28 GHz, the empty domain produced more response bytes than the canonical dense domain despite less geometry work.

The finite pre-handler inventory lookup sample reached 0.024170 wall seconds and 0.193324 process CPU seconds (different lookups). Counts include complete footprint vertices intersecting each conservative square envelope; they are metadata, not actual RF interaction counts. Even estimation requires its own bounded resource allowance.

| Exploratory predictor | Cases | Underestimates | Worst actual / predicted | Worst predicted / actual | Certified? |
| --- | --- | --- | --- | --- | --- |
| ray-only | 20 | 16 | 52.53× | 1.06× | No |
| ray-times-radius | 20 | 14 | 4.20× | 1.40× | No |
| ray-times-area | 20 | 7 | 1.78× | 5.34× | No |
| geometry | 44 | 11 | 1.35× | 48.29× | No |
| response-bytes | 44 | 15 | 1.54× | 12.47× | No |

These errors reject the tested estimators as conservative admission rules. Geometry estimates use pre-handler domain footprints with a canonical ray/radius coefficient; byte estimates use canonical bytes/requested-segment budget. Neither proves a schema/geometry upper bound. CPU/geometry/byte estimates require separate calibration and held-out tests; no production reserve or scalar weight is selected.

## Container, bandwidth and browser measurements

| Normal HTTP image | GHz | Case index | HTTP | Wall s | Cgroup CPU s | Server RSS MiB | Received body bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| /api/simulate | 2.6 | 0 | 200 | 0.074 | 0.081 | 508.71 | 7325534 |
| /api/evaluate-network | 2.6 | 1 | 200 | 0.479 | 0.810 | 799.54 | 29084 |
| /api/interference | 2.6 | 2 | 200 | 0.068 | 0.057 | 812.66 | 4698126 |
| /api/optimize-network | 2.6 | 3 | 200 | 6.982 | 15.084 | 845.07 | 98180 |
| /api/simulate | 2.6 | 4 | 200 | 0.423 | 0.970 | 1096.91 | 64122209 |
| /api/evaluate-network | 2.6 | 5 | 200 | 6.740 | 19.521 | 1096.99 | 29168 |
| /api/optimize-network | 2.6 | 6 | 504 | 60.040 | 189.067 | 1076.98 | 0 |
| /api/coverage-surface | 2.6 | 7 | 200 | 9.214 | 15.939 | 933.33 | 22090087 |
| /api/recommend-sites | 2.6 | 8 | 504 | 60.028 | 282.623 | 1060.80 | 0 |
| /api/simulate | 28 | 0 | 200 | 0.047 | 0.046 | 980.96 | 2123370 |
| /api/evaluate-network | 28 | 1 | 200 | 0.466 | 0.751 | 981.43 | 29046 |
| /api/interference | 28 | 2 | 200 | 0.087 | 0.271 | 855.10 | 4667640 |
| /api/optimize-network | 28 | 3 | 200 | 6.783 | 13.978 | 849.46 | 98162 |
| /api/simulate | 28 | 4 | 200 | 0.288 | 0.905 | 1029.46 | 20853540 |
| /api/evaluate-network | 28 | 5 | 200 | 6.756 | 19.229 | 1029.82 | 29138 |
| /api/optimize-network | 28 | 6 | 504 | 60.030 | 189.352 | 1063.60 | 0 |
| /api/coverage-surface | 28 | 7 | 200 | 9.220 | 16.147 | 1020.15 | 22066656 |
| /api/recommend-sites | 28 | 8 | 504 | 60.030 | 280.544 | 1055.83 | 0 |

Normal container cgroup CPU includes local helper probes and wget; wall includes docker exec and transfer. HTTP 504 error bodies are not captured by wget, so received zero bytes is not a server response-size claim. Separate instrumented container rows supply Go heap, goroutines and geometry with the same Go 1.26.6 toolchain and unmodified quota settings. Geometry matches agree with native defaults for the measured routes; timers and working set differ.

| Instrumented Linux workload | GHz | CPU s | Wall s | RSS MiB | Heap MiB | GOMAXPROCS |
| --- | --- | --- | --- | --- | --- | --- |
| linux-simulate | 2.6 | 0.062 | 0.045 | 525.86 | 427.15 | 10 |
| linux-evaluate-network | 2.6 | 0.796 | 0.484 | 797.72 | 678.24 | 10 |
| linux-interference | 2.6 | 0.050 | 0.044 | 521.84 | 418.94 | 10 |
| linux-optimize-network | 2.6 | 14.478 | 6.956 | 854.22 | 719.28 | 10 |
| linux-opt-opt | 2.6 | 31.025 | 8.212 | 936.56 | 807.37 | 10 |
| linux-async-two | 2.6 | 16.984 | 7.130 | 958.46 | 835.57 | 10 |
| linux-simulate | 28 | 0.034 | 0.021 | 512.84 | 398.83 | 10 |
| linux-evaluate-network | 28 | 0.676 | 0.430 | 826.29 | 695.43 | 10 |
| linux-interference | 28 | 0.050 | 0.045 | 537.12 | 418.79 | 10 |
| linux-optimize-network | 28 | 13.953 | 6.855 | 853.80 | 706.48 | 10 |
| linux-opt-opt | 28 | 29.884 | 7.991 | 931.41 | 774.06 | 10 |
| linux-async-two | 28 | 16.032 | 6.950 | 922.27 | 761.25 | 10 |

| Payload/workflow (2.6 GHz) | Actual bytes | 10 Mbit/s modeled s | 50 Mbit/s modeled s | 100 Mbit/s modeled s | 1 Gbit/s modeled s |
| --- | --- | --- | --- | --- | --- |
| high-rays-radius | 64,122,209 | 51.30 | 10.26 | 5.13 | 0.51 |
| A-evaluate | 40,365,391 | 32.29 | 6.46 | 3.23 | 0.32 |
| C-evaluate-interference-reevaluate | 85,428,908 | 68.34 | 13.67 | 6.83 | 0.68 |
| high-evaluate-map-bundle | 360,659,611 | 288.53 | 57.71 | 28.85 | 2.89 |
| high-repeat-bundle | 726,378,275 | 581.10 | 116.22 | 58.11 | 5.81 |

| Visible desktop Chromium payload | Bytes | Median JSON.parse ms | Retained parsed-object heap delta MiB |
| --- | --- | --- | --- |
| 6-2.6-coverage-surface.response.json | 814,404 | 1.80 | 0.85 |
| 6-2.6-high-rays-radius-0.response.json | 64,122,209 | 72.60 | 46.01 |
| 6-2.6-high-simulate-0.response.json | 11,301,830 | 12.00 | 7.93 |
| 6-2.6-high-surface-0.response.json | 22,090,087 | 41.70 | 22.89 |
| 6-2.6-interference.response.json | 4,698,126 | 3.90 | 3.51 |
| 6-2.6-simulate.response.json | 7,325,534 | 7.30 | 5.03 |
| 6-28-coverage-surface.response.json | 785,963 | 1.50 | 0.79 |
| 6-28-high-rays-radius-0.response.json | 20,853,540 | 19.40 | 13.62 |
| 6-28-high-simulate-0.response.json | 3,674,988 | 3.40 | 2.41 |
| 6-28-high-surface-0.response.json | 22,066,656 | 41.30 | 22.80 |
| 6-28-interference.response.json | 4,667,640 | 3.50 | 3.42 |
| 6-28-simulate.response.json | 2,123,370 | 2.20 | 1.37 |
| six-canonical-map-bundle | 40,336,307 | 42.10 | 26.98 |
| six-high-map-bundle | 360,630,513 | 375.60 | 252.69 |

## Modeled CPU scheduling requirements

| Observed native demand | CPU seconds | Ideal at 2 vCPU s | Ideal at 4 vCPU s | Ideal at 8 vCPU s |
| --- | --- | --- | --- | --- |
| high-recommend | 302.360 | 151.180 | 75.590 | 37.795 |
| high-opt-opt | 351.294 | 175.647 | 87.824 | 43.912 |
| high-experiment-64 | 164.746 | 82.373 | 41.186 | 20.593 |
| high-repeat-bundle | 34.575 | 17.288 | 8.644 | 4.322 |

Division is arithmetic plausibility only. No 2/4/8-vCPU benchmark, throughput capacity, safe token quantity, reserve cost, new attempt floor, or production deployment number is certified. The 24-GiB host and 11.7-GiB VM are local test resources, not a supported hardware target.

## Validation and production invariance

| Final check | Result | Evidence / limitation |
| --- | --- | --- |
| Backend tests / race / vet | PASS | Unmodified backend full suites |
| Frontend unit/workflow tests / lint / build | PASS | Unmodified frontend |
| Real RF budget E2E | PASS | Fresh isolated backend; desktop-1440 |
| Real optimizer deadline E2E | PASS | Separate fresh backend; desktop-1440 |
| Workspace E2E | FAIL: 57 passed, 9 skipped, 1 failed | Existing cancellation feedback bounding-box assertion: x=100 versus expected 92 at workspace.spec.js:693 |
| Targeted optimization E2E, twice | FAIL: 13 passed, 1 failed | Budget feedback hit the same intermittent 8-pixel x mismatch; cancellation then passed; both complete optimization journeys passed |
| Core Lab race / vet | PASS | Optional adapter full suites |
| Gated resource / cancel / concurrent / async suites | PASS | 234 published native/eight/instrumented-Linux rows; normal production image HTTP measured separately |
| Gated resource race tests | PASS | Same/distinct/third clients, cancellation, queue drain; no detected race |
| Docs build / validation | PASS | Pandoc deprecation warnings; validation uses locked PyYAML in temporary venv after system Python lacked it |
| Version metadata / diff whitespace / tooling syntax / opt-in refusals | PASS | 0.11.0; gated runners refuse execution without --run |

The first baseline mock RF/deadline run skipped its eight real-backend cases. A combined real-server run also showed that the two files share the anchored ClientIP budget: the deadline request spent one attempt before the budget test expected a fresh window. Final isolated fresh-server runs passed separately. These initial outcomes are preserved, not reclassified as successes. Workspace failures remain unresolved because this is an audit and production UI changes are outside scope; no assertion was weakened.

All tracked changes generated by workspace screenshot tests were restored to the clean starting baseline; the single new generated screenshot was removed. The pre-existing request-budget audit files/tooling remain intact. Production source, RF math, optimizer, frontend sequences, persistence, async manager, Dockerfile, and quotas are unchanged. Final tracked diff is empty. Only the two resource-study documents and opt-in tooling are added. Raw local measurement files remain in dedicated /tmp directories; the owned measurement container is removed after measurement.

## Phase completion map

| Requested phases | Coverage |
| --- | --- |
| 0–3 | Baseline ledger, deployment classification, native/container environment snapshots, independently measured dimensions |
| 4–9 | Canonical 2.6/28 GHz routes, source bounds, single-parameter sweeps, supported high combinations and observed envelopes |
| 10–13 | Two-client mixes, same-IP/third-client rejection, high timeout and cancellation cases |
| 14–16 | Manager source audit, normal and alternate gated workers, overlap, 64-run jobs and queue cancellation |
| 17–19 | Individual/workflow response bytes, modeled link times, visible desktop parser/retained-object heap |
| 20–23 | Input/geometry/byte predictor trials, equal-profile Ankara domains and synthetic control |
| 24–28 | Authoritative workflow binding, anti-forgery, partial failure/retry/cancellation/refund semantics, frequency floor and resource dimensions |
| 29–33 | Local headroom, unbenchmarked hypothetical profiles, unchanged concurrency, six/eight workflow comparisons |
| 34–39 | Protected targets, candidate future architecture, explicit no numeric recommendation, eight-cell prerequisites, rejection and observability contract |
| 40–43 | Production invariance, classification F, both artifacts and final checks with failures disclosed |


**Final classification: F — More deployment data required.** No production numbers are certified. **Single recommended next action:** define an actual deployment profile and its load, latency, memory/CPU/link headroom, dataset complexity and background-worker requirements; replay this study on that target before selecting or implementing admission parameters.

