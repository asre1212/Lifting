const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const page=await context.newPage();
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
 await page.goto('http://localhost:8765');await page.waitForTimeout(1000);await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.locator('#voice-manage').click();assert.equal(await page.locator('#voice-memory').getAttribute('open'),'');assert.equal(await page.locator('#voice-record').getAttribute('aria-pressed'),'false');
 await page.locator('#voice-dictionary summary').click();await page.locator('#voice-dictionary-search').fill('db rdl');assert.match(await page.locator('#voice-dictionary-list').textContent(),/Dumbbell Romanian Deadlift/);
 await page.locator('#voice-dictionary-search').fill('BSS');assert.match(await page.locator('#voice-dictionary-list').textContent(),/Bulgarian Split Squat/);
 await page.locator('#voice-text').fill('My hinge, 3 sets of 10 at 20 lb each');await page.locator('#voice-parse').click();
 await page.locator('#voice-entry-0-reps').fill('12');assert.equal(await page.locator('[data-action="remember"]').isHidden(),true);
 await page.locator('#voice-entry-0-exercise').fill('Romanian Deadlift');await page.locator('#voice-entry-0-exercise').press('Tab');
 assert.equal(await page.locator('#voice-entry-0-section').inputValue(),'legs');assert.equal(await page.locator('#voice-entry-0-subgroup').inputValue(),'Glutes / Hamstrings');
 assert.equal(await page.locator('[data-action="remember"]').isVisible(),true);
 await page.locator('[data-action="remember"]').click();assert.equal(await page.locator('#voice-add').isVisible(),true);
 const expected={phrase:'My hinge',exercise:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings'};
 assert.deepEqual(await page.evaluate(()=>LiftVoiceMemory.list()),[expected]);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lt_voice_corrections'))),{version:1,entries:[expected]});
 await page.screenshot({path:'/tmp/lifting-learning-preview.png',fullPage:true});
 // Offline reload must retain the mapping; no microphone or model downloads required.
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>typeof LiftVoiceMemory!=='undefined');await page.locator('#voice-manage').click();
 await page.locator('#voice-text').fill('My hinge 2 sets of 6 at 35 lb each');await page.locator('#voice-parse').click();
 assert.equal(await page.locator('#voice-entry-0-exercise').inputValue(),'Romanian Deadlift');assert.equal(await page.locator('#voice-entry-0-sets').inputValue(),'2');assert.equal(await page.locator('#voice-entry-0-weight').inputValue(),'35');assert.match(await page.locator('#voice-preview').textContent(),/Using your saved correction/);
 await page.locator('#voice-add').click();await page.evaluate(()=>saveWorkout());await page.waitForTimeout(1000);
 const workout=await page.evaluate(()=>getWO()[0]);assert.equal(workout.entries[0].section,'legs');assert.equal(workout.entries[0].volume,840);assert.equal(Object.hasOwn(workout.entries[0],'spokenExercise'),false);
 // Actual JSON export and file import round-trip with the existing workflow.
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
 const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>exportData());const download=await downloadPromise;
 const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.deepEqual(backup.voiceCorrections,{version:1,entries:[expected]});assert.equal(JSON.stringify(backup).includes('My hinge 2 sets'),false);
 await page.locator('#voice-manage').click();await page.getByRole('button',{name:'Forget correction for My hinge',exact:true}).click();assert.deepEqual(await page.evaluate(()=>LiftVoiceMemory.list()),[]);
 async function importBackup(data){const chooserPromise=page.waitForEvent('filechooser');await page.evaluate(()=>importData());const chooser=await chooserPromise;await chooser.setFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
 await importBackup(backup);await page.waitForFunction(()=>LiftVoiceMemory.list().length===1);assert.deepEqual(await page.evaluate(()=>LiftVoiceMemory.list()),[expected]);
 // Edit mapping and phrase, then restore an older conflicting backup without undoing it.
 await page.getByRole('button',{name:'Edit correction for My hinge',exact:true}).click();await page.locator('#voice-memory-phrase').fill('My hinge');await page.locator('#voice-memory-exercise').fill('Hip Thrust');await page.locator('#voice-memory-exercise').press('Tab');await page.locator('#voice-memory-save').click();
 await importBackup(backup);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>LiftVoiceMemory.list()[0].exercise),'Hip Thrust');
 await page.getByRole('button',{name:'Edit correction for My hinge',exact:true}).click();await page.locator('#voice-memory-phrase').fill('My glute lift');await page.locator('#voice-memory-save').click();assert.equal(await page.evaluate(()=>LiftVoiceMemory.list()[0].phrase),'My glute lift');assert.equal(await page.evaluate(()=>LiftVoiceMemory.list().length),1);
 // Legacy backups leave correction memory intact; malformed new data changes nothing.
 await importBackup({app:'LiftTrack',workouts:[],exercises:{arms:[]}});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>LiftVoiceMemory.list()[0].phrase),'My glute lift');
 const before=await page.evaluate(()=>({workouts:getWO(),corrections:LiftVoiceMemory.list()}));
 await importBackup({workouts:[{id:'invalid-import-test',date:'2099-01-01',entries:[]}],voiceCorrections:{version:1,entries:[{...expected,section:'unknown'}]}});await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>({workouts:getWO(),corrections:LiftVoiceMemory.list()})),before);
 // User-created mappings and hostile-looking text render as text, never HTML.
 await page.locator('#voice-memory-phrase').fill('New nickname');await page.locator('#voice-memory-exercise').fill('<img src=x onerror=alert(1)>');await page.locator('#voice-memory-exercise').press('Tab');await page.locator('#voice-memory-save').click();assert.equal(await page.locator('#voice-memory-list img').count(),0);
 await page.screenshot({path:'/tmp/lifting-learning-manager.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 page.once('dialog',d=>d.accept());await page.locator('#voice-memory-clear').click();assert.deepEqual(await page.evaluate(()=>LiftVoiceMemory.list()),[]);
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('Learning UI: dictionary search, explicit remember, metrics excluded, offline reload, saved workout, backup round-trip, edit/forget, conflict/legacy import, invalid backup and XSS safety passed');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
