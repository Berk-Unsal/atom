"""Authenticated, GET-only GitHub snapshot. No remote mutation endpoints."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'evidence'
OUT.mkdir(exist_ok=True)
REPO = 'repos/Berk-Unsal/atom'


def fetch(name, endpoint, pages=False):
    command = ['gh', 'api', '--method', 'GET', endpoint]
    if pages:
        command += ['--paginate', '--slurp']
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        data = {'error': result.stderr, 'endpoint': endpoint}
    else:
        data = json.loads(result.stdout)
        if pages:
            data = [item for page in data for item in page]
    (OUT / (name + '.json')).write_text(json.dumps(data, indent=2) + '\n')
    return name, data


def batch(jobs):
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        return dict(pool.map(lambda job: fetch(*job), jobs))


def main():
    initial = batch([
        ('repository', REPO),
        ('issues-and-prs', REPO + '/issues?state=all&per_page=100', True),
        ('pulls', REPO + '/pulls?state=all&per_page=100', True),
        ('labels', REPO + '/labels?per_page=100', True),
        ('milestones', REPO + '/milestones?state=all&per_page=100', True),
        ('releases', REPO + '/releases?per_page=100', True),
        ('main', REPO + '/commits/main'),
        ('workflow-runs', REPO + '/actions/runs?branch=main&per_page=100'),
        ('all-issue-comments', REPO + '/issues/comments?per_page=100', True),
        ('community-profile', REPO + '/community/profile'),
    ])
    issues = [i for i in initial['issues-and-prs'] if 'pull_request' not in i]
    created = min(i['created_at'] for i in issues if 76 <= i['number'] <= 90)
    prs = [p for p in initial['pulls'] if p['state'] == 'open' or
           (p.get('merged_at') and p['merged_at'] >= created)]
    jobs = []
    for n in range(76, 91):
        jobs += [(f'issue-{n}', f'{REPO}/issues/{n}'),
                 (f'issue-{n}-timeline', f'{REPO}/issues/{n}/timeline?per_page=100', True)]
    for p in prs:
        n = p['number']
        for suffix, endpoint in [('', ''), ('-files', '/files?per_page=100'),
                                 ('-reviews', '/reviews?per_page=100'),
                                 ('-review-comments', '/comments?per_page=100'),
                                 ('-commits', '/commits?per_page=100')]:
            jobs.append((f'pr-{n}{suffix}', f'{REPO}/pulls/{n}{endpoint}', bool(suffix)))
    details = batch(jobs)
    runs = initial['workflow-runs'].get('workflow_runs', [])
    # Retain latest per workflow plus failed runs since the roadmap baseline.
    selected = {}
    for run in runs:
        if run['workflow_id'] not in selected:
            selected[run['workflow_id']] = run
    ids = {r['id'] for r in selected.values()}
    ids |= {r['id'] for r in runs if r['created_at'] >= created and r['conclusion'] == 'failure'}
    batch([(f'run-{n}-jobs', f'{REPO}/actions/runs/{n}/jobs?per_page=100') for n in sorted(ids)])
    batch([('current-check-runs', f"{REPO}/commits/{initial['main']['sha']}/check-runs?per_page=100"),
           ('fixed-documentation-jobs', REPO + '/actions/runs/38776451915/jobs?per_page=100')])
    checks = []
    for pr in prs:
        if pr['state'] == 'open':
            number = pr['number']
            sha = details[f'pr-{number}']['head']['sha']
            checks.append((f'pr-{number}-checks', f'{REPO}/commits/{sha}/check-runs?per_page=100'))
    batch(checks)
    summary = {'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'issue_count': len(issues), 'open_issues': sum(i['state'] == 'open' for i in issues),
               'closed_issues': sum(i['state'] == 'closed' for i in issues),
               'main': initial['main']['sha'], 'roadmap_baseline_created_at': created,
               'prs_inspected': [p['number'] for p in prs],
               'errors': [k for k, v in {**initial, **details}.items() if isinstance(v, dict) and 'error' in v]}
    (OUT / 'snapshot-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
