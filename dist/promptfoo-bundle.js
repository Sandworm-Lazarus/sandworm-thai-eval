(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));else root.ThaiEvalPromptfoo=factory(root.ThaiEval);}(typeof globalThis!=='undefined'?globalThis:this,function(engine){
 'use strict';
 const fail=()=>{throw new Error('INVALID_PROMPTFOO_BUNDLE');};
 const fields=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.prototype.hasOwnProperty.call(v,k)))fail();};
 const integer=(v,max=1000000000)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail();};
 function validate(value){
  fields(value,['schemaVersion','kind','dataset','candidates','run']);
  if(value.schemaVersion!==1||value.kind!=='sandworm-promptfoo-run')fail();
  engine.evaluateObjects(value.dataset,value.candidates,{nfc:true,whitespace:true});
  const run=value.run;fields(run,['engine','engineVersion','mode','model','createdAt','plannedCalls','variants']);
  if(run.engine!=='promptfoo'||typeof run.engineVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(run.engineVersion)||!['live-api','local-mock'].includes(run.mode)||typeof run.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(run.model)||typeof run.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(run.createdAt)||(!Number.isFinite(Date.parse(run.createdAt))||new Date(run.createdAt).toISOString()!==run.createdAt))fail();
  integer(run.plannedCalls,200);
  if(!Array.isArray(run.variants)||run.variants.length!==value.candidates.models.length||run.plannedCalls!==run.variants.length*value.dataset.cases.length)fail();
  const ids=new Set(value.candidates.models.map(v=>v.id)),seen=new Set();
  for(const v of run.variants){
   fields(v,['id','promptSha256','calls','errors','inputTokens','outputTokens','usageComplete','durationMs','costUsd']);
   if(!ids.has(v.id)||seen.has(v.id)||typeof v.promptSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.promptSha256)||typeof v.usageComplete!=='boolean'||v.costUsd!==null)fail();seen.add(v.id);
   for(const k of ['calls','errors','inputTokens','outputTokens','durationMs'])integer(v[k]);
   if(v.calls!==value.dataset.cases.length||v.errors>v.calls||v.errors!==value.dataset.cases.length-value.candidates.models.find(m=>m.id===v.id).outputs.length)fail();
  }
  return value;
 }
 function parse(raw){return validate(engine.parse(raw));}
 return Object.freeze({validate,parse});
}));
