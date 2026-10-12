#!/usr/bin/env python3
"""Authorized sequence: non-scoring proof → freeze → W1-only qualification → quality."""
import pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-w1-shipping-qualification')
for script,logname in [('precheck.py','producer-v3.log'),('finish.py','finish.log')]:
 with (WORK/logname).open('x') as log:code=subprocess.run(['python3',str(HERE/script)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
 print(script,'exit',code,flush=True)
 if code:raise SystemExit(code)
