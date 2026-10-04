#!/usr/bin/env python3
"""Bounded resource study, explicit opt-in; instrument only a fresh disposable copy, never production."""
import argparse, json, os, pathlib, re, shutil, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(); p.add_argument('--run', action='store_true'); p.add_argument('--eight', action='store_true'); p.add_argument('--workdir', default='/tmp/atom-resource-study'); args=p.parse_args()
if not args.run: p.error('explicit --run required')
w=pathlib.Path(args.workdir).resolve()
if w.parent != pathlib.Path('/tmp').resolve() or not w.name.startswith('atom-resource-'):
 p.error('workdir must be a dedicated /tmp/atom-resource-* directory')
w.mkdir(exist_ok=True,parents=True)
b=w/'backend-go'
if b.exists(): shutil.rmtree(b)
shutil.copytree(ROOT/'backend-go',b,ignore=shutil.ignore_patterns('*.test','atom','dataset-cache'))
if not (w/'data-pipeline').exists(): (w/'data-pipeline').symlink_to(ROOT/'data-pipeline',target_is_directory=True)
subprocess.run(['node',str(ROOT/'scripts/network-capacity-audit/fixtures.mjs'),str(w/'fixtures')],check=True,stdout=subprocess.DEVNULL)
# Optional eight-cell comparison is confined to this disposable copy, retaining guards.
f=b/'raytracer/policy_generated.go'; s=f.read_text(); assert s.count('MaxNetworkTowers                   = 6')==1;
if args.eight: f.write_text(s.replace('MaxNetworkTowers                   = 6','MaxNetworkTowers                   = 8'))
# Race-safe counters have no scientific effect; overhead is included in timings.
(b/'raytracer/policy_audit_counters.go').write_text('''package raytracer
import "sync/atomic"
var AuditQueries, AuditCandidates, AuditRays, AuditPolygons, AuditCoverage, AuditIntersections, AuditEdges atomic.Int64
func AuditReset(){AuditQueries.Store(0);AuditCandidates.Store(0);AuditRays.Store(0);AuditPolygons.Store(0);AuditCoverage.Store(0);AuditIntersections.Store(0);AuditEdges.Store(0)}
func AuditCounts() map[string]int64{return map[string]int64{"spatial_queries":AuditQueries.Load(),"spatial_candidates":AuditCandidates.Load(),"ray_traces":AuditRays.Load(),"polygon_tests":AuditPolygons.Load(),"coverage_builds":AuditCoverage.Load(),"polygon_intersection_calls":AuditIntersections.Load(),"edge_intersection_checks":AuditEdges.Load()}}
''')
f=b/'raytracer/building_index.go'; s=f.read_text(); s=s.replace('func (idx *BuildingIndex) SearchBounds(bounds Bounds) []*BuildingFootprint {','func (idx *BuildingIndex) SearchBounds(bounds Bounds) []*BuildingFootprint {\n AuditQueries.Add(1)'); s=s.replace('candidates = append(candidates, footprint)','AuditCandidates.Add(1)\n candidates = append(candidates, footprint)'); f.write_text(s)
for filename, names in [('geometry.go',['PointInPolygon']),('static_simulation.go',['simulateSegmentedRayInternalWithBudgetContext','buildBeamCoverageProfilesContext'])]:
 f=b/'raytracer'/filename; s=f.read_text()
 for name in names:
  counter={'PointInPolygon':'AuditPolygons','simulateSegmentedRayInternalWithBudgetContext':'AuditRays','buildBeamCoverageProfilesContext':'AuditCoverage'}[name]
  s,n=re.subn(r'(func '+name+r'\([^\n]+\{)',r'\1\n '+counter+'.Add(1)',s); assert n==1,name
 f.write_text(s)
f=b/'raytracer/segment_geometry.go';s=f.read_text()
for name,counter in [('segmentPolygonIntersectionsContext','AuditIntersections'),('SegmentIntersectionPoint','AuditEdges')]:
 s,n=re.subn(r'(func '+name+r'\([^\n]+\{)',r'\1\n '+counter+'.Add(1)',s);assert n==1
f.write_text(s)
# Linux Alpine lacks ps RSS columns; use proc before the portable ps fallback.
f=b/'network_capacity_audit_test.go';s=f.read_text().replace('func capacityRSS() int64 {',r'''func capacityRSS() int64 {
 if runtime.GOOS=="linux" {b,_:=os.ReadFile("/proc/self/status");for _,line:=range strings.Split(string(b),"\n"){if strings.HasPrefix(line,"VmRSS:"){fields:=strings.Fields(line);n,_:=strconv.ParseInt(fields[1],10,64);return n*1024}}}''');f.write_text(s)
f=b/'experiment_jobs.go';s=f.read_text().replace('func (manager *experimentManager) run(jobID string) {','func (manager *experimentManager) run(jobID string) {\n auditExperimentActive.Add(1);defer auditExperimentActive.Add(-1)');f.write_text(s)
for f in b.glob('*.go'):
 if not f.name.endswith('_test.go'): f.write_text(f.read_text().replace('c.JSON(', 'auditJSON(c, '))
(b/'policy_audit_json.go').write_text('''package main
import("time";"sync/atomic";"github.com/gin-gonic/gin")
var auditJSONNS atomic.Int64
var auditExperimentActive atomic.Int64
func auditJSON(c *gin.Context,code int,payload any){start:=time.Now();c.JSON(code,payload);auditJSONNS.Add(time.Since(start).Nanoseconds())}
''')
main=(ROOT/'backend-go/main.go').read_text(); routes=main[main.index('\tregisterExperimentRoutes(router, experiments, datasets)'):main.index('\tregisterCoreLabRoutes(router)')]
template=(ROOT/'scripts/rf-resource-admission-study/harness.go.txt').read_text().replace('// ROUTES',routes)
reflection=(ROOT/'backend-go/sub_thz_reflection_reference_route_test.go').read_text().split('payload := ',1)[1].split('\n\tbody, err :=',1)[0]
template=template.replace('// REFLECTION','return '+reflection)
(b/'resource_study_test.go').write_text(template)
(b/'resource_domain_test.go').write_text((ROOT/'scripts/rf-resource-admission-study/domain.go.txt').read_text())
(b/'resource_queue_test.go').write_text((ROOT/'scripts/rf-resource-admission-study/queue.go.txt').read_text())
subprocess.run(['gofmt','-w',str(b/'resource_study_test.go'),str(b/'resource_domain_test.go'),str(b/'resource_queue_test.go'),str(b/'policy_audit_json.go'),str(b/'raytracer/policy_audit_counters.go')],check=True)
subprocess.run(['go','test','-c','-o',str(w/'resource.test')],cwd=b,check=True)
# Literal JSON contract examples are preserved from existing route tests.
extras={}
for endpoint,filename in [('path-profile','path_profile_route_test.go'),('sub-thz-validation','sub_thz_validation_route_test.go'),('sub-thz-material-reference','sub_thz_material_reference_route_test.go')]:
 s=(ROOT/'backend-go'/filename).read_text(); extras['/api/'+endpoint]=json.loads(re.search(r'body := (?:\[\]byte\()?`([^`]+)`',s).group(1))
extras['/api/sub-thz-reference']={'frequency_ghz':140,'transmitter':{'lon':32.85,'lat':39.92,'height_m':25},'receiver':{'lon':32.851,'lat':39.92,'height_m':1.5},'atmosphere':{'enabled':True,'pressure_hpa':1013.25,'temperature_k':288.15,'water_vapour_density_g_m3':7.5},'rain':{'enabled':False},'local_fog':{'enabled':False}}
extras['/api/sub-thz-p1411-reference']={'frequency_ghz':140,'transmitter':{'lon':32.85,'lat':39.92,'height_m':10},'receiver':{'lon':32.85,'lat':39.9209,'height_m':10},'morphology':'urban_high_rise','rooftop_relation':'both_below_rooftop','los_state':'los','provenance':{k:'geometry_derived' if k=='distance_m' else 'user_declared' for k in ['frequency_ghz','distance_m','tx_height_m','rx_height_m','morphology','rooftop_relation','los_state']}}
# Reflection example captured via the existing contract map in a small generated test helper.
(w/'extras.json').write_text(json.dumps(extras))
out=w/'raw'; out.mkdir(exist_ok=True)
print('prepared', w, flush=True)
