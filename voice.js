/* Whisper runs locally in a worker. Network is restricted to GET model/runtime
   downloads; audio is only passed in memory, never to fetch or persistent storage. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let worker, pending, seq=0, recorder, stream, chunks=[], timer, canceled=false, preview=[], generation=0;
const status=s=>$('voice-status').textContent=s;

function call(op,audio){
 if(!worker){
  worker=new Worker(new URL('voice-worker.js', document.baseURI),{type:'module'});
  worker.onmessage=({data})=>{if(data.progress){status(data.progress);return;}if(pending&&data.id===pending.id){clearTimeout(pending.timeout);const p=pending;pending=null;data.error?p.reject(new Error(data.error)):p.resolve(data);}};
  worker.onerror=()=>abortWorker('Speech engine unavailable. Retry online, or type the entry.');
 }
 return new Promise((resolve,reject)=>{const id=++seq;pending={id,resolve,reject,timeout:setTimeout(()=>abortWorker('Speech engine timed out. Retry or type the entry.'),240000)};worker.postMessage({id,op,audio},audio?[audio.buffer]:[]);});
}
function abortWorker(message){if(worker)worker.terminate();worker=null;if(pending){clearTimeout(pending.timeout);pending.reject(new Error(message));pending=null;}}
function micState(state){
 const button=$('voice-record'),recording=state==='recording';
 const label=recording?'Stop voice recording':state==='busy'?'Processing voice entry':'Start voice recording';
 button.disabled=state==='busy';button.setAttribute('aria-pressed',String(recording));button.setAttribute('aria-label',label);button.title=label;
}
function controls(on){$('voice-load').disabled=on;$('voice-parse').disabled=on;$('voice-text').disabled=on;$('voice-add').disabled=on;micState(on?'busy':'idle');}
async function loadModel(){if(location.protocol==='file:'){status('Open the Safari or Home Screen web app to download and run local Whisper.');return;}const gen=generation;controls(true);status('Downloading speech files; first setup needs internet.');try{await call('load');if(gen===generation)status('Speech model ready on this device.');}catch(e){if(gen===generation)status(e.message);}finally{if(gen===generation)controls(false);}}
function release(){clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;}
function toggleRecording(){
 $('voice-panel').hidden=false;$('voice-record').setAttribute('aria-expanded','true');
 if(recorder?.state==='recording')stop();else start();
}
async function start(){
 if(location.protocol==='file:'){status('Local Whisper recording requires the Safari or Home Screen web app. You can type entries in this native wrapper.');return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Microphone unavailable here. Type your entry below.');return;}
 controls(true);canceled=false;const gen=++generation;
 try{
  const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  if(gen!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;
  chunks=[];const activeRecorder=new MediaRecorder(stream);recorder=activeRecorder;
  recorder.ondataavailable=e=>{if(gen===generation&&e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{if(gen!==generation)return;release();if(canceled){chunks=[];controls(false);return;}transcribe(activeRecorder.mimeType,gen);};
  recorder.onerror=()=>{if(gen!==generation)return;canceled=true;release();controls(false);status('Recording failed. Please retry.');};
  recorder.start();micState('recording');status('Recording locally… tap the microphone again to stop. Maximum 30 seconds.');timer=setTimeout(stop,30000);
 }catch(e){if(gen!==generation)return;release();controls(false);status(e.name==='NotAllowedError'?'Microphone permission denied. Allow it in Settings, or type the entry.':e.message);}
}
function stop(){if(recorder?.state==='recording'){micState('busy');recorder.stop();}}
async function transcribe(mimeType,gen){
 let ctx;
 try{
  status('Transcribing on your device…');
  const blob=new Blob(chunks,{type:mimeType});chunks=[];
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
  if(gen!==generation)return;
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const pcm=(await offline.startRendering()).getChannelData(0);
  if(gen!==generation)return;
  let energy=0;for(const x of pcm)energy+=x*x;
  if(Math.sqrt(energy/pcm.length)<0.002)throw new Error('No clear speech detected. Try again closer to the microphone.');
  const r=await call('transcribe',pcm);
  if(gen!==generation)return;
  $('voice-text').value=[$('voice-text').value,r.text.trim()].filter(Boolean).join('\n');
  parse();
 }catch(e){if(gen===generation)status(e.message);}finally{if(ctx)await ctx.close();if(gen===generation)controls(false);}
}
function parse(){
 const normalized=LiftVoiceParser.normalizeTranscript($('voice-text').value);
 $('voice-text').value=normalized.text;
 preview=LiftVoiceParser.parse(normalized.text,qlCatalog(),curSec);
 const box=$('voice-preview');box.replaceChildren();
 for(const [i,p] of preview.entries()){
  if(!SUBGROUPS[p.section].includes(p.subgroup))p.subgroup=inferSubgroup(p.exercise,p.section);
  const row=document.createElement('div');row.className='voice-preview-row';
  const heading=document.createElement('strong');heading.textContent=p.exercise;row.append(heading);
  const grid=document.createElement('div');grid.className='voice-fields';row.append(grid);
  function field(label,key,options){
   const wrap=document.createElement('label');wrap.textContent=label;
   if(key==='exercise'||key==='subgroup')wrap.className='voice-wide';
   const input=document.createElement(options?'select':'input');input.dataset.field=key;
   input.id=`voice-entry-${i}-${key}`;wrap.htmlFor=input.id;
   if(options)for(const [value,text] of options)input.add(new Option(text,value));
   else if(key==='exercise'){input.type='text';input.required=true;input.autocomplete='off';}
   else{input.type='number';input.min=key==='sets'||key==='reps'?'1':'0';input.step=key==='sets'||key==='reps'?'1':'any';input.inputMode=key==='sets'||key==='reps'?'numeric':'decimal';input.placeholder='Not specified';}
   input.value=p[key];
   input.oninput=()=>{p[key]=input.type==='number'?(input.value===''?'':Number(input.value)):input.value;};
   wrap.append(input);grid.append(wrap);return input;
  }
  const exercise=field('Exercise','exercise');
  const section=field('Category','section',Object.entries(SECS).map(([value,sec])=>[value,sec.label]));
  field('Weight type','weightMode',[['total','Total'],['each','Each side']]);
  const subgroup=field('Subgroup','subgroup',SUBGROUPS[p.section].map(g=>[g,g]));
  function setSubgroup(){
   subgroup.replaceChildren();for(const g of SUBGROUPS[p.section])subgroup.add(new Option(g,g));
   if(!SUBGROUPS[p.section].includes(p.subgroup))p.subgroup=inferSubgroup(p.exercise,p.section);
   subgroup.value=p.subgroup;
  }
  section.onchange=()=>{p.section=section.value;p.subgroup=inferSubgroup(p.exercise,p.section);setSubgroup();};
  exercise.onchange=()=>{
   const found=LiftVoiceParser.resolveExercise(exercise.value.trim(),qlCatalog(),p.section);
   p.exercise=found.exercise;exercise.value=p.exercise;heading.textContent=p.exercise;
   p.section=found.section;section.value=p.section;p.subgroup=found.subgroup;setSubgroup();
  };
  field('Sets','sets');field('Reps','reps');field('Weight (lb)','weight');field('Time (minutes)','duration');
  if(p.issues.length){const warning=document.createElement('p');warning.textContent='Please review: '+p.issues.join(' · ');row.append(warning);}
  box.append(row);
 }
 $('voice-add').hidden=!preview.length;
 const correction=normalized.corrections.length?'Corrected '+normalized.corrections.join(', ')+'. ':'';
 status(preview.length?correction+'Review the fields below. Add to workout places each exercise in its category.':'No entries found. Try: Bench press, 3 sets of 8 at 135 pounds.');
}
function add(){
 if(!preview.length)return;
 for(const input of $('voice-preview').querySelectorAll('input')){
  if(input.type==='text')input.setCustomValidity(input.value.trim()?'':'Enter an exercise name.');
  if(!input.reportValidity())return;
 }
 const first=preview[0].section,counts={};
 for(const p of preview){
  const section=p.section;counts[section]=(counts[section]||0)+1;
  rows[section]=rows[section].filter(r=>(r.exercise||'').trim());
  // Only workout fields enter storage; transcript, corrections and warnings stay ephemeral.
  rows[section].push({exercise:p.exercise.trim(),subgroup:p.subgroup,sets:p.sets,reps:p.reps,weight:p.weight,weightMode:p.weightMode,duration:p.duration});
 }
 const destinations=Object.entries(counts).map(([sec,n])=>`${n} to ${SECS[sec].label}`).join(', ');
 preview=[];$('voice-preview').replaceChildren();$('voice-add').hidden=true;$('voice-text').value='';setSec(first);
 status(`Added ${destinations}. Check the workout cards, then Save workout.`);toast('Voice entries added — review before saving');
}
function cancel(){generation++;canceled=true;stop();release();chunks=[];abortWorker('Canceled.');controls(false);status('Canceled. Audio discarded.');}
function init(){
 $('voice-load').onclick=loadModel;$('voice-record').onclick=toggleRecording;$('voice-cancel').onclick=()=>{cancel();$('voice-panel').hidden=true;$('voice-record').setAttribute('aria-expanded','false');$('voice-record').focus();};$('voice-parse').onclick=parse;$('voice-add').onclick=add;
 $('voice-text').oninput=()=>{preview=[];$('voice-preview').replaceChildren();$('voice-add').hidden=true;};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||recorder?.state==='recording'))cancel();});
 window.addEventListener('pagehide',cancel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
