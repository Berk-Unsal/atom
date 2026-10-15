#!/usr/bin/env python3
"""Concept-level regressions for maintained public claims; historical records are excluded."""
import argparse
import json
import re
from html import unescape
from pathlib import Path

from classify_docs import CATALOG, ROOT, catalog_errors


def plain(text):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'</?[A-Za-z][^>]*>', ' ', text))).strip()


def current_text(path):
    text = (ROOT/path).read_text()
    if path == 'CHANGELOG.md':
        text = text.split('## [Unreleased]', 1)[1].split('\n## [', 1)[0]
    elif path == 'docs/changelog.html':
        text = text.split('id="unreleased"', 1)[1].split('<h2', 1)[0]
    return text


def negated(sentence, start):
    prefix = sentence[max(0, start-100):start].lower()
    suffix = sentence[start:start+120].lower()
    return bool(re.search(r'\b(?:no|not|never|without|excludes?|unavailable|unsupported)\b', prefix)
                or re.search(r'\b(?:not implemented|not established|unestablished|outside .*scope)\b', suffix))


PROHIBITED = [
    ('stale normal network maximum6', r'(?:network.{0,100}|(?:select|choose).{0,30})\b(?:two|2)\s*(?:to|[-–])\s*(?:six|6)\b'),
    ('Measurement Validation scope inflated to8', r'measurement(?: validation)?\b.{0,65}(?:accepts?|maximum|max|up to|one to)\s*(?:eight|8)\b'),
    ('unsupported vendor antenna validation', r'\bvalidat\w*\s+(?:vendor\s+)?antenna\s+(?:hardware|performance)'),
    ('unsupported canonical terrain planning', r'(?:terrain-aware\s+(?:canonical|network)\s+planning|(?:canonical|network)\s+(?:RF\s+)?planning\s+(?:uses?|includes?)\s+terrain)'),
    ('stale normal selected Cell maximum6', r'(?:deadline|normal network).{0,50}(?:six|6) selected cells'),
    ('unsupported unscoped p99 benchmark', r'<\s*100\s*ms\s*p99'),
    ('unsupported sub100ms benchmark', r'\bsub[- ]?100\s*(?:ms|milliseconds)\b'),
    ('unsupported multiplier benchmark', r'\b\d+(?:\.\d+)?\s*(?:×|x)\s*(?:faster|speedup)|\bspeedup\s*:\s*\d+'),
    ('unsupported generic runtime benchmark', r'(?:typical response time|optimization runtime|optimized time|total time)\s*:\s*~?\s*\d'),
    ('global optimum assertion', r'\b(?:globally optimal|global (?:mathematical )?optimum|maximum coverage)\b'),
    ('complete operator-like dataset assertion', r'\bcomplete\s+(?:OSM\s+building|operator(?:[- ]like)?\s+(?:inventory|data))'),
    ('universal region scalability assertion', r'\bscales?\s+to\s+any\s+(?:city|region)'),
    ('unsupported beamforming control', r'\btoggle\s+beamforming'),
]


def claim_errors(text, path='fixture'):
    normalized = plain(text)
    errors = []
    for sentence in re.split(r'(?<=[.!?])\s+', normalized):
        for name, pattern in PROHIBITED:
            for match in re.finditer(pattern, sentence, re.I):
                if not negated(sentence, match.start()): errors.append(f'{path}: {name}: {sentence[:280]}')
    return errors


def validate_current_claims(catalog):
    errors = catalog_errors(catalog)
    for path, item in catalog['sources'].items():
        if item['classification'] == 'CURRENT PRODUCT DOC':
            errors.extend(claim_errors(current_text(path), path))
    features = plain(current_text('docs/features.md')).lower()
    if not re.search(r'network evaluation.{0,70}two to eight', features): errors.append('features: normal network must state two-to-eight scope')
    if not re.search(r'up to five existing input cells', features): errors.append('features: independent Recommendation5 scope missing')
    if not re.search(r'one to six selected 4g/5g cells', features): errors.append('features: independent Measurement6 scope missing')
    for path in ('README.md', 'docs/overview.md', 'docs/index.html', 'docs/modeling-limits.md'):
        text = plain(current_text(path)).lower()
        for term in ('2.6', '28', '140', 'research'):
            if term not in text: errors.append(f'{path}: missing model boundary {term}')
        if not re.search(r'(?:accuracy.{0,35}(?:not yet established|unestablished)|accuracy remains unestablished)', text):
            errors.append(f'{path}: measured real-world accuracy boundary missing')
    api = plain(current_text('docs/api.md')).lower()
    if not all(term in api for term in ('optimal_azimuth', '36 evaluated', 'residential', '578', 'global optimum')):
        errors.append('API: bounded single-sector/network objective semantics missing')
    app = (ROOT/'frontend-react/src/App.jsx').read_text()
    if 'Spatially validated global bias' in app or 'Residual bias review' not in app:
        errors.append('UI: use neutral bias-review wording before eligibility')
    return errors


def inventories(catalog):
    accuracy = re.compile(r'accurat\w*|validat\w*|calibrat\w*|precis\w*|realis\w*|real.world|production.grade|operator.grade|verif\w*', re.I)
    performance = re.compile(r'seconds?|milliseconds?|\bms\b|faster|speedup|concurren\w*|parallel\w*|scalab\w*|real.time|sub.100|performance|optimization time', re.I)
    output = []
    for path, item in catalog['sources'].items():
        if item['classification'] != 'CURRENT PRODUCT DOC': continue
        for number, line in enumerate(current_text(path).splitlines(),1):
            kinds = [kind for kind, pattern in [('accuracy',accuracy),('performance',performance)] if pattern.search(line)]
            if not kinds: continue
            content = plain(line)
            if not content: continue
            if claim_errors(line,path): classification='unsupported / remove'
            elif re.search(r'historical|recorded|uncached|6\.72',content,re.I): classification='historical and clearly scoped'
            elif re.search(r'future|planned|opportunit|contribut|profiling',content,re.I): classification='aspirational / label'
            else: classification='supported and scoped'
            output.append({'file':path,'line_in_current_scope':number,'kinds':kinds,'classification':classification,'text':content,'interpretation':'Context must distinguish model limits, software/input/hash checks, configuration deadlines, research scope and measured accuracy; these labels do not independently establish physical validity.'})
    return output


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--inventory',type=Path);args=parser.parse_args()
    catalog=json.loads(CATALOG.read_text());errors=validate_current_claims(catalog)
    if args.inventory: args.inventory.write_text(json.dumps(inventories(catalog),indent=2,ensure_ascii=False)+'\n')
    if errors: raise SystemExit('\n'.join(errors))
    print('current-doc claim regressions passed; historical/reference/design sources excluded explicitly')


if __name__=='__main__':main()
