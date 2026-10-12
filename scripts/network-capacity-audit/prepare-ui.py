#!/usr/bin/env python3
import pathlib,shutil,json
root=pathlib.Path(__file__).resolve().parents[2];work=pathlib.Path('/tmp/atom-network-capacity');front=work/'frontend-react'
shutil.copytree(root/'frontend-react',front,dirs_exist_ok=True,ignore=shutil.ignore_patterns('node_modules','dist','test-results','playwright-report'))
if not (front/'node_modules').exists():(front/'node_modules').symlink_to(root/'frontend-react/node_modules',target_is_directory=True)
p=front/'src/utils/networkSelection.js';s=p.read_text();assert s.count('MAX_NETWORK_CELLS = 6')==1;p.write_text(s.replace('MAX_NETWORK_CELLS = 6','MAX_NETWORK_CELLS = 12'))
p=front/'src/generated/policy.js';s=p.read_text();assert s.count('"network_towers_max": 6')==1;p.write_text(s.replace('"network_towers_max": 6','"network_towers_max": 12'))
print(front)
