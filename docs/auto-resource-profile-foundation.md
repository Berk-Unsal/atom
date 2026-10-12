# Auto Resource Profiling Foundation

Auto is the only development mode. It observes runtime resources for diagnostics
and calibration. It does not control admission, GOMAXPROCS, experiment workers,
queue sizes, RF computation, search or scientific identities. No product resource
controls, adaptive limits or certified deployment hardware are introduced.

## Starting baseline

2026-10-04: branch `main`, HEAD `c48ef63c9ce064a72058e2b72c3cd095c7deb904`, VERSION
`0.11.0`; tracked diff empty. Existing untracked RF budget/admission study reports
and both script directories were preserved. Backend tests, race tests and vet;
frontend 423 tests, lint and build passed before implementation. Build retained
its existing large-chunk warning.

## Discovery and schema

`backend-go/internal/resourceprofile` is independent of all RF packages. The
collector receives injectable file, runtime, host-memory and runtime-limit
providers. The retained `Profile` is serialized and immutable; `View()` returns
a deep copy. A startup integration module supplies actual normalized limiter and
experiment settings plus already-loaded dataset metadata.

Schema version 1 has `mode`, `environment` and its evidence, `cgroup_version`,
`constraint_visibility`, `cpu`, `memory`, `runtime`, `rf_policy`, `experiments`,
`dataset`, `diagnostic_fingerprint`, and bounded `warnings`. Resource signals
contain `state`, nullable `value` and `sources`; `unknown_sources` preserves
incomplete evidence even when another source supplies a known upper bound. States are `known`, `unlimited`,
`absent` or `unknown`. No host memory size is invented on unsupported platforms.
Unavailable dataset counts are null; dataset state gates their interpretation. All measured captures have a known dataset.

| Signal | Source / meaning |
|---|---|
| Visible logical CPUs | `runtime.NumCPU()`; process-visible CPU inventory, not an assertion about physical host CPUs |
| Scheduler capacity | `runtime.GOMAXPROCS(0)`; observation only |
| Linux CPU quota | Resolve `/proc/self/cgroup` through `/proc/self/mountinfo`; v2 `cpu.max`, v1 `cpu.cfs_quota_us` / `cpu.cfs_period_us` |
| Cpuset | v2 `cpuset.cpus.effective`; v1 `cpuset.effective_cpus`, falling back to the nearest nonempty inherited `cpuset.cpus` |
| Darwin physical memory | `golang.org/x/sys/unix.SysctlUint64("hw.memsize")` |
| Linux host/VM memory | `/proc/meminfo` `MemTotal` and `MemAvailable`, strict kB units |
| Darwin available memory | Unknown; free/inactive pages are not treated as a trustworthy available-memory promise |
| Linux hard memory ceiling | v2 `memory.max`; v1 `memory.limit_in_bytes` |
| Soft memory threshold | v2 `memory.high`; v1 `memory.soft_limit_in_bytes`, whose semantics differ from v2 high |
| Current cgroup usage | v2 `memory.current`; v1 `memory.usage_in_bytes` (legacy approximate accounting) |
| Runtime constraints | Go version, OS/arch, read-only `runtime/metrics` GOMEMLIMIT and GOGC values |
| RF/experiment settings | Constructed limiter, deadline, generated Cell cap, normalized experiment manager |
| Dataset | Validated manifest ID/version/file SHA256; index length, inventory cell count, cached polygon vertex count |

No discovery shells out. Linux cgroup mount roots, mount escapes, nonstandard
mount locations, visible ancestors and hybrid v1/v2 controllers are handled.
Controller state does not establish whether Linux is a container: environment
remains `unknown`. Darwin reports `native`. No Docker marker-file heuristic is
used. External calibration evidence separately identifies Docker containers.
Native Linux is supported through the same sources but was not available as a
separate physical host for this run. V1/hybrid behavior is fixture-tested; actual
containers use v2.

## Descriptive formulas and unlimited values

CPU capacity is the minimum of known positive runtime-visible logical CPUs,
GOMAXPROCS, quota/period cores, and effective cpuset count. Fractions are retained,
including sub-core quotas; there is no ceil/floor and no scheduler mutation. CPU
quota considers minima over visible ancestors. Leaf quota and period remain
separate, so the profile preserves the original units even when an ancestor binds.

Memory ceiling is `min(known host/VM total, known visible cgroup hard limits)`.
When only one is known, that source provides an observed upper bound. Available
host memory, current cgroup usage, high/soft thresholds and Go's soft memory limit
are separate; none is subtracted to create an allocation or admission promise.
Each aggregate retains all source provenance. A valid upper bound can coexist
with an unreadable ancestor: the bounded warning and unknown individual evidence
are retained; it is not a guarantee that all constraints were discovered.

V2 `max` and v1 CPU `-1` mean unlimited at that visible scope. V1 memory's
PAGE_COUNTER_MAX values near signed 64-bit maximum (and the legacy 32-bit page
sentinel) are unlimited, never giant usable allocations. Missing files are absent;
unreadable/malformed files are unknown. Unlimited cgroup memory with known host
memory is host-bounded. Unknown host and cgroup memory stays unknown.

The cgroup namespace may hide stricter ancestors. `constraint_visibility` is
explicitly `visible_hierarchy_only`; even a complete visible snapshot cannot
promise exclusive CPUs or RAM. Ancestor memory in v1 is a conservative observed
minimum, with enforcement dependent on the hierarchy's configured semantics.
No automatic detection value is used for RF admission.

Go itself has container-aware GOMAXPROCS defaults and may update them. This code
only reads the current value. See [Go's runtime change](https://go.dev/doc/go1.25),
[the kernel v2 interfaces](https://docs.kernel.org/admin-guide/cgroup-v2.html), and
[legacy memory semantics](https://docs.kernel.org/admin-guide/cgroup-v1/memory.html).

## Collection, identity and diagnostics

Collection happens once after dataset and normalized configuration initialization,
before serving HTTP. No request-time OS reads or polling loop is introduced.
`VertexCount()` is cached during the existing index insertion loop and accessed
in O(1); dataset file hashes are reused from the validated manifest. Counts describe
the indexed geometry, including separate footprint parts, not just GeoJSON features.
The profile describes the startup dataset. A dataset switch builds fresh cheap
index metadata, but does not retroactively mutate the retained startup profile.

SHA256 of canonical JSON provides a diagnostic fingerprint of static resources,
runtime version, dataset identity/complexity and effective configured policy.
Dynamic host availability, current usage and warning text are excluded. Provenance
and visibility are included. It is not a portable machine identity and never
enters RF request fingerprints, Scenario, Version, Run, optimizer results, experiment
scientific hashes or project documents.

One concise structured startup log reports mode, environment, visible CPUs,
GOMAXPROCS, quota state/value, observed CPU/memory ceiling, RF slots, workers,
footprints, diagnostic fingerprint and bounded warnings. No IP, credentials,
location, project content or map payload is included. Resource metadata is not
added to `/healthz`, `/readyz`, `/api/meta`, any other public API, or the UI.

Developers can run `cd backend-go && go run . --resource-profile` or
`docker exec <container> ./server --resource-profile`. This local one-shot loads
the initial dataset and emits full JSON without opening a listener. It is a fresh
observation under the same configuration, not remote inspection of another
process's switched dataset. Use startup logs for the actual startup snapshot.
The command adds no resource configuration mode. Treat local logs/reports as
infrastructure diagnostics rather than publishable capacity promises.

Detection failure does not block server startup: unavailable signals stay unknown
and warnings are bounded to twelve fixed messages. Current fixed safety policy
continues unchanged. Deliberately unsupported available-memory estimates are
unknown without pretending an error or replacing them with free pages.

## Calibration

Measured on 2026-10-04 in a 10-CPU Linux arm64 development VM with 11.735 GiB host/VM RAM. Native development capture: 10 visible CPUs, GOMAXPROCS 10, 24 GiB, darwin/arm64, Go go1.27.1. Container image uses Go 1.26.6. Native available memory is unknown. CPU model recorded in the prior study is Apple M4; this profile independently records visible/scheduler counts rather than guessing model-specific capacity. None of these is production capacity certification.

Requested and actually tested: A 2 CPU/4 GiB; B 4 CPU/8 GiB; C 8 CPU/10 GiB; default with no explicit quota/limit. C uses 10 GiB because the actual VM cannot provide 16 GiB; the configured ceiling leaves VM capacity outside it but reserves no memory. Profiles ran sequentially. The existing `atom-app` was preserved. Dockerfile defaults were used unchanged, without published calibration ports.

| Profile | Visible / GOMAXPROCS | Quota | Hard cgroup limit | Effective ceiling | Detection |
|---|---:|---:|---:|---:|---|
| A-2CPU-4GiB | 10 / 2 | 2 | 4.0 GiB | 4.000 GiB | exact; startup fingerprint matches local diagnostic |
| B-4CPU-8GiB | 10 / 4 | 4 | 8.0 GiB | 8.000 GiB | exact; startup fingerprint matches local diagnostic |
| C-8CPU-10GiB | 10 / 8 | 8 | 10.0 GiB | 10.000 GiB | exact; startup fingerprint matches local diagnostic |
| default | 10 / 10 | unlimited | unlimited | 11.735 GiB | exact; startup fingerprint matches local diagnostic |

All profiles load `ankara-open-planning` version `2026.07`: 161,784 footprints, 451 inventory Cells, 936,651 polygon vertices, and the same validated file hashes. Dataset SHA256 values and full source-provenance snapshots are in the JSON report. Cgroup v2 high is unlimited in these default configurations. Normal Compose diagnostics match the default matrix fingerprint. An additional actual 1.5-core quota, one-CPU cpuset, 2 GiB container correctly reports quota 1.5, cpuset 1 and observed capacity 1, with unchanged RF/experiment policy and dataset metadata. No-quota default is host/VM-bounded, never infinite or a sentinel allocation.

### Same workload and method

The six inventory Cell IDs are 9664800, 26390, 9664790, 9664795, 9664791 and 9664794. Existing frontend payload builders provide 120 rays, 400 m, 2.6 GHz and 28 GHz, unchanged default search and normal dataset. Evaluate and Optimize include six resulting maps; Optimize maps use returned azimuths. Repeat is Evaluate+maps → Interference → Evaluate+maps (15 attempts). Concurrent optimizers use two real socket client identities. Async overlap uses 16 normal azimuth runs with default workers=1; jobs were observed running, completed uncached, and actual timestamp overlap was measured.

Real production HTTP is exercised by a separate standard-library Go client inside the container. A 100 ms sampler separates `/proc/1/status` RSS from cgroup `memory.current`. Process CPU uses `/proc/1/stat` ticks at USER_HZ=100. Cgroup CPU/throttle deltas include probe overhead. Peaks/HWM are cumulative container/process lifetime values; cgroup lifetime peak includes startup and the one-shot diagnostic subprocess. Short memory spikes can escape sampling. No test/build jobs overlapped the final matrix, but the development host/VM was shared and not isolated from external activity.

One pass per profile/frequency; no percentile, minimum hardware guarantee or stable numeric threshold follows. A preliminary interrupted harness pass contributed no published timings. Workflow order and warm caches/GC can affect comparisons.

### Workflow performance curves

Seconds unless otherwise stated; RSS/current are sampled maxima in MiB. Headroom is 60 minus the slowest individual HTTP request, including transfer. Bundle wall is not a computation deadline. CPU is application / cgroup; throttle is cgroup accumulated throttled time, not a direct scalar slowdown.

| Profile | GHz | Workflow | Wall | CPU app / group | Throttle | RSS / current MiB | Min request headroom | Bytes |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| A-2CPU-4GiB | 2.6 | evaluate_maps | 1.240 | 1.840 / 1.890 | 0.019 | 933.7 / 1043.8 | 59.151 | 40365391 |
| A-2CPU-4GiB | 2.6 | optimize_maps | 18.994 | 30.560 / 30.754 | 0.101 | 1105.8 / 1216.7 | 41.688 | 40821192 |
| A-2CPU-4GiB | 2.6 | interference | 0.090 | 0.090 / 0.105 | 0.000 | 1015.3 / 1129.4 | 59.914 | 4698126 |
| A-2CPU-4GiB | 2.6 | evaluate_interference_reevaluate | 3.810 | 5.610 / 5.771 | 0.027 | 1050.7 / 1162.5 | 58.383 | 85428908 |
| A-2CPU-4GiB | 2.6 | two_distinct_optimizers | 27.049 | 53.780 / 53.918 | 0.285 | 1225.7 / 1376.4 | 32.952 | 196360 |
| A-2CPU-4GiB | 2.6 | async_plus_evaluate-network | 2.363 | 4.660 / 4.694 | 0.033 | 1228.1 / 1355.5 | 57.788 | 29628 |
| A-2CPU-4GiB | 2.6 | async_plus_optimize-network | 15.060 | 25.270 / 25.419 | 0.143 | 1199.8 / 1330.0 | 44.961 | 98724 |
| A-2CPU-4GiB | 2.6 | cancel_optimizer_release | 0.992 | 1.030 / 1.041 | 0.000 | 1015.0 / 1142.7 | 59.363 | 29084 |
| A-2CPU-4GiB | 28 | evaluate_maps | 0.765 | 1.130 / 1.145 | 0.000 | 1015.0 / 1026.2 | 59.423 | 13894505 |
| A-2CPU-4GiB | 28 | optimize_maps | 11.114 | 17.540 / 17.585 | 0.016 | 1038.1 / 1076.5 | 49.104 | 14475747 |
| A-2CPU-4GiB | 28 | interference | 0.058 | 0.070 / 0.079 | 0.000 | 1038.1 / 1081.2 | 59.944 | 4667640 |
| A-2CPU-4GiB | 28 | evaluate_interference_reevaluate | 1.797 | 2.660 / 2.716 | 0.000 | 1038.1 / 1081.2 | 59.255 | 32456650 |
| A-2CPU-4GiB | 28 | two_distinct_optimizers | 29.285 | 58.330 / 58.497 | 0.242 | 1237.5 / 1297.6 | 30.715 | 196324 |
| A-2CPU-4GiB | 28 | async_plus_evaluate-network | 1.505 | 2.880 / 2.888 | 0.010 | 1239.1 / 1299.7 | 58.505 | 29588 |
| A-2CPU-4GiB | 28 | async_plus_optimize-network | 17.742 | 28.940 / 29.038 | 0.020 | 1239.1 / 1299.7 | 42.266 | 98705 |
| A-2CPU-4GiB | 28 | cancel_optimizer_release | 1.111 | 1.220 / 1.237 | 0.000 | 1080.6 / 1146.7 | 59.246 | 29046 |
| B-4CPU-8GiB | 2.6 | evaluate_maps | 0.921 | 1.590 / 1.661 | 0.000 | 892.0 / 1060.4 | 59.333 | 40365391 |
| B-4CPU-8GiB | 2.6 | optimize_maps | 13.426 | 26.830 / 26.944 | 0.000 | 956.5 / 1137.1 | 46.902 | 40821192 |
| B-4CPU-8GiB | 2.6 | interference | 0.071 | 0.080 / 0.083 | 0.000 | 961.0 / 1137.1 | 59.932 | 4698126 |
| B-4CPU-8GiB | 2.6 | evaluate_interference_reevaluate | 2.130 | 3.880 / 3.992 | 0.000 | 961.2 / 1179.6 | 59.212 | 85428908 |
| B-4CPU-8GiB | 2.6 | two_distinct_optimizers | 17.771 | 59.410 / 59.507 | 0.021 | 1127.9 / 1347.5 | 42.229 | 196360 |
| B-4CPU-8GiB | 2.6 | async_plus_evaluate-network | 1.124 | 3.300 / 3.306 | 0.000 | 1104.9 / 1326.8 | 58.881 | 29628 |
| B-4CPU-8GiB | 2.6 | async_plus_optimize-network | 12.201 | 25.490 / 25.539 | 0.000 | 1080.3 / 1303.0 | 47.800 | 98724 |
| B-4CPU-8GiB | 2.6 | cancel_optimizer_release | 1.031 | 1.180 / 1.181 | 0.000 | 904.8 / 1017.0 | 59.325 | 29084 |
| B-4CPU-8GiB | 28 | evaluate_maps | 0.833 | 1.520 / 1.551 | 0.000 | 905.1 / 927.0 | 59.324 | 13894505 |
| B-4CPU-8GiB | 28 | optimize_maps | 11.506 | 22.180 / 22.261 | 0.000 | 904.2 / 927.0 | 48.673 | 14475747 |
| B-4CPU-8GiB | 28 | interference | 0.074 | 0.130 / 0.137 | 0.000 | 912.4 / 945.1 | 59.929 | 4667640 |
| B-4CPU-8GiB | 28 | evaluate_interference_reevaluate | 1.892 | 3.380 / 3.457 | 0.000 | 916.1 / 947.4 | 59.263 | 32456650 |
| B-4CPU-8GiB | 28 | two_distinct_optimizers | 17.717 | 58.660 / 58.745 | 0.021 | 1120.0 / 1171.1 | 42.283 | 196324 |
| B-4CPU-8GiB | 28 | async_plus_evaluate-network | 1.056 | 2.870 / 2.872 | 0.000 | 1060.0 / 1111.6 | 58.947 | 29590 |
| B-4CPU-8GiB | 28 | async_plus_optimize-network | 12.522 | 25.180 / 25.263 | 0.000 | 1094.7 / 1146.8 | 47.480 | 98706 |
| B-4CPU-8GiB | 28 | cancel_optimizer_release | 1.115 | 1.560 / 1.570 | 0.000 | 884.4 / 949.0 | 59.244 | 29046 |
| C-8CPU-10GiB | 2.6 | evaluate_maps | 0.993 | 1.920 / 1.988 | 0.000 | 824.8 / 988.4 | 59.294 | 40365391 |
| C-8CPU-10GiB | 2.6 | optimize_maps | 12.274 | 27.550 / 27.643 | 0.000 | 893.1 / 1066.1 | 48.026 | 40821192 |
| C-8CPU-10GiB | 2.6 | interference | 0.098 | 0.420 / 0.432 | 0.000 | 909.6 / 1065.8 | 59.905 | 4698126 |
| C-8CPU-10GiB | 2.6 | evaluate_interference_reevaluate | 2.479 | 4.540 / 4.684 | 0.000 | 909.7 / 1127.0 | 59.069 | 85428908 |
| C-8CPU-10GiB | 2.6 | two_distinct_optimizers | 24.976 | 103.560 / 103.965 | 0.089 | 940.2 / 1160.4 | 35.025 | 196360 |
| C-8CPU-10GiB | 2.6 | async_plus_evaluate-network | 2.678 | 9.510 / 9.538 | 0.000 | 916.2 / 1046.9 | 57.334 | 29628 |
| C-8CPU-10GiB | 2.6 | async_plus_optimize-network | 26.166 | 70.680 / 71.047 | 0.004 | 976.1 / 1108.6 | 33.837 | 98724 |
| C-8CPU-10GiB | 2.6 | cancel_optimizer_release | 1.201 | 1.880 / 1.896 | 0.000 | 816.5 / 962.7 | 59.156 | 29084 |
| C-8CPU-10GiB | 28 | evaluate_maps | 1.236 | 2.440 / 2.483 | 0.000 | 814.4 / 844.1 | 58.989 | 13894505 |
| C-8CPU-10GiB | 28 | optimize_maps | 15.353 | 34.300 / 34.423 | 0.000 | 834.3 / 879.7 | 44.926 | 14475747 |
| C-8CPU-10GiB | 28 | interference | 0.131 | 0.570 / 0.582 | 0.000 | 851.0 / 895.6 | 59.874 | 4667640 |
| C-8CPU-10GiB | 28 | evaluate_interference_reevaluate | 3.163 | 6.210 / 6.330 | 0.000 | 851.0 / 913.1 | 58.744 | 32456650 |
| C-8CPU-10GiB | 28 | two_distinct_optimizers | 18.243 | 73.610 / 73.718 | 0.000 | 874.0 / 938.9 | 41.757 | 196324 |
| C-8CPU-10GiB | 28 | async_plus_evaluate-network | 1.054 | 3.600 / 3.601 | 0.000 | 888.3 / 953.2 | 58.950 | 29589 |
| C-8CPU-10GiB | 28 | async_plus_optimize-network | 14.202 | 33.680 / 33.816 | 0.000 | 936.6 / 1004.7 | 45.801 | 98706 |
| C-8CPU-10GiB | 28 | cancel_optimizer_release | 1.266 | 1.980 / 1.990 | 0.000 | 788.5 / 856.7 | 59.089 | 29046 |
| default | 2.6 | evaluate_maps | 1.364 | 2.630 / 2.691 | 0.000 | 853.8 / 1024.5 | 58.975 | 40365391 |
| default | 2.6 | optimize_maps | 14.465 | 32.440 / 32.587 | 0.000 | 870.3 / 1035.7 | 45.822 | 40821192 |
| default | 2.6 | interference | 0.166 | 0.170 / 0.192 | 0.000 | 886.8 / 1057.0 | 59.837 | 4698126 |
| default | 2.6 | evaluate_interference_reevaluate | 2.938 | 6.330 / 6.476 | 0.000 | 886.8 / 1096.9 | 58.739 | 85428908 |
| default | 2.6 | two_distinct_optimizers | 16.962 | 69.140 / 69.219 | 0.000 | 924.2 / 1140.3 | 43.038 | 196360 |
| default | 2.6 | async_plus_evaluate-network | 1.071 | 3.740 / 3.755 | 0.000 | 855.9 / 990.5 | 58.935 | 29628 |
| default | 2.6 | async_plus_optimize-network | 12.190 | 29.060 / 29.101 | 0.000 | 878.4 / 1012.8 | 47.816 | 98724 |
| default | 2.6 | cancel_optimizer_release | 1.076 | 1.330 / 1.326 | 0.000 | 831.7 / 966.6 | 59.280 | 29084 |
| default | 28 | evaluate_maps | 0.925 | 1.850 / 1.884 | 0.000 | 840.7 / 868.7 | 59.253 | 13894505 |
| default | 28 | optimize_maps | 13.214 | 28.820 / 28.977 | 0.000 | 848.2 / 877.2 | 47.063 | 14475747 |
| default | 28 | interference | 0.089 | 0.090 / 0.105 | 0.000 | 859.3 / 896.1 | 59.914 | 4667640 |
| default | 28 | evaluate_interference_reevaluate | 2.927 | 5.370 / 5.448 | 0.000 | 868.2 / 919.1 | 58.578 | 32456650 |
| default | 28 | two_distinct_optimizers | 16.022 | 64.100 / 64.172 | 0.000 | 878.2 / 941.6 | 43.978 | 196324 |
| default | 28 | async_plus_evaluate-network | 1.092 | 3.440 / 3.449 | 0.000 | 909.0 / 971.1 | 58.912 | 29590 |
| default | 28 | async_plus_optimize-network | 11.564 | 26.320 / 26.385 | 0.000 | 887.4 / 953.3 | 48.441 | 98706 |
| default | 28 | cancel_optimizer_release | 0.987 | 1.210 / 1.209 | 0.000 | 844.4 / 910.8 | 59.368 | 29046 |

All ordinary RF HTTP requests succeeded (200); async starts returned 202 and jobs finished `succeeded`, 16/16 runs, without cache hits. No RF deadline failure, memory OOM event or OOM kill occurred. Cancellation intentionally produces client status 0 (disconnected); every following same-client Evaluate returned 200, preserving slot release and attempt charging. Scientific RF response hashes match across all profiles, repeat workflows, concurrent optimizers, async contention and cancellation follow-up.

### CPU and concurrency headroom

| Profile | GHz | Operation | Avg equivalent cores | Throttled periods / periods | Two-optimizer wall inflation |
|---|---:|---|---:|---:|---:|
| A-2CPU-4GiB | 2.6 | optimize_maps | 1.619 | 19 / 190 | — |
| A-2CPU-4GiB | 2.6 | two_distinct_optimizers | 1.993 | 143 / 271 | 1.477x |
| A-2CPU-4GiB | 28 | optimize_maps | 1.582 | 6 / 111 | — |
| A-2CPU-4GiB | 28 | two_distinct_optimizers | 1.998 | 170 / 293 | 2.688x |
| B-4CPU-8GiB | 2.6 | optimize_maps | 2.007 | 0 / 134 | — |
| B-4CPU-8GiB | 2.6 | two_distinct_optimizers | 3.349 | 4 / 178 | 1.357x |
| B-4CPU-8GiB | 28 | optimize_maps | 1.935 | 0 / 115 | — |
| B-4CPU-8GiB | 28 | two_distinct_optimizers | 3.316 | 11 / 177 | 1.564x |
| C-8CPU-10GiB | 2.6 | optimize_maps | 2.252 | 0 / 123 | — |
| C-8CPU-10GiB | 2.6 | two_distinct_optimizers | 4.163 | 2 / 249 | 2.086x |
| C-8CPU-10GiB | 28 | optimize_maps | 2.242 | 0 / 153 | — |
| C-8CPU-10GiB | 28 | two_distinct_optimizers | 4.041 | 0 / 183 | 1.210x |
| default | 2.6 | optimize_maps | 2.253 | 0 / 0 | — |
| default | 2.6 | two_distinct_optimizers | 4.081 | 0 / 0 | 1.196x |
| default | 28 | optimize_maps | 2.193 | 0 / 0 | — |
| default | 28 | two_distinct_optimizers | 4.005 | 0 / 0 | 1.238x |

Quota is a CPU-time upper bound; average equivalent cores do not measure exclusive remaining cores. Increasing quota does not produce a stable linear performance curve. Search work, existing parallelism, GC, frequency-dependent path viability and shared VM/host activity matter. Compare request headroom and throttle evidence independently.

### Memory headroom

| Profile | Effective ceiling GiB | Max sampled RSS MiB | Max sampled cgroup MiB | Lifetime cgroup peak MiB | Ceiling − sampled / lifetime peak GiB |
|---|---:|---:|---:|---:|---:|
| A-2CPU-4GiB | 4.000 | 1239.1 | 1376.4 | 1376.4 | 2.656 / 2.656 |
| B-4CPU-8GiB | 8.000 | 1127.9 | 1347.5 | 1347.5 | 6.684 / 6.684 |
| C-8CPU-10GiB | 10.000 | 976.1 | 1160.4 | 1160.4 | 8.867 / 8.867 |
| default | 11.735 | 924.2 | 1140.3 | 1140.3 | 10.621 / 10.621 |

These subtractions are descriptive measured margins, not safe allocatable RAM. Cgroup accounting includes file cache and kernel/container charges beyond process RSS. Host-bounded default shares memory with other processes/containers. Missing margins include browser/frontend memory, OS/VM overhead, dataset switches, retained async snapshots/caches/queue, larger or simultaneous requests, GC variability and unmeasured peak transients. Staying below OOM does not certify any profile.

### Async contention

| Profile | GHz | Interactive operation | Interactive wall | Experiment wall | Actual overlap | Interactive inflation |
|---|---:|---|---:|---:|---:|---:|
| A-2CPU-4GiB | 2.6 | async_plus_evaluate-network | 2.212 | 2.336 | 2.212 | 2.606x |
| A-2CPU-4GiB | 2.6 | async_plus_optimize-network | 15.039 | 2.594 | 2.576 | 0.821x |
| A-2CPU-4GiB | 28 | async_plus_evaluate-network | 1.495 | 1.384 | 1.376 | 2.592x |
| A-2CPU-4GiB | 28 | async_plus_optimize-network | 17.734 | 1.414 | 1.408 | 1.628x |
| B-4CPU-8GiB | 2.6 | async_plus_evaluate-network | 1.119 | 0.885 | 0.882 | 1.679x |
| B-4CPU-8GiB | 2.6 | async_plus_optimize-network | 12.200 | 0.855 | 0.855 | 0.931x |
| B-4CPU-8GiB | 28 | async_plus_evaluate-network | 1.053 | 0.701 | 0.699 | 1.557x |
| B-4CPU-8GiB | 28 | async_plus_optimize-network | 12.520 | 0.704 | 0.703 | 1.105x |
| C-8CPU-10GiB | 2.6 | async_plus_evaluate-network | 2.666 | 1.996 | 1.989 | 3.776x |
| C-8CPU-10GiB | 2.6 | async_plus_optimize-network | 26.163 | 1.386 | 1.384 | 2.185x |
| C-8CPU-10GiB | 28 | async_plus_evaluate-network | 1.050 | 0.621 | 0.619 | 1.039x |
| C-8CPU-10GiB | 28 | async_plus_optimize-network | 14.199 | 0.783 | 0.783 | 0.942x |
| default | 2.6 | async_plus_evaluate-network | 1.065 | 0.814 | 0.809 | 1.039x |
| default | 2.6 | async_plus_optimize-network | 12.184 | 0.815 | 0.810 | 0.859x |
| default | 28 | async_plus_evaluate-network | 1.088 | 0.550 | 0.549 | 1.456x |
| default | 28 | async_plus_optimize-network | 11.559 | 0.635 | 0.631 | 0.893x |

### Future derivation decision

| Proposed derivation | Finding |
|---|---|
| Safe interactive concurrency | Feasible after more repeated calibration across dataset/local geometry, operation/search settings and mixed-load tails; no certified value here |
| Experiment worker count | Feasible after more queue, retained-job/cache and overlap measurements; leave workers=1 |
| Compute reservation capacity | Feasible after bounded geometry-aware workload-cost calibration; CPU count alone cannot predict request cost |
| Memory reservation capacity | Feasible after transient allocation/GC, retained snapshots and mixed-load high-water calibration; no promise from limit minus sampled RSS |
| Response-byte envelope | Not predictable from CPU/RAM alone; depends on geometry, rays, grids/output form and independent network/transfer capacity |

CPU/RAM detection alone is insufficient. Different operations and frequencies have materially different cost under the same resources and dataset. Response hashes/bytes remain stable across hardware profiles while execution times change. Global footprint/vertex counts are useful dataset context but cannot quantify local density. Future decisions need hardware plus dataset/geometry complexity and operation parameters. This calibration held geometry and dataset fixed; it does not measure cross-dataset density scaling. This single dataset does not establish a stable dataset complexity class or descriptive Auto classes; none are created.

### Validation, freeze and next action

The JSON report contains a complete 28-file change manifest; prior untracked study files were preserved. Backend full tests, race tests and vet pass; new discovery/immutability/configuration tests pass. Frontend 423/423 tests (two workers), lint and production build pass. Real budget and deadline E2Es pass on separate fresh servers, including the existing optimizer golden response hash. Combined E2Es initially shared a budget; a heavy parallel test/build run caused frontend timing failures. Clean reruns passed without changing frontend tests or behavior. Documentation build and validation pass (48 HTML pages, 41 API paths); version consistency and diff whitespace checks pass. Python docs validation uses PyYAML in a disposable local venv; existing Vite/pandoc warnings persist.

Security review: no new public diagnostic route, browser data, raw client identity in the profile, credentials, user location, project or map payload logging. Existing health/meta contracts remain unchanged. Scenario/Version/Run/project scientific identity paths were untouched and their existing frontend/backend tests pass. RF defaults remain 20/60 s anchored ClientIP attempts, slots 2/1, deadline 60 s, Cell cap 6; experiment workers 1, queue 16 and max runs 64 remain unchanged.

Deployment docs explain observation and local diagnostics without scaling or hardware guarantees. VERSION stays 0.11.0; recommend no immediate release for this internal foundation, with its developer-facing diagnostics recorded under Unreleased. The observational foundation can freeze: all final gates passed. Adaptive admission, resource tokens, reservations, classes and product controls remain out of scope.

**Single next action:** repeat deployment-target calibration across geometry densities, dataset complexity and mixed-load tails before designing any admission derivation.

Reproduce with the [calibration harness](../scripts/auto-resource-profile/README.md); full profile provenance, external limits, raw metrics and response hashes are in [the JSON report](./auto-resource-profile-calibration.json).
