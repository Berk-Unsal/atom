// Real desktop Chromium payload parsing; local HTTP streams avoid oversized CDP arguments.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../..'),dir='/tmp/atom-resource-study/raw';
const {chromium}=require(path.join(root,'frontend-react/node_modules/@playwright/test'));
(async()=>{
const names=fs.readdirSync(dir).filter(x=>x.endsWith('.response.json'));const allow=new Set(names);
const server=http.createServer((req,res)=>{const file=decodeURIComponent(req.url.slice(1));if(!file){res.end('<!doctype html><title>Local resource study</title>');return}if(!allow.has(file)){res.writeHead(404).end();return}res.setHeader('Content-Type','application/json');fs.createReadStream(path.join(dir,file)).pipe(res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:false,args:['--enable-precise-memory-info']});let rows=[],failure=null;
const publish=()=>fs.writeFileSync('/tmp/atom-resource-study/browser.json',JSON.stringify({browser:browser.version(),visible_desktop:true,method:'local HTTP loads excluded from timer; JSON.parse 5 repetitions for individual payloads, 1 for bundles; CDP forced-GC retained object heap excludes raw JSON strings; excludes React/Leaflet/GPU/native browser memory',mobile_device_measured:false,failure,rows},null,2));
try{const page=await browser.newPage();await page.goto(origin);const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.enable');
const files=names.filter(x=>/6-(2.6|28)-(simulate|interference|coverage-surface)\.response/.test(x)||x.includes('high-surface')||x.includes('high-simulate')||x.includes('high-rays-radius'));
const bundles=[names.filter(x=>/^6-2.6-map-cell-\d+-0.response.json$/.test(x)),names.filter(x=>/^6-2.6-high-evaluate-map-bundle-[1-6]\.response.json$/.test(x))];
for(const selection of [...files.map(x=>[x]),...bundles]){if(!selection.length)continue;
 let timer;try{await Promise.race([(async()=>{
  await page.evaluate(()=>{window.retained=null;window.payloads=null});await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Runtime.getHeapUsage');
  await page.evaluate(async names=>{window.payloads=[];for(const name of names){window.payloads.push(await (await fetch('/'+encodeURIComponent(name))).text())}},selection);
  const measured=await page.evaluate(()=>{let times=[];for(let k=0;k<(window.payloads.length===1?5:1);k++){const start=performance.now();window.retained=window.payloads.map(x=>JSON.parse(x));times.push(performance.now()-start)}window.payloads=null;return {parse_ms:times}});
  await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Runtime.getHeapUsage');
  rows.push({file:selection.length===1?selection[0]:(selection===bundles[0]?'six-canonical-map-bundle':'six-high-map-bundle'),response_bytes:selection.reduce((n,x)=>n+fs.statSync(path.join(dir,x)).size,0),...measured,heap_before_bytes:before.usedSize,heap_retained_bytes:after.usedSize,retained_delta_bytes:after.usedSize-before.usedSize});publish();
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('45-second bounded browser-case watchdog')),45000)})]);}finally{clearTimeout(timer)}
}
}catch(e){failure=String(e);publish();throw e}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
