const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
require('../voice-parser.js');
let stored=new Map(),blocked=false;
global.localStorage={getItem:k=>stored.get(k)||null,setItem(k,v){if(blocked)throw new Error('QuotaExceededError');stored.set(k,v)}};
require('../voice-memory.js');const memory=LiftVoiceMemory;
const original={phrase:'My leg lift',exercise:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings'};
memory.remember({...original,sets:99,reps:999,weight:500,transcript:'private sentence',audio:[1,2,3]});
assert.deepEqual(memory.list(),[original]);assert.equal([...stored.values()][0].includes('private sentence'),false);
// Recreate the module to verify persistent storage rather than in-memory retention.
delete require.cache[require.resolve('../voice-memory.js')];require('../voice-memory.js');assert.deepEqual(LiftVoiceMemory.list(),[original]);
memory.remember({...original,phrase:'MY LEG LIFT',exercise:'Single-leg Romanian Deadlift'});assert.equal(memory.list().length,1);
memory.remember({...original,phrase:'My hinge'},'MY LEG LIFT');assert.equal(memory.list().length,1);assert.equal(memory.list()[0].phrase,'My hinge');
const backup=memory.exportData();memory.clear();assert.equal(memory.list().length,0);assert.deepEqual(memory.merge(backup),{added:1,kept:0});assert.deepEqual(memory.list(),backup.entries);
memory.remember({...original,phrase:'My hinge',exercise:'Hip Thrust'});assert.deepEqual(memory.merge(backup),{added:0,kept:1});assert.equal(memory.list()[0].exercise,'Hip Thrust');
for(const entry of [{...original,section:'unknown'},{...original,subgroup:'Biceps'},{...original,phrase:''},{...original,phrase:'x'.repeat(121)},{...original,phrase:'line\nbreak'},{...original,exercise:42}])assert.throws(()=>memory.remember(entry));
assert.throws(()=>memory.validateBackup({version:2,entries:[]}));assert.throws(()=>memory.validateBackup({version:1,entries:[{...original,section:'__proto__'}]}));assert.equal(memory.list()[0].exercise,'Hip Thrust');
blocked=true;assert.throws(()=>memory.remember(original),/Could not save/);blocked=false;assert.equal(memory.list().length,1);
memory.forget('MY HINGE');assert.deepEqual(memory.list(),[]);
stored.set('lt_voice_corrections','broken');assert.deepEqual(memory.list(),[]);assert.ok(memory.problem());assert.throws(()=>memory.remember(original));memory.clear();assert.equal(memory.problem(),'');
// This module must work when all network primitives fail.
const sandbox={LiftVoiceParser,localStorage,fetch(){throw new Error('Network forbidden')},XMLHttpRequest:class{constructor(){throw new Error('Network forbidden')}}};
vm.runInNewContext(fs.readFileSync(require.resolve('../voice-memory.js'),'utf8'),sandbox);sandbox.LiftVoiceMemory.remember(original);assert.equal(sandbox.LiftVoiceMemory.list()[0].exercise,original.exercise);
console.log('Memory: durable mappings only, edit/forget, backup/restore, conflict preservation, validation, quota errors and no-network operation passed');
