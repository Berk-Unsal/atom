# Product capability, UX & growth audit — evidence

Read-only audit of A.T.O.M at `d0763974e2b5b68c209fda5c680cdfd8b1bdde2a` (VERSION 0.12.3). Report: [`docs/product-capability-ux-growth-audit.md`](../../docs/product-capability-ux-growth-audit.md).

| File | Purpose |
|---|---|
| `audit-lock.json`, `audit-lock.sha256` | Immutable baseline: HEAD/tree, source hashes, audited image, GitHub snapshot, allowed writes |
| `create_audit_lock.py` | Created the lock (refuses to overwrite) |
| `audit_data.py`, `build_audit_artifacts.py` | Single source for findings; renders the JSON below and `docs/product-capability-ux-growth-audit.json` |
| `capability-inventory.json` | 38 capabilities with entry point, workflow, backend, persistence, maturity, evidence |
| `friction-map.json` | 34 friction findings with category, severity, frequency, effort, impact, evidence |
| `product-opportunities.json` | 28 opportunities, safety classes, Top 10, new-feature shortlist, quick wins |
| `candidate-issues.json` | 17 **proposed** issues (not filed) plus items to fold into existing issues |
| `explore-*.mjs` | Playwright walks used to collect browser evidence |
| `traces/` | Request/timing/ARIA traces, sample Markdown report, export summary, GitHub snapshots |
| `screenshots/` | Curated captures (converted from the scripts' PNG output to JPEG to keep the repository small) |

Re-running the walks (against any running build; the audit used `atom:product-audit-d076397` on port 18090):

```bash
cd frontend-react
cp ../scripts/product-capability-ux-growth-audit/explore-workflows.mjs .audit-tmp.mjs   # resolve @playwright/test
AUDIT_DIR=../scripts/product-capability-ux-growth-audit node .audit-tmp.mjs http://127.0.0.1:18090
rm .audit-tmp.mjs
```

`explore-first-run.mjs` predates the `AUDIT_DIR` convention and writes next to its own directory. Walks create fresh browser profiles, issue real RF requests (stay under the 20/min budget) and overwrite screenshots and traces.
