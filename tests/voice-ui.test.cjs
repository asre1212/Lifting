const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:8765');await page.waitForTimeout(1000);await page.evaluate(()=>goTab('log'));await page.locator('.voice-card summary').click();
await page.locator('#voice-text').fill('Bench press, three sets of eight at 135 pounds. Dumbbell curls, 3 sets of 10 at 22.5 pounds each.');await page.locator('#voice-parse').click();assert.equal(await page.locator('.voice-preview-row').count(),2);
await page.locator('#voice-add').click();assert.equal(await page.locator('#voice-add').isHidden(),true);assert.equal(await page.locator('#voice-text').inputValue(),'');
const staged=await page.evaluate(()=>Object.values(rows).flat().filter(r=>r.exercise));assert.equal(staged.length,2);assert.equal(staged.find(r=>r.weightMode==='each').weight,22.5);assert.equal(staged.find(r=>r.weightMode==='each').weightMode,'each');
await page.evaluate(()=>saveWorkout());await page.waitForTimeout(1000);const ws=await page.evaluate(()=>getWO());assert.equal(ws.length,1);assert.equal(ws[0].entries.length,2);assert.equal(ws[0].entries.find(r=>r.weightMode==='each').totalWeight,45);
// Synthetic RDL regression, beginning in Arms: map every field and save to Legs.
await page.evaluate(()=>{goTab('log');setSec('arms');});
await page.locator('#voice-text').fill('RDLs for sets of 10 at 20 pounds each side.');await page.locator('#voice-parse').click();
assert.equal(await page.locator('#voice-text').inputValue(),'RDLs 4 sets of 10 at 20 pounds each side.');
assert.match(await page.locator('#voice-status').textContent(),/for → 4/);
for(const [field,value] of Object.entries({exercise:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings',sets:'4',reps:'10',weight:'20',weightMode:'each'}))assert.equal(await page.locator(`#voice-preview [data-field="${field}"]`).inputValue(),value);
// Missing whitespace must not turn the exercise into an unknown Arms entry.
await page.locator('#voice-text').fill('RDL4 sets of 10 at 20 pounds each side.');await page.locator('#voice-parse').click();
assert.equal(await page.locator('#voice-text').inputValue(),'RDL 4 sets of 10 at 20 pounds each side.');
assert.match(await page.locator('#voice-status').textContent(),/RDL4 → RDL 4/);
for(const [field,value] of Object.entries({exercise:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings',sets:'4',reps:'10',weight:'20',weightMode:'each'}))assert.equal(await page.locator(`#voice-preview [data-field="${field}"]`).inputValue(),value);
assert.equal(await page.locator('#voice-preview').getByText(/Please review:/).count(),0);
await page.screenshot({path:'/tmp/lifting-voice-fixed.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.locator('#voice-add').click();assert.equal(await page.evaluate(()=>curSec),'legs');
const rdl=await page.evaluate(()=>rows.legs.find(r=>r.exercise==='Romanian Deadlift'));
assert.deepEqual(rdl,{exercise:'Romanian Deadlift',subgroup:'Glutes / Hamstrings',sets:4,reps:10,weight:20,weightMode:'each',duration:''});
await page.evaluate(()=>saveWorkout());await page.waitForTimeout(1000);
const saved=await page.evaluate(()=>getWO().flatMap(w=>w.entries).find(e=>e.exercise==='Romanian Deadlift'));
assert.equal(saved.section,'legs');assert.equal(saved.subgroup,'Glutes / Hamstrings');assert.equal(saved.totalWeight,40);assert.equal(saved.volume,1600);
// Multiple categories, editable preview, and an existing unsaved row survive insertion.
await page.evaluate(()=>{goTab('log');rows.back.push({exercise:'Existing row',subgroup:'Upper Back',sets:2,reps:10,weight:30,weightMode:'total',duration:''});setSec('legs');});
await page.locator('#voice-text').fill('Biceps curls too sets of ten at 20 pounds each. New exercise, 3 sets of 8 at 25 pounds.');await page.locator('#voice-parse').click();
assert.equal(await page.locator('#voice-entry-0-section').inputValue(),'arms');
assert.equal(await page.locator('#voice-entry-0-subgroup').inputValue(),'Biceps');
await page.locator('#voice-entry-0-sets').fill('4');
await page.locator('#voice-entry-1-section').selectOption('core');await page.locator('#voice-entry-1-subgroup').selectOption('Obliques');
await page.locator('#voice-add').click();
const multi=await page.evaluate(()=>({arms:rows.arms,core:rows.core,back:rows.back}));
assert.equal(multi.arms.find(r=>r.exercise==='Bicep Curl').sets,4);assert.equal(multi.core.find(r=>r.exercise==='New exercise').subgroup,'Obliques');assert.equal(multi.back.find(r=>r.exercise==='Existing row').weight,30);
await page.evaluate(()=>{for(const sec of Object.keys(rows))rows[sec]=[];});
await page.evaluate(()=>goTab('log'));await page.locator('#voice-text').fill('<img src=x onerror=alert(1)>, 3 sets of 8 at 10 pounds');await page.locator('#voice-parse').click();assert.equal(await page.locator('#voice-preview img').count(),0);
await page.locator('#voice-text').fill('Bench press, 3 sets of 8 at 135 pounds');assert.equal(await page.locator('#voice-add').isHidden(),true);await page.locator('#voice-parse').click();await page.locator('#voice-add').click();assert.equal(await page.evaluate(()=>Object.values(rows).flat().filter(r=>r.exercise).length),1);
await page.evaluate(()=>{window.stoppedTracks=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,writable:true,value:async()=>({getTracks:()=>[{stop(){window.stoppedTracks++}}]})});window.MediaRecorder=class{constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}stop(){this.state='inactive';this.onstop()}};});
await page.locator('#voice-record').click();assert.equal(await page.locator('#voice-stop').isVisible(),true);await page.locator('#voice-cancel').click();assert.equal(await page.locator('#voice-stop').isHidden(),true);assert.equal(await page.evaluate(()=>stoppedTracks),1);assert.equal(await page.locator('#voice-record').isEnabled(),true);
await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')}});await page.locator('#voice-record').click();assert.match(await page.locator('#voice-status').textContent(),/permission denied/);assert.equal(await page.locator('#voice-record').isEnabled(),true);
// A completed on-device transcription automatically previews the corrected fields.
await page.locator('#voice-text').fill('');
await page.evaluate(()=>{
 navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){}}]});
 window.Worker=class{postMessage({id}){queueMicrotask(()=>this.onmessage({data:{id,text:'RDL4 sets of 10 at 20 pounds each side.'}}))}terminate(){}};
 window.AudioContext=class{async decodeAudioData(){return {duration:1}}async close(){}};
 window.OfflineAudioContext=class{createBufferSource(){return {connect(){},start(){}}}async startRendering(){return {getChannelData:()=>new Float32Array(16000).fill(.1)}}};
});
await page.locator('#voice-record').click();await page.locator('#voice-stop').click();
await page.locator('#voice-entry-0-exercise').waitFor();
assert.equal(await page.locator('#voice-entry-0-exercise').inputValue(),'Romanian Deadlift');assert.equal(await page.locator('#voice-entry-0-sets').inputValue(),'4');assert.equal(await page.locator('#voice-entry-0-section').inputValue(),'legs');
await page.screenshot({path:'/tmp/lifting-voice.png',fullPage:true});assert.deepEqual(errors,[]);console.log('UI: RDL regression, category/subgroup/field mapping, edits, saved volume, preserved drafts, XSS, stale preview, cancellation and microphone denial passed');
await browser.close();})();
