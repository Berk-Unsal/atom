/* global process */
import { expect, test } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { importProjectFile } from '../src/utils/projectStore.js';

const enabled=process.env.ATOM_RUN_CAPACITY_UI==='1';
const work=process.env.ATOM_CAPACITY_WORKDIR || '/tmp/atom-network-capacity';
const out=process.env.ATOM_CAPACITY_SCREENSHOTS || resolve('../docs/assets/network-capacity-audit');
test.use({actionTimeout:10000});
const json=async p=>JSON.parse(await readFile(p,'utf8'));
async function tool(page,stage,label,id){await page.waitForTimeout(400);if(page.viewportSize().width<=400){const close=page.getByRole('button',{name:'Close inspector',exact:true});if(await close.isVisible())await close.click();}const target=page.locator(`#stage-tool-${stage}-${id}`);if(!await target.isVisible())await page.getByRole('button',{name:`${label} workspace`}).click();if(page.viewportSize().width<=400){await expect(target).toBeVisible();await page.waitForTimeout(350);await target.click({force:true,timeout:10000});}else{await target.click();}}
for(const n of [6,8,10,12]) test(`capacity audit ${n} cells`,async({page},info)=>{
 test.skip(!enabled,'Disposable capacity UI only');
 test.skip(info.project.name!=='desktop-1440' && n!==12,'Responsive review at largest candidate');
 test.setTimeout(120000);
 test.skip(process.env.ATOM_CAPACITY_DETAILS==='1' && (n===8 || info.project.name!=='desktop-1440'),'Focused detail evidence');
 const f=await json(resolve(work,`fixtures/${n}-28.json`));
 const inventory=await json(resolve(work,'fixtures/inventory.json'));
 const workspace=await json(resolve(work,`fixtures/workspace-${n}.json`));
 workspace.projects[0].activeScenarioId=null;workspace.projects[0].draft={plan:workspace.projects[0].draft.plan,requiresRerun:true};workspace.projects[0].scenarios=[];
 await page.addInitScript(value=>{localStorage.setItem('atom.planning.workspace.v1',JSON.stringify(value));},workspace);
 const requests=[];let simIndex=0;let optimized=false;
 await page.route('**/api/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST') requests.push(endpoint);
  let body;
  switch(endpoint){
  case '/api/towers':body={type:'FeatureCollection',features:inventory.features.slice(0,n)};break;
  case '/api/meta':body={application_version:'0.10.2',model_version:'fspl-walls-cell-profiles-v2',supported_technologies:['4g','5g','6g']};break;
  case '/api/datasets':body={active_id:'ankara-default',datasets:[],warnings:[]};break;
  case '/api/buildings/summary':body={total_buildings:161784};break;
  case '/api/collections/buildings/items':body={type:'FeatureCollection',features:[]};break;
  case '/api/evaluate-network':simIndex=0;optimized=false;body=await json(resolve(work,`raw/repeat-1/${n}-28-evaluateevaluate-network.response.json`));break;
  case '/api/optimize-network':simIndex=0;optimized=true;body=await json(resolve(work,`raw/repeat-1/${n}-28-optimizeoptimize-network.response.json`));break;
  case '/api/simulate':body=await json(resolve(work,optimized?`optimized-rays/${n}-28-opt-evaluatesimulate-${++simIndex}.response.json`:`followup/${n}-28-evaluatesimulate-${++simIndex}.response.json`));break;
  case '/api/explain-network-cell':body=await json(resolve(work,`counters/${n}-28-explainexplain-network-cell.response.json`));break;
  case '/api/interference':body=await json(resolve(work,`raw/repeat-1/${n}-28-interferenceinterference.response.json`));break;
  default:body={};
  }await route.fulfill({json:body});
 });
 await page.goto('/');
 await expect(page.getByRole('button',{name:`Network mode, ${n} selected`})).toBeVisible();
 const screenshot=async name=>{await mkdir(out,{recursive:true});await page.screenshot({path:resolve(out,`${n}-${info.project.name}-${name}.png`),fullPage:true,animations:'disabled'});};
 await screenshot('setup');
 const close=page.getByRole('button',{name:'Close tool drawer'});if(await close.isVisible())await close.click();
 const fit=page.getByRole('button',{name:'Fit selected cells',exact:true});
 if(await fit.isVisible())await fit.click();else{await page.getByRole('button',{name:/^Map interaction:/}).click();await page.getByRole('button',{name:'Fit selected cells',exact:true}).click();}
 await expect(page.locator('.tower-order-badge')).toHaveCount(n);
 await page.waitForTimeout(1500);
 await screenshot('map');
 const typography=await page.evaluate(()=>{const source=document.querySelector('.tower-order-badge span');const results=[];for(const label of ['10','11','12','16','20']){const parent=document.createElement('div');parent.className='tower-order-badge';parent.style.cssText='position:fixed;left:-100px;top:0';const span=source.cloneNode();span.textContent=label;parent.append(span);document.body.append(parent);const range=document.createRange();range.selectNodeContents(span);results.push({label,containerWidth:span.getBoundingClientRect().width,textWidth:range.getBoundingClientRect().width,scrollWidth:span.scrollWidth});parent.remove();}return results;});
 const geometry=await page.locator('.tower-order-badge span').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {label:node.textContent,width:r.width,height:r.height,scrollWidth:node.scrollWidth,font:getComputedStyle(node).font,fontSize:getComputedStyle(node).fontSize,x:r.x,y:r.y};}));
 await page.getByRole('button',{name:'Map view options'}).click();
 await page.getByRole('combobox',{name:'Map focus cell'}).selectOption(f.towers.at(-1).cellId);
 await expect(page.getByRole('combobox',{name:'Map focus cell'})).toHaveValue(f.towers.at(-1).cellId);
 await page.getByRole('button',{name:'Inspect focused cell'}).click();
 await screenshot('inspector');
 const evaluationStarted=performance.now();
 await page.getByRole('button',{name:'Evaluate Network',exact:true}).click();
 await expect(page.locator('.run-state')).toHaveText('Ready');
 const evaluationReplayMs=performance.now()-evaluationStarted;
 expect(requests.slice(0,n+1)).toEqual(['/api/evaluate-network',...Array(n).fill('/api/simulate')]);
 await tool(page,'review','Review','results');await screenshot('rf-results');
 await tool(page,'analyze','Analyze','interference');
 await page.getByRole('button',{name:'Analyze Interference',exact:true}).click();await expect(page.getByRole('button',{name:'Analyze Interference',exact:true})).toBeEnabled();
 await tool(page,'review','Review','results');await screenshot('interference-results');
 await tool(page,'simulate','Simulate','propagation');
 const optimize=page.getByRole('button',{name:/^Optimize Network$/});await optimize.click();await expect(optimize).toBeEnabled();
 await tool(page,'review','Review','results');await expect(page.locator('.network-card')).toBeVisible();await screenshot('optimization-results');
 if(process.env.ATOM_CAPACITY_DETAILS==='1'){await page.getByText('Configuration changes',{exact:true}).click();await page.locator('.optimization-configuration-list').scrollIntoViewIfNeeded();await screenshot('azimuth-list');}
 const tabs=await page.getByRole('tab').allTextContents();
 const compare=page.getByRole('tab',{name:/Compare/});if(await compare.isVisible()){await compare.click();await screenshot('compare');}
 const candidates=page.getByRole('tab',{name:/Candidates|Solutions/});if(await candidates.count()){await candidates.click();await expect(page.locator('.pareto-explorer')).toBeVisible();await screenshot('candidates');if(process.env.ATOM_CAPACITY_DETAILS==='1'){await expect(page.locator('.pareto-cell-row')).toHaveCount(n);await page.locator('.pareto-cell-list').scrollIntoViewIfNeeded();await screenshot('per-cell-detail');if(n===12){await page.getByRole('button',{name:`Explain Cell ${f.towers[0].cellId} marginal effect`}).click();await expect(page.locator('.cell-marginal-effect')).toBeVisible();await screenshot('cell-explanation');}}}
 await tool(page,'plan','Plan','inventory');await page.getByRole('group',{name:'Inventory scope'}).getByRole('button',{name:/^Network/}).click();
 await expect(page.getByRole('list',{name:'Network Cells'}).locator('li')).toHaveCount(n);await screenshot('inventory');
 await page.getByRole('button',{name:'Edit multiple',exact:true}).click();
 for(const t of f.towers)await page.getByRole('checkbox',{name:`Select Cell ${t.cellId} for editing`}).check();
 await page.getByRole('button',{name:`Edit ${n} Cells`,exact:true}).click();await screenshot('batch');
 await tool(page,'plan','Plan','scenarios');await screenshot('scenarios');
 let exportEvidence=null;
 const save=page.getByRole('button',{name:'Save Version',exact:true});if(await save.isEnabled()){await save.click();await page.waitForTimeout(700);}
 if(process.env.ATOM_CAPACITY_DETAILS==='1'){
  await page.getByRole('button',{name:'Open project menu'}).click();const downloaded=page.waitForEvent('download');await page.getByRole('dialog',{name:'Project and scenarios'}).getByRole('button',{name:'Export',exact:true}).click();const file=await downloaded;const text=await readFile(await file.path(),'utf8');let error=null;try{importProjectFile(text);}catch(e){error=e.message;}const parsed=JSON.parse(text);exportEvidence={bytes:Buffer.byteLength(text),importError:error,scenarios:parsed.project.scenarios.length,selection:parsed.project.scenarios[0]?.plan?.selectedNetworkTowerIds};await page.getByRole('button',{name:'Open project menu'}).click();
  await writeFile(resolve(out,`${n}-export.json`),JSON.stringify(exportEvidence,null,2));
  await page.getByText('More Scenario actions',{exact:true}).click();await page.getByRole('button',{name:'Delete Scenario',exact:true}).click();await page.waitForTimeout(750);await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(750);await expect(page.getByRole('group',{name:'RF context'})).toContainText(`Network · ${n} cells`);
 }
 await page.reload();await expect(page.getByRole('button',{name:'Evaluate Network',exact:true}).or(page.getByRole('button',{name:'Run Sector',exact:true}))).toBeEnabled();const restoredContext=await page.getByRole('group',{name:'RF context'}).innerText();const reloadSelectionPreserved=restoredContext.includes(`Network · ${n} cells`);if(process.env.ATOM_CAPACITY_DETAILS!=='1')await expect(page.getByRole('button',{name:`Network mode, ${n} selected`})).toBeVisible();else await screenshot('undo-reload');
 const doc=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth}));
 await writeFile(resolve(out,`${n}-${info.project.name}.json`),JSON.stringify({n,project:info.project.name,markerGeometry:geometry,typography,evaluationReplayMs,requests,tabs,doc,exportEvidence,reloadSelectionPreserved,restoredContext},null,2));
});


test('capacity report artifacts',async({page},info)=>{
 test.skip(!enabled || info.project.name!=='desktop-1440','Audit reports once');
 const rows=[];for(const n of [6,10,12]){
  const html=await readFile(resolve(work,`reports/${n}.html`),'utf8');
  await page.setContent(html);await page.emulateMedia({media:'print'});
  await page.screenshot({path:resolve(out,`report-${n}.png`),fullPage:true,animations:'disabled'});
  const dimensions=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,svgCount:document.querySelectorAll('svg').length,tableRows:document.querySelectorAll('tr').length,overflowCells:[...document.querySelectorAll('td,th')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent)}));
  rows.push({n,...dimensions});
 }await writeFile(resolve(out,'reports.json'),JSON.stringify(rows,null,2));
});

test('capacity inventory polygon selection',async({page},info)=>{
 test.skip(!enabled || info.project.name!=='desktop-1440','Larger selection workflow once');
 const inventory=await json(resolve(work,'fixtures/inventory.json'));
 const ws=await json(resolve(work,'fixtures/workspace-12.json'));
 ws.projects[0].scenarios=[];ws.projects[0].activeScenarioId=null;
 ws.projects[0].draft={plan:{...ws.projects[0].draft.plan,selectionPolygon:[]},requiresRerun:true};
 await page.addInitScript(value=>localStorage.setItem('atom.planning.workspace.v1',JSON.stringify(value)),ws);
 await page.route('**/api/**',route=>{const endpoint=new URL(route.request().url()).pathname;return route.fulfill({json:endpoint==='/api/towers'?{type:'FeatureCollection',features:inventory.features}:endpoint==='/api/meta'?{application_version:'0.10.2'}:endpoint==='/api/datasets'?{active_id:'ankara-default',datasets:[],warnings:[]}:endpoint==='/api/buildings/summary'?{total_buildings:161784}:{type:'FeatureCollection',features:[]}});});
 await page.goto('/');await expect(page.getByRole('button',{name:'Network mode, 12 selected'})).toBeVisible();
 await page.getByRole('button',{name:'Close tool drawer'}).click();await page.getByRole('button',{name:'Fit selected cells',exact:true}).click();await page.waitForTimeout(1000);
 await page.locator('.map-desktop-interaction').getByRole('button',{name:'Select cells',exact:true}).click();
 await page.getByRole('button',{name:'Clear selected cluster',exact:true}).click();await expect(page.getByRole('group',{name:'RF context'})).toContainText('Network · 0 cells');
 await page.getByRole('button',{name:'Draw selection area'}).click();
 const map=page.locator('.leaflet-container');const box=await map.boundingBox();
 for(const [dx,dy] of [[-200,-200],[200,-200],[200,200],[-200,200]])await map.click({force:true,position:{x:box.width/2+dx,y:box.height/2+dy}});
 await page.getByRole('button',{name:'Finish',exact:true}).click();
 await expect(page.getByRole('group',{name:'RF context'})).toContainText('Network · 12 cells');
 await tool(page,'plan','Plan','inventory');await page.getByRole('group',{name:'Inventory scope'}).getByRole('button',{name:/^Network/}).click();
 const list=page.getByRole('list',{name:'Network Cells'});await expect(list.locator('li')).toHaveCount(12);
 const ids=await list.locator('.inventory-cell-copy strong').allTextContents();expect(new Set(ids).size).toBe(12);
 await page.screenshot({path:resolve(out,'inventory-selection-12.png'),fullPage:true,animations:'disabled'});
 await writeFile(resolve(out,'inventory-selection.json'),JSON.stringify({n:12,method:'Select cells mode then Draw selection area: four points and Finish',selected_order:ids,network_working_set_rows:12},null,2));
});
