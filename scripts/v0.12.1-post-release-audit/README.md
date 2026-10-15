# v0.12.1 audit evidence

Audit only. No implementation is authorized by the findings.

- `criteria-lock.json` / `.sha256`: pre-evaluation criteria, anchors, source-group hashes and request digest. Never replace this lock.
- `baseline.json`: freeze-time state, including this then-untracked audit directory. The first shell observation before creating it showed a clean checkout; the report records both observations.
- `source-manifest.json`: SHA-256 identities of all 3,217 originally tracked files, including public data and historical evidence.
- `audit.py verify`: compare every original identity, HEAD, VERSION and the lock. `scan` regenerates bounded textual candidate occurrences; data/campaign JSON and binary files are excluded.
- `contracts.py`: strict OpenAPI 3.1 validation, local refs, independent caps and historical cap8 shipping-source identity comparison. Expected to exit 1 on this frozen release: five Response Objects are invalid. It does not fix them.
- `checks.py`: repeat static checks; `--full` also repeats Go/frontend/browser suites and dataset validation. It does not run expensive gated qualifications or generate historical campaigns.
- `build_report.py`: assemble structured assessment and Markdown report. No production writes.
- `claim-language-scan.json` and `claim-language-assessment.json`: reproducible lexical coverage, with semantic families and explicit non-accuracy uses. The scan is discovery evidence, not independent verification of accuracy.
- `checks.json`, `static-checks.json`, `contracts.json`, `invariance.json`, `evidence-manifest.json`: bounded check records and final identities.
- `logs/`: retained check outputs. Browser suites use test-provided mocked APIs; current full Go suite includes the actual RF engine with controlled fixtures. Live UI inspection used the normal backend and full Ankara pack. Historical F28/Profile A qualification is cited in place and was not rerun.

Repeat with Python 3.12, PyYAML 6.0.3, `openapi-spec-validator==0.9.0`, Go 1.26.9, Node >=24 and existing frontend dependencies. The original run used a temporary Python environment and Codex's bundled Node because host Node's simdjson dylib was missing. No host installation was repaired. `checks.py` uses bundled Node when that session path exists and otherwise the current PATH.

```sh
python scripts/v0.12.1-post-release-audit/audit.py verify
python scripts/v0.12.1-post-release-audit/checks.py
```

The raw private campaign files, route coordinates, user identifiers and external Reddit content are not copied. Existing sanitized readiness reports and public planning datasets are cited. New browser screenshot assertions write only ignored Playwright artifacts; shipped gallery assets were inspected in place. Do not treat a skipped test, a successful import, a hash match or a resource qualification as measured RF accuracy.
