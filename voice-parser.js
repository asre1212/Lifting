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
 const plural={biceps:'bicep',triceps:'tricep',curls:'curl',rdls:'rdl',squats:'squat',deadlifts:'deadlift',rows:'row',raises:'raise',extensions:'extension',lunges:'lunge',presses:'press',flys:'fly',flies:'fly',pushdowns:'pushdown',crushers:'crusher',shrugs:'shrug',thrusts:'thrust',planks:'plank',crunches:'crunch',twists:'twist',bugs:'bug',burpees:'burpee',crossovers:'crossover',carries:'carry',dips:'dip',kickbacks:'kickback',swings:'swing',cleans:'clean',snatches:'snatch',thrusters:'thruster',rotations:'rotation',stretches:'stretch',crunchs:'crunch',dumbbells:'dumbbell',barbells:'barbell',kettlebells:'kettlebell',ups:'up',pulls:'pull',pulldowns:'pulldown',kicks:'kick',climbers:'climber',taps:'tap',jacks:'jack',touches:'touch'};
 return numbers(String(name).toLowerCase()).replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()
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
 ['Bulgarian Split Squat','legs','Quads','bulgarian squat|bss'],
 ['Split Squat','legs','Quads',''],
 ['Hack Squat','legs','Quads',''],
 ['Leg Press','legs','Quads',''],
 ['Romanian Deadlift','legs','Glutes / Hamstrings','rdl|romanian dead lift'],
 ['Leg Curl','legs','Glutes / Hamstrings','hamstring curl'],
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
 ['Leg Raise','core','Abs',''],
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

 // Equipment and position variants keep their own names in workout history.
 ['Dumbbell Bicep Curl','arms','Biceps','dumbbell curl'],
 ['Barbell Curl','arms','Biceps','barbell bicep curl'],
 ['EZ Bar Curl','arms','Biceps','ez curl|ez bar bicep curl'],
 ['Cable Curl','arms','Biceps','cable bicep curl'],
 ['Concentration Curl','arms','Biceps','concentration'],
 ['Incline Dumbbell Curl','arms','Biceps','incline curl|incline bicep curl'],
 ['Spider Curl','arms','Biceps',''],
 ['Zottman Curl','arms','Biceps','zottman'],
 ['Bayesian Curl','arms','Biceps','bayesian cable curl'],
 ['Reverse Wrist Curl','arms','Forearms','wrist extension'],
 ['Tricep Kickback','arms','Triceps','tricep kick back|kickback'],
 ['Rope Tricep Extension','arms','Triceps','rope overhead extension'],
 ['Close-grip Bench Press','arms','Triceps','close grip bench'],
 ['Tricep Dip','arms','Triceps','bench dip'],
 ['Dumbbell Row','back','Upper Back','one arm dumbbell row|single arm dumbbell row'],
 ['Seated Row','back','Upper Back','seated machine row'],
 ['Chest-supported Row','back','Upper Back','chest supported dumbbell row'],
 ['T-bar Row','back','Upper Back','t bar|tbar row'],
 ['Pendlay Row','back','Upper Back','pendlay'],
 ['Landmine Row','back','Upper Back','meadows row'],
 ['Inverted Row','back','Upper Back','bodyweight row|australian pullup'],
 ['TRX Row','back','Upper Back','suspension row'],
 ['Machine Row','back','Upper Back',''],
 ['Straight-arm Pulldown','back','Lats','straight arm pull down|lat prayer'],
 ['Assisted Pull-up','back','Lats','assisted pullup'],
 ['Assisted Chin-up','back','Lats','assisted chinup'],
 ['Dumbbell Pullover','back','Lats','pullover'],
 ['Dumbbell Shrug','back','Traps',''],
 ['Barbell Shrug','back','Traps',''],
 ['Sumo Deadlift','back','Lower Back','sumo'],
 ['Trap Bar Deadlift','back','Lower Back','hex bar deadlift'],
 ['Rack Pull','back','Lower Back','rack deadlift'],
 ['Dumbbell Romanian Deadlift','legs','Glutes / Hamstrings','dumbbell rdl'],
 ['Barbell Romanian Deadlift','legs','Glutes / Hamstrings','barbell rdl'],
 ['Single-leg Romanian Deadlift','legs','Glutes / Hamstrings','single leg rdl|one leg rdl'],
 ['Stiff-leg Deadlift','legs','Glutes / Hamstrings','stiff legged deadlift|sldl'],
 ['B-stance Romanian Deadlift','legs','Glutes / Hamstrings','b stance rdl|kickstand rdl'],
 ['Seated Leg Curl','legs','Glutes / Hamstrings','seated hamstring curl'],
 ['Lying Leg Curl','legs','Glutes / Hamstrings','lying hamstring curl|prone leg curl'],
 ['Nordic Curl','legs','Glutes / Hamstrings','nordic hamstring curl'],
 ['Glute Ham Raise','legs','Glutes / Hamstrings','ghr|glute hamstring raise'],
 ['Cable Pull-through','legs','Glutes / Hamstrings','cable pull through|pullthrough'],
 ['Cable Glute Kickback','legs','Glutes / Hamstrings','glute kickback'],
 ['Hip Abduction','legs','Glutes / Hamstrings','hip abductor|abductor machine'],
 ['Hip Adduction','legs','Other Legs','hip adductor|adductor machine'],
 ['Donkey Kick','legs','Glutes / Hamstrings',''],
 ['Clamshell','legs','Glutes / Hamstrings','clam shell'],
 ['Lateral Band Walk','legs','Glutes / Hamstrings','banded side step|monster walk'],
 ['Dumbbell Squat','legs','Quads',''],
 ['Smith Machine Squat','legs','Quads','smith squat'],
 ['Belt Squat','legs','Quads',''],
 ['Box Squat','legs','Quads',''],
 ['Sissy Squat','legs','Quads',''],
 ['Pistol Squat','legs','Quads','pistol'],
 ['Step-up','legs','Quads','stepup'],
 ['Step-down','legs','Quads','stepdown'],
 ['Reverse Lunge','legs','Quads','backward lunge'],
 ['Walking Lunge','legs','Quads',''],
 ['Lateral Lunge','legs','Quads','side lunge'],
 ['Curtsy Lunge','legs','Quads','curtsey lunge'],
 ['Wall Sit','legs','Quads','wall squat'],
 ['Standing Calf Raise','legs','Calves',''],
 ['Seated Calf Raise','legs','Calves',''],
 ['Single-leg Calf Raise','legs','Calves','one leg calf raise'],
 ['Donkey Calf Raise','legs','Calves',''],
 ['Tibialis Raise','legs','Other Legs','tib raise|toe raise'],
 ['Hanging Leg Raise','core','Abs',''],
 ['Hanging Knee Raise','core','Abs','hanging knee lift'],
 ['Reverse Crunch','core','Abs',''],
 ['Bicycle Crunch','core','Abs','bicycle'],
 ['Cable Crunch','core','Abs','rope crunch'],
 ['Decline Sit-up','core','Abs','decline situp'],
 ['V-up','core','Abs','vup'],
 ['Flutter Kick','core','Abs',''],
 ['Mountain Climber','core','Abs',''],
 ['Heel Touch','core','Obliques','heel tap'],
 ['Side Bend','core','Obliques','dumbbell side bend'],
 ['Wood Chop','core','Obliques','woodchop|cable wood chop'],
 ['Bird Dog','core','Stability','birddog'],
 ['Hollow Hold','core','Stability','hollow body hold'],
 ['Bear Crawl','core','Stability',''],
 ['Plank Shoulder Tap','core','Stability','shoulder tap'],
 ['Dumbbell Bench Press','chest','Mid Chest','dumbbell bench'],
 ['Barbell Bench Press','chest','Mid Chest','barbell bench'],
 ['Incline Dumbbell Bench Press','chest','Upper Chest','incline dumbbell press|dumbbell incline bench press|dumbbell incline press'],
 ['Incline Barbell Bench Press','chest','Upper Chest','incline barbell press'],
 ['Decline Dumbbell Bench Press','chest','Lower Chest','decline dumbbell press'],
 ['Dumbbell Chest Fly','chest','Mid Chest','dumbbell fly'],
 ['Cable Chest Fly','chest','Mid Chest','cable fly'],
 ['Incline Chest Fly','chest','Upper Chest','incline fly'],
 ['Floor Press','chest','Mid Chest',''],
 ['Machine Chest Press','chest','Mid Chest','machine bench press'],
 ['Chest Dip','chest','Lower Chest','chest dips'],
 ['Incline Push-up','chest','Mid Chest','incline pushup'],
 ['Decline Push-up','chest','Upper Chest','decline pushup'],
 ['Diamond Push-up','arms','Triceps','diamond pushup|close grip pushup'],
 ['Dumbbell Shoulder Press','general','Compound','dumbbell overhead press'],
 ['Seated Shoulder Press','general','Compound','seated overhead press'],
 ['Arnold Press','general','Compound','arnold'],
 ['Push Press','general','Compound',''],
 ['Landmine Press','general','Compound',''],
 ['Lateral Raise','general','Other','side raise|side lateral raise'],
 ['Front Raise','general','Other',''],
 ['Upright Row','general','Other',''],
 ['Kettlebell Swing','general','Compound','kettle bell swing'],
 ['Turkish Get-up','general','Compound','turkish getup|tgu'],
 ['Power Clean','general','Compound',''],
 ['Hang Clean','general','Compound',''],
 ['Snatch','general','Compound',''],
 ['Thruster','general','Compound',''],
 ['Suitcase Carry','general','Compound','suitcase walk'],
 ['Overhead Carry','general','Compound','waiter carry'],
 ['Battle Rope','general','Conditioning','battle ropes'],
 ['Box Jump','general','Conditioning',''],
 ['Jumping Jack','general','Conditioning',''],
 ['Sled Pull','general','Conditioning','sled drag'],
 ['Rowing Machine','general','Conditioning','rower|erg rowing|row machine'],
 ['Stationary Bike','general','Conditioning','exercise bike|cycling|bike'],
 ['Assault Bike','general','Conditioning','air bike'],
 ['Treadmill','general','Conditioning','treadmill walk|treadmill run'],
 ['Elliptical','general','Conditioning','cross trainer'],
 ['Stair Climber','general','Conditioning','stairmaster|stair master'],
 ['Running','general','Conditioning','run|jogging'],
 ['Walking','general','Conditioning','walk'],
 ['Hip Flexor Stretch','general','Mobility',''],
 ['Hamstring Stretch','general','Mobility',''],
 ['Calf Stretch','general','Mobility',''],
 ['Cat Cow','general','Mobility','cat camel'],
 ['Foam Rolling','general','Mobility','foam roll'],
 ['Worlds Greatest Stretch','general','Mobility',"world's greatest stretch"],
 ['Mobility Work','general','Mobility','mobility|stretching']
].map(([name,section,subgroup,aliases])=>({name,section,subgroup,keys:[name,...aliases.split('|').filter(Boolean)].map(key)}));
const sections=new Set(['arms','back','legs','core','chest','general']);
function resolveExercise(name,catalog=[],fallback='general',corrections=[]){
 const k=key(name), safeFallback=sections.has(fallback)?fallback:'general';
 const learned=corrections.find(e=>e&&key(e.phrase)===k&&sections.has(e.section)&&typeof e.exercise==='string');
 if(learned)return {exercise:learned.exercise,section:learned.section,subgroup:learned.subgroup||'',issues:[],remembered:true};
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
function parse(text,catalog,fallback,corrections=[]){
 const out=[];
 const trimName=s=>s.replace(/^[\s,]+|[\s,]+$/g,'').replace(/\s+/g,' ')
  .replace(/(?:\s+\b(?:at|for|with|using|of|and)\b[\s,]*)+$/i,'').replace(/^(?:(?:at|for|with|using|of)\s+)+/i,'').replace(/^[\s,]+|[\s,]+$/g,'');
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
  name=trimName(name.replace(/\b(?:(?:on\s+)?each(?:\s+(?:side|hand|dumbbell))?|per\s+(?:side|hand|dumbbell)|total)\b/gi,' ')
   .replace(/^(?:please\s+)?(?:log|add|i did|today i did|i just did)\s+/i,''));
  if(!name)continue;
  let found=resolveExercise(name,catalog,fallback,corrections);
  // Preserve names such as "bodyweight row" before treating bodyweight as a metric.
  if(bodyweight&&found.issues.includes('Check exercise and category')){
   name=trimName(name.replace(/\bbody\s?weight\b/gi,' '));
   if(!name)continue;
   found=resolveExercise(name,catalog,fallback,corrections);
  }
  let weight=wt?Number(wt[1]):at?Number(at[1]):'';
  if(wt&&/^k/i.test(wt[2]))weight=Math.round(weight*2.2046226218*100)/100;
  const issues=[...found.issues];
  if(!dur&&(!sets||!reps))issues.push('Sets or reps missing');
  if(weight===''&&!bodyweight)issues.push('Weight missing; enter it or use bodyweight');
  if((part.match(/\b\d+\s*sets?\b/gi)||[]).length>1)issues.push('Multiple set groups: split into separate entries');
  out.push({...found,spokenExercise:name,sets:sets===''?'':Number(sets),reps:reps===''?'':Number(reps),weight:bodyweight?0:weight,weightMode:/\beach\b|per (?:side|hand|dumbbell)/i.test(part)?'each':'total',duration:dur?Number(dur[1])*(/^s/i.test(dur[2])?1/60:1):'',issues});
 }
 return out;
}
root.LiftVoiceParser={parse,numbers,normalizeTranscript,resolveExercise,key,dictionary:()=>exercises.map(e=>({name:e.name,section:e.section,subgroup:e.subgroup,aliases:[...e.keys]}))};
})(typeof window==='undefined'?globalThis:window);
