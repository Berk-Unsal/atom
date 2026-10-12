#!/usr/bin/env python3
"""Build validation-only instrumentation into a disposable copy."""
import hashlib,json,os,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2];HERE=pathlib.Path(__file__).resolve().parent
W=pathlib.Path('/tmp/atom-resource-locked-validation');G=W/'geometry'
lock=HERE/'validation-lock.json';assert hashlib.sha256(lock.read_bytes()).hexdigest()==(HERE/'validation-lock.sha256').read_text().split()[0]
subprocess.run(['python3',str(ROOT/'scripts/auto-resource-geometry/prepare.py'),'--run','--workdir',str(W)],check=True)
prior=json.loads((ROOT/'docs/auto-resource-geometry-calibration.json').read_text())
G.mkdir(exist_ok=True);(G/'prior-domains.json').write_text(json.dumps(prior['domain_selection']['selected']));(G/'candidates.json').write_text(json.dumps(prior['domain_selection']['candidates']))
(G/'validation-lock.json').write_bytes(lock.read_bytes())
s=(W/'backend-go/geometry_study_test.go').read_text()
s=s.replace('geometryEnvelope(p, 800)','geometryEnvelope(p, 902)')
s=s.replace('chosen := []geometryDomain{}','''var prior []geometryDomain
 geometryRead(t, filepath.Join(w,"prior-domains.json"), &prior)
 excludedIDs:=map[string]bool{};for _,d:=range prior {for _,tw:=range d.Towers {excludedIDs[tw.CellID]=true}}
 exclusions:=[]map[string]any{}
 chosen := []geometryDomain{}''')
s=s.replace('for _, split := range []string{"calibration", "held-out"} {','for round := 0; round < 3; round++ {\n split := "validation"')
s=s.replace('overlap := false\n\t\t\t\tfor _, d := range chosen {','''overlap := false
                reason:=""
                for _,tw:=range c.Towers {if excludedIDs[tw.CellID] {overlap=true;reason="prior-cell"}}
                for _,d:=range prior {if geometryOverlap(c.SelectionBounds,geometryEnvelope(geometryPoints(d.Towers),802)) {overlap=true;reason="prior-envelope"}}
                for _, d := range chosen {''')
s=s.replace('c.ID = x.band + "-" + split','c.ID = fmt.Sprintf("%s-validation-%d",x.band,round+1)')
s=s.replace('if !overlap {\n\t\t\t\t\tc.Band', 'if overlap {exclusions=append(exclusions,map[string]any{"anchor":c.ID,"band":x.band,"round":round,"reason":reason})}\n if !overlap {\n\t\t\t\t\tc.Band')
s=s.replace('t.Fatal("insufficient disjoint domains")','t.Log("no further disjoint domain in band",x.band)')
s=s.replace('"candidates": candidates, "selected": chosen','"exclusions": exclusions, "candidates": candidates, "selected": chosen')
s=s.replace('\n\tgeometryWrite(t, filepath.Join(w, "domains.json")','\n if len(chosen)<8 {t.Fatal("fewer than8 disjoint domains")}\n\tgeometryWrite(t, filepath.Join(w, "domains.json")',1)
# Replace primary recorder execution with real server; recorder mode is explicitly secondary.
s=s.replace('"net/http"','"net/http"\n"net"\n"sync/atomic"')
s=s.replace('func TestGeometryStudy(t *testing.T) {','func TestLockedStudy(t *testing.T) {')
s=s.replace('pack, e := raytracer.LoadDatasetPack("../data-pipeline")\n\tif e != nil', 'startup:=time.Now()\n pack, e := raytracer.LoadDatasetPack("../data-pipeline")\n _=startup\n\tif e != nil')
s=s.replace('if profileName == "A" || profileName == "B" {','if strings.Split(profileName,"-")[0] == "A" || strings.Split(profileName,"-")[0] == "B" {').replace('if profileName == "B" {','if strings.Split(profileName,"-")[0] == "B" {')
s=s.replace('var plans []geometryPlan' ,'''ln,e:=net.Listen("tcp","127.0.0.1:0");if e!=nil {t.Fatal(e)}
 var handlers sync.Map
 srv:=&http.Server{Handler:http.HandlerFunc(func(wr http.ResponseWriter,r *http.Request){st:=time.Now();enc:=auditJSONNS.Load();router.ServeHTTP(wr,r);handlers.Store(r.Header.Get("X-Audit-ID"),map[string]float64{"handler_wall_seconds":time.Since(st).Seconds(),"encoding_write_seconds":float64(auditJSONNS.Load()-enc)/1e9})})}
 go srv.Serve(ln);defer srv.Close()
 var serial atomic.Int64
 var frozen lockedContract;geometryRead(t,filepath.Join(w,"validation-lock.json"),&frozen)
 predFile,e:=os.OpenFile(filepath.Join(w,"predictions-"+profileName+".jsonl"),os.O_CREATE|os.O_EXCL|os.O_WRONLY,0644);if e!=nil {t.Fatal(e)};defer predFile.Close()
 var predMu sync.Mutex
 requestRows,e:=os.OpenFile(filepath.Join(w,"requests-"+profileName+".jsonl"),os.O_CREATE|os.O_EXCL|os.O_WRONLY,0644);if e!=nil {t.Fatal(e)};defer requestRows.Close()
 geometryWrite(t,filepath.Join(w,"startup-"+profileName+".json"),map[string]any{"startup_index_seconds":time.Since(startup).Seconds(),"ready_at":time.Now()})
 var plans []geometryPlan''')
start=s.index('\t\trequest := func(');end=s.index('\n\t\tencode :=',start)
s=s[:start]+'''        request := func(endpoint string, body []byte, client string, ctx context.Context) geometryResponse {
            id:=fmt.Sprintf("%s-%d",profileName,serial.Add(1))
            op:=lockedOperation(endpoint)
            points:=[]raytracer.Point{};for _,tw:=range netBody["towers"].([]any) {m:=tw.(map[string]any);points=append(points,raytracer.Point{Lon:m["tower_lon"].(float64),Lat:m["tower_lat"].(float64)})}
            if op=="simulate"||op=="surface"||op=="azimuth" {points=points[:1]}
            if op=="recommendation" {bounds:=geometryEnvelope(points,20);for _,tw:=range pack.Towers {if tw.Lon>=bounds.MinLon&&tw.Lon<=bounds.MaxLon&&tw.Lat>=bounds.MinLat&&tw.Lat<=bounds.MaxLat {points=append(points,raytracer.Point{Lon:tw.Lon,Lat:tw.Lat})}}}
            geo:=geometryDescribe(pack.BuildingIndex,geometryEnvelope(points,f.Radius+2))
            prediction:=lockedPredict(frozen,op,f,geo)
            stamp:=time.Now();hashBody:=sha256.Sum256(body)
            predMu.Lock();json.NewEncoder(predFile).Encode(map[string]any{"id":id,"plan_index":index,"operation":op,"recorded_at":stamp,"domain":f.Domain,"frequency_ghz":f.Frequency,"level":f.Level,"repeat":p.Repeat,"request_sha256":hex.EncodeToString(hashBody[:]),"predictions":prediction,"lock_sha256":os.Getenv("ATOM_LOCK_SHA"),"domain_sha256":os.Getenv("ATOM_DOMAIN_SHA")});predFile.Sync();predMu.Unlock()
            start:=time.Now()
            result:=geometryResponse{Endpoint:endpoint,Start:start}
            if os.Getenv("ATOM_RECORDER_CONTROL")=="1" {
               req:=httptest.NewRequest("POST",endpoint,bytes.NewReader(body));req.RemoteAddr=client;req.Header.Set("Content-Type","application/json");rec:=httptest.NewRecorder();router.ServeHTTP(rec,req);result.Status=rec.Code;result.Bytes=rec.Body.Len();h:=sha256.Sum256(rec.Body.Bytes());result.Hash=hex.EncodeToString(h[:]);result.Body=append([]byte(nil),rec.Body.Bytes()...);result.Remaining=rec.Header().Get("RateLimit-Remaining")
            } else {
               if ctx==nil {ctx=context.Background()};req,_:=http.NewRequestWithContext(ctx,"POST","http://"+ln.Addr().String()+endpoint,bytes.NewReader(body));req.Header.Set("Content-Type","application/json");req.Header.Set("X-Audit-ID",id)
               ip:=fmt.Sprintf("127.%d.%d.%d",1+index/60000,(index/250)%240+1,index%250+1);if strings.HasPrefix(client,"198.19") {ip=fmt.Sprintf("127.%d.%d.%d",2+index/60000,(index/250)%240+1,index%250+1)}
               if strings.HasPrefix(client,"198.20") {var jobIndex int;fmt.Sscanf(client,"198.20.%d",&jobIndex);ip=fmt.Sprintf("127.3.%d.%d",index%240+1,jobIndex+1)}
               dial:=net.Dialer{LocalAddr:&net.TCPAddr{IP:net.ParseIP(ip)}}
               tr:=&http.Transport{DialContext:dial.DialContext,DisableCompression:true};defer tr.CloseIdleConnections()
               cl:=&http.Client{Transport:tr,Timeout:70*time.Second};res,err:=cl.Do(req)
               receive:=time.Now();if err!=nil {result.Status=0} else {result.Status=res.StatusCode;result.Remaining=res.Header.Get("RateLimit-Remaining");h:=sha256.New();var retained bytes.Buffer;dst:=io.Writer(h);if op=="optimize"||strings.Contains(endpoint,"execution") {dst=io.MultiWriter(h,&retained)};n,readErr:=io.Copy(dst,res.Body);res.Body.Close();result.Bytes=int(n);result.Hash=hex.EncodeToString(h.Sum(nil));result.Body=retained.Bytes();if readErr!=nil {result.Status=0}}
               result.End=time.Now();result.Wall=result.End.Sub(start).Seconds()
               var measurement any;for wait:=time.Now().Add(time.Second);time.Now().Before(wait); {if m,ok:=handlers.LoadAndDelete(id);ok {measurement=m;break};if result.Status==0 {break};time.Sleep(time.Millisecond)}
               predMu.Lock();json.NewEncoder(requestRows).Encode(map[string]any{"id":id,"plan_index":index,"operation":op,"domain":f.Domain,"start":start,"end":result.End,"http_wall_seconds":result.Wall,"client_receive_seconds":result.End.Sub(receive).Seconds(),"response_bytes":result.Bytes,"status":result.Status,"server":measurement});requestRows.Sync();predMu.Unlock()
            }
            if result.End.IsZero() {result.End=time.Now();result.Wall=result.End.Sub(start).Seconds()}
            return result
        }''' +s[end:]
# Keep bad results and continue full matrix, no case removal.
s=s.replace('t.Fatalf("%s %s: %d %s", f.Domain, p.Operation, rs[i].Status, rs[i].Body)','t.Logf("FAILED %s %s: %d", f.Domain, p.Operation, rs[i].Status)')
# Make Explain failure a recorded request, no pilot data exclusion.
s=s.replace('t.Fatalf("explain prerequisite %d %s", res.Status, res.Body)','t.Logf("FAILED explain prerequisite %d",res.Status)')
# main async scenarios replaced by separately supported helper, all four background variants
start=s.index('\t\tcase "async-optimize", "async-evaluate":');end=s.index('\n\t\tcase "cancel":',start)
s=s[:start]+'''        case "async-optimize", "async-evaluate", "async-optimize-evaluate", "async-two-optimizers":
            rs=lockedSustained(t,w,profileName,index,p.Operation,simBody,experiments,request,encode,network,peer,peer2)
''' +s[end:]
s=s.replace('job :=', 'job :=')
# Retain unused snapshot variable for shared original row formatter.
(W/'backend-go/geometry_study_test.go').write_text(s)
(W/'backend-go/locked_validation_test.go').write_text((HERE/'harness.go.txt').read_text())
subprocess.run(['gofmt','-w',str(W/'backend-go/geometry_study_test.go'),str(W/'backend-go/locked_validation_test.go')],check=True)
subprocess.run(['go','test','-c','-o',str(W/'locked.test')],cwd=W/'backend-go',env=os.environ|{'GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0'},check=True)
