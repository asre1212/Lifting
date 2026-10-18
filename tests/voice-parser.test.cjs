const assert=require('node:assert/strict');require('../voice-parser.js');
const catalog=[{name:'Bench Press',section:'chest'},{name:'Dumbbell curls',section:'arms'},{name:'Plank',section:'core'},{name:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings'},{name:'Bicep Curl',section:'arms'},{name:'Leg Curl',section:'legs'},{name:'Deadlift',section:'back'}];
const parse=(t,fallback='general',entries=catalog)=>LiftVoiceParser.parse(t,entries,fallback);
let scenarios=0;
function test(name,run){try{run();scenarios++;}catch(e){console.error(name);throw e;}}
test('word numbers and separate exercises',()=>{
 const p=parse('Bench press, three sets of eight at one hundred thirty five pounds. Dumbbell curls, three sets of ten at twenty five pounds each.');
 assert.equal(p.length,2);assert.equal(p[0].weight,135);assert.equal(p[0].sets,3);assert.equal(p[0].reps,8);assert.equal(p[0].section,'chest');assert.equal(p[1].weightMode,'each');assert.equal(p[1].weight,25);
});
test('RDL homophone from the wrong tab',()=>{
 const text='RDLs for sets of 10 at 20 pounds each side.';
 assert.equal(LiftVoiceParser.normalizeTranscript(text).text,'RDLs 4 sets of 10 at 20 pounds each side.');
 assert.deepEqual(parse(text,'arms'),[{exercise:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings',spokenExercise:'RDLs',sets:4,reps:10,weight:20,weightMode:'each',duration:'',issues:[]}]);
});
test('joined exercise/count tokens still map to the right category',()=>{
 for(const text of ['RDL4 sets of 10 at 20 pounds each side.','RDLS4sets of 10 at 20 pounds each side.','RDL4x10 at 20 pounds each side.','RDL4 by 10 at 20 pounds each side.']){
  for(const section of ['arms','back','chest','core','general','legs']){
   const [p]=parse(text,section,[...catalog,{name:'RDL4',section:'arms',subgroup:'Other Arms'}]);
   assert.equal(p.exercise,'Romanian Deadlift');assert.equal(p.section,'legs');assert.equal(p.subgroup,'Glutes / Hamstrings');assert.equal(p.sets,4);assert.equal(p.reps,10);assert.equal(p.weight,20);assert.equal(p.weightMode,'each');assert.deepEqual(p.issues,[]);
  }
 }
 const [curl]=parse('Bicep Curl3 sets of 10 at 20 lb','legs');assert.equal(curl.section,'arms');assert.equal(curl.sets,3);
 const normalized=LiftVoiceParser.normalizeTranscript('RDL4 sets of 10');assert.equal(normalized.text,'RDL 4 sets of 10');assert.ok(normalized.corrections.includes('RDL4 → RDL 4'));
 assert.deepEqual(LiftVoiceParser.normalizeTranscript(normalized.text),{text:normalized.text,corrections:[]});
 for(const text of ['B12 Curl, 3 sets of 10','TRX row, 3 sets of 10','RDL4','Zone2 cycling'])assert.equal(LiftVoiceParser.normalizeTranscript(text).text,text);
});
test('spoken numbers, separated abbreviation, metric first',()=>{
 for(const text of ['RDLs four sets of eight at twenty five pounds each side.','R D Ls, 4 by 8 at 25 pounds each side.','R.D.L.s, 4 x 8 at 25 pounds each side.','4 sets of 8 RDLs at 25 pounds each side.']){
  const [p]=parse(text,'back');assert.equal(p.exercise,'Romanian Deadlift');assert.equal(p.section,'legs');assert.equal(p.sets,4);assert.equal(p.reps,8);assert.equal(p.weight,25);assert.equal(p.weightMode,'each');
 }
});
test('categories and subgroups independent of current tab',()=>{
 const examples=[['biceps curls','Bicep Curl','arms','Biceps'],['leg curls','Leg Curl','legs','Glutes / Hamstrings'],['deadlifts','Deadlift','back','Lower Back'],['reverse flies','Reverse Fly','back','Upper Back'],['chest flies','Chest Fly','chest','Mid Chest'],['shoulder press','Overhead Press','general','Compound'],['lunges','Lunges','legs','Quads'],['pull ups','Pull-ups','back','Lats'],['skull crushers','Skull Crusher','arms','Triceps']];
 for(const [spoken,name,section,subgroup] of examples){const p=parse(spoken+', 3 sets of 10 at 25 lb','core')[0];assert.equal(p.exercise,name);assert.equal(p.section,section);assert.equal(p.subgroup,subgroup);assert.deepEqual(p.issues,[]);}
});
test('equipment variants do not merge into different history',()=>{
 const p=parse('Dumbbell bench press 3 sets of 8 at 25 lb each','legs')[0];assert.equal(p.exercise,'Dumbbell Bench Press');assert.equal(p.section,'chest');assert.equal(p.subgroup,'Mid Chest');
 const r=parse('Single leg RDL 3 sets of 8 at 25 lb','arms')[0];assert.equal(r.exercise,'Single-leg Romanian Deadlift');assert.equal(r.section,'legs');
});
test('respect exact user names and categories',()=>{
 const p=parse('RDLs 4 sets of 8 at 25 pounds','arms',[...catalog,{name:'RDLs',section:'back',subgroup:'Lower Back'}])[0];assert.equal(p.exercise,'RDLs');assert.equal(p.section,'back');assert.equal(p.subgroup,'Lower Back');
});
test('conflicting catalog categories are flagged',()=>{
 const p=parse('Bench press, 3 sets of 8 at 25 lb','arms',[...catalog,{name:'Bench Press',section:'arms'}])[0];assert.equal(p.section,'arms');assert.match(p.issues.join(' '),/multiple categories/);
});
test('homophones only in count contexts',()=>{
 const t='Plank for 30 seconds bodyweight. Bench press for three sets of eight at 135 pounds. Pushups to failure.';
 assert.equal(LiftVoiceParser.normalizeTranscript(t).text,t);
 const p=parse('Biceps curls too sets of ate at 25 pounds');assert.equal(p[0].sets,2);assert.equal(p[0].reps,8);
});
test('decimal and kilogram weights',()=>{
 const p=parse('Dumbbell curls, 3 x 10 at 22.5 pounds each.');assert.equal(p.length,1);assert.equal(p[0].weight,22.5);
 assert.equal(parse('Bench press, 3 sets of 8 at 60 kilograms')[0].weight,132.28);
 assert.equal(parse('Bench press, 3 sets of 8 at twenty two point five pounds')[0].weight,22.5);
});
test('duration and bodyweight',()=>{const p=parse('Plank for 90 seconds bodyweight')[0];assert.equal(p.exercise,'Plank');assert.equal(p.duration,1.5);assert.equal(p.weight,0);assert.deepEqual(p.issues,[]);});
test('missing fields are not invented',()=>{
 let p=parse('Bench press')[0];assert.equal(p.sets,'');assert.ok(p.issues.length);
 p=parse('Bench press sets of 8 at 135 pounds')[0];assert.equal(p.exercise,'Bench Press');assert.equal(p.sets,'');assert.equal(p.reps,8);
 p=parse('Bench press 4 sets at 135 pounds')[0];assert.equal(p.reps,'');assert.equal(p.sets,4);
});
test('empty and unknown input',()=>{assert.equal(parse('').length,0);const p=parse('New exercise, 2 sets of 12 at 40 pounds')[0];assert.equal(p.section,'general');assert.ok(p.issues.includes('Check exercise and category'));});
test('repeated exercises and compound names',()=>{
 const p=parse('Bench press, 2 sets of 8 at 135 pounds; Bench press, 1 set of 6 at 145 pounds');assert.equal(p.length,2);assert.equal(p[1].sets,1);
 const q=parse('Clean and press, 3 sets of 8 at 25 lb.');assert.equal(q.length,1);assert.equal(q[0].exercise,'Clean and Press');
});
test('expanded dictionary covers common equipment, mobility and cardio names',()=>{
 const examples=[['DB bench','Dumbbell Bench Press','chest','Mid Chest'],['BB RDL','Barbell Romanian Deadlift','legs','Glutes / Hamstrings'],['BSS','Bulgarian Split Squat','legs','Quads'],['single leg RDL','Single-leg Romanian Deadlift','legs','Glutes / Hamstrings'],['seated hamstring curls','Seated Leg Curl','legs','Glutes / Hamstrings'],['lying leg curls','Lying Leg Curl','legs','Glutes / Hamstrings'],['DB rows','Dumbbell Row','back','Upper Back'],['cable curls','Cable Curl','arms','Biceps'],['side raises','Lateral Raise','general','Other'],['row machine','Rowing Machine','general','Conditioning'],['hip flexor stretch','Hip Flexor Stretch','general','Mobility']];
 for(const [spoken,name,section,subgroup] of examples){const [p]=parse(spoken+', 3 sets of 10 at 20 pounds','core');assert.equal(p.exercise,name);assert.equal(p.section,section);assert.equal(p.subgroup,subgroup);assert.deepEqual(p.issues,[]);}
 const [bike]=parse('bike for 15 minutes bodyweight');assert.equal(bike.exercise,'Stationary Bike');assert.equal(bike.duration,15);
});
test('dictionary aliases cannot silently shadow different exercises',()=>{
 const seen=new Map();const dictionary=LiftVoiceParser.dictionary();assert.ok(dictionary.length>=150);
 for(const entry of dictionary)for(const alias of entry.aliases){assert.ok(!seen.has(alias)||seen.get(alias)===entry.name,`${alias}: ${seen.get(alias)} / ${entry.name}`);seen.set(alias,entry.name);assert.equal(LiftVoiceParser.resolveExercise(alias).exercise,entry.name);const [parsed]=LiftVoiceParser.parse(alias+', 3 sets of 10 at 20 lb',[],'arms');assert.equal(parsed.exercise,entry.name);assert.equal(parsed.section,entry.section);}
});
test('personal mappings override history and defaults without changing workout metrics',()=>{
 const memory=[{phrase:'my leg lift',exercise:'Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings'},{phrase:'RDL',exercise:'Single-leg Romanian Deadlift',section:'legs',subgroup:'Glutes / Hamstrings'}];
 const [p]=LiftVoiceParser.parse('My leg lift, 2 sets of 12 at 30 pounds each',catalog,'arms',memory);
 assert.equal(p.spokenExercise,'My leg lift');assert.equal(p.exercise,'Romanian Deadlift');assert.equal(p.section,'legs');assert.equal(p.sets,2);assert.equal(p.reps,12);assert.equal(p.weight,30);assert.equal(p.remembered,true);
 const [rdl]=LiftVoiceParser.parse('RDLs 3 sets of 10 at 20 lb',catalog,'arms',memory);assert.equal(rdl.exercise,'Single-leg Romanian Deadlift');
 assert.equal(LiftVoiceParser.resolveExercise('my leg lift variation',catalog,'arms',memory).remembered,undefined);
});
console.log(`${scenarios} parser regression scenarios passed`);
