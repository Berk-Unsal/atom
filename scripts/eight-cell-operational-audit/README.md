# Eight-Cell operational and request-budget audit

This is audit-only tooling. The shipping network cap stays six. The disposable
backend copy changes only `raytracer.MaxNetworkTowers` to eight; the production
Dockerfile, compiler, RF code, middleware, budgets, deadlines, workers and queue
remain unchanged. Audit data is not a production-cap promotion.

## This run's preregistration defect

The initial RF budget/deadline Playwright commands exited zero but skipped their
gated tests because `ATOM_REAL_E2E=1` was missing. The frozen preflight incorrectly
accepted command exit status alone. `methodology-defect.json` records the original
logs, hashes and qualification consequence. The final real E2Es do **not** repair
the missing pre-measurement validation retrospectively. This run's final formal
classification must remain **D — INVALID / INSUFFICIENT**, even if every measured
operational gate and budget mechanism passes. All locked groups are completed;
none is replaced, dropped or averaged out. Previously published W1 evidence is
preserved unchanged.

The corrected `checks.py` explicitly enables the real E2Es and rejects skipped
required tests. `preflight.py` independently checks actual baseline execution.
These changes repair future quality tooling; they do not rewrite this run's lock.

## Recorded sequence

From the repository root, the original preparation sequence was:

```sh
python3 scripts/eight-cell-operational-audit/checks.py baseline
python3 scripts/eight-cell-operational-audit/build.py
node scripts/eight-cell-operational-audit/layouts.mjs /tmp/atom-eight-cell-operational-audit
```

Run the metadata-only geometry tool from `backend-go`:

```sh
go run ../scripts/eight-cell-operational-audit/geometry.go \
  /tmp/atom-eight-cell-operational-audit/layout-selection.json \
  ../data-pipeline /tmp/atom-eight-cell-operational-audit/layout-geometry.json
```

Then, from the repository root:

```sh
node scripts/network-capacity-audit/fixtures.mjs /tmp/atom-eight-cell-operational-audit/historical-original
node scripts/eight-cell-operational-audit/historical.mjs /tmp/atom-eight-cell-operational-audit
python3 -m unittest discover -s scripts/eight-cell-operational-audit -p 'test_*.py'
python3 scripts/eight-cell-operational-audit/freeze.py
python3 scripts/eight-cell-operational-audit/run.py
```

The historical generator also writes unused 10/12-Cell templates. **Only six/eight
fixtures enter the execution plan.** They provide no evidence for larger networks.

`caffeinate -i` starts before freeze and remains active through final validation.
The runtime launcher checks existing Auto observations and external Docker/cgroup
constraints before every batch. No CPU/GC/memory overrides are applied. The
external observer uses real loopback source IPs, streamed reads, process/cgroup
counters and Linux Gin completion logs. It imports the unchanged certified W1
producer from the preserved prior audit, with a pinned source hash in the lock.

After every locked group finishes, supplementary accounting and presentation run:

```sh
python3 scripts/eight-cell-operational-audit/cap_supplement.py
python3 scripts/eight-cell-operational-audit/accounting.py
python3 scripts/eight-cell-operational-audit/presentation.py
python3 scripts/eight-cell-operational-audit/report.py
python3 scripts/eight-cell-operational-audit/checks.py final
python3 scripts/eight-cell-operational-audit/evidence.py
python3 scripts/eight-cell-operational-audit/report.py
python3 scripts/eight-cell-operational-audit/completion_audit.py
```

Search accounting uses the existing opt-in collector in a separate test
executable, never in the primary shipping HTTP server. Its response hashes must
match the measured responses; its timings are not qualification evidence.
Presentation uses a disposable frontend copy and saved measured response replay.
The shipping frontend clamp and generated policy remain six. The v3 persistence
sample retains all eight result-bearing Cells while shipping selection restore
still clamps to six; this is bounded evidence, not general persistence certification.

The host `python3` lacks PyYAML. Final docs validation uses the existing docs venv
at `/tmp/atom-persistence-docs-venv/bin/python`, configurable through the audit-only
`ATOM_AUDIT_DOCS_PYTHON` setting. This does not affect either shipping binary.

## Reproduction and a future valid qualification

Do not rerun into the existing evidence directory, overwrite locks, restart a
nonterminal batch, or change frozen inputs. `run.py` fails closed on such attempts.
`protocol.verify()` checks every frozen input, fixture and prior published artifact.
The tracked manifest identifies raw files by SHA256, byte size, category and group;
the local archive is outside Git. Raw traces are not normal Git additions.

A valid successor requires a **new prospective audit**, preserving this directory
and its raw archive as invalid evidence. Use a fresh audit workspace and a new
evidence root, exact production source/dataset/toolchain, then run the corrected
baseline checks and `preflight.py` **before** creating any new lock or measuring RF.
Generate the same deterministic paired layouts and retain the same gates/repeats;
do not select replacements using this run's timings. Declare any new build identity
and source hashes prospectively. Neither this report nor final-test success permits
retroactive promotion of this run to A/B.

Permanent raw archival may separately use release assets, object storage or LFS.
No upload, release, product-cap change, limiter change or adaptive admission is
performed by this task.
