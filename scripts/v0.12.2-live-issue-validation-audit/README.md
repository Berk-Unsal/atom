# Live issue validation evidence

Snapshot: 17 October 2026. Reports validate authenticated GitHub issue/PR state
against main `a712097dd2da47d95aa06d0050ba4a2cc5b09070`. They distinguish the
published v0.12.3 tag from later fixes on main. No GitHub mutations were made.

- `pre-audit-lock.json` and `.sha256`: exclusive-created baseline, read-only lock;
  do not rewrite. `audit-scope-supplement.json` permits only two report catalog entries.
- `collect.py`: GET-only, paginated `gh api` collection. Requires authenticated
  GitHub CLI access. Running it again replaces evidence with a **new snapshot**;
  preserve this audit before doing that. It does not execute a mutation plan.
- `render_report.py`: reviewed criterion findings, exact proposal-only bodies,
  Markdown/JSON reports and exactly two historical documentation catalog entries.
  Findings are specific to this snapshot and must be reassessed after recollection.
- `verify.py`: confirms all 15 issues/63 criteria, immutable lock, exact catalog
  additions, unchanged production scope, valid form structure and artifact hashes.
- `issue-mutation-plan.json`: four body-only proposals, eleven no-ops. Contains
  exact replacement bodies and expected issue body hashes/updated_at. No executor.
- `evidence/`: complete all-state issue/PR metadata and repository issue comments,
  individual roadmap bodies/timelines, detailed relevant PR changes/reviews/commits,
  CI jobs/checks, historical failure log, release/labels/milestones, source references,
  overlap search and focused test logs. GitHub-auth credentials are not stored.

Local focused checks:

```sh
cd frontend-react
node node_modules/vitest/vitest.mjs run src/components/ProjectMenu.fileRecovery.test.jsx src/utils/projectFileReliability.test.js src/App.workflow.test.jsx
cd ../backend-go
go test . -run 'TestOperationalResponseContractFixtures|TestReadiness' -count=1
cd ..
python -m unittest discover -s docs -p '*_test.py'
python docs/validate_openapi.py
python docs/validate_docs.py
python docs/validate_claims.py
python docs/classify_docs.py
python scripts/versioning.py check
python scripts/v0.12.2-live-issue-validation-audit/verify.py
git diff --check
```

Python docs checks used an existing isolated environment installed from
`docs/requirements.txt`; frontend used bundled Node 24 (lockfile and installed
Vitest both 4.1.11). No dependency files changed. The documentation build ran
from a temporary `git archive origin/main` extraction with **Pandoc 3.10** and
produced no generated-file changes. Full browser, race and security checks are
evidenced by the passing current-main Quality run, rather than repeated locally.

Issue-form YAML/structure validation does not submit a GitHub issue. Native PR
template recognition is confirmed by community profile and the prepopulated
body of PR #92. Projects inventory/views are outside this audit.
