/* Shared content-free experiment report; imported metrics are unverified claims. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));else root.SandwormExperiment=factory(root.ThaiEval);})(typeof globalThis!=='undefined'?globalThis:this,function(engine){
'use strict';
const LIMIT=1048576;
const fail=()=>{throw new Error('INVALID_EXPERIMENT_REPORT');};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
function fields(v,keys){if(!obj(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uint=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e9;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00.000Z').toISOString().slice(0,10)===v;
function validate(r){
try{
 fields(r,['kind','schemaVersion','experimentId','createdAt','datasetId','datasetSha256','planSha256','normalization','attempts','evaluations']);
 if(r.kind!=='sandworm-experiment/v1'||r.schemaVersion!==1||!id(r.experimentId)||!id(r.datasetId)||!hash(r.datasetSha256)||!hash(r.planSha256)||typeof r.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(r.createdAt)||!Number.isFinite(Date.parse(r.createdAt))||new Date(r.createdAt).toISOString().slice(0,19)!==r.createdAt.slice(0,19))fail();
 fields(r.normalization,['nfc','whitespace']);if(r.normalization.nfc!==true||r.normalization.whitespace!==true)fail();
 if(!Array.isArray(r.evaluations)||!r.evaluations.length||r.evaluations.length>100||!Array.isArray(r.attempts)||!r.attempts.length||r.attempts.length>200)fail();
 const evaluations=new Map(),ids=new Set(),counts=new Map(),caseSets=new Map(),successes=new Map(),slots=new Set();
 for(const e of r.evaluations){
  fields(e,['id','model','variantId','promptSha256','repeat','score','expectedAttempts','completedAttempts']);
  if(!id(e.id)||evaluations.has(e.id)||!id(e.model)||e.model.length>100||!id(e.variantId)||e.variantId.length>100||!hash(e.promptSha256)||!Number.isSafeInteger(e.repeat)||e.repeat<1||e.repeat>10||typeof e.score!=='number'||!Number.isFinite(e.score)||e.score<0||e.score>100)fail();
  if(!uint(e.expectedAttempts)||e.expectedAttempts<1||e.expectedAttempts>200||!uint(e.completedAttempts)||e.completedAttempts>e.expectedAttempts)fail();
  const slot=JSON.stringify([e.model,e.variantId,e.promptSha256,e.repeat]);if(slots.has(slot))fail();slots.add(slot);
  evaluations.set(e.id,e);caseSets.set(e.id,new Set());
 }
 for(const a of r.attempts){
  fields(a,['id','evaluationId','caseId','model','variantId','promptSha256','repeat','input_tokens','output_tokens','latency_ms','status','cost_usd','cost_source','rate_date','rate_source','score']);
  const e=evaluations.get(a.evaluationId);
  if(!id(a.caseId)||a.caseId.length>64||!e||caseSets.get(e.id).has(a.caseId))fail();caseSets.get(e.id).add(a.caseId);
  if(!id(a.id)||ids.has(a.id)||!e||['model','variantId','promptSha256','repeat'].some(k=>a[k]!==e[k])||a.score!==null||!uint(a.latency_ms)||a.latency_ms>86400000||!['success','error'].includes(a.status))fail();
  if(!((a.input_tokens===null&&a.output_tokens===null)||(uint(a.input_tokens)&&uint(a.output_tokens))))fail();
  if(a.cost_usd!==null&&!(typeof a.cost_usd==='number'&&Number.isFinite(a.cost_usd)&&a.cost_usd>=0&&a.cost_usd<=1e6))fail();
  if(!['unknown','provider-reported','user-rate'].includes(a.cost_source))fail();
  if(a.cost_source==='unknown'?(a.cost_usd!==null||a.rate_date!==null||a.rate_source!==null):(a.cost_usd===null))fail();
  if(a.cost_source==='provider-reported'&&(a.rate_date!==null||a.rate_source!==null))fail();
  if(a.cost_source==='user-rate'&&(!date(a.rate_date)||typeof a.rate_source!=='string'||a.rate_source.length<1||a.rate_source.length>256||/[\u0000-\u001f\u007f]/.test(a.rate_source)||a.input_tokens===null))fail();
  ids.add(a.id);counts.set(e.id,(counts.get(e.id)||0)+1);if(a.status==='success')successes.set(e.id,(successes.get(e.id)||0)+1);
 }
 const reference=[...caseSets.values()][0];
 if([...evaluations.values()].some(e=>counts.get(e.id)!==e.expectedAttempts||(successes.get(e.id)||0)!==e.completedAttempts||caseSets.get(e.id).size!==reference.size||[...caseSets.get(e.id)].some(k=>!reference.has(k))))fail();
 return r;
}catch(_){fail();}
}
function parse(raw){try{return validate(engine.parse(raw));}catch(_){fail();}}
function summarize(reports){
 if(!Array.isArray(reports)||!reports.length||reports.length>10)fail();
 const used=new Set(),evals=new Set(),runs=new Set(),groups=new Map();let dataset=null,referenceCases=null;
 for(const report of reports){
  const r=validate(report);
  if(dataset!==null&&dataset!==r.datasetSha256||runs.has(r.experimentId))fail();dataset=r.datasetSha256;runs.add(r.experimentId);
  const cases=new Set(r.attempts.map(a=>a.caseId));if(referenceCases&&(cases.size!==referenceCases.size||[...cases].some(k=>!referenceCases.has(k))))fail();referenceCases=cases;
  for(const e of r.evaluations){
   if(evals.has(e.id))fail();evals.add(e.id);
   const k=JSON.stringify([e.model,e.variantId,e.promptSha256]);
   if(!groups.has(k))groups.set(k,{model:e.model,variantId:e.variantId,promptSha256:e.promptSha256,scores:[],evaluations:0,attempts:[]});
   groups.get(k).evaluations++;if(e.completedAttempts===e.expectedAttempts)groups.get(k).scores.push(e.score);
  }
  for(const a of r.attempts){if(used.has(a.id))fail();used.add(a.id);groups.get(JSON.stringify([a.model,a.variantId,a.promptSha256])).attempts.push(a);}
 }
 return [...groups.values()].map(g=>{
 const priced=g.attempts.filter(a=>a.cost_usd!==null),usage=g.attempts.filter(a=>a.input_tokens!==null),times=g.attempts.map(a=>a.latency_ms).sort((a,b)=>a-b);
 const knownCost=Number(priced.reduce((n,a)=>n+a.cost_usd,0).toFixed(12));
 return {model:g.model,variantId:g.variantId,promptSha256:g.promptSha256,evaluations:g.evaluations,eligibleEvaluations:g.scores.length,scoreMean:g.scores.length?g.scores.reduce((n,s)=>n+s,0)/g.scores.length:null,scoreMin:g.scores.length?Math.min(...g.scores):null,scoreMax:g.scores.length?Math.max(...g.scores):null,calls:g.attempts.length,errors:g.attempts.filter(a=>a.status==='error').length,knownCostUsd:knownCost,totalCostUsd:priced.length===g.attempts.length?knownCost:null,pricedCalls:priced.length,usageCalls:usage.length,inputTokens:usage.reduce((n,a)=>n+a.input_tokens,0),outputTokens:usage.reduce((n,a)=>n+a.output_tokens,0),p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1]};
 });
}
return Object.freeze({validate,parse,summarize,LIMIT});
});
