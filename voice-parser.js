/* Local workout parsing and exercise aliases. No network or model calls. */
(function(root){
'use strict';
function numbers(s){
 const small={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 return s.replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -]+(?:and[ -]+)?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))*\b/gi,m=>{let n=0;for(const w of m.toLowerCase().split(/[ -]+/)){if(w==='hundred')n=(n||1)*100;else if(w!=='and')n+=small[w]||0;}return n;});
}
function normalizeTranscript(text){
 const corrections=[];
 // Speech can join the exercise and count (RDL4 sets). Split only before
 // explicit count syntax; leave names such as B12 Curl or TRX unchanged.
 text=String(text||'').replace(/\b([a-z][a-z'-]*)(\d+)(?=\s*(?:sets?|reps?)\b|\s*(?:[x×]|by)\s*\d)/gi,(joined,name,count)=>{
  const separated=`${name} ${count}`;corrections.push(`${joined} → ${separated}`);return separated;
 });
 // Only fix homophones in count positions, never ordinary "for 30 seconds" or "to failure".
 text=String(text||'').replace(/\b(for|fore|to|too|ate)(?=\s+(?:sets?|reps?)\b)/gi,(word)=>{
  const digit={for:'4',fore:'4',to:'2',too:'2',ate:'8'}[word.toLowerCase()];
  corrections.push(`${word} → ${digit}`);return digit;
 }).replace(/\b(sets?\s+of\s+)(for|fore|to|too|ate)\b/gi,(_,prefix,word)=>{
  const digit={for:'4',fore:'4',to:'2',too:'2',ate:'8'}[word.toLowerCase()];
  corrections.push(`${word} → ${digit}`);return prefix+digit;
 }).replace(/\br\s*\.\s*d\s*\.\s*l\s*\.(s?)/gi,'RDL$1');
 return {text,corrections:[...new Set(corrections)]};
}
function key(name){
 const plural={biceps:'bicep',triceps:'tricep',curls:'curl',rdls:'rdl',squats:'squat',deadlifts:'deadlift',rows:'row',raises:'raise',extensions:'extension',lunges:'lunge',presses:'press',flys:'fly',flies:'fly',pushdowns:'pushdown',crushers:'crusher',shrugs:'shrug',thrusts:'thrust',planks:'plank',crunches:'crunch',twists:'twist',bugs:'bug',burpees:'burpee',crossovers:'crossover',carries:'carry',dumbbells:'dumbbell',barbells:'barbell',kettlebells:'kettlebell',ups:'up',pulls:'pull'};
 return String(name).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()
  .replace(/\bdb\b/g,'dumbbell').replace(/\bbb\b/g,'barbell').replace(/\bkb\b/g,'kettlebell')
  .split(/\s+/).map(w=>plural[w]||w).join(' ')
  .replace(/\br d ls?\b/g,'rdl').replace(/\bdead lift\b/g,'deadlift').replace(/\bpull down\b/g,'pulldown')
  .replace(/\b(push|pull|chin|sit) up\b/g,'$1up');
}
// Match the app's existing sections/subgroups; shoulders use General (there is no shoulder section).
const exercises=[
 ['Bicep Curl','arms','Biceps','curl|biceps curl'],
 ['Hammer Curl','arms','Biceps','hammer'],
 ['Preacher Curl','arms','Biceps','preacher'],
 ['Tricep Pushdown','arms','Triceps','triceps pushdown|tricep pulldown|tricep pressdown|rope pushdown'],
 ['Skull Crusher','arms','Triceps','lying tricep extension'],
 ['Tricep Extension','arms','Triceps','overhead tricep extension'],
 ['Wrist Curl','arms','Forearms','forearm curl'],
 ['Reverse Curl','arms','Forearms','reverse bicep curl'],
 ['Deadlift','back','Lower Back','conventional deadlift'],
 ['Barbell Row','back','Upper Back','bent over row|bentover row'],
 ['Cable Row','back','Upper Back','seated cable row'],
 ['Lat Pulldown','back','Lats','lat pull down|lat pulldowns'],
 ['Pull-ups','back','Lats','pullup'],
 ['Chin-up','back','Lats','chinup'],
 ['Face Pull','back','Upper Back','facepull'],
 ['Reverse Fly','back','Upper Back','rear delt fly'],
 ['Shrugs','back','Traps','shrug'],
 ['Back Extension','back','Lower Back','hyperextension'],
 ['Squat','legs','Quads','back squat'],
 ['Front Squat','legs','Quads',''],
 ['Goblet Squat','legs','Quads',''],
 ['Bulgarian Split Squat','legs','Quads','bulgarian squat'],
 ['Split Squat','legs','Quads',''],
 ['Hack Squat','legs','Quads',''],
 ['Leg Press','legs','Quads',''],
 ['Romanian Deadlift','legs','Glutes / Hamstrings','rdl|romanian dead lift'],
 ['Leg Curl','legs','Glutes / Hamstrings','hamstring curl|seated leg curl|lying leg curl'],
 ['Leg Extension','legs','Quads','quad extension'],
 ['Calf Raise','legs','Calves','calf press'],
 ['Hip Thrust','legs','Glutes / Hamstrings',''],
 ['Glute Bridge','legs','Glutes / Hamstrings',''],
 ['Lunges','legs','Quads','lunge'],
 ['Good Morning','legs','Glutes / Hamstrings','good mornings'],
 ['Plank','core','Stability',''],
 ['Side Plank','core','Obliques',''],
 ['Crunch','core','Abs','ab crunch'],
 ['Sit-up','core','Abs','situp'],
 ['Russian Twist','core','Obliques',''],
 ['Leg Raise','core','Abs','hanging leg raise'],
 ['Ab Wheel','core','Abs','ab rollout|ab wheel rollout'],
 ['Dead Bug','core','Stability',''],
 ['Pallof Press','core','Stability',''],
 ['Bench Press','chest','Mid Chest','bench|flat bench press'],
 ['Incline Bench Press','chest','Upper Chest','incline bench|incline press'],
 ['Decline Bench Press','chest','Lower Chest','decline bench|decline press'],
 ['Chest Fly','chest','Mid Chest','pec fly|pec deck'],
 ['Chest Press','chest','Mid Chest',''],
 ['Push-up','chest','Mid Chest','pushup|press up'],
 ['Cable Crossover','chest','Mid Chest','cable cross over'],
 ['Clean and Press','general','Compound',''],
 ['Overhead Press','general','Compound','shoulder press|military press|ohp'],
 ['Farmer Carry','general','Compound','farmers carry|farmer walk|farmers walk'],
 ['Sled Push','general','Conditioning',''],
 ['Burpee','general','Conditioning',''],
 ['Jump Rope','general','Conditioning','skipping rope'],
 ['Mobility Work','general','Mobility','mobility|stretching']
].map(([name,section,subgroup,aliases])=>({name,section,subgroup,keys:[name,...aliases.split('|').filter(Boolean)].map(key)}));
const sections=new Set(['arms','back','legs','core','chest','general']);
function resolveExercise(name,catalog=[],fallback='general'){
 const k=key(name), safeFallback=sections.has(fallback)?fallback:'general';
 const known=exercises.find(e=>e.keys.includes(k));
 function choose(matches){
  if(!matches.length)return null;
  const unique=[...new Map(matches.map(e=>[e.section+'|'+e.name.toLowerCase(),e])).values()];
  const found=unique.length===1?unique[0]:unique.find(e=>e.section===safeFallback)||unique[0];
  return {exercise:found.name,section:found.section,subgroup:found.subgroup||(known&&known.section===found.section?known.subgroup:''),issues:unique.length>1?['Exercise appears in multiple categories; check category']:[]};
 }
 const valid=catalog.filter(e=>e.name&&sections.has(e.section));
 // Keep the user's existing names and categories before consulting built-in aliases.
 const exact=choose(valid.filter(e=>e.name.toLowerCase()===name.toLowerCase()));
 if(exact)return exact;
 const normalized=choose(valid.filter(e=>key(e.name)===k));
 if(normalized)return normalized;
 if(known){
  const canonical=choose(valid.filter(e=>key(e.name)===key(known.name)));
  return canonical||{exercise:known.name,section:known.section,subgroup:known.subgroup,issues:[]};
 }
 // Classify equipment variants without merging dumbbell/barbell entries in history.
 const base=k.replace(/\b(?:dumbbell|barbell|kettlebell|single leg|single arm)\b/g,'').replace(/\s+/g,' ').trim();
 const family=base!==k&&exercises.find(e=>e.keys.includes(base));
 if(family)return {exercise:name,section:family.section,subgroup:family.subgroup,issues:[]};
 return {exercise:name,section:safeFallback,subgroup:'',issues:['Check exercise and category']};
}
function parse(text,catalog,fallback){
 const out=[];
 const normalized=numbers(normalizeTranscript(text).text).replace(/(\d)\s+point\s+(\d)/gi,'$1.$2');
 for(const part of normalized.split(/\n|;|\.(?!\d)|\bnext exercise\b|\band then\b|\bthen\b/i).map(s=>s.trim()).filter(Boolean)){
  const sr=part.match(/\b(\d+)\s*(?:sets?\s+(?:of|for)\s+|[x×]\s*|by\s+)(\d+)\b|\b(\d+)\s+sets?\s+(\d+)\s+reps?\b/i);
  const setMatch=part.match(/\b(\d+)\s*sets?\b/i);
  const repMatch=part.match(/\b(\d+)\s*reps?\b|\bsets?\s+of\s+(\d+)\b/i);
  const sets=sr?(sr[1]||sr[3]):setMatch?.[1]||'';
  const reps=sr?(sr[2]||sr[4]):repMatch?(repMatch[1]||repMatch[2]):'';
  const wt=part.match(/\b(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kilograms?|kgs?)\b/i);
  const at=part.match(/\bat\s+(\d+(?:\.\d+)?)\b/i);
  const dur=part.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\b/i);
  const bodyweight=/\bbody\s?weight\b/i.test(part);
  let name=part;
  for(const match of [sr,setMatch,repMatch,wt,dur,at])if(match)name=name.replace(match[0],' ');
  name=name.replace(/\b(?:body\s?weight|(?:on\s+)?each(?:\s+(?:side|hand|dumbbell))?|per\s+(?:side|hand|dumbbell)|total)\b/gi,' ')
   .replace(/^(?:please\s+)?(?:log|add|i did|today i did|i just did)\s+/i,'')
   .replace(/^[\s,]+|[\s,]+$/g,'').replace(/\s+/g,' ')
   .replace(/(?:\s+\b(?:at|for|with|using|of|and)\b[\s,]*)+$/i,'').replace(/^(?:(?:at|for|with|using|of)\s+)+/i,'').replace(/^[\s,]+|[\s,]+$/g,'');
  if(!name)continue;
  const found=resolveExercise(name,catalog,fallback);
  let weight=wt?Number(wt[1]):at?Number(at[1]):'';
  if(wt&&/^k/i.test(wt[2]))weight=Math.round(weight*2.2046226218*100)/100;
  const issues=[...found.issues];
  if(!dur&&(!sets||!reps))issues.push('Sets or reps missing');
  if(weight===''&&!bodyweight)issues.push('Weight missing; enter it or use bodyweight');
  if((part.match(/\b\d+\s*sets?\b/gi)||[]).length>1)issues.push('Multiple set groups: split into separate entries');
  out.push({...found,sets:sets===''?'':Number(sets),reps:reps===''?'':Number(reps),weight:bodyweight?0:weight,weightMode:/\beach\b|per (?:side|hand|dumbbell)/i.test(part)?'each':'total',duration:dur?Number(dur[1])*(/^s/i.test(dur[2])?1/60:1):'',issues});
 }
 return out;
}
root.LiftVoiceParser={parse,numbers,normalizeTranscript,resolveExercise};
})(typeof window==='undefined'?globalThis:window);
