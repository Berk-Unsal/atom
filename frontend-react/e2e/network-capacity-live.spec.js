/* global process */
import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const work=process.env.ATOM_CAPACITY_WORKDIR || '/tmp/atom-network-capacity';
const enabled=process.env.ATOM_RUN_CAPACITY_LIVE==='1';
for(const n of [6,8,10,12])for(const frequency of [2.6,28])test(`capacity live Evaluate ${n} cells ${frequency} GHz`,async({page},info)=>{
 test.skip(!enabled || info.project.name!=='desktop-1440','Gated isolated real backend');
 test.setTimeout(90000);
 const port=18200+n;
 const log=[];
 const server=spawn(resolve(work,'capacity-server'),[],{cwd:resolve(work,'backend-go'),env:{...process.env,PORT:String(port),ATOM_DATASET_DIR:resolve(work,'data-pipeline'),FRONTEND_DIST_PATH:resolve(work,'frontend-react/dist')}});
 server.stdout.on('data',b=>log.push(b.toString()));server.stderr.on('data',b=>log.push(b.toString()));
 try {
  const url=`http://127.0.0.1:${port}`;
  await expect.poll(async()=>{try{return (await fetch(`${url}/readyz`)).status;}catch{return 0;}},{timeout:30000}).toBe(200);
  const f=JSON.parse(await readFile(resolve(work,`fixtures/${n}-${frequency}.json`),'utf8'));
  const inventory=JSON.parse(await readFile(resolve(work,'fixtures/inventory.json'),'utf8'));
  const ws=JSON.parse(await readFile(resolve(work,`fixtures/workspace-${n}.json`),'utf8'));
  ws.projects[0].scenarios=[];ws.projects[0].activeScenarioId=null;ws.projects[0].draft={plan:{...ws.projects[0].draft.plan,settings:f.settings},requiresRerun:true};
  await page.addInitScript(value=>localStorage.setItem('atom.planning.workspace.v1',JSON.stringify(value)),ws);
  await page.route('**/api/towers',route=>route.fulfill({json:{type:'FeatureCollection',features:inventory.features.slice(0,n)}}));
  // Inventory is controlled; RF routes, dataset, guards and JSON parsing are real.
  const rows=[];const pending=[];
  page.on('response',response=>{const endpoint=new URL(response.url()).pathname;if(!['/api/evaluate-network','/api/simulate'].includes(endpoint))return;pending.push(response.body().then(async body=>rows.push({endpoint,status:response.status(),bytes:body.length,headers:await response.allHeaders()})));});
  await page.goto(url);
  await expect(page.getByRole('button',{name:`Network mode, ${n} selected`})).toBeVisible();
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const before=await cdp.send('Performance.getMetrics');
  const start=performance.now();await page.getByRole('button',{name:'Evaluate Network',exact:true}).click();
  await expect(page.locator('.run-state')).toHaveText('Ready',{timeout:60000});
  await expect(page.getByRole('button',{name:'Evaluate Network',exact:true})).toBeEnabled({timeout:60000});
  const wall=performance.now()-start;await Promise.all(pending);
  const after=await cdp.send('Performance.getMetrics');
  expect(rows).toHaveLength(n+1);expect(rows.every(r=>r.status===200)).toBe(true);expect(rows.at(-1).headers['ratelimit-remaining']).toBe(String(20-n-1));
  const heap=metrics=>Object.fromEntries(metrics.metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes'].includes(m.name)).map(m=>[m.name,m.value]));
  await writeFile(resolve(work,`live-${n}-${frequency}.metrics.json`),JSON.stringify({n,frequency_ghz:frequency,end_to_end_ms:wall,requests:rows,chromium_before:heap(before),chromium_after:heap(after)},null,2));
 }finally{server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await writeFile(resolve(work,`live-${n}-${frequency}.log`),log.join(''));}
});
