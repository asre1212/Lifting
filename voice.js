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
function controls(on){$('voice-load').disabled=on;$('voice-record').disabled=on;$('voice-parse').disabled=on;$('voice-text').disabled=on;}
async function loadModel(){if(location.protocol==='file:'){status('Open the Safari or Home Screen web app to download and run local Whisper.');return;}controls(true);status('Downloading speech files; first setup needs internet.');try{await call('load');status('Speech model ready on this device.');}catch(e){status(e.message);}finally{controls(false);}}
function release(){clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$('voice-stop').hidden=true;}
async function start(){
 if(location.protocol==='file:'){status('Local Whisper recording requires the Safari or Home Screen web app. You can type entries in this native wrapper.');return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Microphone unavailable here. Type your entry below.');return;}
 controls(true);canceled=false;const gen=++generation;
 try{
  const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  if(gen!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;
  chunks=[];recorder=new MediaRecorder(stream);
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{release();if(canceled){chunks=[];controls(false);return;}transcribe();};
  recorder.onerror=()=>{canceled=true;release();controls(false);status('Recording failed. Please retry.');};
  recorder.start();$('voice-stop').hidden=false;status('Recording locally… tap Stop. Maximum 30 seconds.');timer=setTimeout(stop,30000);
 }catch(e){release();controls(false);status(e.name==='NotAllowedError'?'Microphone permission denied. Allow it in Settings, or type the entry.':e.message);}
}
function stop(){if(recorder?.state==='recording')recorder.stop();}
async function transcribe(){
 let ctx;
 try{
  status('Transcribing on your device…');
  const blob=new Blob(chunks,{type:recorder.mimeType});chunks=[];
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const pcm=(await offline.startRendering()).getChannelData(0);
  let energy=0;for(const x of pcm)energy+=x*x;
  if(Math.sqrt(energy/pcm.length)<0.002)throw new Error('No clear speech detected. Try again closer to the microphone.');
  const r=await call('transcribe',pcm);
  $('voice-text').value=[$('voice-text').value,r.text.trim()].filter(Boolean).join('\n');
  status('Transcript ready. Check the words, then Preview entries.');
 }catch(e){status(e.message);}finally{if(ctx)await ctx.close();controls(false);}
}
function parse(){
 preview=LiftVoiceParser.parse($('voice-text').value,qlCatalog().map(e=>({name:e.name,section:e.section})),curSec);
 const box=$('voice-preview');box.replaceChildren();
 for(const [i,p] of preview.entries()){
  const row=document.createElement('div');row.className='voice-preview-row';
  const label=document.createElement('strong');label.textContent=p.exercise;row.append(label);
  const details=document.createElement('p');details.textContent=`${SECS[p.section].label} · ${p.sets||'?'} × ${p.reps||'?'} · ${p.weight===''?'?':p.weight} lb ${p.weightMode==='each'?'each':'total'}${p.duration?' · '+p.duration+' min':''}`;row.append(details);
  if(p.issues.length){const warning=document.createElement('p');warning.textContent=p.issues.join(' · ');row.append(warning);}
  box.append(row);
 }
 $('voice-add').hidden=!preview.length;
 status(preview.length?'Review the preview. Add to workout to edit individual fields before saving.':'No entries found. Try: Bench press, 3 sets of 8 at 135 pounds.');
}
function add(){
 if(!preview.length)return;
 const first=preview[0].section;
 for(const p of preview){const section=p.section;rows[section]=rows[section].filter(r=>(r.exercise||'').trim());const {issues,...entry}=p;entry.subgroup=inferSubgroup(p.exercise,section);delete entry.section;rows[section].push(entry);}
 preview=[];$('voice-preview').replaceChildren();$('voice-add').hidden=true;$('voice-text').value='';setSec(first);status('Entries added. Check the workout cards, then Save workout.');toast('Voice entries added — review before saving');
}
function cancel(){generation++;canceled=true;stop();release();abortWorker('Canceled.');controls(false);status('Canceled. Audio discarded.');}
function init(){
 $('voice-load').onclick=loadModel;$('voice-record').onclick=start;$('voice-stop').onclick=stop;$('voice-cancel').onclick=cancel;$('voice-parse').onclick=parse;$('voice-add').onclick=add;
 $('voice-text').oninput=()=>{preview=[];$('voice-preview').replaceChildren();$('voice-add').hidden=true;};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||recorder?.state==='recording'))cancel();});
 window.addEventListener('pagehide',cancel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
