#!/usr/bin/env python3
"""Instrumentation exists exclusively in a disposable backend copy."""
import argparse,os,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--workdir',default='/tmp/atom-resource-geometry');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path(a.workdir).resolve()
if w.parent!=pathlib.Path('/tmp').resolve() or not w.name.startswith('atom-resource-'):p.error('dedicated /tmp/atom-resource-* workdir required')
subprocess.run(['python3',str(ROOT/'scripts/rf-resource-admission-study/prepare.py'),'--run','--workdir',str(w)],check=True)
b=w/'backend-go'; source=(ROOT/'backend-go/main.go').read_text();routes=source[source.index('\tregisterExperimentRoutes(router, experiments, datasets)'):source.index('\tregisterCoreLabRoutes(router)')]
(b/'geometry_study_test.go').write_text((ROOT/'scripts/auto-resource-geometry/study.go.txt').read_text().replace('// ROUTES',routes))
subprocess.run(['gofmt','-w',str(b/'geometry_study_test.go')],check=True)
subprocess.run(['go','test','-c','-o',str(w/'geometry.test')],cwd=b,env=os.environ|{'GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0'},check=True)
subprocess.run(['node',str(ROOT/'scripts/auto-resource-geometry/fixtures.mjs'),str(w/'geometry')],check=True)
