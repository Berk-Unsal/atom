#!/usr/bin/env python3
"""Route each lexical occurrence to adjudicated claim families, without making tests into RF accuracy.

Rules are transparent indexing aids. The human-readable context/claim matrix owns the judgment;
this file does not independently validate historical numbers, physical models or field accuracy.
"""
import collections
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent
report = json.loads((ROOT/'docs/v0.12.1-post-release-product-scientific-audit.json').read_text())
claims = {c['id']: c for c in report['claim_inventory']}
rows = json.loads((OUT/'claim-language-scan.json').read_text())
current = {'README.md','docs/index.md','docs/index.html','docs/overview.md','docs/features.md','docs/features.html','docs/algorithms.md','docs/algorithms.html','docs/api.md','docs/api.html','docs/architecture.md','docs/architecture.html','docs/getting-started.md','docs/download.html','docs/faq.md','docs/faq.html','docs/modeling-limits.md','docs/modeling-limits.html','docs/visualization.md','docs/visualization.html','docs/deployment.md','docs/deployment.html','docs/project-format.md','docs/contributing.md','docs/contributing.html','docs/dataset-pack-studio.md','docs/dataset-pack-studio.html'}

def route(row):
    p, line = row['file'], row['text']
    t = line.lower()
    ids = []
    def add(*values):
        for value in values:
            if value not in ids: ids.append(value)
    nature = 'contextual claim/limit or capability statement'
    if 'more accurate coverage prediction' in t:
        return ['C26'], 'future contribution example, not an existing measured-accuracy claim'
    if 'coordinates precisely' in t:
        return ['C40'], 'coordinate-editing precision, not propagation accuracy'
    if 'real-world data' in t:
        return ['C40','C45'], 'real geographic input data, not real-world RF accuracy'
    if 'precise handover' in t:
        return ['C47'], 'explicit exclusion, not a precision claim'
    if 'verified rf follow' in t or 'verified follow-up' in t or 'prebook' in t or 'ratelimit' in t or 'retry-after' in t or 'budget' in p:
        add('C36')
    if 'profile a' in t or '2 cpu' in t or '4 gib' in t:
        add('C11','C02')
    if 'eight-cell' in t or 'eight cell' in t or '8-cell' in t:
        add('C01','C02')
    if 'auto-resource' in p or 'estimator' in t or 'admission' in t:
        add('C37')
    if '1.5' in t and ('receiver' in t or 'height' in t or 'hut' in t or 'h_ut' in t):
        add('C20','C25')
    if 'seconds' in t or 'minutes' in t or 'elapsed' in t or 'latency' in t:
        add('C08' if 'deadline' in p or 'optimization' in t else 'C02')
    if 'datum' in t or 'terrain' in p or 'terrain' in t:
        add('C26','C27')
    if 'sub-thz' in p or any(x in p for x in ('4i1','4i2','4i3','4i4','4i5')):
        add('C05','C28')
    if any(x in p for x in ('6a1','6a-')) or any(x in t for x in ('canonical observation','serving semantics','signal collector')):
        add('C15','C07','C16')
    if 'interference' in t or 'sinr' in t or 'rsrq' in t or 'rsrp' in t:
        add('C13')
    if 'measurement' in t or 'residual' in t or 'mae' in t or 'rmse' in t:
        add('C14')
    if 'calibrat' in t:
        add('C16')
    if 'not calibrated' in t or 'not a calibrated' in t or 'field calibration' in t or 'not ue' in t:
        add('C07')
        nature = 'explicit measured-accuracy/calibration limit'
    if 'dataset' in t or 'geojson' in t or 'crs' in t or 'pack' in t or 'manifest' in t:
        add('C40')
    if 'persist' in t or 'export' in t or 'project file' in t or 'schema-v3' in t:
        add('C18')
    if 'report' in t or 'artifact' in t or 'sha-256' in t:
        add('C43')
    if '3gpp' in t or 'uma' in t or 'propagation' in t:
        add('C06','C03','C04')
    if 'p.1411' in t or 'p.2040' in t or 'p.676' in t or 'p.526' in t or 'reference' in p:
        add('C28')
    if 'antenna' in t:
        add('C24')
    if 'optimal' in t or 'pareto' in t:
        add('C12','C29')
    if p == 'docs/overview.md':
        nature = 'unarchived current repository product overview; not linked from maintained docs hub'
    if not ids:
        add('C19')
        nature = 'software/data validation or historical method context; no standalone measured-accuracy assertion identified'
    # An occurrence can contain several atomic claims, each with one level in the main matrix.
    return ids,nature

assessed=[]
for row in rows:
    ids,nature=route(row)
    role = 'current public guide' if row['file'] in current else 'release history' if 'changelog' in row['file'].lower() else 'implementation/UI source' if row['file'].startswith('frontend-react/') else 'historical/reference evidence'
    assessed.append({**row,'source_role':role,'interpretation':nature,'atomic_claims':[{'id':i,'evidence_level':claims[i]['evidence_level'],'support':claims[i]['supported']} for i in ids],'judgment_scope':'Apply the cited family qualification and local negation/conditional context; no promotion from successful validation/import to measured accuracy.'})
manual=[]
for c in claims.values():
    if c['evidence_level']=='F':
        manual.append({'claim_id':c['id'],'claim':c['claim'],'support':c['supported'],'locations':c['evidence'],'qualification':c['qualification_needed']})
result={'method':'Complete lexical occurrence index routed to manually adjudicated atomic claim families; transparent rule-based routing is not independent semantic/physical verification. Multi-claim lines inherit multiple separate atomic judgments, never one blended evidence grade. All F exceptions are explicitly listed even when their wording does not match the accuracy regex.','occurrences':len(assessed),'files':len(set(r['file'] for r in rows)),'source_roles':dict(collections.Counter(r['source_role'] for r in assessed)),'primary_matrix': 'docs/v0.12.1-post-release-product-scientific-audit.json#claim_inventory','unsupported_wording_exceptions':manual,'rows':assessed}
(OUT/'claim-language-assessment.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:result[k] for k in ('occurrences','files','source_roles')}))
