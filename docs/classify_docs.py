#!/usr/bin/env python3
"""Maintain an explicit source catalog so current claims never rewrite historical evidence."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / 'docs/doc-sources.json'
CURRENT = {'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'planning/future_plans.md', *('docs/' + name for name in [
    'index.md', 'index.html', 'overview.md', 'algorithms.md', 'algorithms.html', 'api.md', 'api.html', 'openapi.yaml',
    'architecture.md', 'architecture.html', 'features.md', 'features.html',
    'getting-started.md', 'download.html', 'modeling-limits.md', 'modeling-limits.html',
    'visualization.md', 'visualization.html', 'deployment.md', 'deployment.html',
    'dataset-pack-studio.md', 'dataset-pack-studio.html', 'faq.md', 'faq.html',
    'terminology.md', 'terminology.html', 'report-guide.md', 'report-guide.html',
    'project-format.md', 'project-format.html', 'contributing.md', 'contributing.html',
    'changelog.html', 'planning-walkthrough.md', 'planning-walkthrough.html',
])}
CLASSES = {'CURRENT PRODUCT DOC', 'HISTORICAL AUDIT / QUALIFICATION', 'RESEARCH REFERENCE', 'INTERNAL DESIGN'}
LOCAL_TOOL_DIRS = {'.impeccable', '.venv', '__pycache__'}


def source_paths():
    return sorted({'docs/doc-sources.json', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'PRODUCT.md', 'planning/product-compass.md', 'planning/future_plans.md',
                   *(p.relative_to(ROOT).as_posix() for p in (ROOT/'docs').rglob('*')
                     if p.is_file() and p.suffix in ('.md', '.html', '.json', '.yaml', '.yml')
                     and not LOCAL_TOOL_DIRS.intersection(p.relative_to(ROOT/'docs').parts))})


def classify(path):
    name = Path(path).name
    if path in CURRENT:
        return 'CURRENT PRODUCT DOC', 'Maintained product/API/task guide; published changelog sections remain historical, only Unreleased is editable.'
    if name == 'priority-issue-plan.md':
        return 'INTERNAL DESIGN', 'Dated issue triage and execution scope; not completion or release evidence.'
    if name == 'planning-walkthrough-evidence.json':
        return 'HISTORICAL AUDIT / QUALIFICATION', 'Recorded deterministic public-pack example, exact inputs and runtime scope; not measured physical accuracy.'
    if path in ('PRODUCT.md', 'planning/product-compass.md') or name in ('doc-sources.json', 'search-index.json', 'reference-template.html'):
        return 'INTERNAL DESIGN', 'Product/design or generated navigation infrastructure; search entries inherit the referenced page scope.'
    if 'claim-reconciliation' in name or 'post-release-product-scientific-audit' in name:
        return 'HISTORICAL AUDIT / QUALIFICATION', 'Dated audit/remediation evidence, not maintained product copy.'
    if 'design' in name.lower() or 'campaign-spec' in name:
        return 'INTERNAL DESIGN', 'Dated design/collection proposal; no implementation or qualification inferred.'
    if name.startswith('concept-'):
        return 'RESEARCH REFERENCE', 'Scoped concept/model/research record; historical results and non-promotion boundaries preserved.'
    if path.startswith('docs/assets/') or any(token in name for token in (
        'audit', 'study', 'qualification', 'certification', 'promotion', 'measurements',
        'auto-resource', 'network-size', 'operational-budget', 'request-budget', 'bounded-followup',
        'dark-mode', 'basemap-', 'optimization-operation', 'bug-fixes',
    )):
        return 'HISTORICAL AUDIT / QUALIFICATION', 'Scoped implementation, visual, regression or operational evidence; original limits/measurements preserved.'
    if Path(path).suffix == '.json':
        return 'RESEARCH REFERENCE', 'Scientific/reference schema or evidence data, not a general product claim.'
    raise ValueError(f'Unclassified documentation source: {path}; choose its scope explicitly')


def catalog_errors(catalog):
    sources = catalog.get('sources', {})
    errors = []
    if set(sources) != set(source_paths()):
        errors.append(f'source catalog drift: missing={sorted(set(source_paths())-set(sources))}, obsolete={sorted(set(sources)-set(source_paths()))}')
    for path, entry in sources.items():
        if entry.get('classification') not in CLASSES or not entry.get('reason'):
            errors.append(f'invalid documentation classification: {path}')
        if path in CURRENT and entry.get('classification') != 'CURRENT PRODUCT DOC':
            errors.append(f'current product source must not be hidden as history: {path}')
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if args.write:
        sources = {}
        for path in source_paths():
            category, reason = classify(path)
            sources[path] = {'classification': category, 'reason': reason}
        CATALOG.write_text(json.dumps({'schema_version': 1, 'policy': 'Claim cleanup targets CURRENT PRODUCT DOC; dated audit/qualification, research and design sources are preserved. Root/generated changelog: Unreleased only is current; released sections remain evidence.', 'sources': sources}, indent=2) + '\n')
    catalog = json.loads(CATALOG.read_text())
    if errors := catalog_errors(catalog): raise SystemExit('\n'.join(errors))
    print(f'documentation classifications valid: {len(catalog["sources"])} sources')


if __name__ == '__main__': main()
