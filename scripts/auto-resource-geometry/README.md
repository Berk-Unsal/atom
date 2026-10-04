# Geometry Density & Mixed-Load Envelope audit

Explicit calibration only. No production files are modified. The prior foundation,
profile calibration and admission studies remain frozen.

Prerequisites: Docker development VM with >=4 CPUs and >=9 GiB, Go, Node, Python.
Use the unchanged normal image `atom:auto-profile-calibration` (build with the
repository Dockerfile if absent). The measured backend is a Linux/arm64 Go test
binary compiled with the local Go toolchain, recorded by Auto; the image supplies
its unchanged user/container defaults. This is instrumented Gin/httptest execution,
not a browser/network throughput test.

From the repository root:

```sh
python3 scripts/auto-resource-geometry/prepare.py --run
# Choose public planning domains before collecting RF timings.
docker run --rm --name atom-geometry-selection \
  -v /tmp/atom-resource-geometry:/study \
  -v "$PWD/data-pipeline:/study/data-pipeline:ro" \
  -w /study/backend-go -e ATOM_GEOMETRY_STUDY=1 \
  -e ATOM_GEOMETRY_DIR=/study/geometry \
  --entrypoint /study/geometry.test atom:auto-profile-calibration \
  -test.run '^TestGeometryDomainSelection$' -test.v
node scripts/auto-resource-geometry/fixtures.mjs /tmp/atom-resource-geometry/geometry
python3 scripts/auto-resource-geometry/plans.py
python3 scripts/auto-resource-geometry/run.py --run
python3 scripts/auto-resource-geometry/supplement.py --run
python3 scripts/auto-resource-geometry/analyze.py --supplement-workdir /tmp/atom-resource-geometry-supplement
python3 scripts/auto-resource-geometry/report.py
python3 -m unittest discover -s scripts/auto-resource-geometry -p 'test_*.py'
```

Use a fresh dedicated `/tmp/atom-resource-*` directory for a full rerun. Existing
measurement JSONL files are exclusive-created, never overwritten or silently
resumed. Profile containers are sequential, do not publish ports, refuse existing
names, and only remove containers created by the invocation. The existing app is
preserved. Preparation recreates only its disposable backend copy.

`prepare.py` reuses the previous study's explicit disposable-copy instrumentation
recipe, then generates this study's own test harness. Atomic counters instrument
spatial queries/candidates, rays, polygons and edges. The checkout's production
backend and policy remain untouched. RF middleware keeps 20 attempts/60s/ClientIP,
2 global /1 per-client slots, 60s deadlines, six Cells and experiments 1/16.

The matrix is fractional and predeclared in `plans.py`; ordinary canonical cases
repeat five times, expensive Optimize/Optimize+maps/Explain/Recommendation and
variants/mixed cases three. No workloads are reduced after measurements. Normal
and higher inputs come from the frontend builders at 30dBm/120 degrees. Surface
uses a documented fixed 25m grid; Recommendation selects five Cells (its supported
maximum) and searches the six-inventory-cell bounding polygon. Explain uses the
actual recommended solution; prerequisite optimization is outside its measured
interval. Returned optimized azimuths drive the Optimize+maps bundle.

The preflight stage loads the pack, then the RF stage reloads it in the same process; every RF interval starts after loading and a domain scan. Earlier stage heap may await GC. No forced GC or GOGC modification. First
measured and later runs characterize warmed process state, not cold OS cache.
Experiments reset completed test-manager cache/jobs consistently before each
mixed case, run uncached with 16 normal azimuth variants, and require actual
running status and timestamp overlap. They do not represent sustained background
optimization or a saturated queue. Results/coordinates remain in audit artifacts;
no raw client identity, payload, credentials or location is logged by this harness.

`analyze.py` fits each operation independently using grouped repeat medians.
Calibration-only leave-domain-out selection and margins precede held-out scoring.
The 180-ray/600m setting is never fit, even on calibration locations. Response,
spatial work, allocations and sampled RSS are separate targets. Reports retain
raw measurements and formulas; summaries are finite sample statistics, not
percentiles or production guarantees. See the report for caveats, numeric gate,
rejected bands and future readiness.

A 24-case fresh D-process supplement measures the held180-ray/600m setting for
Evaluate+maps, Optimize+maps, Explain and Azimuth on the sparse/dense held-out
locations. The analyzer requires the same Auto fingerprint and records stage
provenance. These observations never change training fits or margins.
