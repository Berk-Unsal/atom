// Interactive native qualification driver, not a product entry point.
// Run in a terminal after a clean matching desktop build. Commands open real
// OS dialogs; a human/CUA driver supplies Save/Open paths or presses Cancel.
// No dialog/print method is replaced. Evidence is private test output.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const desktop=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(desktop,'package.json'));
const { _electron:electron }=require('playwright-core');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'atom-physical-surfaces-'));
const saved=path.join(scratch,'Ankara çığ — Native Save.atom-project.json');
const open=path.join(scratch,'Türkçe Open.atom-project.json');
await fs.copyFile(path.join(desktop,'../examples/ankara-sample.atom-project.json'),open);
const env={...process.env,ATOM_DESKTOP_TEST_PROFILE:path.join(scratch,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:desktop,encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:desktop,encoding:'utf8'}).trim(),'');
assert.equal(JSON.parse(await fs.readFile(path.join(desktop,'build/resources/build-info.json'),'utf8')).commit,sourceCommit);
const result={source_commit:sourceCommit,source_dirty:false,platform:process.platform,architecture:process.arch,kernel:os.release(),surface_driver:'CUA actual OS controls; native dialog/print methods not replaced',steps:[]};
const app=await electron.launch({executablePath:require('electron'),args:['--no-proxy-server','--host-resolver-rules=MAP tile.openstreetmap.org ~NOTFOUND',desktop],env,chromiumSandbox:true,timeout:60000});
const page=await app.firstWindow();await page.getByRole('button',{name:'Run Sector',exact:true}).waitFor();
await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Run Sector'&&!button.disabled));
const posts=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().startsWith('app://atom/api/'))posts.push(new URL(request.url()).pathname)});
const status=async()=>{await fs.mkdir(path.join(desktop,'test-results'),{recursive:true});await fs.writeFile(path.join(desktop,'test-results/native-os-surfaces.json'),JSON.stringify({...result,scratch,saved,open,rf_posts:posts},null,2));};
await status();console.log(JSON.stringify({ready:true,scratch,saved,open,pid:app.process().pid}));
async function associatedWith(states,file,clean=false){
 const expected=await fs.stat(file);
 for(const row of states){if(!row.path||(clean&&row.dirty))continue;const actual=await fs.stat(row.path).catch(()=>null);if(actual&&actual.dev===expected.dev&&actual.ino===expected.ino)return true;}
 return false;
}
const cli=createInterface({input:process.stdin,terminal:false});
try {
 for await(const command of cli){
  try {
   if(command==='save-as'||command==='open'){
    await app.evaluate(({Menu},id)=>Menu.getApplicationMenu().getMenuItemById(id).click(),command==='open'?'atom-project-open':'atom-project-save-as');
    console.log('Opened actual OS '+command+' surface');
   }else if(command==='verify-save'){
    const file=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(file.schemaVersion,3);const states=await page.evaluate(async()=> (await window.atomDesktop.getProjectFileState()).value);assert.ok(await associatedWith(states,saved,true));result.steps.push({operation:'native Save As',valid_project:true,approved_association:true,filename:path.basename(saved)});console.log('Verified native saved project');
   }else if(command==='verify-open'){
    await page.getByRole('button',{name:/^Project menu,/}).waitFor();
    const states=await page.evaluate(async()=> (await window.atomDesktop.getProjectFileState()).value);assert.ok(await associatedWith(states,open));result.steps.push({operation:'native Open',approved_association:true,filename:path.basename(open),project_menu:await page.getByRole('button',{name:/^Project menu,/}).innerText()});console.log('Recorded Open result');
   }else if(command==='snapshot-cancel'){
    globalThis.beforeCancel={hash:createHash('sha256').update(await fs.readFile(saved)).digest('hex'),state:await page.evaluate(async()=> (await window.atomDesktop.getProjectFileState()).value)};console.log('Captured state before real OS cancellation');
   }else if(command==='verify-cancel'){
    assert.equal(createHash('sha256').update(await fs.readFile(saved)).digest('hex'),globalThis.beforeCancel.hash);assert.deepEqual(await page.evaluate(async()=> (await window.atomDesktop.getProjectFileState()).value),globalThis.beforeCancel.state);result.steps.push({operation:'actual OS Save As cancel',bytes_and_association_preserved:true});console.log('Verified actual chooser cancellation');
   }else if(command==='prepare-report'){
    const response=page.waitForResponse(r=>r.url().endsWith('/api/analyze-sector')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Run Sector',exact:true}).click();assert.equal((await response).status(),200);
    await page.locator('.run-state').filter({hasText:/^Ready$/}).waitFor({timeout:120000});
    await page.getByRole('button',{name:/^Project menu,/}).click();await page.getByRole('button',{name:'Save Version',exact:true}).click();await page.getByText('Version saved',{exact:true}).waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Review workspace',exact:true}).click();await page.locator('#stage-tool-review-report').click();console.log('Prepared actual shared report');
   }else if(command==='print'){
    void page.getByRole('button',{name:'Print',exact:true}).click().catch(e=>console.log('Print click error '+e.message));console.log('Requested actual OS Print');
   }else if(command==='verify-print-cancel'){
    await page.getByRole('button',{name:'Print',exact:true}).waitFor();await page.getByRole('button',{name:'Print',exact:true}).isEnabled().then(enabled=>assert.equal(enabled,true));
    result.steps.push({operation:'actual OS Print cancel',ui_usable:true});console.log('Print operation released');
   }else if(command==='state'){
    console.log(JSON.stringify({url:page.url(),alerts:await page.locator('[role="alert"], .run-state').allTextContents(),menu:await page.getByRole('button',{name:/^Project menu,/}).innerText()}));
   }else if(command==='quit'){
    result.result='OBSERVED_SURFACES';await status();await app.evaluate(({app})=>app.quit());console.log('Requested ordinary Quit');
   }else if(command==='finish'){await status();break;}
   await status();
  }catch(e){console.log('Command failed: '+e.message);result.steps.push({operation:command,error:e.message});await status();}
 }
}finally{cli.close();process.stdin.pause();await app.close().catch(()=>{});console.log('Closed owned native app; evidence kept');}
