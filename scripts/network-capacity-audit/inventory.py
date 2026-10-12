#!/usr/bin/env python3
"""Record cap ownership and fixture/documentation assumptions without editing them."""
import pathlib,re,json,subprocess
root=pathlib.Path(__file__).resolve().parents[2]
files=subprocess.check_output(['rg','--files','backend-go','frontend-react/src','frontend-react/e2e','docs','scripts','policy','README.md','CHANGELOG.md'],cwd=root,text=True).splitlines()
patterns=[r'MaxNetworkTowers',r'MAX_NETWORK_CELLS',r'network_towers_max',r'measurement_towers_max',r'MaxMeasurementTowers',r'MaxRecommendationTowers',r'recommendation_towers_max',r'maxItems:\s*[56](?:\D|$)',r'(?:one|two).to.six',r'six[ -](?:cell|tower|selected|sector|node)',r'(?:at most|up to|maximum of) six',r'6[ -](?:cell|tower)',r'six(?:Cells|Towers| Ankara cells)',r'six_(?:cell|tower)',r'(?:cells|cellCount|towers)\s*[:=]\s*6\b',r'Array\(6\)\.fill',r'6 cells',r'6 Cells',r'Maximum 6',r'between [12] and [56] selected',r'(?:slice|length).*\b6\b']
rx=re.compile('|'.join(patterns),re.I);rows=[]
for name in files:
 if any(x in name for x in ['network-capacity-audit','network_capacity_audit','network-size-capacity','network-capacity.spec','network-capacity-live.spec']) or name.endswith(('.html','.json','.geojson','.png','.svg')) and name!='policy/rf-policy.json':continue
 p=root/name
 if not p.is_file():continue
 for line,text in enumerate(p.read_text(errors='replace').splitlines(),1):
  if not rx.search(text):continue
  if ('test' in name or '/e2e/' in name):kind='test fixture assumption'
  elif name.startswith('docs/') or name in ['README.md','CHANGELOG.md']:kind='documentation only'
  elif name.startswith('backend-go/') or name=='policy/rf-policy.json' or 'generate_policy' in name:kind='hard safety limit' if any(x in text for x in ['MaxNetworkTowers','network_towers_max','between','MaxMeasurementTowers','MaxRecommendationTowers','_towers_max']) else 'incidental constant'
  elif 'MAX_NETWORK_CELLS' in text or 'normalizeNetworkSelection' in text or 'two to six' in text:kind='product UX limit'
  else:kind='incidental constant'
  rows.append({'file':name,'line':line,'classification':kind,'evidence':text.strip()})
(root/'docs/network-size-capacity-cap-inventory.json').write_text(json.dumps(rows,indent=2)+'\n')
print(f'{len(rows)} references in {len(set(r["file"] for r in rows))} files')
