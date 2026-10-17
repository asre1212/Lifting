/* Local, conservative workout parser. Never sends transcripts over the network. */
(function(root){
'use strict';
function numbers(s){
 const small={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 return s.replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -]+(?:and[ -]+)?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))*\b/gi,m=>{let n=0;for(const w of m.toLowerCase().split(/[ -]+/)){if(w==='hundred')n=(n||1)*100;else if(w!=='and')n+=small[w]||0;}return n;});
}
function parse(text,catalog,fallback){
 const out=[];const normalized=numbers(text.toLowerCase()).replace(/(\d)\s+point\s+(\d)/g,'$1.$2');
 for(const part of normalized.split(/\n|;|\.(?!\d)|\bnext exercise\b|\band then\b|\bthen\b/).map(s=>s.trim()).filter(Boolean)){
  const sr=part.match(/\b(\d+)\s*(?:sets?\s*(?:of|for)?|[x×])\s*(\d+)\s*(?:reps?)?\b/);
  const sets=sr?sr[1]:(part.match(/\b(\d+)\s*sets?\b/)||[])[1]||'';
  const reps=sr?sr[2]:(part.match(/\b(\d+)\s*reps?\b/)||[])[1]||'';
  const wt=part.match(/\b(\d+(?:\.\d+)?)\s*(pounds?|lbs?|kilograms?|kgs?)\b/);
  const at=part.match(/\bat\s+(\d+(?:\.\d+)?)\b/);
  const dur=part.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\b/);
  let name=part.split(/,|\b\d|\bfor\b|\bat\b/)[0].replace(/^(?:log|add|i did|today i did)\s+/,'').trim();
  if(!name)continue;
  const matches=(catalog||[]).filter(e=>e.name.toLowerCase()===name);
  const found=matches.length===1?matches[0]:null;
  let weight=wt?Number(wt[1]):at?Number(at[1]):'';
  if(wt&&/^k/.test(wt[2]))weight=Math.round(weight*2.2046226218*100)/100;
  const issues=[];
  if(!found)issues.push('Check exercise and category');
  if(!dur&&(!sets||!reps))issues.push('Sets or reps missing');
  if(weight===''&&!/\bbody\s?weight\b/.test(part))issues.push('Weight missing; enter it or use bodyweight');
  if((part.match(/\b\d+\s*sets?\b/g)||[]).length>1)issues.push('Multiple set groups: split into separate entries');
  out.push({exercise:found?found.name:name,section:found?found.section:fallback,sets:sets===''?'':Number(sets),reps:reps===''?'':Number(reps),weight:/\bbody\s?weight\b/.test(part)?0:weight,weightMode:/\beach\b|per (?:side|hand|dumbbell)/.test(part)?'each':'total',duration:dur?Number(dur[1])*(/^s/.test(dur[2])?1/60:1):'',issues});
 }
 return out;
}
root.LiftVoiceParser={parse,numbers};
})(typeof window==='undefined'?globalThis:window);
