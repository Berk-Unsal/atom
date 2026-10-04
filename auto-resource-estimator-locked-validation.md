# Auto Resource Estimator Locked Validation

**D — INVALID VALIDATION**. Adaptive-admission DESIGN not allowed. Auto remains observation-only. No production behavior changed, no release.

Completed 3166/3166 planned groups, 5997 real HTTP requests and 6057 prediction records (including secondary recorder controls). Optimize CPU fails: worst raw actual/predicted 15.321×, post-margin 5.443×, post-margin misses 43.26%; 139 applicable HTTP504 failures. Only Surface, Explain and Azimuth response estimators pass the numerical gates; no useful compute candidate passes.

Certification is invalid: only 61/72 scenarios reached30s sampled background activity, 20 mixed comparisons lack matching A/B isolated references, and the reference-completeness guard was added after launch. Frozen models, margins and numeric gates remain unchanged.

## Baseline and frozen contract

Clean `main`, HEAD `2da0f9deaf40e2145049eb4506b9b424851aed5d`, VERSION `0.11.0`; initial status/diff empty. Calibration source commit `2da0f9deaf40e2145049eb4506b9b424851aed5d`. Prior artifacts preserved.

Lock SHA256 `313002209d4ccd39ffe663bc5365b66a6cc7d7e0edad1613ce603b237cdbe7d2`. Domain SHA256 `da869358b0163abb16c88c322fa7589ca4b928245a7a3b4c239923e5a25616fe`. Run-plan SHA256 `d85c125203d67d7e64078fdac7caf2ad4980ed3ea9b4b6f198c4ca8a861986cc`.

Prior gates retained: calibration-only margin ≤4; post-margin underprediction ≤5%; worst post-margin shortfall relative to actual ≤10%. Each repeat scores separately, to prevent repeat averaging from hiding safety misses. These gates apply overall and within every geometry band, RF setting, search setting, frequency and resource profile. Failed/timed-out primary requests fail applicable candidates. Missing planned evidence is INSUFFICIENT; overall incomplete or breached validation is D. Negative controls cannot certify.

Frozen predictor: `exp(max(-40,min(b0 + Σ bi*(transform(xi)-mean_i)/scale_i,40)))`, retaining the prior numeric clamp. Count/ray/radius/density features use log1p; area uses log(max(x,1e-9)); 28GHz is binary. No hardware, Cell-count, search-policy or contention features exist. Coefficients below include intercept first. Exact means/scales and all formulas are in the JSON and lock.

| Estimator | Role | Family / features | Coefficients (intercept first) | Frozen margin | Verdict |
| --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | candidate | parameters: rays, radius_m, frequency_28 | 8.5985646932316975, 0, 0, -0.00011369916285380661 | 1.0018470212470461 | PASS |
| building-entry/wall_seconds | candidate | density: radius_m, frequency_28, vertex_density, area | -3.1748569518068601, 0.10279649107815242, 0.01127103201442727, 1.2282666410994536, 0.80146369393413242 | 3.9227794390474862 | FAIL |
| evaluate/cpu_seconds | negative_control | edges: rays, radius_m, frequency_28, edges | -0.44098503483785911, 0.14737524300944865, -0.22075812222525168, 0.14330614077645079, 0.62398190957018917 | 2.1005736478104855 | FAIL |
| evaluate/response_bytes | candidate | density: rays, radius_m, frequency_28, vertex_density, area | 10.273064196740748, 5.4461454910815729e-05, 0.0045582346031649785, 0.0001747873366664151, 0.0025573761154354885, -0.0056764824488158708 | 1.007581827023615 | FAIL |
| explain/response_bytes | candidate | parameters: rays, radius_m, frequency_28 | 7.9765316360135881, 0, 0, 0.00046262270375725857 | 1.0427124933064769 | PASS |
| interference/cpu_seconds | negative_control | edges: radius_m, frequency_28, edges | -3.2249855755317687, -0.099324639576198748, 0.017637709381274597, 0.92884789913748245 | 1.9373811578869533 | FAIL |
| interference/response_bytes | candidate | parameters: radius_m, frequency_28 | 15.54038214230718, 0.197203832017875, -0.008375573456405801 | 1.7638193340812069 | FAIL |
| optimize/cpu_seconds | candidate | footprints: rays, radius_m, frequency_28, footprints | 2.4685679954736548, 0.094024759929614163, -0.049716454634313845, 0.03000586856720663, 0.5852698703197331 | 2.8149320503790176 | FAIL |
| optimize/response_bytes | candidate | density: rays, radius_m, frequency_28, vertex_density, area | 11.39938022695353, 0.0041067204261470598, -0.18428108523340114, 0.015939959591134884, 0.27566459181174729, 0.21527611657138865 | 2.0565050267549565 | FAIL |
| optimize/wall_seconds | candidate | footprints: rays, radius_m, frequency_28, footprints | 1.7733187807887991, 0.11625872764944836, -0.021976475133981183, 0.036140809304940139, 0.47946694299832554 | 2.5055987685215677 | FAIL |
| recommendation/cpu_seconds | candidate | footprints: rays, radius_m, frequency_28, footprints | 0.70783853163874899, 0.10580673755112369, -0.13489403365312935, 0.093160728867184225, 0.82664217072929003 | 3.6447638240228226 | FAIL |
| recommendation/wall_seconds | candidate | footprints: rays, radius_m, frequency_28, footprints | -0.34928702114338012, 0.06110514103569048, -0.11900913133548163, 0.068596507974881982, 0.6315309508593282 | 3.0686616832504297 | FAIL |
| simulate/cpu_seconds | negative_control | footprints: rays, radius_m, frequency_28, footprints | -3.1662315935441399, 0.17447090427303452, 0.16927416700333575, -0.1992260491422462, 0.51892087352986271 | 3.459924563878777 | FAIL |
| simulate/response_bytes | candidate | footprints: rays, radius_m, frequency_28, footprints | 15.479367564103711, 0.221011781400032, 0.10137090365262237, -0.27990577630200542, 0.18540352697231394 | 1.5569448006757514 | FAIL |
| surface/cpu_seconds | candidate | footprints: radius_m, frequency_28, footprints | -5.6221958019116203, 0.60479850188085782, 0.025739495419905993, 0.94477442854098947 | 3.0107375305213209 | FAIL |
| surface/response_bytes | candidate | footprints: radius_m, frequency_28, footprints | 11.03652431220495, 0.40479809291491081, 0.10852350561770767, 0.96509637512276325 | 2.6368398869284286 | PASS |
| surface/wall_seconds | candidate | footprints: radius_m, frequency_28, footprints | -5.6304168518478095, 0.6069871368298948, 0.027266509261162721, 0.94561600563940229 | 3.0956912825336182 | FAIL |

## Domains and settings

Reuse frozen inventory-only anchor candidates (not previous selected domains); recompute geometry with frozen preflight; rank 400m vertex density then ID; band targets .98/.85/.50/.05 in that order, three rounds; nearest rank, tie rank ascending. Exclude any 902m conservative tower envelope touching previous 802m envelopes, any previous selected Cell ID, or chosen 902m envelopes. No replacements; if <8 stop D; 8-11 retained and disclosed. Persist every exclusion. No timing or RF cost input.

11 fresh domains. Bands: {'very-dense': 3, 'dense': 3, 'medium': 3, 'sparse': 2}. Frozen exclusions retain 2300 attempted selections (duplicates across band/round targets are intentional). Previous tower IDs and conservative 802m envelopes excluded; new 902m envelopes mutually disjoint. No reselection/replacement occurred. Labelled bands reflect selection targets, not universal density thresholds: exclusions shift surviving ranks. Exact geometry, tower IDs, coordinates and ranks are in the locked manifest.

| Domain | Rank | Parts | Vertices | km² | Vertices/km² |
| --- | --- | --- | --- | --- | --- |
| very-dense-validation-1 | 304 | 421 | 2710 | 0.940412 | 2881.71 |
| very-dense-validation-2 | 284 | 1828 | 8140 | 2.98616 | 2725.91 |
| very-dense-validation-3 | 223 | 641 | 3163 | 1.47951 | 2137.86 |
| dense-validation-1 | 217 | 7366 | 34972 | 17.2754 | 2024.38 |
| dense-validation-2 | 184 | 1968 | 8526 | 5.31791 | 1603.26 |
| dense-validation-3 | 182 | 1838 | 14859 | 9.55472 | 1555.15 |
| medium-validation-1 | 152 | 233 | 1922 | 1.55446 | 1236.44 |
| medium-validation-2 | 68 | 226 | 1965 | 2.76369 | 711.007 |
| medium-validation-3 | 49 | 362 | 3893 | 7.88907 | 493.468 |
| sparse-validation-1 | 17 | 169 | 893 | 5.87328 | 152.045 |
| sparse-validation-2 | 31 | 332 | 1849 | 6.16139 | 300.095 |

Unseen RF: [{'id': 'r300-r500', 'rays': 300, 'radius_m': 500}, {'id': 'r160-r900', 'rays': 160, 'radius_m': 900}]; both 2.6/28GHz,30dBm,120° beam; six Cells for network operations, one for single-cell endpoints, Recommendation supported five. Optimize uses frozen legacy plus `{'id': 'unseen-multistart', 'search_policy': 'deterministic_multistart_coordinate_v1', 'max_search_passes': 3, 'max_unique_evaluations': 192}`. No search semantics changed.

Profiles A2CPU/4GiB, B4CPU/8GiB, Ddefault; Auto and policy checked before every batch. {'D': 'all selected domains x two RF settings x two frequencies x all candidate operations; Optimize legacy and unseen multistart, Explain prerequisite legacy', 'A_B': 'all selected domains x two frequencies x simulate/evaluate/optimize/interference/surface; RF setting assigned by selection index parity; Optimize both searches; geometry/hardware coverage balanced, not full factorial', 'fresh_subset': 'one first selected domain per band x profiles x Optimize legacy at 2.6 GHz r300-r500 three repeats, each group fresh process', 'recorder_controls': 'first selected sparse and dense x each profile x simulate and interference at2.6 r300-r500 five repeats fresh separate group; same frozen predictions; recorder excluded primary verdict'}. Run-order seed 20261004; pre-generated shuffled plans hashed before execution.

## HTTP, process and sustained-load methods

{'main': 'fresh process per profile, warmed long-running service; first RF and startup recorded separately', 'fresh': 'new process per geometry/profile group', 'cold_os_cache': 'no eviction'}

real net/http TCP server on container loopback, unmodified Gin handlers/middleware; bind distinct loopback source IPs, trusted proxies disabled. io.Copy into SHA256 without retention for large outputs; only small Optimize/experiment responses retained for prerequisite handling. handler interval including writing; global encoding/write counter only for isolated requests, compute wall=handler minus observable encode/write. Full client wall and receive duration independently timed. RSS/heap/cgroup/allocations sampled50ms. Instrumentation/client allocations part of process observation, not reservation

Full client wall, client receive and server handler wall are separate observations. Handler wall includes JSON/write; isolated compute wall can be described by handler minus observable encoding/write. Under concurrency the encoding counter is process-wide and not attributed. Bytes are uncompressed response entity bytes drained over TCP, excluding framing. Loopback transfer is not production network performance. Prediction JSONL is exclusive-created, fsynced before request execution and carries request ID/hash plus lock/domain hashes. Report embeds prediction and result logs for chronology audit. Disposable containers retain the image’s port8080 health probe, while this harness uses an ephemeral listener; probe failures therefore do not measure the harness listener. Batch exits and request outcomes are reported separately.

Repeats: {'ordinary': 5, 'expensive': 3, 'mixed': 3}; no favorable/unfavorable early stopping. Cold evidence means fresh process/index, not cold OS cache. Startup and first RF request separate from warmed later requests.

{'duration_seconds': 30, 'maximum_seconds_per_scenario': 120, 'initial_jobs': 8, 'max_total_submissions': 64, 'matrix_runs_per_job': 64, 'workers': 1, 'queue_capacity': 16, 'refill': 'top up to eight queued/active uncached jobs while interactive scenarios repeat for at least30s, capped64; jobs vary calibration offset + unique fractional azimuth. Cancel/drain outstanding jobs at end; no manager/cache reset while active. If capped work finishes before30s insufficient sustained evidence, retain all observations.', 'sampling_ms': 50}

72/72 sustained scenarios recorded. Four scenarios: Optimize, Evaluate, Optimize+Evaluate, two distinct-client Optimizers, all with background activity; sparse/dense, A/B/D, three repeats. Queue/job/active/completed/canceled time series retained as hashed gzip files in `scripts/auto-resource-estimator-validation/evidence/`; JSON links each archive to its original and compressed hashes. Mixed CPU is aggregate process demand and cannot validate individual CPU predictions.

Observed sampling durations 30.2512–54.6028s; active sampling duration 10.5523–54.2375s. Full gap/overlap evidence is in JSON; incomplete sustained activity cannot be averaged away. Refill submissions share the unchanged protected-route global slots: two Optimizers can occupy both slots, causing429 refills and exhaustion of the locked64-submission bound. Accepted/cached/denied counts and completed/canceled runs are explicit in JSON. This is not a queue-size or worker-count change.

## Estimator errors and classification

| Estimator | n incl. mixed / primary expected | Raw misses | Worst raw actual/predicted | Post-margin misses | Worst post-margin ratio | Median absolute relative error | Largest raw overestimate | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | 220/220 | 130 (59.09%) | 1.00143 | 0 (0.00%) | 0.999582 | 0.10% | 0.14% | PASS |
| building-entry/wall_seconds | 220/220 | 84 (38.18%) | 10.286 | 1 (0.45%) | 2.62212 | 40.96% | 619.65% | FAIL |
| evaluate/cpu_seconds | 440/440 | 240 (54.55%) | 7.90027 | 87 (19.77%) | 3.76101 | 59.55% | 924.42% | FAIL |
| evaluate/response_bytes | 631/440 | 491 (77.81%) | 1.01195 | 110 (17.43%) | 1.00433 | 0.19% | 0.84% | FAIL |
| explain/response_bytes | 132/132 | 102 (77.27%) | 1.03454 | 0 (0.00%) | 0.992164 | 2.40% | 3.32% | PASS |
| interference/cpu_seconds | 440/440 | 260 (59.09%) | 33.5574 | 165 (37.50%) | 17.321 | 66.18% | 4399.70% | FAIL |
| interference/response_bytes | 440/440 | 240 (54.55%) | 2.64717 | 65 (14.77%) | 1.50082 | 31.75% | 138.16% | FAIL |
| optimize/cpu_seconds | 564/564 | 441 (78.19%) | 15.3215 | 244 (43.26%) | 5.44294 | 69.90% | 432.49% | FAIL |
| optimize/response_bytes | 716/564 | 382 (53.35%) | 2.05582 | 0 (0.00%) | 0.999665 | 29.50% | 247793.54% | FAIL |
| optimize/wall_seconds | 716/564 | 565 (78.91%) | 13.9563 | 319 (44.55%) | 5.57006 | 68.62% | 275.65% | FAIL |
| recommendation/cpu_seconds | 132/132 | 69 (52.27%) | 5.51046 | 2 (1.52%) | 1.51188 | 56.10% | 439.64% | FAIL |
| recommendation/wall_seconds | 132/132 | 78 (59.09%) | 4.39864 | 3 (2.27%) | 1.43341 | 49.94% | 218.00% | FAIL |
| simulate/cpu_seconds | 440/440 | 256 (58.18%) | 10.3167 | 29 (6.59%) | 2.98176 | 48.73% | 130.18% | FAIL |
| simulate/response_bytes | 440/440 | 340 (77.27%) | 1.88225 | 50 (11.36%) | 1.20894 | 24.18% | 77.21% | FAIL |
| surface/cpu_seconds | 440/440 | 222 (50.45%) | 24.6291 | 57 (12.95%) | 8.18042 | 36.20% | 126.60% | FAIL |
| surface/response_bytes | 440/440 | 80 (18.18%) | 1.49483 | 0 (0.00%) | 0.566902 | 70.31% | 343.81% | PASS |
| surface/wall_seconds | 440/440 | 142 (32.27%) | 4.52934 | 6 (1.36%) | 1.46311 | 38.67% | 251.32% | FAIL |

Surface response, Simulate/Evaluate/Interference/Explain/Azimuth response, Optimize CPU/wall/response, Surface CPU/wall, Recommendation CPU/wall, Building Entry wall and negative controls are evaluated separately. No missing estimator invented; RSS, allocations and cgroup observations do not certify memory reservation.

### Geometry bands

| Estimator | Stratum | n | Worst raw ratio | Post-margin miss rate | Worst post-margin shortfall |
| --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | dense | 60 | 1.00143 | 0.00% | 0.00% |
| azimuth/response_bytes | medium | 60 | 1.00124 | 0.00% | 0.00% |
| azimuth/response_bytes | sparse | 40 | 1.00014 | 0.00% | 0.00% |
| azimuth/response_bytes | very-dense | 60 | 1.00143 | 0.00% | 0.00% |
| building-entry/wall_seconds | dense | 60 | 2.36773 | 0.00% | 0.00% |
| building-entry/wall_seconds | medium | 60 | 1.2891 | 0.00% | 0.00% |
| building-entry/wall_seconds | sparse | 40 | 10.286 | 2.50% | 61.86% |
| building-entry/wall_seconds | very-dense | 60 | 2.08274 | 0.00% | 0.00% |
| evaluate/cpu_seconds | dense | 120 | 1.26525 | 0.00% | 0.00% |
| evaluate/cpu_seconds | medium | 120 | 6.30561 | 22.50% | 66.69% |
| evaluate/cpu_seconds | sparse | 80 | 7.90027 | 53.75% | 73.41% |
| evaluate/cpu_seconds | very-dense | 120 | 6.02364 | 14.17% | 65.13% |
| evaluate/response_bytes | dense | 205 | 1.01195 | 46.34% | 0.43% |
| evaluate/response_bytes | medium | 120 | 1.00908 | 12.50% | 0.15% |
| evaluate/response_bytes | sparse | 186 | 1.00756 | 0.00% | 0.00% |
| evaluate/response_bytes | very-dense | 120 | 1.00379 | 0.00% | 0.00% |
| explain/response_bytes | dense | 36 | 1.03454 | 0.00% | 0.00% |
| explain/response_bytes | medium | 36 | 1.02767 | 0.00% | 0.00% |
| explain/response_bytes | sparse | 24 | 1.00441 | 0.00% | 0.00% |
| explain/response_bytes | very-dense | 36 | 1.03454 | 0.00% | 0.00% |
| interference/cpu_seconds | dense | 120 | 2.97237 | 0.83% | 34.82% |
| interference/cpu_seconds | medium | 120 | 20.0454 | 46.67% | 90.34% |
| interference/cpu_seconds | sparse | 80 | 33.5574 | 92.50% | 94.23% |
| interference/cpu_seconds | very-dense | 120 | 10.9335 | 28.33% | 82.28% |
| interference/response_bytes | dense | 120 | 2.64717 | 8.33% | 33.37% |
| interference/response_bytes | medium | 120 | 1.79169 | 12.50% | 1.56% |
| interference/response_bytes | sparse | 80 | 2.14577 | 37.50% | 17.80% |
| interference/response_bytes | very-dense | 120 | 1.92243 | 8.33% | 8.25% |
| optimize/cpu_seconds | dense | 153 | 3.74758 | 20.92% | 24.89% |
| optimize/cpu_seconds | medium | 153 | 14.3779 | 53.59% | 80.42% |
| optimize/cpu_seconds | sparse | 105 | 15.3215 | 51.43% | 81.63% |
| optimize/cpu_seconds | very-dense | 153 | 8.81584 | 49.67% | 68.07% |
| optimize/response_bytes | dense | 212 | 1.54459 | 0.00% | 0.00% |
| optimize/response_bytes | medium | 153 | 1.82626 | 0.00% | 0.00% |
| optimize/response_bytes | sparse | 198 | 2.05582 | 0.00% | 0.00% |
| optimize/response_bytes | very-dense | 153 | 1.58792 | 0.00% | 0.00% |
| optimize/wall_seconds | dense | 212 | 4.18266 | 16.98% | 40.10% |
| optimize/wall_seconds | medium | 153 | 12.901 | 53.59% | 80.58% |
| optimize/wall_seconds | sparse | 198 | 13.9563 | 59.60% | 82.05% |
| optimize/wall_seconds | very-dense | 153 | 7.69321 | 54.25% | 67.43% |
| recommendation/cpu_seconds | dense | 36 | 0.516623 | 0.00% | 0.00% |
| recommendation/cpu_seconds | medium | 36 | 5.51046 | 2.78% | 33.86% |
| recommendation/cpu_seconds | sparse | 24 | 3.34424 | 0.00% | 0.00% |
| recommendation/cpu_seconds | very-dense | 36 | 3.94512 | 2.78% | 7.61% |
| recommendation/wall_seconds | dense | 36 | 0.777081 | 0.00% | 0.00% |
| recommendation/wall_seconds | medium | 36 | 4.39864 | 5.56% | 30.24% |
| recommendation/wall_seconds | sparse | 24 | 2.70144 | 0.00% | 0.00% |
| recommendation/wall_seconds | very-dense | 36 | 4.01736 | 2.78% | 23.61% |
| simulate/cpu_seconds | dense | 120 | 8.77761 | 6.67% | 60.58% |
| simulate/cpu_seconds | medium | 120 | 6.0337 | 5.00% | 42.66% |
| simulate/cpu_seconds | sparse | 80 | 8.49017 | 10.00% | 59.25% |
| simulate/cpu_seconds | very-dense | 120 | 10.3167 | 5.83% | 66.46% |
| simulate/response_bytes | dense | 120 | 1.51038 | 0.00% | 0.00% |
| simulate/response_bytes | medium | 120 | 1.71746 | 20.83% | 9.35% |
| simulate/response_bytes | sparse | 80 | 1.88225 | 31.25% | 17.28% |
| simulate/response_bytes | very-dense | 120 | 1.45693 | 0.00% | 0.00% |
| surface/cpu_seconds | dense | 120 | 24.6291 | 20.83% | 87.78% |
| surface/cpu_seconds | medium | 120 | 17.0041 | 7.50% | 82.29% |
| surface/cpu_seconds | sparse | 80 | 18.0639 | 3.75% | 83.33% |
| surface/cpu_seconds | very-dense | 120 | 14.7787 | 16.67% | 79.63% |
| surface/response_bytes | dense | 120 | 1.18017 | 0.00% | 0.00% |
| surface/response_bytes | medium | 120 | 0.845226 | 0.00% | 0.00% |
| surface/response_bytes | sparse | 80 | 0.833005 | 0.00% | 0.00% |
| surface/response_bytes | very-dense | 120 | 1.49483 | 0.00% | 0.00% |
| surface/wall_seconds | dense | 120 | 3.78215 | 2.50% | 18.15% |
| surface/wall_seconds | medium | 120 | 3.26794 | 0.83% | 5.27% |
| surface/wall_seconds | sparse | 80 | 2.87411 | 0.00% | 0.00% |
| surface/wall_seconds | very-dense | 120 | 4.52934 | 1.67% | 31.65% |

### RF setting generalization

| Estimator | Stratum | n | Worst raw ratio | Post-margin miss rate | Worst post-margin shortfall |
| --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | r160-r900 | 110 | 1.00139 | 0.00% | 0.00% |
| azimuth/response_bytes | r300-r500 | 110 | 1.00143 | 0.00% | 0.00% |
| building-entry/wall_seconds | r160-r900 | 110 | 2.36773 | 0.00% | 0.00% |
| building-entry/wall_seconds | r300-r500 | 110 | 10.286 | 0.91% | 61.86% |
| evaluate/cpu_seconds | r160-r900 | 210 | 7.90027 | 27.62% | 73.41% |
| evaluate/cpu_seconds | r300-r500 | 230 | 7.61545 | 12.61% | 72.42% |
| evaluate/response_bytes | r160-r900 | 210 | 1.00276 | 0.00% | 0.00% |
| evaluate/response_bytes | r300-r500 | 421 | 1.01195 | 26.13% | 0.43% |
| explain/response_bytes | r160-r900 | 66 | 1.03454 | 0.00% | 0.00% |
| explain/response_bytes | r300-r500 | 66 | 1.03317 | 0.00% | 0.00% |
| interference/cpu_seconds | r160-r900 | 210 | 33.5574 | 31.90% | 94.23% |
| interference/cpu_seconds | r300-r500 | 230 | 31.9698 | 42.61% | 93.94% |
| interference/response_bytes | r160-r900 | 210 | 1.47497 | 0.00% | 0.00% |
| interference/response_bytes | r300-r500 | 230 | 2.64717 | 28.26% | 33.37% |
| optimize/cpu_seconds | r160-r900 | 252 | 15.3215 | 42.06% | 81.63% |
| optimize/cpu_seconds | r300-r500 | 312 | 13.6434 | 44.23% | 79.37% |
| optimize/response_bytes | r160-r900 | 252 | 2.05582 | 0.00% | 0.00% |
| optimize/response_bytes | r300-r500 | 464 | 1.59295 | 0.00% | 0.00% |
| optimize/wall_seconds | r160-r900 | 252 | 13.9563 | 46.03% | 82.05% |
| optimize/wall_seconds | r300-r500 | 464 | 10.6489 | 43.75% | 76.47% |
| recommendation/cpu_seconds | r160-r900 | 66 | 5.51046 | 1.52% | 33.86% |
| recommendation/cpu_seconds | r300-r500 | 66 | 3.94512 | 1.52% | 7.61% |
| recommendation/wall_seconds | r160-r900 | 66 | 4.39864 | 1.52% | 30.24% |
| recommendation/wall_seconds | r300-r500 | 66 | 4.01736 | 3.03% | 23.61% |
| simulate/cpu_seconds | r160-r900 | 210 | 10.3167 | 5.24% | 66.46% |
| simulate/cpu_seconds | r300-r500 | 230 | 8.49017 | 7.83% | 59.25% |
| simulate/response_bytes | r160-r900 | 210 | 1.88225 | 21.43% | 17.28% |
| simulate/response_bytes | r300-r500 | 230 | 1.58106 | 2.17% | 1.53% |
| surface/cpu_seconds | r160-r900 | 210 | 9.85388 | 16.19% | 69.45% |
| surface/cpu_seconds | r300-r500 | 230 | 24.6291 | 10.00% | 87.78% |
| surface/response_bytes | r160-r900 | 210 | 1.49483 | 0.00% | 0.00% |
| surface/response_bytes | r300-r500 | 230 | 1.32294 | 0.00% | 0.00% |
| surface/wall_seconds | r160-r900 | 210 | 3.56505 | 1.43% | 13.17% |
| surface/wall_seconds | r300-r500 | 230 | 4.52934 | 1.30% | 31.65% |

### Search setting generalization

| Estimator | Stratum | n | Worst raw ratio | Post-margin miss rate | Worst post-margin shortfall |
| --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | not-applicable | 220 | 1.00143 | 0.00% | 0.00% |
| building-entry/wall_seconds | not-applicable | 220 | 10.286 | 0.45% | 61.86% |
| evaluate/cpu_seconds | not-applicable | 440 | 7.90027 | 19.77% | 73.41% |
| evaluate/response_bytes | not-applicable | 631 | 1.01195 | 17.43% | 0.43% |
| explain/response_bytes | not-applicable | 132 | 1.03454 | 0.00% | 0.00% |
| interference/cpu_seconds | not-applicable | 440 | 33.5574 | 37.50% | 94.23% |
| interference/response_bytes | not-applicable | 440 | 2.64717 | 14.77% | 33.37% |
| optimize/cpu_seconds | legacy | 300 | 5.54858 | 8.67% | 49.27% |
| optimize/cpu_seconds | unseen-multistart | 264 | 15.3215 | 82.58% | 81.63% |
| optimize/response_bytes | legacy | 452 | 2.05582 | 0.00% | 0.00% |
| optimize/response_bytes | unseen-multistart | 264 | 1.89462 | 0.00% | 0.00% |
| optimize/wall_seconds | legacy | 452 | 7.02616 | 20.13% | 64.34% |
| optimize/wall_seconds | unseen-multistart | 264 | 13.9563 | 86.36% | 82.05% |
| recommendation/cpu_seconds | not-applicable | 132 | 5.51046 | 1.52% | 33.86% |
| recommendation/wall_seconds | not-applicable | 132 | 4.39864 | 2.27% | 30.24% |
| simulate/cpu_seconds | not-applicable | 440 | 10.3167 | 6.59% | 66.46% |
| simulate/response_bytes | not-applicable | 440 | 1.88225 | 11.36% | 17.28% |
| surface/cpu_seconds | not-applicable | 440 | 24.6291 | 12.95% | 87.78% |
| surface/response_bytes | not-applicable | 440 | 1.49483 | 0.00% | 0.00% |
| surface/wall_seconds | not-applicable | 440 | 4.52934 | 1.36% | 31.65% |

### Frequency generalization

| Estimator | Stratum | n | Worst raw ratio | Post-margin miss rate | Worst post-margin shortfall |
| --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | 2.6 | 110 | 1.00139 | 0.00% | 0.00% |
| azimuth/response_bytes | 28 | 110 | 1.00143 | 0.00% | 0.00% |
| building-entry/wall_seconds | 2.6 | 110 | 10.286 | 0.91% | 61.86% |
| building-entry/wall_seconds | 28 | 110 | 2.54309 | 0.00% | 0.00% |
| evaluate/cpu_seconds | 2.6 | 220 | 7.90027 | 26.82% | 73.41% |
| evaluate/cpu_seconds | 28 | 220 | 7.61545 | 12.73% | 72.42% |
| evaluate/response_bytes | 2.6 | 411 | 1.01195 | 21.90% | 0.43% |
| evaluate/response_bytes | 28 | 220 | 1.01028 | 9.09% | 0.27% |
| explain/response_bytes | 2.6 | 66 | 1.03454 | 0.00% | 0.00% |
| explain/response_bytes | 28 | 66 | 1.03256 | 0.00% | 0.00% |
| interference/cpu_seconds | 2.6 | 220 | 31.9698 | 39.55% | 93.94% |
| interference/cpu_seconds | 28 | 220 | 33.5574 | 35.45% | 94.23% |
| interference/response_bytes | 2.6 | 220 | 2.59151 | 11.36% | 31.94% |
| interference/response_bytes | 28 | 220 | 2.64717 | 18.18% | 33.37% |
| optimize/cpu_seconds | 2.6 | 300 | 15.3215 | 42.00% | 81.63% |
| optimize/cpu_seconds | 28 | 264 | 14.2325 | 44.70% | 80.22% |
| optimize/response_bytes | 2.6 | 452 | 2.05582 | 0.00% | 0.00% |
| optimize/response_bytes | 28 | 264 | 1.83272 | 0.00% | 0.00% |
| optimize/wall_seconds | 2.6 | 452 | 13.9563 | 42.92% | 82.05% |
| optimize/wall_seconds | 28 | 264 | 12.9277 | 47.35% | 80.62% |
| recommendation/cpu_seconds | 2.6 | 66 | 5.51046 | 3.03% | 33.86% |
| recommendation/cpu_seconds | 28 | 66 | 2.54301 | 0.00% | 0.00% |
| recommendation/wall_seconds | 2.6 | 66 | 4.39864 | 4.55% | 30.24% |
| recommendation/wall_seconds | 28 | 66 | 2.34229 | 0.00% | 0.00% |
| simulate/cpu_seconds | 2.6 | 220 | 10.3167 | 4.09% | 66.46% |
| simulate/cpu_seconds | 28 | 220 | 8.49017 | 9.09% | 59.25% |
| simulate/response_bytes | 2.6 | 220 | 1.57367 | 2.27% | 1.06% |
| simulate/response_bytes | 28 | 220 | 1.88225 | 20.45% | 17.28% |
| surface/cpu_seconds | 2.6 | 220 | 24.6291 | 12.73% | 87.78% |
| surface/cpu_seconds | 28 | 220 | 18.0639 | 13.18% | 83.33% |
| surface/response_bytes | 2.6 | 220 | 1.49483 | 0.00% | 0.00% |
| surface/response_bytes | 28 | 220 | 1.19301 | 0.00% | 0.00% |
| surface/wall_seconds | 2.6 | 220 | 4.52934 | 1.82% | 31.65% |
| surface/wall_seconds | 28 | 220 | 3.56505 | 0.91% | 13.17% |

### Hardware transfer

| Estimator | Stratum | n | Worst raw ratio | Post-margin miss rate | Worst post-margin shortfall |
| --- | --- | --- | --- | --- | --- |
| azimuth/response_bytes | D | 220 | 1.00143 | 0.00% | 0.00% |
| building-entry/wall_seconds | D | 220 | 10.286 | 0.45% | 61.86% |
| evaluate/cpu_seconds | A | 110 | 3.03765 | 11.82% | 30.85% |
| evaluate/cpu_seconds | B | 110 | 7.90027 | 27.27% | 73.41% |
| evaluate/cpu_seconds | D | 220 | 7.61545 | 20.00% | 72.42% |
| evaluate/response_bytes | A | 175 | 1.01195 | 20.00% | 0.43% |
| evaluate/response_bytes | B | 172 | 1.01195 | 18.60% | 0.43% |
| evaluate/response_bytes | D | 284 | 1.01195 | 15.14% | 0.43% |
| explain/response_bytes | D | 132 | 1.03454 | 0.00% | 0.00% |
| interference/cpu_seconds | A | 110 | 9.24512 | 39.09% | 79.04% |
| interference/cpu_seconds | B | 110 | 22.5783 | 43.64% | 91.42% |
| interference/cpu_seconds | D | 220 | 33.5574 | 33.64% | 94.23% |
| interference/response_bytes | A | 110 | 2.14577 | 13.64% | 17.80% |
| interference/response_bytes | B | 110 | 2.14577 | 13.64% | 17.80% |
| interference/response_bytes | D | 220 | 2.64717 | 15.91% | 33.37% |
| optimize/cpu_seconds | A | 144 | 9.74475 | 31.25% | 71.11% |
| optimize/cpu_seconds | B | 144 | 15.3215 | 56.25% | 81.63% |
| optimize/cpu_seconds | D | 276 | 13.6434 | 42.75% | 79.37% |
| optimize/response_bytes | A | 190 | 2.05582 | 0.00% | 0.00% |
| optimize/response_bytes | B | 190 | 2.05582 | 0.00% | 0.00% |
| optimize/response_bytes | D | 336 | 2.05582 | 0.00% | 0.00% |
| optimize/wall_seconds | A | 190 | 10.5591 | 43.68% | 76.27% |
| optimize/wall_seconds | B | 190 | 13.9563 | 49.47% | 82.05% |
| optimize/wall_seconds | D | 336 | 10.6489 | 42.26% | 76.47% |
| recommendation/cpu_seconds | D | 132 | 5.51046 | 1.52% | 33.86% |
| recommendation/wall_seconds | D | 132 | 4.39864 | 2.27% | 30.24% |
| simulate/cpu_seconds | A | 110 | 2.70624 | 0.00% | 0.00% |
| simulate/cpu_seconds | B | 110 | 8.49017 | 7.27% | 59.25% |
| simulate/cpu_seconds | D | 220 | 10.3167 | 9.55% | 66.46% |
| simulate/response_bytes | A | 110 | 1.88225 | 9.09% | 17.28% |
| simulate/response_bytes | B | 110 | 1.88225 | 9.09% | 17.28% |
| simulate/response_bytes | D | 220 | 1.88225 | 13.64% | 17.28% |
| surface/cpu_seconds | A | 110 | 4.7106 | 11.82% | 36.09% |
| surface/cpu_seconds | B | 110 | 14.7787 | 20.00% | 79.63% |
| surface/cpu_seconds | D | 220 | 24.6291 | 10.00% | 87.78% |
| surface/response_bytes | A | 110 | 1.32294 | 0.00% | 0.00% |
| surface/response_bytes | B | 110 | 1.32294 | 0.00% | 0.00% |
| surface/response_bytes | D | 220 | 1.49483 | 0.00% | 0.00% |
| surface/wall_seconds | A | 110 | 2.32009 | 0.00% | 0.00% |
| surface/wall_seconds | B | 110 | 4.02837 | 3.64% | 23.15% |
| surface/wall_seconds | D | 220 | 4.52934 | 0.91% | 31.65% |

### Planned mixed-scenario latency and observed overlap

| Profile | Domain | Scenario / operation | Isolated median s | All-request median / max s | All-request median / max inflation |
| --- | --- | --- | --- | --- | --- |
| A | sparse-validation-1 | async-optimize / optimize | unavailable | 11.9026 / 12.1808 | unavailable / unavailable |
| A | dense-validation-1 | async-optimize / optimize | unavailable | 18.2866 / 18.9772 | unavailable / unavailable |
| B | sparse-validation-1 | async-optimize / optimize | unavailable | 22.8164 / 24.5942 | unavailable / unavailable |
| B | dense-validation-1 | async-optimize / optimize | unavailable | 27.4563 / 39.952 | unavailable / unavailable |
| D | sparse-validation-1 | async-optimize / optimize | 7.57781 | 11.3835 / 11.7378 | 1.50222 / 1.54897 |
| D | dense-validation-1 | async-optimize / optimize | 9.93284 | 17.0053 / 18.5253 | 1.71203 / 1.86506 |
| A | sparse-validation-1 | async-evaluate / evaluate | unavailable | 0.564196 / 0.643225 | unavailable / unavailable |
| A | dense-validation-1 | async-evaluate / evaluate | unavailable | 1.24359 / 1.36901 | unavailable / unavailable |
| B | sparse-validation-1 | async-evaluate / evaluate | unavailable | 0.512652 / 0.56401 | unavailable / unavailable |
| B | dense-validation-1 | async-evaluate / evaluate | unavailable | 1.2418 / 3.45994 | unavailable / unavailable |
| D | sparse-validation-1 | async-evaluate / evaluate | 0.418926 | 0.559594 / 0.609069 | 1.33578 / 1.45388 |
| D | dense-validation-1 | async-evaluate / evaluate | 0.795642 | 1.33618 / 1.43918 | 1.67938 / 1.80883 |
| A | sparse-validation-1 | async-optimize-evaluate / optimize | unavailable | 11.2174 / 13.0441 | unavailable / unavailable |
| A | sparse-validation-1 | async-optimize-evaluate / evaluate | unavailable | 0.875272 / 0.997587 | unavailable / unavailable |
| A | dense-validation-1 | async-optimize-evaluate / optimize | unavailable | 18.934 / 19.5816 | unavailable / unavailable |
| A | dense-validation-1 | async-optimize-evaluate / evaluate | unavailable | 2.12866 / 2.19329 | unavailable / unavailable |
| B | sparse-validation-1 | async-optimize-evaluate / optimize | unavailable | 9.14301 / 23.9466 | unavailable / unavailable |
| B | sparse-validation-1 | async-optimize-evaluate / evaluate | unavailable | 0.585685 / 1.57347 | unavailable / unavailable |
| B | dense-validation-1 | async-optimize-evaluate / optimize | unavailable | 15.4711 / 41.4293 | unavailable / unavailable |
| B | dense-validation-1 | async-optimize-evaluate / evaluate | unavailable | 1.42202 / 3.79613 | unavailable / unavailable |
| D | sparse-validation-1 | async-optimize-evaluate / optimize | 7.57781 | 11.3211 / 12.3095 | 1.49398 / 1.62442 |
| D | sparse-validation-1 | async-optimize-evaluate / evaluate | 0.418926 | 0.653831 / 0.714064 | 1.56073 / 1.70451 |
| D | dense-validation-1 | async-optimize-evaluate / optimize | 9.93284 | 17.3323 / 19.2708 | 1.74495 / 1.94011 |
| D | dense-validation-1 | async-optimize-evaluate / evaluate | 0.795642 | 1.59945 / 1.77971 | 2.01027 / 2.23682 |
| A | sparse-validation-1 | async-two-optimizers / optimize | unavailable | 14.7089 / 18.8272 | unavailable / unavailable |
| A | dense-validation-1 | async-two-optimizers / optimize | unavailable | 29.1637 / 34.6586 | unavailable / unavailable |
| B | sparse-validation-1 | async-two-optimizers / optimize | unavailable | 8.26798 / 28.7766 | unavailable / unavailable |
| B | dense-validation-1 | async-two-optimizers / optimize | unavailable | 33.5766 / 51.3185 | unavailable / unavailable |
| D | sparse-validation-1 | async-two-optimizers / optimize | 7.57781 | 9.22176 / 14.1704 | 1.21694 / 1.86999 |
| D | dense-validation-1 | async-two-optimizers / optimize | 9.93284 | 18.8916 / 22.1262 | 1.90193 / 2.22758 |

Mixed statistics above retain every planned interactive request, including requests after background exhaustion; they are not all sustained-load measurements. The JSON separately reports observed-overlap subsets, non-overlap counts and overlap durations. No low-overlap or failed request was dropped from estimator scoring.

Mixed baseline gaps: [{'profile': 'A', 'domain': 'sparse-validation-1', 'scenario': 'async-optimize', 'operation': 'optimize'}, {'profile': 'A', 'domain': 'dense-validation-1', 'scenario': 'async-optimize', 'operation': 'optimize'}, {'profile': 'B', 'domain': 'sparse-validation-1', 'scenario': 'async-optimize', 'operation': 'optimize'}, {'profile': 'B', 'domain': 'dense-validation-1', 'scenario': 'async-optimize', 'operation': 'optimize'}, {'profile': 'A', 'domain': 'sparse-validation-1', 'scenario': 'async-evaluate', 'operation': 'evaluate'}, {'profile': 'A', 'domain': 'dense-validation-1', 'scenario': 'async-evaluate', 'operation': 'evaluate'}, {'profile': 'B', 'domain': 'sparse-validation-1', 'scenario': 'async-evaluate', 'operation': 'evaluate'}, {'profile': 'B', 'domain': 'dense-validation-1', 'scenario': 'async-evaluate', 'operation': 'evaluate'}, {'profile': 'A', 'domain': 'sparse-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'optimize'}, {'profile': 'A', 'domain': 'sparse-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'evaluate'}, {'profile': 'A', 'domain': 'dense-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'optimize'}, {'profile': 'A', 'domain': 'dense-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'evaluate'}, {'profile': 'B', 'domain': 'sparse-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'optimize'}, {'profile': 'B', 'domain': 'sparse-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'evaluate'}, {'profile': 'B', 'domain': 'dense-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'optimize'}, {'profile': 'B', 'domain': 'dense-validation-1', 'scenario': 'async-optimize-evaluate', 'operation': 'evaluate'}, {'profile': 'A', 'domain': 'sparse-validation-1', 'scenario': 'async-two-optimizers', 'operation': 'optimize'}, {'profile': 'A', 'domain': 'dense-validation-1', 'scenario': 'async-two-optimizers', 'operation': 'optimize'}, {'profile': 'B', 'domain': 'sparse-validation-1', 'scenario': 'async-two-optimizers', 'operation': 'optimize'}, {'profile': 'B', 'domain': 'dense-validation-1', 'scenario': 'async-two-optimizers', 'operation': 'optimize'}]. These are insufficient matched inflation evidence; no different-setting baseline substituted or extra case added after timing.

## Memory and preflight observation

Memory remains observational.50ms sampling misses short transients; lifetime cgroup peak includes startup/prior work. Allocation totals are work, not live reservation. Test/client overhead remains included. Recorder controls and primary HTTP share inputs but have separate process/cache histories, so the following differences are descriptive, not causal estimates of previous recorder inflation. Historical recorder-heavy RSS cannot be retrospectively corrected.

| Profile | Band / operation | Recorder−HTTP RSS MiB | Recorder−HTTP heap MiB | Recorder−HTTP allocation MiB |
| --- | --- | --- | --- | --- |
| D | sparse / simulate | -147.953 | -28.063 | 25.624 |
| D | sparse / interference | -77.094 | 21.824 | 16.836 |
| D | dense / simulate | -110.750 | 57.644 | 41.254 |
| D | dense / interference | -5.445 | 214.604 | 13.680 |

Only four matched D-profile recorder comparisons are available. The locked fractional A/B matrix has no matching500m primary cases for those recorder controls. Previous recorder-induced memory inflation cannot be quantified causally from this design.


Frozen geometry preflight is deterministic and independent of RF results. Domain selection/repeat preflight invoke only index queries, no RF. Primitive tests cover multipart and closed-ring accounting, empty sources and envelope nesting; malformed metadata JSON is rejected and unknown operations yield no estimate. The failure observation found that a nil metadata source returns zero counts: this is an unsafe unknown-to-zero ambiguity in the frozen diagnostic primitive. Primary runs use a successfully loaded, identified real dataset; no unavailable-source estimate is used. Future preflight design must reject unknown sources rather than treating them as empty geometry. The frozen prototype has no query-budget state. Admission remains unimplemented. Bounded query cost is sample evidence only, no hard query complexity guarantee.

Profile A: 660 preflight samples; metadata batch-average median 16.152µs/query, worst 1093.789µs/query, max allocation 1235.805KiB/query; raw timing retained in JSON.
Profile B: 660 preflight samples; metadata batch-average median 15.107µs/query, worst 955.300µs/query, max allocation 1235.805KiB/query; raw timing retained in JSON.
Profile D: 660 preflight samples; metadata batch-average median 14.519µs/query, worst 858.745µs/query, max allocation 1235.806KiB/query; raw timing retained in JSON.

Preflight failure observation: {'malformed_metadata_rejected': True, 'query_budget_state': 'unsupported by frozen prototype', 'stats': {'footprints': 0, 'logical_buildings': 0, 'vertices': 0, 'edges': 0, 'max_vertices': 0, 'median_vertices': 0, 'area_km2': 0.9506126093963062, 'footprints_per_km2': 0, 'vertices_per_km2': 0, 'bounds': {'minLon': 32.8, 'minLat': 39.9, 'maxLon': 32.81, 'maxLat': 39.91}}, 'unavailable_source': 'returned_counts'}

## Leakage, completeness and production invariance

{'violations': [], 'hashes_unchanged': True, 'predictions_before_results': True, 'no_fitting_or_margin_changes': True, 'no_validation_row_influenced_coefficients': True, 'no_validation_row_influenced_margins': True, 'no_validation_row_influenced_features': True, 'no_validation_row_influenced_domains': True, 'no_validation_row_influenced_settings': True, 'numeric_estimator_gates_unchanged': True, 'methodology_issues': ['The locked A/B fractional plan omitted matching500m isolated mixed-load reference cases.', 'The matching-reference completeness guard was implemented after launch; this requirement came from the original task and plan inspection, but the guard was not explicit in the machine-readable lock. Overall D, no certification; no model or margin correction.']}

No validation row influenced coefficients, transforms, selected features, margins, selection, RF/search settings or numeric estimator gates. The matching-reference completeness guard was added to scoring after launch: it implements a requirement from the original task, discovered through plan inspection, but was not explicit in the lock. This is a methodology limitation requiring D; observed numeric PASS values are not certification. All immutable hashes are verified before each batch and at scoring. Only validation harness/report code is added. Planned versus observed rows, exits/OOM state and failures are retained; no silent resume or bad-case exclusion.

| Batch | Planned | Observed | Complete |
| --- | --- | --- | --- |
| D | 1874 | 1874 | True |
| D-fresh-sparse | 3 | 3 | True |
| D-fresh-medium | 3 | 3 | True |
| D-fresh-dense | 3 | 3 | True |
| D-fresh-very-dense | 3 | 3 | True |
| D-recorder-sparse | 10 | 10 | True |
| D-recorder-dense | 10 | 10 | True |
| A | 598 | 598 | True |
| A-fresh-sparse | 3 | 3 | True |
| A-fresh-medium | 3 | 3 | True |
| A-fresh-dense | 3 | 3 | True |
| A-fresh-very-dense | 3 | 3 | True |
| A-recorder-sparse | 10 | 10 | True |
| A-recorder-dense | 10 | 10 | True |
| B | 598 | 598 | True |
| B-fresh-sparse | 3 | 3 | True |
| B-fresh-medium | 3 | 3 | True |
| B-fresh-dense | 3 | 3 | True |
| B-fresh-very-dense | 3 | 3 | True |
| B-recorder-sparse | 10 | 10 | True |
| B-recorder-dense | 10 | 10 | True |

Production invariants:20 attempts/ClientIP/anchored60s; concurrency2 global/1 client; RF deadline60s; Cell cap6; workers1/queue16; Auto observation-only. RF equations, optimizer/search semantics, frontend request shape, scientific fingerprints and persistence untouched. Existing budget/deadline E2Es include frozen scientific hash verification. Cross-dataset generalization remains unvalidated: only real Ankara, synthetic sample pack excluded.

Eight-Cell implication: fixed Cell count in prior fitting means no calibrated Cell-count coefficient; a future predictor may need Cell count, but this validation cannot certify eight Cells or justify a cap change.

Full-body response hashes vary in 44 groups, all Building Entry. That response includes runtime `diagnostics.elapsed_ms`; whole-body hashes do not isolate scientific fields. Other successful groups are stable. Scientific invariance is checked separately by unchanged production source and the existing canonical RF tests/E2E fingerprints.

## Checks and freeze decision

{'backend_tests': {'status': 'PASS', 'exit_code': 0, 'command': ['go', 'test', './...'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-backend_tests.log'}, 'backend_race': {'status': 'PASS', 'exit_code': 0, 'command': ['go', 'test', '-race', './...'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-backend_race.log'}, 'backend_vet': {'status': 'PASS', 'exit_code': 0, 'command': ['go', 'vet', './...'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-backend_vet.log'}, 'frontend_tests': {'status': 'PASS', 'exit_code': 0, 'command': ['npm', 'test', '--', '--maxWorkers=2'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-frontend_tests.log'}, 'frontend_lint': {'status': 'PASS', 'exit_code': 0, 'command': ['npm', 'run', 'lint'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-frontend_lint.log'}, 'frontend_build': {'status': 'PASS', 'exit_code': 0, 'command': ['npm', 'run', 'build'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-frontend_build.log'}, 'rf_budget_e2e': {'status': 'PASS', 'exit_code': 0, 'command': ['npx', 'playwright', 'test', 'e2e/rf-budget.spec.js', '--project=desktop-1440', '--workers=1'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-rf_budget_e2e.log'}, 'rf_deadline_e2e': {'status': 'PASS', 'exit_code': 0, 'command': ['npx', 'playwright', 'test', 'e2e/network-deadline.spec.js', '--project=desktop-1440', '--workers=1'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-rf_deadline_e2e.log'}, 'geometry_calibration_tests': {'status': 'PASS', 'exit_code': 0, 'command': ['python3', '-m', 'unittest', 'discover', '-s', 'scripts/auto-resource-geometry', '-p', 'test_*.py'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-geometry_calibration_tests.log'}, 'locked_validation_tests': {'status': 'PASS', 'exit_code': 0, 'command': ['python3', '-m', 'unittest', 'discover', '-s', 'scripts/auto-resource-estimator-validation', '-p', 'test_*.py'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-locked_validation_tests.log', 'tests_passed': 12}, 'docs_build': {'status': 'PASS', 'exit_code': 0, 'command': ['sh', 'docs/build-reference-pages.sh'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-docs_build.log'}, 'docs_validation': {'status': 'PASS', 'exit_code': 0, 'command': ['/tmp/atom-resource-locked-validation/docs-venv/bin/python', 'docs/validate_docs.py'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-docs_validation.log', 'attempts': [{'status': 'FAIL', 'exit_code': 1, 'command': ['python3', 'docs/validate_docs.py'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-docs_validation.log'}], 'dependency': 'PyYAML 6.0.3 in isolated temporary venv'}, 'version_check': {'status': 'PASS', 'exit_code': 0, 'command': ['python3', 'scripts/versioning.py', 'check'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-version_check.log'}, 'diff_check': {'status': 'PASS', 'exit_code': 0, 'command': ['git', 'diff', '--check'], 'log': '/tmp/atom-resource-locked-validation/geometry/final-check-diff_check.log'}}

No VERSION bump or release. Unreleased records the validation documentation; previous calibration artifacts preserved. Freeze the immutable contract, raw evidence and decision; no refit, tuning, changed margin or admission implementation.

Limitations:

- One installed real Ankara dataset: cross-dataset generalization unvalidated.
- Locked fractional A/B matrix lacks same-setting isolated reference cases for selected mixed-load domains; matching latency inflation is insufficient, no post-hoc cases added.
- Shared Docker VM; CPU getrusage includes prediction preflight/logging, audit client and instrumentation. Mixed CPU is aggregate, no per-request compute attribution.
- HTTP response bytes are decoded entity bytes on uncompressed loopback, exclude HTTP framing; loopback is not production network performance.
- RSS/heap/cgroup peaks sampled50ms and depend on process order; allocations are cumulative work, not memory reservation.
- Recorder controls have distinct process/cache histories: observed deltas cannot isolate historical inflation causally.
- Selection band labels are target-quantile strata; exclusion shifts surviving ranks, no universal density thresholds.
- Hardware A/B matrix is predeclared fractional, D fit has no hardware/cell/search terms.
- Frozen preflight has no query-budget state; malformed/unavailable metadata must remain unknown, no admission implemented.

Created/changed files: Unreleased changelog entry; validation report Markdown/JSON; validation-only scripts, lock/hash, manifest/hash, plans/hash and compressed queue evidence; generated documentation when built. Full raw measurements/predictions and per-request errors embedded in machine-readable report; disposable runtime logs retained under `/tmp/atom-resource-locked-validation/geometry`.

**Single recommended next action:** Keep Auto observation-only; use conservative fixed deployment profiles as the next design study, without estimator-driven admission.

[Full evidence](./auto-resource-estimator-locked-validation.json) · [Frozen protocol and tooling](../scripts/auto-resource-estimator-validation/README.md)
