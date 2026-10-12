# Auto profile calibration

Auto observes resources; this harness never changes RF policy or science. It uses
actual Docker CPU/memory limits and the current frontend payload builders for the
canonical six inventory cells at 2.6/28 GHz, 120 rays, 400 m. The production image
serves real HTTP. Separate loopback socket addresses provide distinct ClientIP
identities; no forwarded headers or admission overrides are used.

From the repository root:

```sh
docker build -t atom:auto-profile-calibration .
python3 scripts/auto-resource-profile/calibrate.py --run
python3 scripts/auto-resource-profile/integration.py --run
python3 scripts/auto-resource-profile/report.py
```

The finite matrix is 2 CPU/4 GiB, 4 CPU/8 GiB, 8 CPU/10 GiB and default/unbounded.
The script checks the VM can support that matrix. On smaller machines, adjust
and document the matrix rather than fabricate a profile. It needs Docker, Node,
Python, and Go. The default work directory is `/tmp/atom-auto-profile`.

No ports are published. Named disposable containers are removed in `finally`;
existing names fail without being replaced. The image is built from the normal
Dockerfile, with its unchanged admission, timeout, dataset and worker defaults.
The existing `atom-app` is preserved. Resource allocation limits do not reserve
physical VM memory; run profiles sequentially and keep unrelated load quiet.

`probe.go` is a standard-library HTTP client, copied into each running production
container. It samples process RSS and cgroup current usage every 100 ms, records
process CPU ticks and cgroup CPU/throttling deltas, cumulative memory peak, memory
events and response bytes. Linux arm64 process CPU uses USER_HZ=100. Cgroup CPU
includes probe/sampler overhead. RSS samples can miss short spikes; lifetime HWM
and cgroup peaks provide complementary cumulative evidence, not per-row peaks.

Every frequency runs Evaluate+six maps, Optimize+six optimized maps, Interference,
Evaluate→Interference→Evaluate with maps, two simultaneous default optimizers,
16-run normal experiment+Evaluate, 16-run experiment+Optimize and cancellation
followed by a same-client Evaluate. Each workflow uses a fresh actual client
identity so the anchored 20-attempt budget remains in effect. The probe waits for
an experiment to be running before issuing interactive work. Job status polling
uses the existing `/api/jobs/:jobID` route and is outside RF admission.

Each HTTP request retains the 60-second computation deadline. The sum of a
multi-request workflow is not a single deadline. Report headroom from the slowest
request, including HTTP transfer; do not subtract a bundle's wall time from 60.

`matrix.json` holds profiles, external Docker constraints and measurements.
Raw fixture payloads and detailed rows stay in the work directory.
`integration.py` additionally verifies normal Compose equivalence and a real
1.5-core quota with a one-CPU cpuset; it opens no listener and measures no
reduced RF workload. `report.py` publishes all four measured profiles plus the
native JSON capture into the two documentation artifacts. Capture native JSON
first with `cd backend-go && go run . --resource-profile > /tmp/atom-auto-profile/native.json`. The committed
report contains metadata and response hashes, not project/map payloads or raw
client identities. `--resource-profile` is a local one-shot server command that
loads the startup dataset and prints JSON without opening a listener. It does not
inspect a previously switched dataset in another running process. Startup logs
are authoritative for that process's collected startup snapshot.
