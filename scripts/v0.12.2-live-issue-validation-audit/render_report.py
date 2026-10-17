"""Render the reviewed audit findings and a proposal-only mutation plan.

No GitHub calls or production source edits. Catalog additions are audit metadata.
"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EVIDENCE = HERE / 'evidence'
BASE = 'https://github.com/Berk-Unsal/atom'
MAIN = 'a712097dd2da47d95aa06d0050ba4a2cc5b09070'
REPORT = ROOT / 'docs/v0.12.2-live-issue-validation-audit'


def read(name):
    return json.loads((EVIDENCE / (name + '.json')).read_text())


def evidence(path, needle):
    lines = (ROOT / path).read_text().splitlines()
    line = next(i for i, text in enumerate(lines, 1) if needle in text)
    return {'path': path, 'line': line, 'url': f'{BASE}/blob/{MAIN}/{path}#L{line}'}


SOURCES = {
    76: [('frontend-react/src/App.jsx', 'const score ='), ('frontend-react/src/App.jsx', 'Non-dominated solutions represent'), ('frontend-react/src/components/OptimizationGoalsPanel.jsx', 'function OptimizationGoalsPanel')],
    77: [('frontend-react/src/utils/projectFileRecovery.js', 'const budgetReasons'), ('frontend-react/src/components/WorkspaceChrome.jsx', 'Your current project and retained evidence'), ('frontend-react/src/components/ProjectMenu.fileRecovery.test.jsx', 'describe.each'), ('frontend-react/src/App.workflow.test.jsx', 'preserves current RF evidence'), ('docs/project-format.md', 'Resource and error contract')],
    78: [('docs/getting-started.md', 'First useful planning decision'), ('examples/ankara-sample.atom-project.json', 'selectedNetworkTowerIds')],
    79: [('docs/index.html', 'theme-preview-light'), ('frontend-react/e2e/docs-theme.spec.js', 'toHaveAttribute("src"')],
    80: [('docs/terminology.md', '## Planning Cell'), ('docs/terminology.md', '## Tower Record and Candidate'), ('docs/getting-started.md', 'Before starting, see'), ('docs/features.md', 'terminology.html')],
    81: [('docs/getting-started.md', 'move the full project'), ('docs/getting-started.md', 'Use **Report**'), ('frontend-react/src/components/ReportArtifactsPanel.jsx', 'function ReportArtifactsPanel'), ('frontend-react/src/utils/reportExport.js', 'sampled'), ('docs/project-format.md', 'Reports')],
    82: [('docs/contributing.md', 'using Jest'), ('docs/contributing.md', 'golint'), ('docs/contributing.md', 'Edit version string'), ('README.md', 'Product compass'), ('docs/build-reference-pages.sh', 'required_pandoc_version=')],
    83: [('.github/ISSUE_TEMPLATE/bug_report.yml', 'name:'), ('.github/ISSUE_TEMPLATE/feature_research_proposal.yml', 'name:'), ('.github/ISSUE_TEMPLATE/config.yml', 'blank_issues_enabled')],
    84: [('.github/PULL_REQUEST_TEMPLATE.md', '## Summary'), ('.github/PULL_REQUEST_TEMPLATE.md', '## Validation'), ('.github/PULL_REQUEST_TEMPLATE.md', '## Boundary notes')],
    85: [('docs/openapi.yaml', '/readyz:'), ('docs/openapi.yaml', '/api/processes/batch-experiment:'), ('backend-go/operational_response_contract_test.go', 'func TestOperationalResponseContractFixtures'), ('docs/validate_openapi_test.py', 'class OperationalResponseContractTests')],
    86: [('planning/future_plans.md', 'Read [Product Compass]'), ('planning/future_plans.md', '## Release Completion Work'), ('docs/api.md', 'Future versions will:')],
    87: [('docs/concept-6a1-readiness.json', 'A_SEMANTICS_UNRESOLVED'), ('docs/concept-6a1-2-serving-state-semantics.md', 'Decision A')],
    88: [('docs/concept-6a1-1-transmitter-truth.json', 'mapped_b7_transmitters'), ('docs/concept-6a1-1-transmitter-reconciliation.json', 'schema_version')],
    89: [('docs/concept-6a1-1-bandwidth-audit.json', 'exact_source_observation_assignments'), ('docs/concept-6a1-1-applicability.json', 'exact_profile_match')],
    90: [('docs/concept-6a1-readiness.json', 'canonical_observation_count'), ('docs/concept-6a1-1-applicability.json', 'receiver_metadata'), ('docs/concept-6a1-1-applicability.json', 'residual_metrics_generated')],
}

# Each tuple corresponds, in order, to one live issue-body acceptance criterion.
CRITERIA = {
    76: [('FAIL', 'Results still shows /100 without explaining preference-weighted normalized utility or distinguishing accuracy/coverage/probability.'), ('FAIL', 'No illustrative two-option non-domination/priorities example is present beside Alternative solutions.'), ('PARTIAL', 'Roles, inspection and explicit apply exist, but the help does not explain retained reranking versus a new search.'), ('PARTIAL', 'Existing scoring/workflow behavior remains; the requested accessible-help regression has not been added.')],
    77: [('PASS', 'Seven known guard messages map to specific reasons; unknown errors retain the original message.'), ('PASS', 'Recovery explicitly names browser-local evidence and separately downloaded reports, and disclaims a full editable backup.'), ('PASS', 'Rejected import validation precedes clearing result context; interaction/workflow tests preserve project/evidence and forbid deletion/download/retry.'), ('PASS', 'Injected import/export budget failures and existing reliability tests pass in the focused 82-test run; current-main browser CI passes.')],
    78: [('FAIL', 'Settings-only sample still has no selected network Cells or recorded dataset binding; no reproducible baseline fixture/instructions supply them.'), ('FAIL', 'General planning limits exist, but there is no example-specific dataset/model/configuration record or fixed-input explanation.'), ('PARTIAL', 'General evaluate/optimize/save/export steps exist; no worked baseline delta and trade-off is supplied.'), ('NOT YET TESTABLE', 'No new worked fixture or exercised walkthrough exists; current docs validation alone cannot establish reproducibility.')],
    79: [('FAIL', 'Viewed both assets: old light Single/Setup map versus dark eight-Cell Review workspace, different extent/selection/viewport; no matched current capture pair/provenance.'), ('PASS', 'Existing assets visibly depict the app; no fabricated or repainted output was introduced. This alone does not satisfy the matched-pair criterion.'), ('PARTIAL', 'Existing assets load and current-main browser/docs checks pass, but fixture paths and alt text still describe the mismatched pair.'), ('PASS', 'Historical gallery and qualification image history is intact.')],
    80: [('PASS', 'Glossary distinguishes planning Cell, sector, physical site and co-location without certifying installed equipment.'), ('PASS', 'Candidate definition explicitly excludes ownership, availability, permitting, cost and backhaul evidence.'), ('PASS', 'Getting Started first workflow, Inventory/Setup help, Features/FAQ/navigation link to the glossary; API names remain compatible.'), ('PASS', 'Pinned generated build has no diff; docs/link checks pass; maintainer discussion on PR #93 records approval (lgtm).')],
    81: [('FAIL', 'Current help has no annotated report example or section map covering assumptions, achieved metrics, baseline, alternatives and limitations.'), ('FAIL', 'Renderer contains lineage/integrity semantics, but current reader help does not teach historical/unsaved context or byte hashes versus accuracy.'), ('PARTIAL', 'PR #95 improves local-project/separate-report recovery help and format documentation; reader guidance for sampling, absent analyses and stored HTML remains incomplete.'), ('FAIL', 'No linked report-reading guide has been exercised against renderer fixtures. Existing docs checks pass but do not meet this criterion.')],
    82: [('FAIL', 'No root contribution entry or README contribution route; current guide still has contradictory instructions.'), ('PARTIAL', 'Getting Started/AGENTS provide real setup; maintained contributor snippets omit prerequisites and use nonexistent RF helpers. Pinned Pandoc 3.10 now needs explicit setup coverage.'), ('PARTIAL', 'Some commands exist, but Jest/golint remain and the required focused/full CI-aligned matrix is incomplete.'), ('FAIL', 'Guide still instructs editing main.go for releases and links unavailable community files; VERSION/Unreleased guidance is not repaired.'), ('PARTIAL', 'Issues are available, but guide still recommends disabled Discussions. README also requires an ignored, unpublished Product Compass; public-only newcomer guidance needs repair.')],
    83: [('PASS', 'Bug form captures app/dataset/model/workflow/environment/steps/expected/actual/safe logs; setup-only bugs explicitly need no RF data. Required dataset/model text says if applicable, so N/A can be entered.'), ('PASS', 'Proposal form asks planning decision, rationale, prerequisites, bounded scope, validation and non-goals.'), ('PASS', 'Both forms warn against secrets/private locations/raw routes; proposal routes uncertainty to maintainer review.'), ('PASS', 'YAML/structural checks pass; bug/enhancement labels exist; canonical issue-form paths are tracked; no Discussions/private-data requirement. Community-profile issue_template=null is not proof that YAML forms are absent.')],
    84: [('PASS', 'GitHub community profile recognizes the exact template; subsequent PR #92 body contains its prepopulated prompts.'), ('PASS', 'Prompts cover before/after, issue reference and exact checks with explicit typo/docs-only exemption.'), ('PASS', 'UI screenshot prompt and conditional RF/scope/persistence/compatibility maintainer review prompt exist.'), ('PASS', 'Unchecked validation prompts and Unreleased reminder match repository policy without contradicting canonical VERSION; no production or CI edits in PR #91.')],
    85: [('PASS', 'Readiness success/failure schemas specify flags/status, optional sanitized dataset_error and readiness consistency.'), ('PASS', 'Discovery schema specifies actual id/version/job_control_options/dimensions/max_runs (64).'), ('PASS', 'Shared fixtures are compared to real Go handlers; Python schema tests reject omissions, nulls/wrong types, invalid discovery values and unsafe errors; strict OpenAPI/reference checks pass.'), ('PASS', 'PR #94 changes schema/tests/fixtures/docs only; no production handler, response/status, budget, limit or RF-evidence behavior change.')],
    86: [('FAIL', 'Maintained roadmap still lists already-shipped tagged images, browser coverage and sample pack as release-completion work; no row-by-row evidence reconciliation.'), ('FAIL', 'Measurement row still blurs tooling/synthetic residual examples and a compatible canonical field reference set.'), ('FAIL', 'API page still unconditionally promises webhooks, batch optimization, terrain and custom-model endpoints. Application VERSION and API 1.0 remain separate, but promises are unresolved.'), ('PASS', 'Current pinned build, docs/classification/claim/link checks pass; historical sources are preserved. Automated success does not validate roadmap claims.')],
    87: [('BLOCKED', 'No new version/device-scoped collector authority resolves registered=true/CONNECTION_NONE and PS identity conflict. Existing unresolved/no-go ledger and vendor questions are scaffolding, not newly resolved evidence.'), ('BLOCKED', 'No newly reviewed authoritative accepted/rejected/ambiguous decision matrix resolves the source conflict.'), ('PASS', 'Importer contradiction guards remain unchanged; no adapter fallback or unreviewed implementation was introduced.'), ('PASS', 'Sanitized existing provenance is public and canonical/calibration readiness remains false; this safeguard does not close the research question.')],
    88: [('BLOCKED', 'No permitted exact PLMN/Cell/sector transmitter mapping package; mapped_b7_transmitters remains zero.'), ('BLOCKED', 'Source-specific position, height/orientation, TX power/reference plane and antenna/system truth remain missing or inferred.'), ('BLOCKED', 'No new sanitized authoritative mapping/completeness decision package is reviewable; deterministic map contracts alone are insufficient.'), ('PASS', 'Current public ledger records insufficiency/no-go rather than guessed planning defaults; no private campaign data is added.')],
    89: [('BLOCKED', 'No accepted observation-bound quantity/reference-plane/resource package with uncertainty.'), ('BLOCKED', 'All 29 B7 CellInfo bandwidth values are unavailable; ServiceState context has zero exact assignments.'), ('BLOCKED', 'Measured 2.665 GHz versus canonical 2.600 GHz remains an explicit no-go with no new compatible source; tolerance unchanged.'), ('PARTIAL', 'Readiness separately enumerates RSRP/RSRQ/SINR/RSSI/carrier power exclusions; no eligible field comparisons have become possible.'), ('PARTIAL', 'Sanitized missing/ambiguous audit exists; no newly accepted positive/negative authoritative assignment examples.')],
    90: [('BLOCKED', '#87–#89 remain independent evidence blockers; unresolved/no-go is not successful canonical validation.'), ('BLOCKED', 'No qualifying licensed compatible-frequency set with serving/TX/receiver/outdoor/LOS truth.'), ('NOT YET TESTABLE', 'No admitted field study/reference set exists to predeclare a specific holdout/uncertainty plan against.'), ('BLOCKED', 'No canonical held-out residuals or subgroup MAE/RMSE can be published with present zero observations.'), ('PASS', 'Calibration remains a separate later study; hashes, software tests and operational qualification do not establish physical accuracy.')],
}

IMPLEMENTATIONS = {77: 95, 80: 93, 83: 92, 84: 91, 85: 94}
UPDATES = [81, 82, 83, 86]
READY = [76, 78, 79, 81, 82, 86]
BLOCKED = [87, 88, 89, 90]


def proposed_body(number, body):
    if number == 81:
        return body.replace(
            'Add a bounded reader guide tied to the existing report sections.',
            'Add a bounded reader guide tied to the existing report sections. Reuse the export-recovery guidance merged in PR #95 and correct Getting Started → Create A Repeatable Project, which still promises moving the “full project” or an “external archive”: portable files carry bounded Draft/retained Scenario evidence, while separate Run History, reports and coverage surfaces have their own retention/download contracts. Do not add an archive mode.'
        )
    if number == 82:
        return body + '\n## Live validation refresh — 17 October 2026\n\nCurrent main is `a712097dd2da47d95aa06d0050ba4a2cc5b09070` (VERSION 0.12.3). Documentation builds require exactly Pandoc 3.10 after `fcdf6cb0368ca68248b18126481ccf63bb04c1c4`; include that prerequisite and the hash-pinned Python documentation dependencies in contributor setup. README currently links `planning/product-compass.md`, which is ignored and absent from both public main and the original audit commit. Make all required newcomer references publicly available or replace the broken route with maintained public guidance; do not depend on a maintainer-local file or automatically publish its contents. Issue forms, the PR template, the terminology glossary and discovery response schemas are already implemented by PRs #91–#94 and should be used as existing surfaces.\n'
    if number == 83:
        bad = '- [planning/product-compass.md:L108](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/planning/product-compass.md#L108)'
        assert bad in body
        return body.replace(bad, '- [Merged implementation PR #92](https://github.com/Berk-Unsal/atom/pull/92)') + '\n## Live validation note — 17 October 2026\n\nAcceptance criteria are satisfied on main by PR #92 (`515ea821a9c08ccaa38ac751cf988a15110062ab`). The removed Product Compass citation pointed to an ignored, unpublished file, including at the original pinned commit. This reference correction does not change completion status or request additional implementation.\n'
    if number == 86:
        return body + '\n## Live validation refresh — 17 October 2026\n\nReconcile against current main `a712097dd2da47d95aa06d0050ba4a2cc5b09070`, VERSION 0.12.3, published v0.12.3 at `13e261c2a45ad8fe201276be870dc3c7448e0c0f`, and completed issues #77/#80/#83/#84/#85. Also repair the maintained roadmap’s mandatory Product Compass link: `planning/product-compass.md` is not tracked on public main. Link existing public scope guidance or explicitly scope a public replacement; do not assume a maintainer-local ignored document is available to contributors. Retain the distinction between API contract 1.0 and application 0.12.3. No new feature/release commitment is authorized.\n'
    return body


def main():
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    snapshot = read('snapshot-summary')
    references = {x['issue']: x for x in read('reference-validation')}
    comments = read('all-issue-comments')
    issues = []
    plans = []
    for n in range(76, 91):
        raw = read(f'issue-{n}')
        criteria = re.findall(r'^- \[[ xX]\] (.+)$', raw['body'].split('## Acceptance criteria', 1)[1].split('\n## ', 1)[0], re.M)
        assert len(criteria) == len(CRITERIA[n]), (n, len(criteria), len(CRITERIA[n]))
        refs = [evidence(*entry) for entry in SOURCES[n]]
        closed = raw['state'] == 'closed'
        classification = 'RESOLVED' if closed else 'PARTIAL' if n == 81 else 'PRESENT'
        suitability = 'research-heavy' if 87 <= n <= 89 else 'maintainer-owned' if n == 90 else 'beginner-safe' if n in [79, 80, 81, 84] else 'contributor-friendly'
        linked = []
        if n in IMPLEMENTATIONS:
            pr = read(f'pr-{IMPLEMENTATIONS[n]}')
            linked = [{'pr': pr['number'], 'url': pr['html_url'], 'merge_commit': pr['merge_commit_sha'], 'merged_at': pr['merged_at'], 'link_evidence': 'Issue #83 contributor completion comment and matching changed files' if n == 83 else 'closing keyword + issue timeline + actual source changes'}]
        labels = [v['name'] for v in raw['labels']]
        item = {
            'issue_number': n, 'title': raw['title'], 'url': raw['html_url'], 'state': raw['state'],
            'state_reason': raw['state_reason'], 'labels': labels, 'assignees': [a['login'] for a in raw['assignees']],
            'milestone': raw['milestone'], 'created_at': raw['created_at'], 'updated_at': raw['updated_at'],
            'current_body': raw['body'], 'comments': [c for c in comments if c['issue_url'].endswith('/'+str(n))],
            'repository_evidence_classification': classification,
            'reference_flags': ['STALE REFERENCE'] if n == 83 else [],
            'validation': 'RESOLVED CORRECTLY' if closed else 'BLOCKED CORRECTLY' if n in BLOCKED else 'PARTIALLY RESOLVED' if n == 81 else 'STILL VALID',
            'problem_still_exists': not closed, 'evidence': refs, 'linked_implementation': linked,
            'acceptance_criteria': [{'criterion': text, 'status': state, 'explanation': note, 'evidence': refs} for text, (state, note) in zip(criteria, CRITERIA[n])],
            'priority': next(l.split(': ')[1] for l in labels if l.startswith('priority: ')),
            'priority_correct': True, 'priority_reason': 'Independent scientific-credibility gate, not a present app failure or release promise.' if n in BLOCKED else 'Meaningful workflow/contributor/integration clarity.' if 'priority: P2' in labels else 'Low-severity documentation polish/reconciliation.',
            'label_validation': {'type': 'correct', 'area': 'correct', 'priority': 'correct', 'contribution': 'correct', 'missing': [], 'unnecessary': [], 'misleading': [], 'note': 'Closed contribution labels are retained historical classification, not an invitation to reimplement completed work.' if closed else 'good first issue requires public current setup, bounded scope and low scientific risk; help wanted is not a beginner promise.'},
            'contributor_suitability': suitability, 'contributor_suitability_correct': True,
            'blocked_correct': True, 'blocker': 'External scientific evidence is still missing; #90 also depends on #87–#89.' if n in BLOCKED else None,
            'duplicate_or_superseded': False, 'references': references[n]['references'],
            'scope_correct': True, 'acceptance_criteria_correct': True,
            'recommended_action': 'update-body' if n in UPDATES else 'leave-unchanged',
        }
        issues.append(item)
        new_body = proposed_body(n, raw['body'])
        reasons = {81: 'Account for PR #95 retention guidance and repair the remaining full-project/archive sentence while delivering the existing report guide.', 82: 'Contributor setup now requires pinned Pandoc 3.10 and must not depend on an ignored, unpublished Product Compass.', 83: 'Remove the one non-public source reference; completed forms remain correctly closed.', 86: 'Rebase roadmap reconciliation evidence on v0.12.3/current main and include its broken mandatory Product Compass link.'}
        plans.append({'issue_number': n, 'action': item['recommended_action'],
                      'reason': reasons.get(n, 'Current state, priority, labels, acceptance scope and suitability are supported by main.'),
                      'evidence': refs + linked, 'risk': 'low; wording only; preserve status, assignee, labels and original acceptance gates' if n in UPDATES else 'none; preserve current state',
                      'expected_updated_at': raw['updated_at'], 'expected_body_sha256': hashlib.sha256(raw['body'].encode()).hexdigest(),
                      'exact_proposed_change': {'body': new_body} if n in UPDATES else {'change': None}})

    # Scientific authoritative ledgers and engines have not gained physical evidence.
    scientific_paths = ['docs/concept-6a1-readiness.json', 'docs/concept-6a1-1-transmitter-truth.json', 'docs/concept-6a1-1-bandwidth-audit.json', 'docs/concept-6a1-1-applicability.json', 'docs/concept-6a1-2-serving-state-semantics.md', 'backend-go/raytracer/canonical_rf_validation.go', 'backend-go/raytracer/canonical_rf_validation_holdout.go', 'backend-go/raytracer/concept_6a1_campaign_tooling.go']
    science = []
    for path in scientific_paths:
        blobs = {ref: subprocess.check_output(['git', 'rev-parse', f'{ref}:{path}'], cwd=ROOT, text=True).strip() for ref in ['0310bd8', 'origin/main']}
        science.append({'path': path, 'blob_ids': blobs, 'unchanged': len(set(blobs.values())) == 1})
    assert all(x['unchanged'] for x in science)
    audit = {
        'schema_version': 1, 'audit': 'A.T.O.M live issue validation', 'recorded_at': now,
        'client_date': '17 October 2026', 'repository': BASE, 'baseline': {**read('source-baseline'), 'release': 'v0.12.3', 'release_commit': '13e261c2a45ad8fe201276be870dc3c7448e0c0f', 'initial_working_tree_clean': True},
        'github_snapshot': snapshot, 'all_issue_states': [{'number': x['number'], 'state': x['state'], 'title': x['title']} for x in read('issues-and-prs') if 'pull_request' not in x],
        'issues': issues, 'scientific_blob_comparison': science,
        'ci': {'health': 'PASSING', 'current_main_quality_run': 38868238186, 'current_documentation_job': 116865945557, 'previous_failure_run': 38768299081, 'previous_failure_job': 116537181491, 'failure': 'Generated deployment.html differed from pinned Pandoc output; not an RF/source behavior failure.', 'fixed_commit': 'fcdf6cb0368ca68248b18126481ccf63bb04c1c4', 'first_fixed_quality_run': 38776451915, 'flakiness': 'No evidence of current flakiness in inspected runs; not a statistical reliability claim.', 'dependency_review_on_main': 'skipped by design; pull_request-only', 'open_pr_failures_are_main_failures': False},
        'roadmap': {'ready': READY, 'blocked': BLOCKED, 'contributor_friendly': READY, 'good_first_issue': [79, 81], 'maintainer_owned': BLOCKED, 'closure_candidates': [], 'reopen_candidates': [], 'update_candidates': UPDATES, 'label_corrections': [], 'priority_corrections': []},
        'duplicates': {'roadmap_duplicates': [], 'overlap': ['#76 score/Pareto explanation, #78 executable comparison and #81 report reading have different outputs.', '#77 portability recovery is implemented by #95; #81 should reuse it, not rebuild it.', '#83 issue forms and #84 PR handoff are separate, both complete.', '#85 schemas are implemented by #94, distinct from #86 unsupported API future promises.', '#87–#89 are independent evidence prerequisites, coordinated by #90; no collapse.', 'Closed #17 bounded import and #26 persistence/save ordering do not supersede #77 contextual recovery.', 'Closed #30 image deduplication and merged historical theme PR #71 do not satisfy #79 matched current hero captures.'], 'open_prs': [49, 51, 52, 53, 63, 74, 75], 'note': 'All 48 PR title/body records, all issue bodies and repository issue comments were searched; detailed files/reviews for the 12 relevant/open PRs were inspected. PR #92 has no closing keyword, so its implementation association relies on the #83 discussion and actual files.'},
        'missing_backlog': [], 'covered_gaps': [{'gap': 'README and maintained roadmap require Product Compass absent from public Git history', 'covered_by': [82, 86], 'closed_issue_stale_citation': 83}, {'gap': 'Getting Started still promises full-project portability/external archive', 'covered_by': [81], 'note': 'Non-material documentation follow-up; #77 acceptance criteria are satisfied.'}],
        'rejected_new_issue_ideas': ['New docs-CI defect: fixed and currently passing.', 'Duplicate contribution forms, PR template, terminology, discovery-schema or export-recovery work: already merged.', 'Larger Cell caps, W2/W3, new RF models, AI optimization, enterprise/mobility/capacity systems, terrain promotion or calibration: no new physical or user evidence.', 'Separate Product Compass or archive-copy ticket: bounded repair belongs to existing #82/#86 and #81.', 'PR #63 security assertion: proposed HTTPS guard still needs maintainer threat-model/compatibility review; do not elevate an unvalidated PR claim into a new issue.'],
        'checks': read('focused-checks') + [read('isolated-docs-build')] + read('final-checks'),
        'end_state_verification': read('end-state-verification'),
        'limitations': ['Point-in-time authenticated GitHub REST snapshot; later GitHub activity may change the result.', 'No new field collection, vendor contact, measured RF qualification, calibration, private evidence retrieval or user comprehension study.', 'Local ignored Product Compass was detected but excluded as public-main evidence.', 'Full browser/race/security suites are supported by current-main CI, not rerun locally; local checks were focused.', 'Native template prepopulation evidenced by community profile and subsequent PR #92, not by submitting a new PR; issue-form schema checked locally without submitting an issue.', 'Historical SHA citations are preserved; 65 of 66 point to current tracked files, with one already-broken Product Compass citation on closed #83.', 'GitHub Projects status can appear in issue timelines; Projects inventory/views/permissions were not audited.'],
        'verdict': 'B. BACKLOG MOSTLY VALID — SMALL CORRECTIONS NEEDED',
        'verdict_reason': 'Five correct closures, no stale open closure candidate, genuine science blockers and sound roadmap structure; four bounded issue-body updates improve public references, setup prerequisites and retention wording.',
        'highest_priority_valid_open_issue': 87, 'highest_priority_actionable_issue': 82, 'best_good_first_issue': 81, 'most_important_blocked_scientific_issue': 87,
        'recommended_next_action': 'Review the exact body-only mutation plan for #81, #82, #83 and #86 before authorizing any GitHub update.',
        'github_mutations_executed': False, 'production_edits': False,
    }
    (HERE / 'issue-mutation-plan.json').write_text(json.dumps({'schema_version': 1, 'proposal_only': True, 'executed': False, 'snapshot_at': snapshot['recorded_at'], 'main_sha': MAIN, 'precondition': 'Before any separately authorized mutation, refetch issue state/body/updated_at; stop if it differs from the saved snapshot.', 'summary': {'update-body': 4, 'leave-unchanged': 11, 'close': 0, 'reopen': 0, 'relabel': 0, 'remove-label': 0, 'update-title': 0}, 'changes': plans}, indent=2) + '\n')
    Path(str(REPORT) + '.json').write_text(json.dumps(audit, indent=2) + '\n')
    lines = [
        '# A.T.O.M v0.12.2 Live Issue Validation Audit', '',
        '17 October 2026 · Authenticated read-only GitHub audit · Current main + published release distinguished', '',
        '**B. BACKLOG MOSTLY VALID — SMALL CORRECTIONS NEEDED.** All five closed roadmap issues satisfy their material acceptance criteria. Six actionable documentation/product/contribution issues and four genuinely blocked scientific issues remain. No closure, reopen, label or priority correction is recommended. Four issue-body updates are proposed; none was executed.', '',
        '## Authority, baseline and immutable lock', '',
        f'- Audited remote main: `{MAIN}`; VERSION **0.12.3**.',
        '- Local HEAD: `bfab6dd8adbf6544f52fd6c306d3dc122d79bc32` on `codex/issue-77-project-export-recovery`; initial full `git status --short` and tracked diff/stat were empty. Main and local HEAD have identical trees. Main is a squash merge, so SHAs differ.',
        '- Latest published release/tag: [v0.12.3](https://github.com/Berk-Unsal/atom/releases/tag/v0.12.3), published 16 October 2026, peeled commit `13e261c2a45ad8fe201276be870dc3c7448e0c0f`. PRs #94/#95 are on current main after this release; do not claim those fixes shipped in the tag.',
        '- Origin fetch/push: `https://github.com/Berk-Unsal/atom.git`. Remote refs were read live, then main/tags fetched; no branch checkout/reset or commit was made.',
        '- The exclusive-created, read-only `pre-audit-lock.json` and SHA-256 sidecar preserve the original commit/tree, branch, VERSION, status, refs and scope. The pre-edit scope supplement allows exactly two historical catalog entries in `docs/doc-sources.json`; existing entries stay identical.', '',
        '## Live GitHub scope', '',
        f"Authenticated REST snapshot: **{snapshot['open_issues']} open, {snapshot['closed_issues']} closed, {snapshot['issue_count']} total issues**, excluding PRs. All issues and all 48 PR title/body records were fetched with pagination, plus all repository issue comments, labels, milestones, roadmap timelines and relevant reviews. Repository `open_issues_count=17` includes seven open PRs; it is not the issue count.", '',
        'Roadmap: **15 inspected (#76–#90), 10 open, 5 closed**. Detailed PR files/patches, commits, issue discussion, reviews and inline comments: **12 PRs**, #91–#95 plus all seven open PRs (#49/#51/#52/#53/#63/#74/#75). All-state overlap/closing-keyword searches are retained in `evidence/overlap-search.json`. No roadmap issue has a milestone; only closed #83 remains assigned (Surendran-7). No assignment/milestone change is recommended.', '',
        '## Issue scorecard', '',
        '| Issue | State | Problem exists? | Criteria | Priority | Labels | Suitability | Blocked | Duplicate | Implementation | Recommendation |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
    ]
    for issue in issues:
        n = issue['issue_number']
        counts = {}
        for c in issue['acceptance_criteria']:
            counts[c['status']] = counts.get(c['status'], 0) + 1
        criteria_text = '; '.join(f'{count} {status}' for status, count in counts.items())
        impl = f"[PR #{IMPLEMENTATIONS[n]}]({BASE}/pull/{IMPLEMENTATIONS[n]})" if n in IMPLEMENTATIONS else '—'
        lines.append(f"| [#{n}]({BASE}/issues/{n}) | {issue['state']} | {'No' if not issue['problem_still_exists'] else 'Yes; partial help' if n == 81 else 'Yes'} | {criteria_text} | {issue['priority']} correct | Correct | {issue['contributor_suitability']} | {'Yes; justified' if n in BLOCKED else 'No; correct'} | No | {impl} | {issue['recommended_action']} |")
    lines += ['', 'Closed validation: **#77/#80/#83/#84/#85 resolved correctly; zero minor material acceptance gaps, zero premature closures.** The broken historical reference on #83 is a body correction, not an acceptance failure. Unchecked historical checklist boxes are not evidence that merged work is absent.', '',
              'Open validation: **#76/#78/#79/#82/#86 still valid; #81 partially supported by PR #95 but its report-reading guide remains absent; #87–#90 blocked correctly.** No open issue is already resolved, duplicated or superseded. #81’s partial support does not amount to completion or a new report reader guide.', '',
              '## Criterion-by-criterion findings and current source', '']
    for issue in issues:
        n = issue['issue_number']
        lines += [f"### #{n} — {issue['title']}", '', f"**{issue['validation']} · {issue['repository_evidence_classification']}**. Current priority, type/area/contribution labels and suitability remain appropriate. Scope and acceptance gates remain valid; suggested refreshes below do not weaken them.", '']
        for idx, c in enumerate(issue['acceptance_criteria'], 1):
            lines.append(f"{idx}. **{c['status']}** — {c['criterion']} {c['explanation']}")
        lines += ['', 'Current evidence: ' + ', '.join(f"[{e['path']}:{e['line']}]({e['url']})" for e in issue['evidence']) + '.', '']
        if issue['linked_implementation']:
            link = issue['linked_implementation'][0]
            lines += [f"Implementation: [PR #{link['pr']}]({link['url']}), merge `{link['merge_commit']}`. {link['link_evidence']}. Actual files and present source were checked; closure keywords were not treated as proof.", '']
    lines += [
        '## Product/UX and contribution/community conclusions', '',
        '#76 still needs Results utility explanation and a plain-language Pareto example. #78 still needs a reproducible public baseline. #79 still uses visibly different light/dark app generations. #80 glossary is complete. #77 recovery is complete; its accepted failure-path protections pass. #81 needs a reader guide, with PR #95 recovery text reused and Getting Started’s “full project”/“external archive” sentence corrected. This residual copy is outside #77’s material acceptance gap and does not justify reopening it.', '',
        '#82 remains important: Jest, golint, nonexistent RF examples, main.go release edits, unavailable community links and disabled Discussions guidance remain. Current build setup must also explain Pandoc 3.10 and pinned Python docs dependencies. #83 forms work and #84 template works; GitHub recognizes the latter, and PR #92 actually contains its prepopulated prompts. The community profile reports 71% health and `issue_template: null` despite tracked YAML forms; that legacy field is not treated as absence of issue forms. #85 handler-backed discovery schemas and negative contract tests are complete. #86 still needs maintained roadmap/API promise reconciliation.', '',
        '## Scientific status: no promotion', '',
        'The authoritative scientific ledgers and canonical/collector engines listed in JSON have identical Git blob IDs at v0.12.2 audit commit and current main. Generated research HTML navigation changes are not new physical evidence. There are no new scientific issue comments or linked implementation PRs.', '',
        '- #87: all 83 registered candidates still conflict with CONNECTION_NONE; no authoritative version/device-specific collector clarification. Preserve the guard.',
        '- #88: zero exact B7 transmitter mappings; source-specific TX position/height/power/reference-plane/antenna truth remains insufficient.',
        '- #89: 29 unavailable B7 bandwidth values, zero exact assignments; ServiceState context ambiguous; 2.665 versus 2.600 GHz mismatch remains. RSRP is not carrier power; other KPIs need independent resource/interferer context.',
        '- #90: 53,005 parsed rows and **zero canonical observations**. Receiver height remains user-estimated and device uncalibrated; independent outdoor/LOS truth is missing. No canonical field MAE/RMSE, calibration readiness or qualifying held-out reference set exists.', '',
        'Keep all four blocked and P1. Source clarification/mapping/resource research can be assessed independently; final field validation needs every gate. More tests, issue activity, hashes, synthetic fixtures and CI success change none of these scientific conclusions.', '',
        '## CI health', '',
        f"**PASSING** on exact main `{MAIN}`: [Quality run 38868238186]({BASE}/actions/runs/38868238186). Backend, frontend, browser, Core Lab adapter, documentation/OpenAPI, version/policy, data pipeline and container security all succeed. The backend/adapter jobs run govulncheck; frontend runs npm audit; container job runs SBOM/Trivy. Dependency review is intentionally skipped on main because it is PR-only. Both docs deployment and Pages deployment succeed on the same main SHA.", '',
        f"Historical documentation failure: [run 38768299081]({BASE}/actions/runs/38768299081), job 116537181491, commit `62355da2b4…`, failed the generated-doc diff at deployment.html. [Commit fcdf6cb]({BASE}/commit/fcdf6cb0368ca68248b18126481ccf63bb04c1c4) enforces pinned Pandoc 3.10 and normalizes generated output; [first fixed Quality run 38776451915]({BASE}/actions/runs/38776451915) passes all applicable jobs. Current local isolated pinned-main rebuild has zero generated changes. No current docs-CI issue should be created; no evidence supports calling current main flaky.", '',
        'Open dependency PRs #49/#74/#75 have version-policy failures; #51/#52/#53 have frontend/browser/container failures. These belong to their PR heads, not current main. #63 changes HTTPS base-URL validation and has only the external GitGuardian check in its fetched head checks; its threat model/compatibility still needs maintainer review. None implements or supersedes a roadmap issue. No PR was merged or modified.', '',
        '## Labels, priorities and contributor suitability', '',
        'All 15 roadmap issues have an appropriate type, area and priority; no missing/unnecessary/misleading current roadmap labels were found. P1 is retained for the four blocked scientific-credibility gates, P2 for meaningful workflow/contribution/integration work, and P3 for bounded documentation polish. No priority correction is warranted merely because P1 research is blocked.', '',
        '**Current good first issues: #79 and #81.** Both have bounded documentation surfaces, low scientific risk and clear checks. #79 requires real app state capture and the already-documented Docker/LFS setup; #81 is the best current first task because existing renderer fixtures bound the work. Closed #80/#84 remain accurate historical beginner-safe labels, not new work offers. Help wanted remains correct for the six Ready issues; #76/#78/#82/#86 need workflow/tooling or maintainer wording review and are not automatically beginner-safe. Do not add help wanted/good first issue to #87–#90.', '',
        '## Duplicates, stale references and missing backlog', '',
        'No roadmap duplicates or superseded scopes were found. Score/Pareto help (#76), executable walkthrough (#78) and report interpretation (#81) have distinct deliverables. Export recovery (#77/#95) is reusable context for #81. Forms (#83) and PR handoff (#84) are distinct. Discovery contracts (#85/#94) do not fix API promises (#86). #90 coordinates #87–#89 without replacing them. Historical import/persistence/image/theme issues do not settle remaining current help/capture needs.', '',
        '**66 issue source citations checked: 65 tracked files still exist on main.** Their old SHA/line pins are harmless historical evidence, not promises of current line numbers. The single broken citation is closed #83 → `planning/product-compass.md:108`: absent at both its pinned SHA and current main. A local ignored file with that name exists, but is excluded from public-main evidence. README:217 and maintained planning/future_plans.md:5 also require it. This is materially misleading for an outside contributor; include public-route repair in #82/#86 and remove the bad #83 citation. No other deleted filename or obsolete issue test command was found. The v0.12.2 context statements are historical; current main/release are recorded separately here.', '',
        '**No uncovered new issue candidate is needed.** Public Compass routing fits #82/#86; full-project archival wording fits #81. Do not create another docs-CI issue or duplicate merged contribution/schema/recovery work. No current evidence admits larger caps, W2/W3, new RF models, AI optimization, enterprise/mobility/capacity systems, terrain promotion or calibration. Do not turn PR #63’s unvalidated security assertion into a duplicate/new issue.', '',
        '## Current roadmap shape and proposed mutations', '',
        '- **Ready / contributor-friendly:** #76, #78, #79, #81, #82, #86.',
        '- **Blocked / maintainer-owned scientific work:** #87, #88, #89, #90. #87–#89 are research-heavy; #90 coordinates final study readiness.',
        '- **Closure candidates:** none. **Reopen candidates:** none.',
        '- **Body refresh candidates:** #81 (retention/archive scope), #82 (public setup/Pandoc), #83 (bad public reference; keep closed), #86 (current release evidence and unavailable Compass prerequisite). No title change or broad rewrite is needed.',
        '- **Mutation plan:** four `update-body`, eleven `leave-unchanged`; zero close/reopen/relabel/remove-label/update-title. Full proposed replacement bodies, reasons, evidence, risks and expected body hashes/updated_at are in `issue-mutation-plan.json`. All are proposals; re-fetch and compare before any later authorized change.', '',
        '## Checks, files and limitations', '',
        'Local focused checks passed: 82 frontend tests across ProjectMenu recovery, project-file reliability and App workflows; Go operational-response/readiness tests; 14 documentation tests; strict OpenAPI (42 paths); docs/assets/links (58 HTML pages); VERSION consistency. The isolated build uses `git archive origin/main` and Pandoc 3.10 and leaves no generated changes. Claim/classification checks passed before and after report/catalog creation. Issue-form structure, 63 criterion records, original lock hash, exact catalog additions and unchanged production scope pass audit verification. Main CI supplies full browser/race/security evidence. No expensive RF qualification was run. A final authenticated read at 10:16 UTC confirms main and all issue states, bodies and updated_at values remain unchanged from the initial snapshot.', '',
        'Created the Markdown and JSON reports, audit collector/renderer/verification support, original immutable lock/hash, scope supplement, full issue mutation plan and paginated GitHub/source/test evidence under `scripts/v0.12.2-live-issue-validation-audit/`. The only existing-file change is two historical audit entries in `docs/doc-sources.json`. No production code, backlog implementation, public comment, issue state/labels/assignee/body, PR or release was changed. No commit was created.', '',
        'Limitations: point-in-time snapshot; no user comprehension study, fresh field collection, vendor contact or private truth retrieval. Full local browser/race/security runs were not repeated. Issue forms were checked as YAML/structure without submitting an issue; native PR template recognition/prepopulation is evidenced by the community profile and subsequent PR body. GitHub Projects inventory/views were outside this issue-validation scope. Ignored local files were not substituted for public main. Body refresh suggestions do not certify future wording until review.', '',
        '## Final decision', '',
        '**B. BACKLOG MOSTLY VALID — SMALL CORRECTIONS NEEDED.** The v0.12.2 audit’s substantive roadmap still holds, with five correctly completed issues and six Ready tasks now remaining. Its original all-open inventory, absent contribution forms/template, absent schemas/glossary/recovery and documentation-CI failure are historical. Scientific non-promotion gates still hold exactly.', '',
        'Highest-priority valid open issue: **#87 (P1)**; highest-priority actionable issue: **#82 (P2)**. Best current good first issue: **#81**. Most important blocked scientific issue: **#87**, matching the readiness ledger’s primary next blocker. Issues to close now: **none**. Broad rewrites: **none**; bounded body refreshes: **#81/#82/#83/#86**.', '',
        '**Single recommended next action:** review the exact body-only mutation plan for #81/#82/#83/#86 before separately authorizing any GitHub update. Stop after this audit; do not implement the backlog.', '',
    ]
    Path(str(REPORT) + '.md').write_text('\n'.join(lines))
    catalog_path = ROOT / 'docs/doc-sources.json'
    catalog = json.loads(catalog_path.read_text())
    for suffix in ['.md', '.json']:
        path = Path(str(REPORT) + suffix).relative_to(ROOT).as_posix()
        catalog['sources'][path] = {'classification': 'HISTORICAL AUDIT / QUALIFICATION', 'reason': 'Dated live GitHub issue validation against pinned current main; audit evidence, not maintained product claims.'}
    catalog['sources'] = dict(sorted(catalog['sources'].items()))
    catalog_path.write_text(json.dumps(catalog, indent=2) + '\n')
    print(json.dumps({'issues': len(issues), 'criteria': sum(len(i['acceptance_criteria']) for i in issues), 'verdict': audit['verdict'], 'proposed_updates': UPDATES}))


if __name__ == '__main__':
    main()
