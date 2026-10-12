# Conservative fixed deployment certification

Internal evidence tooling only. No adaptive admission, resource UI, validation,
RF algorithm, persistence, fingerprint, Cell cap, or production limit changes.

The active immutable contract is `certification-lock.json`; the additional
`workflow-supplement-lock.json` measures the complete Optimize → explanation
workflow with the same inputs, gates and repetition method. The original bootstrap
contract and three stopped preliminary rows are preserved under `invalid-bootstrap/`
and are excluded from certification. Its Linux environment assumption and missing
pre-RF guard were corrected in a separately frozen successor, before successor RF
measurements. Numerical gates and workload plan were not relaxed.

The `science-supplement-lock.json` adds 156 science-only Building Entry requests
after raw-response auditing found `diagnostics.elapsed_ms`. It retains every
primary raw hash, removes only that field from complete JSON scientific identity,
and preserves numeric precision and array order. Supplementary body buffering is
excluded from primary performance/memory scoring. The original contract incorrectly
assumed RF responses had no runtime fields; this explicit methodological correction
does not change scientific values, inputs, repeats or headroom gates.

Primary measurements use a real TCP listener, original Gin handlers and RF
middleware, streamed `io.Copy`/SHA256 reads and the exact Ankara pack. Only small
Optimize/job responses are retained to build actual follow-up requests. The
production source is copied unchanged except for a test-copy atomic worker-entry
counter used to witness background computation and drain; all sampling/client
costs are included. No test-recorder results count as certification evidence.

Auto checks quota, cpuset, GOMAXPROCS, effective CPU, hard/effective memory,
runtime, dataset hashes/counts, workers/queue and RF policy **before RF execution**.
Auto deliberately reports Linux environment `unknown`; Docker image/HostConfig
inspection independently establishes container provenance before launch. Unknown
Auto evidence alone never establishes descriptive profile eligibility.

Main profile batches rotate A/B/C order in three segments. They characterize
warmed long-running services, with a fresh process per segment and separate fresh
first-Optimize cases. Startup/index time is separately recorded. No forced GC,
GOMAXPROCS override, cache eviction, algorithm tuning or early stopping is used.
The candidate containers publish no ports, use their own names, run sequentially,
and leave the existing application container intact. Memory swap equals the hard
memory limit for bounded profiles. The unbounded control cannot certify.

Five W1 repeats per operation/profile/band/frequency alternate two real domains
(three/two repeats); W2 has three, W3 has three on sparse/dense. Mixed scenarios
use the first sparse/dense domain at both frequencies, three repeats, after a
fail-closed guard verifies five exact isolated Evaluate/Optimize reference repeats.
Normal background jobs have 16 runs; sustained scenarios keep four uncached
64-run jobs active/queued with one worker, bounded by 64 submissions and a
30-second observation interval. Jobs are canceled/drained without manager/cache
resets. Queued submissions alone do not prove sustained computation.

## Commands

The checked-in locks and plans are the executed preregistration. Do not overwrite,
refit, replace failures, change gates, or rerun a completed batch. A new study
requires a new dedicated directory and contract. Preparation and freeze are
one-time commands for an entirely fresh study, not commands to run over these
checked-in results:

```sh
python3 scripts/fixed-deployment-profiles/prepare.py
python3 scripts/fixed-deployment-profiles/freeze.py
python3 scripts/fixed-deployment-profiles/workflow-supplement.py --freeze
python3 scripts/fixed-deployment-profiles/surface-supplement.py --freeze
python3 scripts/fixed-deployment-profiles/science-supplement.py --freeze
python3 -m unittest discover -s scripts/fixed-deployment-profiles -p 'test_*.py'
python3 scripts/fixed-deployment-profiles/run.py --run
python3 scripts/fixed-deployment-profiles/workflow-supplement.py --run
python3 scripts/fixed-deployment-profiles/surface-supplement.py --run
python3 scripts/fixed-deployment-profiles/science-supplement.py --run
python3 scripts/fixed-deployment-profiles/analyze.py
python3 scripts/fixed-deployment-profiles/report.py
```

The active run used `/tmp/atom-resource-fixed-certification` ,
`/tmp/atom-resource-fixed-explanation`, `/tmp/atom-resource-fixed-surface`
and `/tmp/atom-resource-fixed-science`; the invalid bootstrap work is retained at
`/tmp/atom-resource-fixed-certification-invalid-bootstrap`. The Linux arm64 binary
is compiled with the recorded local Go toolchain; the pinned image supplies its
unchanged runtime/user defaults. Source, fixtures, dataset files, plans, binary
and image are hashed. Completed raw ledgers, logs, Auto/startup snapshots and
async samples are preserved as deterministic gzip evidence. Report summaries
are finite observed ranges, not percentiles, memory reservations, hardware-only
capacity guarantees or general dataset-complexity ceilings.

Clock discontinuity audit retains both the monotonic duration and UTC timestamps.
The longer recorded interval scores the same frozen 45-second elapsed gate; no
interrupted repeat is replaced. Observed B/W2 and C/W1 discontinuities are
reported separately from intrinsic RF compute cost. A host idle-sleep assertion
was started after detection and lasts until the finisher exits. Its exact start
is in `idle-sleep-prevention.json`; it changes no workload/resource/production
settings and cannot override user-forced suspension.

The frozen Surface supplement incorrectly annotated the original 5 m negative
controls as HTTP 422. Production `ValidateCoverageSurfaceRequest` rejects below
10 m first, and its route returns HTTP 400. The raw body digest matches that
exact source error JSON. This assumption mismatch is retained as a methodology
violation; the lock and original outcomes are not rewritten or made to pass.
The separately frozen 10 m supplement remains a valid 90,601-cell edge probe.

The final `completion-audit.json` independently reconciles every measured row with
its immutable plan and fixture, verifies compressed/uncompressed evidence hashes,
and records all 52 numbered phases (0–51) and 65 required report items. Its
additional evidence preserves all 64 generated fixtures, runtime plans, environment
ledgers, supplement-copy audits and quality-command logs. Run this read-only audit
with `python3 scripts/fixed-deployment-profiles/completion_audit.py`; it neither
reruns measurements nor turns negative observations into certification.

Observed numerical gates are published separately from formal qualification.
A/B W1 single, every profile's concurrency and normal async, and all 18 fresh
requests passed the observed numerical gates. The negative-control status
annotation violation, sustained-overlap failures and C's interrupted W1 prevent
positive certification. No minimum/recommended deployment reference is published.
