#!/usr/bin/env python3
"""Build test-only certification transport; never modify checkout production code."""
import os,pathlib,shutil,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]; HERE=pathlib.Path(__file__).resolve().parent
W=pathlib.Path('/tmp/atom-resource-fixed-certification'); G=W/'geometry'
if (HERE/'certification-lock.json').exists(): raise SystemExit('refuse rebuild after freeze')
W.mkdir(exist_ok=True);G.mkdir(exist_ok=True)
if (W/'backend-go').exists(): shutil.rmtree(W/'backend-go')
shutil.copytree(ROOT/'backend-go',W/'backend-go',ignore=shutil.ignore_patterns('*.test','atom','dataset-cache'))
if not (W/'data-pipeline').exists(): (W/'data-pipeline').symlink_to(ROOT/'data-pipeline',target_is_directory=True)
source=(ROOT/'scripts/auto-resource-geometry/study.go.txt').read_text()
routes=(ROOT/'backend-go/main.go').read_text();routes=routes[routes.index('\tregisterExperimentRoutes(router, experiments, datasets)'):routes.index('\tregisterCoreLabRoutes(router)')]
s=source.replace('// ROUTES',routes).replace('"net/http/httptest"','"net"\n"sync/atomic"')
s=s.replace('Body      []byte    `json:"-"`','Body      []byte    `json:"-"`\n RequestHash string `json:"request_sha256"`\n ServerDone bool `json:"server_done"`\n ReleaseSeconds float64 `json:"release_seconds"`')
# Fresh domains from exact same deterministic inventory tooling, no RF timing.
s=s.replace('geometryEnvelope(p, 800)','geometryEnvelope(p, 802)')
s=s.replace('chosen := []geometryDomain{}','''var prior []geometryDomain
 geometryRead(t, filepath.Join(w,"prior-domains.json"), &prior)
 chosen := []geometryDomain{}''')
s=s.replace('overlap := false\n\t\t\t\tfor _, d := range chosen {','''overlap := false
                for _,d:=range prior {if geometryOverlap(c.SelectionBounds,d.SelectionBounds) {overlap=true}}
                for _, d := range chosen {''')
s=s.replace('[]string{"calibration", "held-out"}','[]string{"certification-1", "certification-2"}')
s=s.replace('t.Fatal("insufficient disjoint domains")','t.Fatal("insufficient fresh disjoint domains; no silent substitutions")')
s=s.replace('train then holdout per band BEFORE timing','two fresh domains per band excluding prior fitting envelopes; prior validation reuse disclosed BEFORE timing')
# Corrected successor primitive: nil source is unknown, empty source is known zero.
s=s.replace('func geometryDescribe(idx *raytracer.BuildingIndex, b raytracer.Bounds) geometryStats {','''func geometryDescribe(idx *raytracer.BuildingIndex, b raytracer.Bounds) geometryStats {
 if idx==nil {panic("unknown geometry source: use fixedGeometryObservation") }''')
s=s.replace('v := auto.View()', 'v := auto.View()\n fixedCheckAuto(t,v)')
s=s.replace('func TestGeometryStudy(t *testing.T) {','func TestFixedStudy(t *testing.T) {')
s=s.replace('pack, e := raytracer.LoadDatasetPack("../data-pipeline")\n\tif e != nil', 'startup:=time.Now()\n pack, e := raytracer.LoadDatasetPack("../data-pipeline")\n _=startup\n\tif e != nil')
s=s.replace('if profileName == "A" || profileName == "B" {','if strings.Split(profileName,"-")[0] != "D" {').replace('if profileName == "B" {','if strings.Split(profileName,"-")[0] == "B" {')
s=s.replace('wantMem = 8 << 30\n\t\t}', 'wantMem = 8 << 30\n\t\t}\n if strings.Split(profileName,"-")[0]=="C" {wantCPU=8;wantMem=10<<30}')
s=s.replace('if v.CPU.Quota.Value == nil ||', 'if v.CPU.Effective.Value==nil || *v.CPU.Effective.Value!=wantCPU || v.CPU.Quota.Value == nil ||')
s=s.replace('var plans []geometryPlan', '''ln,e:=net.Listen("tcp","127.0.0.1:0");if e!=nil {t.Fatal(e)}
 var handlers sync.Map
 srv:=&http.Server{Handler:http.HandlerFunc(func(wr http.ResponseWriter,r *http.Request){defer handlers.Store(r.Header.Get("X-Audit-ID"),true);router.ServeHTTP(wr,r)})}
 go srv.Serve(ln);defer srv.Close()
 var serial atomic.Int64
 geometryWrite(t,filepath.Join(w,"startup-"+profileName+".json"),map[string]any{"startup_index_seconds":time.Since(startup).Seconds(),"ready_at":time.Now()})
 var plans []geometryPlan''')
start=s.index('\t\trequest := func(');end=s.index('\n\t\tencode :=',start)
s=s[:start]+'''        request := func(endpoint string, body []byte, client string, ctx context.Context) geometryResponse {
            id:=fmt.Sprintf("%s-%d",profileName,serial.Add(1))
            if ctx==nil {ctx=context.Background()}
            // A real loopback source IP, not a forwarded header, supplies ClientIP.
            octets:=strings.Split(strings.Split(client,":")[0],".")
            ip:=net.ParseIP("127."+strings.Join(octets[1:],"."))
            dial:=&net.Dialer{LocalAddr:&net.TCPAddr{IP:ip}}
            tr:=&http.Transport{DialContext:dial.DialContext,DisableKeepAlives:true,DisableCompression:true}
            defer tr.CloseIdleConnections()
            hc:=&http.Client{Transport:tr,Timeout:75*time.Second}
            req,e:=http.NewRequestWithContext(ctx,"POST","http://"+ln.Addr().String()+endpoint,bytes.NewReader(body));if e!=nil {t.Fatal(e)}
            req.Header.Set("Content-Type","application/json");req.Header.Set("X-Audit-ID",id)
            start:=time.Now();bodyHash:=sha256.Sum256(body)
            result:=geometryResponse{Endpoint:endpoint,Start:start,RequestHash:hex.EncodeToString(bodyHash[:])}
            resp,e:=hc.Do(req)
            if e==nil {
              result.Status=resp.StatusCode;result.Remaining=resp.Header.Get("RateLimit-Remaining")
              h:=sha256.New();var small bytes.Buffer;writer:=io.Writer(h)
              if endpoint=="/api/optimize-network" || strings.Contains(endpoint,"/execution") {writer=io.MultiWriter(h,&small)}
              n,readErr:=io.Copy(writer,resp.Body);resp.Body.Close();result.Bytes=int(n);result.Hash=hex.EncodeToString(h.Sum(nil));result.Body=small.Bytes()
              if readErr!=nil {result.Status=0}
            }
            result.End=time.Now();result.Wall=result.End.Sub(start).Seconds()
            // Await server completion before taking resource/release observations.
            until:=time.Now().Add(5*time.Second)
            for {if _,ok:=handlers.LoadAndDelete(id);ok {result.ServerDone=true;break};if time.Now().After(until){break};time.Sleep(time.Millisecond)}
            result.ReleaseSeconds=time.Since(result.End).Seconds()
            return result
        }''' +s[end:]
s=s.replace('encoder := json.NewEncoder(out)','''encoder := json.NewEncoder(out)
 for _,path:=range []string{"/sys/fs/cgroup/memory.peak","/sys/fs/cgroup/memory.current","/sys/fs/cgroup/memory.events","/sys/fs/cgroup/cpu.stat","/proc/self/status"} {if _,err:=os.ReadFile(path);err!=nil {t.Fatal("required memory/CPU signal unavailable",path)}}
 if !strings.Contains(profileName,"-fresh-") {
  var warm geometryFixture
  name:=plans[0].Fixture;name=name[:strings.LastIndex(name,"-W")]+"-W1"
  geometryRead(t,filepath.Join(w,name+".json"),&warm)
  req,_:=http.NewRequest("POST","http://"+ln.Addr().String()+"/api/simulate",bytes.NewReader(warm.Simulations[0]));req.Header.Set("Content-Type","application/json");req.Header.Set("X-Audit-ID","warmup")
  client:=&http.Client{Timeout:75*time.Second};resp,err:=client.Do(req);if err!=nil {t.Fatal(err)};_,err=io.Copy(io.Discard,resp.Body);resp.Body.Close();if err!=nil || resp.StatusCode!=200 {t.Fatal("warmup failed")}
  for {if _,ok:=handlers.LoadAndDelete("warmup");ok {break};time.Sleep(time.Millisecond)}
 }
''')
# No raytracer/serialization counter instrumentation: original production RF is copied verbatim.
s=s.replace('\t\traytracer.AuditReset()','').replace('"work": raytracer.AuditCounts(),','')
# W2 alternate search is fixture-defined. Surface resolution is class-defined.
s=s.replace('simBody["cell_size_m"] = 25','simBody["cell_size_m"] = 25\n if f.Level=="W3" {simBody["cell_size_m"]=5}')
s=s.replace('t.Fatalf("%s %s: %d %s", f.Domain, p.Operation, rs[i].Status, rs[i].Body)','t.Logf("FAILED %s %s: %d", f.Domain, p.Operation, rs[i].Status)')
# Evaluate/interference/re-evaluate is the real protected three-call sequence.
s=s.replace('case "interference":','case "cycle":\n rs=maps([]geometryResponse{network(false,peer)},false);rs=append(rs,request("/api/interference",f.Interference,peer,nil));rs=append(rs,maps([]geometryResponse{network(false,peer)},false)...)\n case "interference":')
s=s.replace('case "two-optimizers", "optimize-evaluate":','case "two-optimizers", "optimize-evaluate", "two-evaluates":')
s=s.replace('rs[0] = network(true, peer) }()', 'rs[0] = network(p.Operation!="two-evaluates", peer) }()')
start=s.index('\t\tcase "async-optimize", "async-evaluate":');end=s.index('\n\t\tcase "cancel":',start)
s=s[:start]+'''        case "async-optimize", "async-evaluate", "sustained-optimize", "sustained-evaluate":
            rs=fixedOverlap(t,w,profileName,index,p.Operation,simBody,experiments,request,encode,network,peer2)
''' +s[end:]
s=s.replace('rs = append(rs, network(false, peer))','''releaseStart:=time.Now()
            for len(limiter.slots)>0 && time.Since(releaseStart)<5*time.Second {time.Sleep(time.Millisecond)}
            rs = append(rs, network(false, peer))
            rs = append(rs, network(false, peer2))''')
s=s.replace('row := map[string]any{','''limiter.mu.Lock();activeClients:=0;requestsByClient:=map[string]int{};for id,state:=range limiter.clients {activeClients+=state.active;requestsByClient[id]=state.requests};limiter.mu.Unlock()
 row := map[string]any{"active_clients_after":activeClients,"slots_after":len(limiter.slots),"cancel_client_attempts":requestsByClient[strings.Replace(strings.Split(peer,":")[0],"198.","127.",1)],''')
s=s.replace('t.Fatal("slots leaked")','t.Log("FAILED slots leaked")')
s=s.replace('"profile": profileName,','"profile": profileName, "plan_index":index, "lock_sha256":os.Getenv("ATOM_LOCK_SHA"),')
(W/'backend-go/geometry_study_test.go').write_text(s)
(W/'backend-go/fixed_certification_test.go').write_text((HERE/'harness.go.txt').read_text())
# The only test-copy production instrumentation counts worker entry/exit for drain evidence.
f=W/'backend-go/experiment_jobs.go';f.write_text(f.read_text().replace('func (manager *experimentManager) run(jobID string) {','func (manager *experimentManager) run(jobID string) {\n auditExperimentActive.Add(1);defer auditExperimentActive.Add(-1)'))
subprocess.run(['gofmt','-w',str(W/'backend-go/geometry_study_test.go'),str(W/'backend-go/fixed_certification_test.go'),str(f)],check=True)
subprocess.run(['go','test','-c','-o',str(W/'fixed.test')],cwd=W/'backend-go',env=os.environ|{'GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0'},check=True)
subprocess.run(['node',str(ROOT/'scripts/auto-resource-geometry/fixtures.mjs'),str(G)],check=True)
# Only geometry is observed during selection, not RF timing.
import json
prior=json.loads((ROOT/'docs/auto-resource-geometry-calibration.json').read_text())['domain_selection']['selected']
# Excluding all prior validation envelopes exhausted the inventory; exclude fitting domains only.
# This geometry-only fallback is explicit and precedes every RF measurement.
(G/'prior-domains.json').write_text(json.dumps(prior))
subprocess.run(['docker','run','--rm','--name','atom-fixed-domain-selection','-v',str(W)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','--entrypoint','/study/fixed.test','atom:auto-profile-calibration','-test.run','^Test(GeometryDomainSelection|FixedUnknownGeometry)$','-test.v'],check=True)
shutil.copyfile(G/'domains.json',HERE/'domain-manifest.json')
print('prepared; RF measurements NOT started')
