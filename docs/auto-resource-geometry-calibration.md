# Auto Resource Geometry Calibration

**Decision: no admission estimator ready. Freeze this audit and keep Auto observation-only.** This development-VM sample tests geometry metadata and interpretable predictors; it does not certify production capacity, margins, workload classes or adaptive policy.

## Starting baseline and boundaries

2026-10-04 (Europe/Istanbul), clean `main`, HEAD `b6acd48b00a1ac334b69cbafe6cdbb9405d6c7b3`, VERSION `0.11.0`. Initial `git status --short` and `git diff --stat` were empty. Previous Auto foundation, calibration and capacity reports are preserved. No tracked backend/frontend, policy, fingerprint, persistence or dataset files changed.

Fixed policy remains **20 protected attempts / ClientIP / anchored 60s; concurrency 2 global /1 client; RF deadline 60s; selected Cell cap 6; experiment workers 1, queue 16**. Auto only observes. No admission, GOMAXPROCS, RF-science, search/Pareto, frontend shape or user controls were changed. VERSION remains 0.11.0; recommend **no release**, internal calibration only.

## Resource profiles

Sequential Docker cgroup-v2 profiles on a shared 10-CPU / 11.735 GiB Linux arm64 development VM. Existing `atom-app` was preserved; no calibration ports published. The unchanged image provides the container; the measured disposable instrumented test binary uses the recorded local Go toolchain, distinct from the image server's Go 1.26.6. Constraints were checked with existing Auto detection in the actual measured process before RF work.

| Profile | Visible CPU | GOMAXPROCS | Quota cores | Cgroup GiB | Observed ceiling GiB | Runtime |
| --- | --- | --- | --- | --- | --- | --- |
| A | 10 | 2 | 2 | 4.000 | 4.000 | go1.27.1 |
| B | 10 | 4 | 4 | 8.000 | 8.000 | go1.27.1 |
| D | 10 | 10 | unlimited | unlimited | 11.735 | go1.27.1 |

A =2CPU/4GiB, B=4CPU/8GiB, D=default without explicit quota/limit. No 8CPU rerun: geometry/load is the study variable. Host-bounded default and quotas promise no exclusive resources. Full Auto provenance, diagnostic fingerprints, external Docker constraints, container exit/OOM state are retained in JSON.

## Deterministic public-planning domains

unique inventory-coordinate anchors; nearest six distinct Cell IDs by cosine-adjusted coordinate distance; rank 400m enclosing-box vertex density, ID tie break; target quantiles .05/.50/.85/.98; choose nearest rank with disjoint 800m enclosing boxes; train then holdout per band BEFORE timing

Select the hardest high-density pair first, followed by dense, medium and sparse pairs; this avoids exhausting disjoint choices at the high end. A ranking target is a construction rule, not a universal density threshold. Counts include all intersecting footprint parts and complete outer-ring vertices, not clipped geometry. Geometric edge count excludes a duplicated closing vertex; actual engine edge-check counters may also include degenerate closing segments. Domain area is the conservative enclosing rectangle, including gaps between towers; densities are rectangle statistics. All eight 800m selection rectangles are disjoint, so overlaps do not dominate samples. Selection/splits precede RF timings. Exact public planning coordinates and selected tower IDs occur only in audit artifacts, never user-location logs.

| Domain | Split | Rank | Footprint parts | Logical buildings | Vertices | Edges | Area km² | Parts/km² | Vertices/km² | Max / median vertices |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| very-dense-calibration | calibration | 412 | 778 | 778 | 3661 | 3661 | 0.728 | 1068.762 | 5029.228 | 28 / 4 |
| very-dense-held-out | held-out | 410 | 1004 | 1004 | 4203 | 4203 | 0.866 | 1159.365 | 4853.397 | 48 / 4 |
| dense-calibration | calibration | 356 | 1149 | 1149 | 5332 | 5332 | 1.500 | 765.814 | 3553.801 | 50 / 4 |
| dense-held-out | held-out | 360 | 1533 | 1533 | 7568 | 7568 | 2.087 | 734.466 | 3625.858 | 40 / 4 |
| medium-calibration | calibration | 210 | 176 | 176 | 1959 | 1959 | 0.999 | 176.104 | 1960.162 | 52 / 8 |
| medium-held-out | held-out | 204 | 1004 | 1004 | 6283 | 6283 | 3.323 | 302.107 | 1890.578 | 78 / 4 |
| sparse-calibration | calibration | 21 | 317 | 317 | 2665 | 2665 | 11.760 | 26.956 | 226.619 | 41 / 6 |
| sparse-held-out | held-out | 19 | 76 | 76 | 697 | 697 | 4.054 | 18.747 | 171.926 | 64 / 5.5 |

Dataset `ankara-open-planning` version `2026.07`: 161,784 indexed footprint parts, 936,651 vertices, 451 inventory Cells. Dataset SHA256 identity is retained. Only this real installed pack exists in the repository/default app; the sample-pack is synthetic test data and acquisition manifests are layer audits. No second production dataset or synthetic scaling experiment was invented. Global counts are constant and their cross-dataset predictive value is **unidentifiable**.

## Preflight prototype and cost

single conservative enclosing bbox of relevant tower radii +2m padding, full intersecting footprint outer rings; recommendation adds every inventory candidate in search polygon before caps; count overestimates circle union/gaps; building-entry still scans global footprint inventory, beyond local preflight descriptors

Both plain bbox candidate count and footprint/vertex/edge metadata are measured at 100, 400 and 800m for one/six Cells, all eight domains, all profiles: five batches of 100 lookups each. Metadata currently sorts polygon complexity for the diagnostic median; this is test-only and not necessary in a future bounded count query. Reads allocate result slices and visit every bbox candidate; enumeration grows with candidate count and is not a constant-time guarantee. Existing production indexes are unchanged.

| Profile | Query | Median batch-average wall µs | Worst batch-average wall µs | Worst allocation KiB/query |
| --- | --- | --- | --- | --- |
| A | bbox-count | 2.479 | 115.784 | 103.000 |
| A | footprint-vertices-edges | 18.253 | 532.099 | 552.650 |
| B | bbox-count | 2.524 | 81.390 | 103.000 |
| B | footprint-vertices-edges | 17.068 | 307.494 | 554.782 |
| D | bbox-count | 2.092 | 82.891 | 103.000 |
| D | footprint-vertices-edges | 17.236 | 440.721 | 551.583 |

Use per-row preflight/RF ratios in JSON when interpreting very cheap Surface or sparse Simulate operations: a cheap scan is not necessarily much cheaper than every endpoint. The study measures the diagnostic full-ring scan; it does not introduce an enforcing query.

## Matrix and measurement protocol

**rf:** normal 120 rays/400m/30dBm/120deg at 2.6 and 28GHz; rays 240/400m; radius 120/800m; fully held setting 180/600m

**matrix:** D: all eight domains, both frequencies, eleven operations; variants at sparse/dense train+holdout 2.6GHz; A/B: sparse+dense train at 2.6GHz six core operations; mixed four scenarios sparse+dense at 2.6GHz on all profiles; no 8CPU rerun

**supplement:** 24 fresh-process D cases complete held180-ray/600m coverage for Evaluate+maps/Optimize+maps/Explain/Azimuth on sparse+dense held-out domains, three repeats; same binary, Auto fingerprint and data; calibration coefficients/margins unchanged. Stage is explicit in every raw row; separate process/reset can affect GC/cache state.

**feature_audit:** Interference/Surface/Building Entry do not consume request ray count. Ray-only cases are unchanged-compute controls and excluded from model fitting/scoring; held-setting still changes radius to an unfitted600m. Source-based feature correction occurred after partial held-out results were inspected; treat all held-out conclusions as exploratory, require a fresh locked validation before design. No held-out value enters automated selection/fitting/margins.

**cache:** preflight stage loads a pack, then RF stage reloads the same pack in the same process; each RF request sees its fully loaded index and preceding domain scan; old stage heap may await GC; no forced GC/FreeOSMemory/GOGC change; request-local caches remain unchanged; first measured case compared to subsequent repeats, not cold-start RF; completed experiment cache/jobs reset consistently before each async case to guarantee uncached16-run work; frontend absent

**sampling:** 50ms RSS/cgroup/heap/slots sampling plus before/after, runtime allocation/GC deltas, getrusage processCPU, cgroupCPU/throttle. Instrumented httptest recorder includes extra buffering and response copies. Lifetime peak includes dataset startup and all prior cases; samples can miss transients. No per-interactive CPU attribution under concurrency

**omissions:** A/B 28GHz and medium/very-dense; variants at28GHz; moderate fit variants for azimuth/explain and maps (only held180/600 tested in a fresh24-case D supplement); only one real dataset; no cold OS page-cache eviction, full queue/cache retention, browser/network or exclusive deployment host; no synthetic controls

Canonical operations: Simulate, Evaluate, Evaluate+six maps, Optimize, Optimize+six returned-azimuth maps, Interference, Explain Cell, Optimize Azimuth, Coverage Surface, Recommendation and Building Entry. Six Cells where supported; one for single-cell endpoints; Recommendation uses its supported five-Cell maximum. Surface grid=25m fixed across cases. Recommendation polygon encloses the selected six inventory positions plus20m and includes all inventory candidates there; candidate count/relative Cell spacing vary with geography and are disclosed confounders. Explain prerequisite Optimize is excluded from its interval.

1210 recorded case runs, 292 isolated groups, 72 mixed scenarios. Five repeats for ordinary canonical cases; three for Optimize, Optimize+maps, Explain and Recommendation, and for variants/mixed cases (expensive repeated optimizer prerequisites and searches make the full five-pass matrix costly). Min/median/max, spread and population CV are finite sample summaries, **not percentile distributions**. A malformed Recommendation audit payload stopped an initial pilot; corrected pilot timings are excluded. No supported request was reduced to make a profile pass.

### Canonical repeats across all geometry bands (D)

| Domain | GHz | Operation | n | Wall min / median / max s | Wall CV | CPU min / median / max s | Bytes median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| very-dense-calibration | 2.6 | simulate | 5 | 0.028 / 0.033 / 0.053 | 23.6% | 0.041 / 0.047 / 0.236 | 7637243 |
| very-dense-calibration | 2.6 | evaluate | 5 | 0.475 / 0.498 / 0.554 | 5.4% | 0.781 / 0.974 / 1.158 | 29089 |
| very-dense-calibration | 2.6 | evaluate-maps | 5 | 0.686 / 0.704 / 0.778 | 4.8% | 1.457 / 1.528 / 1.649 | 44700846 |
| very-dense-calibration | 2.6 | optimize | 3 | 9.424 / 9.758 / 10.954 | 6.5% | 21.337 / 22.516 / 24.911 | 97468 |
| very-dense-calibration | 2.6 | optimize-maps | 3 | 9.631 / 10.073 / 11.482 | 7.6% | 21.881 / 23.488 / 26.922 | 45187937 |
| very-dense-calibration | 2.6 | interference | 5 | 0.037 / 0.040 / 0.045 | 7.4% | 0.043 / 0.050 / 0.115 | 4582675 |
| very-dense-calibration | 2.6 | explain | 3 | 0.242 / 0.246 / 0.272 | 5.2% | 0.515 / 0.536 / 0.611 | 2984 |
| very-dense-calibration | 2.6 | azimuth | 5 | 0.465 / 0.505 / 0.595 | 8.4% | 1.939 / 2.177 / 2.606 | 5424 |
| very-dense-calibration | 2.6 | surface | 5 | 0.006 / 0.007 / 0.008 | 11.7% | 0.006 / 0.007 / 0.008 | 140478 |
| very-dense-calibration | 2.6 | building-entry | 5 | 0.047 / 0.059 / 0.066 | 10.5% | 0.047 / 0.061 / 0.258 | 1945002 |
| very-dense-calibration | 2.6 | recommendation | 3 | 1.629 / 1.697 / 2.233 | 14.6% | 5.746 / 6.062 / 8.135 | 18556 |
| very-dense-calibration | 28 | simulate | 5 | 0.019 / 0.024 / 0.042 | 29.2% | 0.032 / 0.041 / 0.251 | 2745025 |
| very-dense-calibration | 28 | evaluate | 5 | 0.490 / 0.587 / 0.647 | 11.0% | 0.823 / 1.192 / 1.309 | 29050 |
| very-dense-calibration | 28 | evaluate-maps | 5 | 0.620 / 0.668 / 0.714 | 5.1% | 1.295 / 1.443 / 1.556 | 14845743 |
| very-dense-calibration | 28 | optimize | 3 | 9.244 / 9.565 / 11.382 | 9.4% | 20.366 / 21.635 / 25.566 | 97457 |
| very-dense-calibration | 28 | optimize-maps | 3 | 9.541 / 9.691 / 10.592 | 4.7% | 20.842 / 21.649 / 23.839 | 14307880 |
| very-dense-calibration | 28 | interference | 5 | 0.042 / 0.044 / 0.056 | 10.6% | 0.048 / 0.063 / 0.254 | 4433173 |
| very-dense-calibration | 28 | explain | 3 | 0.244 / 0.256 / 0.273 | 4.6% | 0.517 / 0.560 / 0.606 | 2986 |
| very-dense-calibration | 28 | azimuth | 5 | 0.455 / 0.554 / 0.571 | 8.2% | 2.020 / 2.300 / 2.482 | 5423 |
| very-dense-calibration | 28 | surface | 5 | 0.006 / 0.008 / 0.009 | 14.9% | 0.006 / 0.008 / 0.009 | 138489 |
| very-dense-calibration | 28 | building-entry | 5 | 0.047 / 0.060 / 0.062 | 9.5% | 0.047 / 0.061 / 0.062 | 1946988 |
| very-dense-calibration | 28 | recommendation | 3 | 1.613 / 2.098 / 2.117 | 12.0% | 5.788 / 7.331 / 7.447 | 18538 |
| dense-calibration | 2.6 | simulate | 5 | 0.028 / 0.038 / 0.057 | 25.6% | 0.035 / 0.049 / 0.327 | 6987575 |
| dense-calibration | 2.6 | evaluate | 5 | 0.365 / 0.417 / 0.427 | 6.0% | 0.739 / 0.773 / 0.838 | 29107 |
| dense-calibration | 2.6 | evaluate-maps | 5 | 0.528 / 0.538 / 0.593 | 4.3% | 1.029 / 1.089 / 1.384 | 38677844 |
| dense-calibration | 2.6 | optimize | 3 | 6.211 / 6.390 / 7.941 | 11.3% | 13.486 / 13.719 / 17.608 | 98626 |
| dense-calibration | 2.6 | optimize-maps | 3 | 6.386 / 6.589 / 7.461 | 6.8% | 13.582 / 14.485 / 16.166 | 36821471 |
| dense-calibration | 2.6 | interference | 5 | 0.035 / 0.042 / 0.055 | 18.0% | 0.037 / 0.044 / 0.209 | 6518847 |
| dense-calibration | 2.6 | explain | 3 | 0.155 / 0.162 / 0.183 | 7.1% | 0.374 / 0.428 / 0.472 | 3000 |
| dense-calibration | 2.6 | azimuth | 5 | 0.265 / 0.300 / 0.307 | 5.1% | 0.935 / 1.062 / 1.093 | 5432 |
| dense-calibration | 2.6 | surface | 5 | 0.003 / 0.004 / 0.004 | 8.5% | 0.003 / 0.004 / 0.004 | 73050 |
| dense-calibration | 2.6 | building-entry | 5 | 0.040 / 0.049 / 0.077 | 26.3% | 0.040 / 0.049 / 0.078 | 3039988 |
| dense-calibration | 2.6 | recommendation | 3 | 0.688 / 0.752 / 0.901 | 11.4% | 2.314 / 2.584 / 3.166 | 16271 |
| dense-calibration | 28 | simulate | 5 | 0.020 / 0.022 / 0.029 | 13.7% | 0.030 / 0.053 / 0.126 | 3515089 |
| dense-calibration | 28 | evaluate | 5 | 0.362 / 0.412 / 0.447 | 6.7% | 0.640 / 0.758 / 0.893 | 29073 |
| dense-calibration | 28 | evaluate-maps | 5 | 0.488 / 0.527 / 0.546 | 4.0% | 0.963 / 1.070 / 1.237 | 20438171 |
| dense-calibration | 28 | optimize | 3 | 6.577 / 6.741 / 6.975 | 2.4% | 13.433 / 14.005 / 14.061 | 98477 |
| dense-calibration | 28 | optimize-maps | 3 | 6.689 / 6.868 / 6.957 | 1.6% | 13.784 / 13.816 / 15.017 | 20141859 |
| dense-calibration | 28 | interference | 5 | 0.034 / 0.036 / 0.057 | 21.0% | 0.036 / 0.042 / 0.240 | 6355651 |
| dense-calibration | 28 | explain | 3 | 0.169 / 0.175 / 0.179 | 2.4% | 0.405 / 0.408 / 0.436 | 3006 |
| dense-calibration | 28 | azimuth | 5 | 0.299 / 0.325 / 0.394 | 9.8% | 1.111 / 1.217 / 1.709 | 5430 |
| dense-calibration | 28 | surface | 5 | 0.004 / 0.004 / 0.004 | 5.0% | 0.004 / 0.004 / 0.004 | 95284 |
| dense-calibration | 28 | building-entry | 5 | 0.039 / 0.055 / 0.078 | 23.3% | 0.039 / 0.055 / 0.250 | 3044027 |
| dense-calibration | 28 | recommendation | 3 | 0.694 / 0.782 / 0.903 | 10.8% | 2.162 / 2.512 / 2.847 | 16255 |
| medium-calibration | 2.6 | simulate | 5 | 0.019 / 0.031 / 0.039 | 27.4% | 0.024 / 0.113 / 0.199 | 5842131 |
| medium-calibration | 2.6 | evaluate | 5 | 0.243 / 0.260 / 0.282 | 5.2% | 0.301 / 0.325 / 0.542 | 29090 |
| medium-calibration | 2.6 | evaluate-maps | 5 | 0.349 / 0.362 / 0.447 | 9.5% | 0.580 / 0.740 / 0.967 | 32222473 |
| medium-calibration | 2.6 | optimize | 3 | 3.359 / 3.518 / 3.586 | 2.7% | 6.096 / 6.565 / 6.745 | 85774 |
| medium-calibration | 2.6 | optimize-maps | 3 | 3.470 / 3.620 / 3.721 | 2.9% | 6.460 / 6.791 / 7.207 | 30610597 |
| medium-calibration | 2.6 | interference | 5 | 0.012 / 0.012 / 0.030 | 44.7% | 0.012 / 0.013 / 0.198 | 2962962 |
| medium-calibration | 2.6 | explain | 3 | 0.080 / 0.080 / 0.091 | 5.8% | 0.096 / 0.100 / 0.235 | 2983 |
| medium-calibration | 2.6 | azimuth | 5 | 0.185 / 0.206 / 0.227 | 6.4% | 0.440 / 0.685 / 0.771 | 5431 |
| medium-calibration | 2.6 | surface | 5 | 0.002 / 0.002 / 0.003 | 12.8% | 0.002 / 0.002 / 0.003 | 33142 |
| medium-calibration | 2.6 | building-entry | 5 | 0.021 / 0.026 / 0.027 | 11.2% | 0.021 / 0.026 / 0.027 | 273985 |
| medium-calibration | 2.6 | recommendation | 3 | 0.343 / 0.351 / 0.398 | 6.7% | 0.791 / 0.813 / 0.948 | 16238 |
| medium-calibration | 28 | simulate | 5 | 0.014 / 0.016 / 0.023 | 19.1% | 0.020 / 0.021 / 0.053 | 2954558 |
| medium-calibration | 28 | evaluate | 5 | 0.286 / 0.300 / 0.331 | 5.8% | 0.506 / 0.547 / 0.577 | 29065 |
| medium-calibration | 28 | evaluate-maps | 5 | 0.370 / 0.382 / 0.431 | 5.8% | 0.610 / 0.625 / 0.754 | 19911311 |
| medium-calibration | 28 | optimize | 3 | 4.629 / 4.729 / 5.324 | 6.3% | 8.299 / 8.698 / 9.575 | 97725 |
| medium-calibration | 28 | optimize-maps | 3 | 4.709 / 4.810 / 5.103 | 3.4% | 8.498 / 8.898 / 9.458 | 22024775 |
| medium-calibration | 28 | interference | 5 | 0.011 / 0.012 / 0.025 | 36.7% | 0.012 / 0.015 / 0.177 | 2955066 |
| medium-calibration | 28 | explain | 3 | 0.104 / 0.106 / 0.128 | 9.7% | 0.130 / 0.132 / 0.378 | 2984 |
| medium-calibration | 28 | azimuth | 5 | 0.233 / 0.252 / 0.272 | 4.9% | 0.805 / 0.861 / 0.911 | 5429 |
| medium-calibration | 28 | surface | 5 | 0.002 / 0.002 / 0.003 | 10.6% | 0.002 / 0.002 / 0.003 | 64188 |
| medium-calibration | 28 | building-entry | 5 | 0.021 / 0.027 / 0.029 | 12.5% | 0.021 / 0.027 / 0.029 | 274360 |
| medium-calibration | 28 | recommendation | 3 | 0.426 / 0.454 / 0.508 | 7.3% | 0.982 / 1.169 / 1.254 | 16226 |
| sparse-calibration | 2.6 | simulate | 5 | 0.010 / 0.011 / 0.011 | 3.6% | 0.012 / 0.013 / 0.014 | 3262803 |
| sparse-calibration | 2.6 | evaluate | 5 | 0.176 / 0.200 / 0.233 | 10.5% | 0.188 / 0.218 / 0.462 | 28490 |
| sparse-calibration | 2.6 | evaluate-maps | 5 | 0.247 / 0.250 / 0.274 | 4.2% | 0.278 / 0.460 / 0.517 | 19957041 |
| sparse-calibration | 2.6 | optimize | 3 | 2.501 / 2.506 / 2.565 | 1.1% | 4.277 / 4.359 / 4.498 | 91264 |
| sparse-calibration | 2.6 | optimize-maps | 3 | 2.473 / 2.553 / 2.676 | 3.2% | 4.108 / 4.583 / 4.715 | 20212025 |
| sparse-calibration | 2.6 | interference | 5 | 0.020 / 0.026 / 0.042 | 26.7% | 0.021 / 0.027 / 0.239 | 7704353 |
| sparse-calibration | 2.6 | explain | 3 | 0.056 / 0.058 / 0.059 | 2.2% | 0.069 / 0.069 / 0.074 | 2687 |
| sparse-calibration | 2.6 | azimuth | 5 | 0.149 / 0.165 / 0.181 | 7.5% | 0.296 / 0.522 / 0.576 | 5411 |
| sparse-calibration | 2.6 | surface | 5 | 0.001 / 0.001 / 0.001 | 12.7% | 0.001 / 0.001 / 0.001 | 13540 |
| sparse-calibration | 2.6 | building-entry | 5 | 0.020 / 0.021 / 0.024 | 7.1% | 0.020 / 0.021 / 0.024 | 150018 |
| sparse-calibration | 2.6 | recommendation | 3 | 0.244 / 0.258 / 0.286 | 6.6% | 0.435 / 0.448 / 0.507 | 15960 |
| sparse-calibration | 28 | simulate | 5 | 0.011 / 0.012 / 0.031 | 47.9% | 0.012 / 0.014 / 0.171 | 3271321 |
| sparse-calibration | 28 | evaluate | 5 | 0.175 / 0.178 / 0.239 | 12.6% | 0.192 / 0.368 / 0.499 | 28634 |
| sparse-calibration | 28 | evaluate-maps | 5 | 0.239 / 0.255 / 0.268 | 4.0% | 0.265 / 0.311 / 0.469 | 19980930 |
| sparse-calibration | 28 | optimize | 3 | 2.355 / 2.466 / 2.587 | 3.8% | 4.163 / 4.346 / 4.560 | 91376 |
| sparse-calibration | 28 | optimize-maps | 3 | 2.408 / 2.551 / 2.952 | 8.7% | 4.286 / 4.575 / 5.104 | 19905839 |
| sparse-calibration | 28 | interference | 5 | 0.019 / 0.023 / 0.026 | 12.1% | 0.019 / 0.024 / 0.038 | 7703353 |
| sparse-calibration | 28 | explain | 3 | 0.055 / 0.055 / 0.070 | 11.9% | 0.067 / 0.069 / 0.090 | 2689 |
| sparse-calibration | 28 | azimuth | 5 | 0.139 / 0.164 / 0.193 | 11.6% | 0.292 / 0.510 / 0.595 | 5411 |
| sparse-calibration | 28 | surface | 5 | 0.001 / 0.001 / 0.001 | 9.6% | 0.001 / 0.001 / 0.001 | 13546 |
| sparse-calibration | 28 | building-entry | 5 | 0.019 / 0.020 / 0.027 | 13.3% | 0.019 / 0.020 / 0.027 | 150231 |
| sparse-calibration | 28 | recommendation | 3 | 0.247 / 0.279 / 0.303 | 8.3% | 0.445 / 0.588 / 0.732 | 15937 |

## Location effect and hardware effect

All RF/search settings are identical across domains within a workload; inventory geometry and relative Cell spacing change. These are location effects, not a causal density-only experiment. Single-cell maps use the anchor geometry; network cases use six different real inventory positions. A sparse/dense label for the network envelope need not order the one-Cell envelope or path viability.

| Profile | GHz | Operation | Sparse wall s | Dense wall s | Wall dense/sparse | Sparse CPU s | Dense CPU s | CPU dense/sparse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 2.6 | simulate | 0.013 | 0.055 | 4.294 | 0.013 | 0.109 | 8.216 |
| A | 2.6 | evaluate | 0.194 | 0.364 | 1.874 | 0.264 | 0.517 | 1.959 |
| A | 2.6 | optimize | 2.490 | 6.851 | 2.752 | 3.774 | 10.795 | 2.861 |
| A | 2.6 | interference | 0.029 | 0.038 | 1.341 | 0.043 | 0.048 | 1.118 |
| B | 2.6 | simulate | 0.013 | 0.026 | 2.019 | 0.025 | 0.036 | 1.453 |
| B | 2.6 | evaluate | 0.199 | 0.374 | 1.880 | 0.326 | 0.566 | 1.739 |
| B | 2.6 | optimize | 2.450 | 6.688 | 2.730 | 3.834 | 12.064 | 3.146 |
| B | 2.6 | interference | 0.030 | 0.037 | 1.240 | 0.119 | 0.040 | 0.340 |
| D | 2.6 | simulate | 0.011 | 0.038 | 3.589 | 0.013 | 0.049 | 3.738 |
| D | 2.6 | evaluate | 0.200 | 0.417 | 2.085 | 0.218 | 0.773 | 3.548 |
| D | 2.6 | optimize | 2.506 | 6.390 | 2.550 | 4.359 | 13.719 | 3.147 |
| D | 2.6 | interference | 0.026 | 0.042 | 1.582 | 0.027 | 0.044 | 1.618 |
| D | 28 | simulate | 0.012 | 0.022 | 1.876 | 0.014 | 0.053 | 3.866 |
| D | 28 | evaluate | 0.178 | 0.412 | 2.311 | 0.368 | 0.758 | 2.059 |
| D | 28 | optimize | 2.466 | 6.741 | 2.733 | 4.346 | 14.005 | 3.223 |
| D | 28 | interference | 0.023 | 0.036 | 1.553 | 0.024 | 0.042 | 1.748 |

| Domain | Operation | A/B wall ratio | A/D wall ratio |
| --- | --- | --- | --- |
| sparse-calibration | simulate | 0.984 | 1.196 |
| sparse-calibration | evaluate | 0.976 | 0.971 |
| sparse-calibration | optimize | 1.016 | 0.994 |
| sparse-calibration | interference | 0.958 | 1.083 |
| dense-calibration | simulate | 2.092 | 1.431 |
| dense-calibration | evaluate | 0.973 | 0.873 |
| dense-calibration | optimize | 1.024 | 1.072 |
| dense-calibration | interference | 1.036 | 0.918 |

Compare the location ratios with each operation’s A/B ratio above. No universal claim that density dominates CPU is supported. A density-only monotone estimator is unsafe: candidate geometry, polygon complexity, live paths, frequency and deterministic search behavior contribute differently. Pearson correlations of grouped D medians with geometry/rays/radius/area appear per operation/target in JSON; constant Cell count is null, not fabricated evidence. Correlated footprint/vertex/edge features do not prove admission safety.

## Warm runs, GC and throttling

First-measured / subsequent-median wall ratio across groups: median 0.983x, range 0.557–1.761x. The preflight stage loads the pack; the RF stage reloads the same pack in that process. Its index is fully loaded before every measured RF request, which also follows an explicit domain scan. The earlier stage’s unreachable heap may await GC; startup/load CPU was not isolated. This is warmed-process characterization; OS page cache/startup, scheduler, host activity and heap state are not independently controlled. Request-local optimizer caches are rebuilt normally. There is no retained frontend or experiment-cache speedup in the measured async cases.

6376 GC cycles occurred across measured intervals; maximum cumulative stop-the-world pause / wall is 17.09%. GC pause is only one part of GC cost; concurrent mark/assist and scheduler effects cannot be separated by pause totals. Per-row heap before/after, cumulative allocations, GC counts/pauses and sampled heap are retained. 30 rows had throttled periods. Cgroup CPU usage, periods, throttled periods/duration and memory events are retained. Throttled duration is accumulated accounting, not direct wall slowdown; concurrency CPU is aggregate, not attributable to individual operations.

## Repeated mixed load and tails

Each profile repeats three times: Optimize+uncached16-run experiment; Evaluate+uncached16-run experiment; two distinct-client Optimizers; Optimize+Evaluate. Each scenario is tested on sparse/dense domains at2.6GHz with unchanged 2/1 RF slots and one async worker. Job status must be running before interactive work; actual timestamps must overlap. Aggregate CPU/GC/memory includes both jobs. Async work is ordinary Simulate azimuth sweep, not background network optimization; finite overlap does not certify a sustained queue.

| Profile | Domain | Scenario | Operation | Isolated median s | Mixed median s | Mixed max s | Median inflation | Max inflation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | sparse-calibration | async-optimize | optimize | 2.490 | 2.528 | 2.620 | 1.015 | 1.052 |
| A | sparse-calibration | async-evaluate | evaluate | 0.194 | 0.220 | 0.254 | 1.134 | 1.309 |
| A | sparse-calibration | two-optimizers | optimize | 2.490 | 3.876 | 3.909 | 1.557 | 1.570 |
| A | sparse-calibration | two-optimizers | optimize | 2.490 | 3.873 | 3.894 | 1.556 | 1.564 |
| A | sparse-calibration | optimize-evaluate | optimize | 2.490 | 2.547 | 2.676 | 1.023 | 1.075 |
| A | sparse-calibration | optimize-evaluate | evaluate | 0.194 | 0.239 | 0.285 | 1.234 | 1.468 |
| A | dense-calibration | async-optimize | optimize | 6.851 | 7.132 | 7.235 | 1.041 | 1.056 |
| A | dense-calibration | async-evaluate | evaluate | 0.364 | 0.479 | 0.520 | 1.317 | 1.429 |
| A | dense-calibration | two-optimizers | optimize | 6.851 | 11.749 | 11.862 | 1.715 | 1.731 |
| A | dense-calibration | two-optimizers | optimize | 6.851 | 11.655 | 11.809 | 1.701 | 1.724 |
| A | dense-calibration | optimize-evaluate | optimize | 6.851 | 7.132 | 7.201 | 1.041 | 1.051 |
| A | dense-calibration | optimize-evaluate | evaluate | 0.364 | 0.567 | 0.636 | 1.559 | 1.750 |
| B | sparse-calibration | async-optimize | optimize | 2.450 | 2.529 | 2.537 | 1.032 | 1.035 |
| B | sparse-calibration | async-evaluate | evaluate | 0.199 | 0.202 | 0.204 | 1.015 | 1.025 |
| B | sparse-calibration | two-optimizers | optimize | 2.450 | 3.220 | 3.252 | 1.314 | 1.327 |
| B | sparse-calibration | two-optimizers | optimize | 2.450 | 3.224 | 3.232 | 1.316 | 1.319 |
| B | sparse-calibration | optimize-evaluate | optimize | 2.450 | 2.519 | 2.562 | 1.028 | 1.046 |
| B | sparse-calibration | optimize-evaluate | evaluate | 0.199 | 0.246 | 0.252 | 1.235 | 1.268 |
| B | dense-calibration | async-optimize | optimize | 6.688 | 6.933 | 6.979 | 1.037 | 1.043 |
| B | dense-calibration | async-evaluate | evaluate | 0.374 | 0.467 | 0.485 | 1.249 | 1.297 |
| B | dense-calibration | two-optimizers | optimize | 6.688 | 9.269 | 9.520 | 1.386 | 1.423 |
| B | dense-calibration | two-optimizers | optimize | 6.688 | 9.206 | 9.360 | 1.376 | 1.399 |
| B | dense-calibration | optimize-evaluate | optimize | 6.688 | 6.740 | 6.758 | 1.008 | 1.010 |
| B | dense-calibration | optimize-evaluate | evaluate | 0.374 | 0.493 | 0.505 | 1.318 | 1.351 |
| D | sparse-calibration | async-optimize | optimize | 2.506 | 2.447 | 2.994 | 0.977 | 1.195 |
| D | sparse-calibration | async-evaluate | evaluate | 0.200 | 0.184 | 0.223 | 0.921 | 1.114 |
| D | sparse-calibration | two-optimizers | optimize | 2.506 | 3.242 | 3.735 | 1.294 | 1.491 |
| D | sparse-calibration | two-optimizers | optimize | 2.506 | 3.222 | 3.684 | 1.286 | 1.470 |
| D | sparse-calibration | optimize-evaluate | optimize | 2.506 | 2.542 | 2.581 | 1.014 | 1.030 |
| D | sparse-calibration | optimize-evaluate | evaluate | 0.200 | 0.254 | 0.268 | 1.269 | 1.341 |
| D | dense-calibration | async-optimize | optimize | 6.390 | 6.642 | 6.672 | 1.040 | 1.044 |
| D | dense-calibration | async-evaluate | evaluate | 0.417 | 0.433 | 0.449 | 1.040 | 1.078 |
| D | dense-calibration | two-optimizers | optimize | 6.390 | 9.719 | 9.827 | 1.521 | 1.538 |
| D | dense-calibration | two-optimizers | optimize | 6.390 | 9.692 | 9.721 | 1.517 | 1.521 |
| D | dense-calibration | optimize-evaluate | optimize | 6.390 | 6.838 | 6.907 | 1.070 | 1.081 |
| D | dense-calibration | optimize-evaluate | evaluate | 0.417 | 0.506 | 0.507 | 1.215 | 1.218 |

Worst observed inflation: 1.750x (A, dense-calibration, optimize-evaluate, evaluate). Minimum individual RF deadline headroom across all runs: 31.019s. Bundle duration is not a single-request deadline. Throttle/GC/overlap per scenario is in JSON; shared-host noise remains an unresolved causal contributor.

## Operation-specific predictors and held-out gate

Predeclared study-only: calibration leave-domain-out margin <=4; held-out underestimates <=5%, worst shortfall<=10%. Selected by training logRMSE. Retrospective held-out margins describe this sample only; no retuning. Four independent held-out locations insufficient for admission certification.

Fit log-cost ridge linear predictors independently per operation and target, using medians of repeat groups. Features are rays/radius/frequency (ray count omitted for Interference, Surface and Building Entry) plus one of footprint count, vertices, edges, density+area, or footprint+vertices; a parameter-only baseline is compared. Ray-only unchanged-compute controls for those three operations are excluded from fitting/scoring. These are exploratory source-informed predictors, not preregistered models; partial held-out results were inspected before the source-based removal of unused ray count, so fresh locked validation is required. Select the family by leave-one-calibration-domain-out log RMSE; standardization and coefficients fit only training rows. All four held-out locations and the180-ray/600m setting stay untouched. Hardware A/B transfer is also scored against the D-fit model and recorded separately. The CPU capacity signal is observed but a capacity coefficient cannot be learned from D-only fitting; no universal wall=CPU/cores guarantee is claimed. Exact formulas, feature transforms, means/scales, coefficients, all candidate CV scores and worst-case identifiers are in JSON.

### CPU

| Operation | Family | Median absolute error | Worst actual/predicted | Worst overestimate | Calibration CV margin | Underestimates after margin | Numeric gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth | parameters | 49.0% | 5.857 | 217.5% | 3.004 | 1000.0% | NOT READY |
| building-entry | density | 65.3% | 4.048 | 115.7% | 6.715 | 0.0% | NOT READY |
| evaluate | edges | 60.5% | 4.622 | 156.1% | 2.101 | 2500.0% | NOT READY |
| evaluate-maps | parameters | 41.3% | 5.786 | 73.9% | 2.430 | 1000.0% | NOT READY |
| explain | footprints | 51.7% | 4.504 | 358.4% | 3.863 | 1000.0% | NOT READY |
| interference | edges | 83.4% | 10.903 | 254.0% | 1.937 | 2857.1% | NOT READY |
| optimize | footprints | 37.7% | 2.556 | 156.2% | 2.815 | 0.0% | PROMISING BUT MORE CALIBRATION |
| optimize-maps | geometry | 31.1% | 8.326 | 194.6% | 3.091 | 1000.0% | NOT READY |
| recommendation | footprints | 57.0% | 3.451 | 252.3% | 3.645 | 0.0% | PROMISING BUT MORE CALIBRATION |
| simulate | footprints | 59.6% | 3.767 | 130.5% | 3.460 | 1250.0% | NOT READY |
| surface | footprints | 17.7% | 1.226 | 103.1% | 3.011 | 0.0% | PROMISING BUT MORE CALIBRATION |

### Wall time in profile D

| Operation | Family | Median absolute error | Worst actual/predicted | Worst overestimate | Calibration CV margin | Underestimates after margin | Numeric gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth | parameters | 41.4% | 4.410 | 87.3% | 2.334 | 1000.0% | NOT READY |
| building-entry | density | 57.6% | 3.227 | 92.7% | 3.923 | 0.0% | PROMISING BUT MORE CALIBRATION |
| evaluate | edges | 48.9% | 2.838 | 92.1% | 1.825 | 3125.0% | NOT READY |
| evaluate-maps | parameters | 33.7% | 4.514 | 58.4% | 1.925 | 1000.0% | NOT READY |
| explain | geometry | 33.4% | 6.312 | 157.6% | 2.861 | 1000.0% | NOT READY |
| interference | footprints | 50.8% | 4.281 | 102.0% | 2.460 | 2142.9% | NOT READY |
| optimize | footprints | 28.8% | 2.187 | 119.7% | 2.506 | 0.0% | PROMISING BUT MORE CALIBRATION |
| optimize-maps | parameters | 39.7% | 5.385 | 76.1% | 2.558 | 1000.0% | NOT READY |
| recommendation | footprints | 52.5% | 2.725 | 164.1% | 3.069 | 0.0% | PROMISING BUT MORE CALIBRATION |
| simulate | footprints | 23.2% | 1.483 | 74.2% | 1.247 | 4375.0% | NOT READY |
| surface | footprints | 17.7% | 1.232 | 103.0% | 3.096 | 0.0% | PROMISING BUT MORE CALIBRATION |

### Spatial candidate work

| Operation | Family | Median absolute error | Worst actual/predicted | Worst overestimate | Calibration CV margin | Underestimates after margin | Numeric gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth | geometry | 100.0% | 5367.204 | 2085.6% | 1080.585 | 3000.0% | NOT READY |
| building-entry | density | 84.4% | 9.333 | 186.6% | 21.904 | 0.0% | NOT READY |
| evaluate | density | 29.6% | 10.784 | 13.9% | 1.644 | 4375.0% | NOT READY |
| evaluate-maps | density | 46.8% | 28.239 | 7.1% | 1.688 | 6000.0% | NOT READY |
| explain | density | 46.6% | 24.822 | 59.3% | 1.609 | 4000.0% | NOT READY |
| interference | density | 84.0% | 17.816 | 104.4% | 3.516 | 2857.1% | NOT READY |
| optimize | density | 19.2% | 9.314 | 37.7% | 1.426 | 3125.0% | NOT READY |
| optimize-maps | density | 35.7% | 20.075 | 36.5% | 1.379 | 4000.0% | NOT READY |
| recommendation | density | 50.6% | 3.137 | 64.0% | 15.284 | 0.0% | NOT READY |
| simulate | density | 99.2% | 76916860.206 | 1430384.3% | 110.453 | 3125.0% | NOT READY |
| surface | density | 98.9% | 2072004.750 | 527718.6% | 70.325 | 3571.4% | NOT READY |

### Response bytes

| Operation | Family | Median absolute error | Worst actual/predicted | Worst overestimate | Calibration CV margin | Underestimates after margin | Numeric gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth | parameters | 0.1% | 1.001 | 0.2% | 1.002 | 0.0% | PROMISING BUT MORE CALIBRATION |
| building-entry | density | 42.8% | 6.111 | 86.9% | 3.404 | 2857.1% | NOT READY |
| evaluate | density | 0.3% | 1.008 | 0.4% | 1.008 | 0.0% | PROMISING BUT MORE CALIBRATION |
| evaluate-maps | parameters | 24.5% | 2.336 | 50.8% | 1.536 | 1000.0% | NOT READY |
| explain | parameters | 2.4% | 1.034 | 2.2% | 1.043 | 0.0% | PROMISING BUT MORE CALIBRATION |
| interference | parameters | 28.6% | 1.557 | 9.0% | 1.764 | 0.0% | PROMISING BUT MORE CALIBRATION |
| optimize | density | 18.2% | 1.814 | 39.5% | 2.057 | 0.0% | PROMISING BUT MORE CALIBRATION |
| optimize-maps | parameters | 29.0% | 2.406 | 44.7% | 1.598 | 1000.0% | NOT READY |
| recommendation | parameters | 2.1% | 1.392 | 3.2% | 1.149 | 1250.0% | NOT READY |
| simulate | footprints | 9.2% | 1.259 | 70.7% | 1.557 | 0.0% | PROMISING BUT MORE CALIBRATION |
| surface | footprints | 26.7% | 1.484 | 140.6% | 2.637 | 0.0% | PROMISING BUT MORE CALIBRATION |

### Allocations

| Operation | Family | Median absolute error | Worst actual/predicted | Worst overestimate | Calibration CV margin | Underestimates after margin | Numeric gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth | footprints | 44.1% | 1.989 | 99.8% | 4.564 | 0.0% | NOT READY |
| building-entry | edges | 95.3% | 22.798 | 438.3% | 4.018 | 2857.1% | NOT READY |
| evaluate | edges | 73.7% | 7.166 | 231.2% | 2.798 | 3125.0% | NOT READY |
| evaluate-maps | parameters | 40.0% | 3.949 | 97.6% | 2.532 | 1000.0% | NOT READY |
| explain | edges | 60.0% | 3.614 | 324.2% | 3.070 | 1000.0% | NOT READY |
| interference | footprints | 28.1% | 4.277 | 84.6% | 2.555 | 2142.9% | NOT READY |
| optimize | footprints | 47.2% | 3.007 | 215.4% | 3.302 | 0.0% | PROMISING BUT MORE CALIBRATION |
| optimize-maps | geometry | 32.4% | 5.468 | 235.5% | 3.630 | 1000.0% | NOT READY |
| recommendation | footprints | 53.0% | 3.950 | 350.7% | 3.609 | 1250.0% | NOT READY |
| simulate | footprints | 12.2% | 1.218 | 42.2% | 1.780 | 0.0% | PROMISING BUT MORE CALIBRATION |
| surface | footprints | 21.8% | 1.260 | 110.3% | 2.816 | 0.0% | PROMISING BUT MORE CALIBRATION |

### Sampled absolute RSS

| Operation | Family | Median absolute error | Worst actual/predicted | Worst overestimate | Calibration CV margin | Underestimates after margin | Numeric gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| azimuth | parameters | 3.2% | 1.044 | 5.8% | 1.102 | 0.0% | PROMISING BUT MORE CALIBRATION |
| building-entry | parameters | 1.9% | 1.040 | 4.5% | 1.053 | 0.0% | PROMISING BUT MORE CALIBRATION |
| evaluate | parameters | 1.6% | 1.084 | 1.4% | 1.089 | 0.0% | PROMISING BUT MORE CALIBRATION |
| evaluate-maps | parameters | 1.6% | 1.150 | 2.2% | 1.080 | 2000.0% | NOT READY |
| explain | density | 1.1% | 1.016 | 3.3% | 1.024 | 0.0% | PROMISING BUT MORE CALIBRATION |
| interference | density | 2.1% | 1.046 | 5.6% | 1.050 | 0.0% | PROMISING BUT MORE CALIBRATION |
| optimize | footprints | 2.2% | 1.096 | 3.2% | 1.065 | 625.0% | NOT READY |
| optimize-maps | parameters | 2.5% | 1.115 | 5.3% | 1.075 | 2000.0% | NOT READY |
| recommendation | geometry | 1.7% | 1.036 | 6.7% | 1.034 | 625.0% | NOT READY |
| simulate | parameters | 1.7% | 1.064 | 1.4% | 1.085 | 0.0% | PROMISING BUT MORE CALIBRATION |
| surface | parameters | 1.6% | 1.030 | 3.8% | 1.057 | 0.0% | PROMISING BUT MORE CALIBRATION |

Held-out errors are measured relative to actual demand; worst actual/predicted reports the required retrospective multiplier. A margin that covers this sample is not a production bound. The JSON separates held-out domain errors, held-out setting errors and A/B hardware transfer; one combined error can hide extrapolation failure. Numeric gate success means a promising pilot, never admission certification. Geometry targets are repeated spatial-candidate/edge work, not an assertion that bbox count equals exact RF intersections.

Worst un-margined CPU underprediction across operation estimators: 10.903x actual/predicted; response: 6.111x. Both may be different cases than the worst latency. Frequency/path survival and grid/output form explain why response bytes require a separate model; dense geometry need not produce larger output.

The worst spatial-candidate predictor is simulate: 76,916,860.2x actual/predicted. This is a catastrophic zero-to-positive extrapolation of the exploratory log-target model (zero training work is floored at1e-9), not an observed geometry-cost explosion. Reject this model and its margins; a zero-aware candidate-work model would need a new locked validation. The directly enumerated bbox metadata itself remains deterministic and conservatively includes complete footprint parts.

Memory: allocation totals are cumulative work, not live demand. Absolute sampled RSS includes loaded dataset, retained heap and recorder response copies; it is order-dependent, can miss spikes and is not incremental memory reservation. Cgroup current includes file/kernel charges; cumulative lifetime peak includes startup/previous cases. Existing app/OS/VM overhead and queued job retention remain unmeasured. The tables quantify exploratory predictors but cannot establish a conservative live-memory envelope.

The table’s median error is median absolute relative error. Signed median errors, maximum shortfall relative to actual, percentage of raw underestimates and setting/domain splits are retained in JSON. Required margins must be compared with calibration-only CV margins, not fitted after seeing held-out data.

### Margin stability across held-out settings and hardware

| Operation | CPU calibration margin | CPU domain actual/pred max | CPU held-setting actual/pred max | CPU A actual/pred max | CPU B actual/pred max |
| --- | --- | --- | --- | --- | --- |
| azimuth | 3.004 | 2.541 | 5.857 | — | — |
| building-entry | 6.715 | 4.048 | 2.303 | — | — |
| evaluate | 2.101 | 4.622 | 3.431 | 1 | 1 |
| evaluate-maps | 2.430 | 1.839 | 5.786 | 1 | 1.080 |
| explain | 3.863 | 2.434 | 4.504 | — | — |
| interference | 1.937 | 10.903 | 7.943 | 1.937 | 5.315 |
| optimize | 2.815 | 2.556 | 2.448 | 1 | 1 |
| optimize-maps | 3.091 | 1.536 | 8.326 | 1 | 1 |
| recommendation | 3.645 | 3.130 | 3.451 | — | — |
| simulate | 3.460 | 3.767 | 3.121 | 1.788 | 1.233 |
| surface | 3.011 | 1.226 | 1.042 | — | — |

Some operation/margin pairs may pass this finite pilot gate, but stability is not established across search policies, new datasets, sustained load and deployment hosts. Large calibration margins or validation exceedances reject that predictor; no retrospective held-out covering multiplier is selected for production.

## Internal cost bands

Four CPU-prediction quartile bands are set using calibration data only. Held-out classification uses the unchanged predictor/cutoffs; actual CPU/RSS/bytes ranges and exceedances of training maxima are retained per band in JSON. CPU groups do not jointly bound memory/response, and broad overlapping ranges cannot support one multi-resource cost class. **Reject these cost bands for admission or product names.**

| Band | Cal CPU min–max s | Held CPU min–max s | Cal RSS min–max MiB | Cal bytes min–max | Held exceedances CPU / RSS / bytes |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.001–0.063 | 0.001–0.087 | 784.8–913.2 | 13540–7704353 | 2 / 0 / 5 |
| 2 | 0.029–0.560 | 0.025–1.346 | 762.9–897.4 | 2687–13889599 | 4 / 0 / 1 |
| 3 | 0.311–2.300 | 0.331–5.588 | 778.5–904.8 | 5411–44700846 | 3 / 2 / 3 |
| 4 | 1.334–38.461 | 0.562–65.782 | 777.8–908.4 | 16054–45187937 | 3 / 2 / 2 |

## Future preflight, feature set and Auto readiness

Smallest useful candidate set: operation/output mode, Cell count, rays, effective per-Cell radius/profile/frequency, deterministic search policy/budget, bounded local bbox candidate and vertex/edge counts, sample/grid count, observed CPU capacity, and active interactive/async work. Geometry/count descriptors are correlated; retain a bounded count plus vertices provisionally, not every correlated density feature. Recommendation additionally needs candidate inventory/search-domain extent; Building Entry needs global scan context. Cells/search/grid variation are operationally required features but their coefficients are not identified by this fixed-default subset.

Recommended future preflight: **C, footprint + vertex/edge metadata**, as a bounded diagnostic prototype for the expensive ray/network operations; add an explicit query budget/fallback design before production use. Cheap bbox-only counts lose polygon complexity. Exact polygon intersections are unnecessary for conservative bbox metadata. For very cheap endpoints, preflight benefit is unknown and may justify skipping it. No new production query or index optimization is introduced here.

| Derivation | Readiness |
| --- | --- |
| safe_concurrency | NOT READY |
| compute_reservation | PROMISING BUT MORE CALIBRATION |
| memory_reservation | NOT READY |
| response_reservation | PROMISING BUT MORE CALIBRATION |
| async_workers | NOT READY |

Future admission design likely needs resource profile + operation parameters + bounded local geometry + mixed-load state. No estimator is certified: only four independent held-out locations, one dataset/shared VM, fixed search policy, incomplete moderate-setting coverage, sample peaks and short async overlap. Eight-Cell demand could plausibly enter such a feature set, but this study measures six. The [separate capacity audit](./network-size-capacity-audit.md) measured six→eight Optimize at5.886→8.374s (2.6GHz) and5.745→8.249s (28GHz), with only one primary eight-Cell sample. Its repeat workflow consumes19 of20 attempts, leaving only one. Those limited compute observations and tight workflow budget do not justify a cap increase. Do not increase validation caps or infer capacity from linear Cell scaling.

Future bounded observability: operation, geometry count bucket, predicted/actual CPU and wall buckets, response-byte bucket, interactive/async active counts and underprediction flag. An internal cost-class field is useful only after a stable class exists. No raw coordinates, IP, project payload or credentials; this task adds no production telemetry.

## Validation and freeze

Baseline: backend full tests, race tests and vet; frontend423 tests, lint/build; existing real RF-budget and deadline browser E2Es passed on separate fresh servers. Final validation results are recorded in the JSON `validation` field after execution. Existing Vite large-chunk and Node environment warnings persist. New Python tests enforce held-out isolation/error arithmetic/repeat/domain/async/policy invariants; the disposable Go primitive test checks multipart/closed-ring accounting and conservative envelope nesting.

All ordinary measured RF responses succeeded: True; cross-repeat/profile canonical hashes stable: True. Six cancellation cases preserve charges and successful same-client follow-up; sampler/slots and async measurements remain test-only. No OOM event or kill; no claim of guaranteed memory safety follows.

Created files: `docs/auto-resource-geometry-calibration.md`, `.json` and `scripts/auto-resource-geometry/` tooling/tests. No VERSION/CHANGELOG bump: no externally visible behavior. Previous artifacts stay untouched. Freeze evidence and audit tooling, **not** a numeric estimator, margin, class or adaptive design.

**Single next action:** Run a predeclared estimator validation on additional disjoint deployment-target domains and RF/search settings, with actual HTTP streaming and sustained async overlap, using calibration-only margins unchanged.

[Full machine-readable evidence](./auto-resource-geometry-calibration.json) · [Reproduction harness](../scripts/auto-resource-geometry/README.md)
