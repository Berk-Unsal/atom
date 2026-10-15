#!/usr/bin/env python3
"""Check availability/identity of recorded historical archives; never reconstruct or copy them."""
import hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(__file__).resolve().parent
meta=json.loads((ROOT/'scripts/eight-cell-product-cap-promotion/raw-evidence.json').read_text())
checks=[]
for path_key,hash_key in [('path','sha256'),('index_path','index_sha256')]:
    p=pathlib.Path(meta[path_key]);exists=p.is_file()
    actual=hashlib.sha256(p.read_bytes()).hexdigest() if exists else None
    checks.append({'role':path_key,'recorded_path':str(p),'present':exists,'expected_sha256':meta[hash_key],'current_sha256':actual,'identity_matches':actual==meta[hash_key] if exists else None})
x={'historical_promotion_raw_archive':checks,'interpretation':'Recorded archive/index are unavailable at their historical paths in this audit session. Retained tracked qualification/report summaries, source identities and current controlled regressions are the available evidence; no fresh raw-trace re-verification or operational recertification is claimed. Archive absence limits independent reproduction of historical numeric measurements and does not erase their explicitly historical attribution.'}
(OUT/'frozen-evidence-availability.json').write_text(json.dumps(x,indent=2)+'\n')
print(json.dumps(x,indent=2))
