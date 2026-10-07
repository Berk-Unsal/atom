# Eight-Cell clean successor audit

Production cap stays six. A disposable source copy changes only
`MaxNetworkTowers = 6` to eight. No production policy or persistence change.
The previous invalid audit directory, reports and raw evidence stay unchanged.

This successor reuses the prior domain manifest, all 36 fixture bytes and
837-group plan/order exactly. Do not run layout-selection tools to reselect Cells.
All operational and budget gates retain the prior lock's definitions.

Before the new lock, `checks.py baseline` runs ten quality commands. Both real
Playwright specs run with `ATOM_REAL_E2E=1 --reporter=json`. `e2e_guard.py`
requires the exact named test, desktop-1440 project, one discovered/executed/pass,
zero skips/failures, result start/duration, matching reporter totals, and recorded
opt-in. `preflight.py` revalidates the reporter artifact and SHA256. Failure stops
before freeze; exit zero alone cannot qualify. Regression fixtures reject skips,
zero discovered tests, missing opt-in, wrong names and failed results.

The frozen lock links these proofs, the baseline/source/runtime, unchanged gates,
exact domain/run-plan/fixture hashes, and all primary harness source hashes.
Every batch revalidates inputs and Profile A's CPU2/RAM4GiB shipping diagnostics.
The producer is the unchanged certified W1 implementation. No group replacement,
repeat reduction or early numerical stopping is allowed. Caffeinate prevents
host idle sleep; longer UTC/monotonic intervals score requests and groups.

Run commands from repository root in a **fresh** successor workspace:

```sh
python3 scripts/eight-cell-operational-successor/checks.py baseline
python3 scripts/eight-cell-operational-successor/preflight.py
python3 scripts/eight-cell-operational-successor/build.py
python3 -m unittest discover -s scripts/eight-cell-operational-successor -p 'test_*.py'
python3 scripts/eight-cell-operational-successor/freeze.py
python3 scripts/eight-cell-operational-successor/run.py
python3 scripts/eight-cell-operational-successor/cap_supplement.py
python3 scripts/eight-cell-operational-successor/accounting.py
python3 scripts/eight-cell-operational-successor/presentation.py
python3 scripts/eight-cell-operational-successor/evidence.py --index-only
python3 scripts/eight-cell-operational-successor/report.py
python3 scripts/eight-cell-operational-successor/checks.py final
python3 scripts/eight-cell-operational-successor/evidence.py
python3 scripts/eight-cell-operational-successor/report.py
python3 scripts/eight-cell-operational-successor/completion_audit.py
```

Existing workspaces/locks/archives are never overwritten. Preserve prior data and
use new names for another run. Raw evidence lives outside Git in
`/tmp/atom-eight-cell-operational-successor`, with a tracked hash/size/group index
and an independently verifiable compressed archive. Core timing uses real HTTP
and shipping binaries; supplementary search accounting uses a separate test
executable and is explicitly excluded from qualification timing. UI smoke replays
retained HTTP bodies in a disposable frontend whose selection clamp alone permits
eight. Persistence is an observation, never an additional promotion gate.

Final checks repeat the JSON-verified real E2Es and normal quality commands.
Documentation validation uses `/tmp/atom-persistence-docs-venv/bin/python`
(PyYAML6.0.3), overrideable by `ATOM_AUDIT_DOCS_PYTHON`. Host Go tests are distinct
from the fixed Go1.26.6 Linux/arm64/CGO0 measurement binaries.
