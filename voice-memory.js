/* Personal exercise mappings only. No audio, transcript sentences, metrics or network. */
(function(root){
'use strict';
const STORAGE_KEY='lt_voice_corrections', LIMIT=1000;
const groups={
 arms:['Biceps','Triceps','Forearms','Other Arms'],
 back:['Lats','Upper Back','Lower Back','Traps','Other Back'],
 legs:['Quads','Glutes / Hamstrings','Calves','Other Legs'],
 core:['Abs','Obliques','Stability','Other Core'],
 chest:['Upper Chest','Mid Chest','Lower Chest','Other Chest'],
 general:['Compound','Conditioning','Mobility','Other']
};
const key=value=>root.LiftVoiceParser.key(value);
function clean(entry){
 if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('Invalid correction');
 const result={};
 for(const field of ['phrase','exercise']){
  if(typeof entry[field]!=='string'||!entry[field].trim()||entry[field].length>120||/[\r\n\u0000-\u001f]/.test(entry[field])||!key(entry[field]))throw new Error('Use a short exercise name (up to 120 characters).');
  result[field]=entry[field].trim().replace(/\s+/g,' ');
 }
 if(!Object.hasOwn(groups,entry.section)||!groups[entry.section].includes(entry.subgroup))throw new Error('Choose a valid category and subgroup.');
 result.section=entry.section;result.subgroup=entry.subgroup;
 return result;
}
function validateBackup(data){
 if(!data||data.version!==1||!Array.isArray(data.entries)||data.entries.length>LIMIT)throw new Error('Invalid voice corrections backup.');
 const entries=new Map();
 for(const item of data.entries){const entry=clean(item);entries.set(key(entry.phrase),entry);}
 return [...entries.values()];
}
function read(){
 const raw=root.localStorage.getItem(STORAGE_KEY);
 return raw?validateBackup(JSON.parse(raw)):[];
}
function list(){try{return read();}catch(_){return [];}}
function problem(){try{read();return '';}catch(_){return 'Saved corrections could not be read. Forget saved corrections to reset them, then restore a backup if available.';}}
function write(entries){
 if(entries.length>LIMIT)throw new Error('Correction memory is full. Forget an unused mapping first.');
 try{root.localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,entries}));}
 catch(_){throw new Error('Could not save corrections on this device. Check available storage.');}
 if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new CustomEvent('voice-memory-changed'));
}
function remember(entry,previousPhrase){
 const cleanEntry=clean(entry),k=key(cleanEntry.phrase),previousKey=previousPhrase?key(previousPhrase):k;
 const entries=read().filter(e=>key(e.phrase)!==k&&key(e.phrase)!==previousKey);
 entries.push(cleanEntry);write(entries);return cleanEntry;
}
function forget(phrase){write(read().filter(e=>key(e.phrase)!==key(phrase)));}
function clear(){write([]);}
function exportData(){return {version:1,entries:read()};}
function merge(data){
 const incoming=validateBackup(data),current=read(),keys=new Set(current.map(e=>key(e.phrase)));
 let kept=0,added=0;
 for(const entry of incoming){
  if(keys.has(key(entry.phrase))){kept++;continue;}
  current.push(entry);keys.add(key(entry.phrase));added++;
 }
 write(current);return {added,kept};
}
root.LiftVoiceMemory={list,problem,remember,forget,clear,exportData,validateBackup,merge};
})(typeof window==='undefined'?globalThis:window);
