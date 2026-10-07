# Request-budget policy design study

Design/documentation/offline arithmetic only. No limiter, capability, HTTP service,
RF endpoint or enforcement implementation. Production20/60 and Cell cap6 unchanged.

`baseline.json` protects407 production and1959 prior/evidence file identities.
`evaluation-lock.json` prospectively freezes20 criteria and the legitimate journey
envelope before numeric comparison/selection. `source-audit.json` records all19
protected POST routes and actual frontend callbacks. `simulations.py` evaluates
finite hypothetical tapes without live policy state, clocks, tokens or RF calls.
It is not the future implementation or a cryptographic security test.

SelectedP3-capped retains ordinary20 and adds only8 shared verified child units,
with owned exact-input slots, prebooking, bounded expiry/state, no spent refunds,
and unchanged concurrency. Recommendations/spec/future gates are in
`design-sections.md`; `render.py` creates MD/JSON and all78 requested final items.

Quality checks exercise **current** production code, including JSON-proven real
E2Es with ATOM_REAL_E2E=1. Raw logs remain outside Git under
`/tmp/atom-eight-cell-request-budget-policy-design`, indexed and archived.

```sh
python3 -B scripts/request-budget-policy-design/inventory.py
python3 -B scripts/request-budget-policy-design/simulations.py
python3 -B -m unittest discover -s scripts/request-budget-policy-design -p 'test_*.py'
python3 -B scripts/request-budget-policy-design/render.py
python3 -B scripts/request-budget-policy-design/checks.py
python3 -B scripts/request-budget-policy-design/evidence.py --archive
python3 -B scripts/request-budget-policy-design/render.py
python3 -B scripts/request-budget-policy-design/complete.py
```

Do not overwrite existing frozen locks/archives or prior study artifacts. Another
study needs new paths. No release, cap promotion, adaptive estimator or production
policy change is authorized by this task.
