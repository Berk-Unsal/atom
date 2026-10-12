# W1 shipping-runtime successor qualification

Strict W1 successor only. Preserve all previous study artifacts. No W2/W3 runs,
production edits, admission, estimators, UI settings or Cell cap changes.

The primary server is built by the unchanged production Dockerfile, with the
shipping Go 1.26.6 compiler and normal release flags. A separate Python observer
shares only its network/PID namespaces and reads its cgroup/proc files; observer
memory/CPU belong to a different cgroup. Distinct real 127/8 client source IPs
exercise the production ClientIP budget. No proxy header substitutes identity.

Before each batch, the shipping binary's existing --resource-profile command runs
inside the actual candidate container, then exits before any RF measurement.
The candidate's lifetime memory peak includes this extra diagnostic process.
The running server's normal Auto log is independently checked as well.

GODEBUG=gctrace=1 prospectively enables the standard shipping Go runtime's
observability output only. It does not tune GOGC/GOMEMLIMIT/GOMAXPROCS. External
parsing records GC-start/end/live heap sizes at GC events (MiB resolution), not a
continuously sampled HeapAlloc maximum. The unchanged kernel cgroup peak rule
remains the qualification memory gate. Exact shipping Go source documentation
for this flag is preserved in runtime-observation-documentation.json and
go126-runtime-extern.go.txt with its BSD license. This is architecture-independent
documentation from the cached Go1.26.6 source, not an alternate qualification binary.

The bounded sustained producer will maintain eight uncached active/queued jobs,
64 W1 RF runs per job, through *all* interactive responses. Its immutable cap is
1,024 submissions, not the historical 64. At each request launch it waits for an
uncached running job with completed work and at least half remaining, records
its progress, and validates the request's start against all final native job
execution timelines. Readiness is separate from the definitive activity proof. A queued job does not prove activity.
A non-scoring 180-second producer precheck on all four sparse/dense/frequency
settings at the largest bounded candidate, plus the historically fast sparse/A setting will precede the final lock. This tests
availability/progress and producer caps only; no qualification latency scores are
used to resize it. A failing precheck requires a new harness and lock before any
scoring run. All precheck observations are retained.

Single W1 uses five repeats per operation/profile/band/frequency, alternating the
same paired domains 3/2. Additional exact isolated Evaluate/Optimize references
have five repeats for the mixed sparse/dense settings. Mixed requests are blocked
until a machine-check validates their actual completed references. Three Latin
segments balance A/B/C. Full Optimize/explanation is one measured two-call
workflow; its prerequisite is not excluded.

All HTTP bodies stream to hashes; Building Entry additionally streams to a file
in the observer's filesystem. Canonicalization runs after the performance interval
on that saved evidence, removing only diagnostics.elapsed_ms and retaining every
numeric token, array order and other field. No extra buffered RF supplement.

Timing retains monotonic and UTC durations for requests and complete measured
groups, including inter-request gaps. Final-tail scheduling uses the actual first
request timestamp rather than an earlier setup timestamp. A difference >1 second is a locked
invalid-observation signal; the original entire group is preserved. No replacement
is planned: any such interruption makes the affected profile INVALID/INSUFFICIENT.
No performance failure is discarded or replaced. Sleep prevention starts before
all protocol checks and remains asserted until the terminal report is complete.

Completion witnesses read Docker’s Linux JSON logs directly through a read-only
mount; macOS bind-mount log lag cannot count as handler-release delay. The
pre-freeze smoke observation that exposed this lag is preserved separately.

Externally verified middleware completion and two simultaneous distinct-client
Evaluate probes establish that both global slots and per-client slots remain
usable. These probes are declared evidence, not hidden workload replacements.
Cancellation uses real TCP cancellation after 100 ms, subsequent same/other-client
requests, response budget headers, and server completion logs. Probe and main
request intervals remain separate and every required probe must also pass.

No positive reference is published until every immutable group and gate passes.

The preserved first producer-proof series exposed a stale job-ID handoff witness.
Before qualification freeze, readiness now reserves half a job and definitive
activity checks use the actual native interval covering request start. All five
proof cases were repeated prospectively. The v2 proof exposed a Docker log-rotation
race; both failed iterations and their exact source snapshots remain preserved.
All five final v3 proofs passed before the qualification contract froze; no scored
qualification or historical profile observation is replaced.

After terminal execution, completion_audit.py independently reconciles every
planned ledger row, actual container/process identity, isolated-reference timing,
per-request background intervals, scientific comparison and workflow budget
headers. Its verdict check permits negative observations as valid evidence while
rejecting a positive claim that contradicts a frozen gate. It archives and hashes
the raw observations and original failed proof iterations without replacement.
