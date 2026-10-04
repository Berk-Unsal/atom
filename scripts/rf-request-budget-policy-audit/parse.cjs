// Local Chromium parse microbenchmark; no network or backend requests.
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {chromium}=require(path.join(root,'frontend-react/node_modules/@playwright/test'));
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();const rows=[];
for(const n of [6,8])for(const f of [2.6,28])for(const ep of ['simulate','interference','coverage-surface']){
 const body=fs.readFileSync(`/tmp/atom-rf-policy/raw/${n}-${f}-${ep}.response.json`,'utf8');
 const measured=await page.evaluate(body=>{const timings=[];let result;for(let i=0;i<5;i++){const start=performance.now();result=JSON.parse(body);timings.push(performance.now()-start)};return {parse_ms:timings,top_level_keys:Object.keys(result).length};},body);
 rows.push({n,frequency_ghz:f,endpoint:'/api/'+ep,response_bytes:Buffer.byteLength(body),...measured});
}
fs.writeFileSync('/tmp/atom-rf-policy/browser-parse.json',JSON.stringify({browser:browser.version(),method:'5 local JSON.parse observations per payload; transfer excluded, rendering excluded; first selected map Cell only',rows},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
