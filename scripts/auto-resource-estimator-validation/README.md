# Strict locked estimator validation

Validation-only tooling. No production estimator or admission code. The immutable
`validation-lock.json` imports exact candidate coefficients/features/transforms and
calibration-only margins from the prior JSON at its recorded Git commit.

The checked-in lock, manifest and run plans are the preregistration. Their SHA256
sidecars and exclusive-created prediction/results logs provide chronology evidence.
Do not rerun `freeze.py` or `plan.py` over an existing study. Do not refit, reselect,
replace bad cases, adjust settings/margins/gates, or reinterpret negative controls as
certified. All failures remain in the report. New studies require a new lock.

Reproduction uses the existing `atom:auto-profile-calibration` image and a dedicated
`/tmp/atom-resource-locked-validation` directory. `prepare.py` copies/instruments the
backend there and compiles a Linux arm64 test binary; production files are untouched.
`run.py --run` uses sequential disposable containers, verifies Auto before every
batch, and refuses existing log/result files or container names. No app port is
published, no existing container is replaced, no OS cache is evicted.

Primary requests run through a real `net/http` TCP listener and the production Gin
handlers, body/attempt/concurrency/deadline middleware, dataset runtime and experiment
manager. Real distinct loopback source IPs provide distinct clients with trusted
proxies disabled. Large responses use `io.Copy` into a hash; only small Optimize/job
responses are retained for prerequisites. Secondary recorder cases are explicitly
excluded from estimator verdicts. CPU/heap observation includes client/instrumentation;
network bytes mean uncompressed response entity bytes, not wire framing.

Predictions are synchronized and fsynced before each request executes. Every record
contains request hash, lock/manifest hashes and timestamp. `analyze.py` scores these
predictions without importing any fitting code. Main/fresh repeat completeness,
per-stratum gates, errors, failures and sustained overlap all remain visible.
Completed queue time series are preserved as deterministic gzip files in `evidence/`;
the report records both compressed and original SHA256 hashes. Archiving does not
change the measurement logs or validation contract.

Sustained scenarios submit eight uncached64-run jobs, refill up to the locked maximum
64 submissions, keep worker1/queue16, run interactive requests for30seconds (bounded
12 rounds with3second gaps), sample queues/jobs50ms, then cancel/drain. Separate
submission clients avoid sharing interactive per-client slots; no limiter is changed.
Mixed process CPU is observational aggregate, not individual compute pricing.

```sh
python3 -m unittest discover -s scripts/auto-resource-estimator-validation -p 'test_*.py'
python3 scripts/auto-resource-estimator-validation/run.py --run
python3 scripts/auto-resource-estimator-validation/analyze.py
python3 scripts/auto-resource-estimator-validation/report.py
```

The scripts are an audit protocol, not installed production functionality. The report
must classify incomplete or breached evidence as D and keep Auto observation-only.
Documentation validation requires PyYAML. Set `ATOM_DOCS_PYTHON` to a Python
environment containing it when running the final-check or finish scripts.
