'use strict';
// One explicit endpoint, one Promptfoo evaluation, bounded model/prompt/repeat matrix.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const engine=require('../../dist/engine.js'),reportEngine=require('../../dist/experiment.js');
const bridge=require('./bridge.cjs'),live=require('./live.cjs');
const {BridgeError}=bridge,fail=c=>{throw new BridgeError(c);};
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('INVALID_EXPERIMENT_PLAN');}
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(v);
const digest=raw=>crypto.createHash('sha256').update(raw,'utf8').digest('hex');
function planFor(dataset,p){
 exact(p,['schemaVersion','models','variants','repeats','responseFormat','inputs','limits','costPolicy']);
 if(p.schemaVersion!==1||!Array.isArray(p.models)||!p.models.length||p.models.length>10||new Set(p.models).size!==p.models.length||p.models.some(m=>!id(m))||!Number.isSafeInteger(p.repeats)||p.repeats<1||p.repeats>10)fail('INVALID_EXPERIMENT_PLAN');
 // Reuse the canonical single-run plan validation for prompts, all case inputs and limits.
 const core={schemaVersion:1,model:p.models[0],variants:p.variants,responseFormat:p.responseFormat,inputs:p.inputs,limits:p.limits};
 live.planFor(dataset,core);
 const evaluations=p.models.length*p.variants.length*p.repeats,calls=evaluations*dataset.cases.length;
 if(evaluations>100||calls>p.limits.maxCalls)fail('CALL_BUDGET_EXCEEDED');
 const c=p.costPolicy;exact(c,['providerUsageCostUsd','rates']);
 if(typeof c.providerUsageCostUsd!=='boolean'||!Array.isArray(c.rates)||c.rates.length>10)fail('INVALID_COST_POLICY');
 const rates=new Set();
 for(const r of c.rates){
  exact(r,['model','inputUsdPerMillion','outputUsdPerMillion','date','source']);
  if(!p.models.includes(r.model)||rates.has(r.model)||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date+'T00:00:00.000Z'))||new Date(r.date+'T00:00:00.000Z').toISOString().slice(0,10)!==r.date||typeof r.source!=='string'||!r.source.trim()||r.source.length>256||/[\u0000-\u001f\u007f]/.test(r.source))fail('INVALID_COST_POLICY');
  for(const k of ['inputUsdPerMillion','outputUsdPerMillion'])if(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0||r[k]>10000)fail('INVALID_COST_POLICY');
  rates.add(r.model);
 }
 return {evaluations,calls,maxRequestedOutputTokens:calls*p.limits.maxOutputTokens,costUsd:null};
}
function costFor(value,usage,model,policy){
 const unknown={cost_usd:null,cost_source:'unknown',rate_date:null,rate_source:null};
 const reported=value?.usage?.cost;
 if(policy.providerUsageCostUsd&&typeof reported==='number'&&Number.isFinite(reported)&&reported>=0&&reported<=1e6)return {cost_usd:reported,cost_source:'provider-reported',rate_date:null,rate_source:null};
 const r=policy.rates.find(x=>x.model===model);
 if(!r||!usage)return unknown;
 const amount=Number(((usage.inputTokens*r.inputUsdPerMillion+usage.outputTokens*r.outputUsdPerMillion)/1e6).toFixed(12));
 if(amount>1e6)return unknown;
 return {cost_usd:amount,cost_source:'user-rate',rate_date:r.date,rate_source:r.source};
}
async function request(p,model,variant,input,conn,fetchImpl=fetch){
 const start=performance.now();let usage=null,cost={cost_usd:null,cost_source:'unknown',rate_date:null,rate_source:null};
 try{
  const headers={'content-type':'application/json'};if(conn.key)headers.authorization='Bearer '+conn.key;
  const body=JSON.stringify({model,messages:[{role:'system',content:variant.instruction},{role:'user',content:input.text}],max_tokens:p.limits.maxOutputTokens,stream:false});
  if(Buffer.byteLength(body)>131072)fail('API_REQUEST_LIMIT');
  const response=await fetchImpl(conn.endpoint,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(p.limits.timeoutMs),body});
  if(!response.ok){await response.body?.cancel().catch(()=>{});fail('API_HTTP_ERROR');}
  const value=await live.boundedJson(response);
  usage=live.usageFor(value.usage);cost=costFor(value,usage,model,p.costPolicy);
  const content=value?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||content.length>32768)fail('INVALID_API_RESPONSE');
  let item={caseId:input.caseId,text:content};
  if(p.responseFormat==='sandworm-json'){
   const parsed=engine.parse(content);
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!['text','citations','abstained'].includes(k)))fail('INVALID_STRUCTURED_ANSWER');
   item={...parsed,caseId:input.caseId};
  }
  bridge.validate({schemaVersion:1,datasetId:'response',cases:[{id:input.caseId,weight:1,assertions:{contains:['unused']}}]},{schemaVersion:1,models:[{id:variant.id,outputs:[item]}]});
  return {item,usage,...cost,latency_ms:Math.round(performance.now()-start),error:null};
 }catch(e){return {item:null,usage,...cost,latency_ms:Math.round(performance.now()-start),error:e instanceof BridgeError?e.message:'API_REQUEST_FAILED'};}
}
let started=false;
async function runExperiment(datasetRaw,planRaw,{allowNetwork=false,env=process.env,mode='live-api',guardObserver=()=>{}}={}){
 const dataset=engine.parse(datasetRaw),p=engine.parse(planRaw),budget=planFor(dataset,p);
 if(!allowNetwork)fail('NETWORK_OPT_IN_REQUIRED');
 const conn=live.connection(env);
 if(!['live-api','local-mock'].includes(mode)||mode==='local-mock'&&!['127.0.0.1','localhost','[::1]'].includes(new URL(conn.endpoint).hostname))fail('INVALID_RUN_MODE');
 if(started)fail('ONE_EVALUATION_PER_PROCESS');started=true;
 const guard=require('./fetch-guard.cjs').installFetchGuard(conn.endpoint);guardObserver(guard);
 const runtime=path.join(__dirname,'.runtime');fs.mkdirSync(runtime,{recursive:true,mode:0o700});
 const configDir=fs.mkdtempSync(path.join(runtime,'experiment-'));fs.chmodSync(configDir,0o700);
 Object.assign(process.env,{PROMPTFOO_DISABLE_TELEMETRY:'1',PROMPTFOO_DISABLE_SHARING:'1',PROMPTFOO_DISABLE_UPDATE:'1',PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS:'1',PROMPTFOO_DISABLE_REMOTE_GENERATION:'1',PROMPTFOO_CONFIG_DIR:configDir,LOG_LEVEL:'silent'});
 const experimentId='exp-'+crypto.randomUUID(),attempts=[],evaluations=[],inputs=new Map(p.inputs.map(i=>[i.caseId,i])),states=[];
 const providers=[];
 for(const model of p.models)for(const variant of p.variants)for(let repeat=1;repeat<=p.repeats;repeat++){
  const eid=experimentId+'-e'+(states.length+1),promptSha256=digest(variant.instruction),outputs=[],seen=new Set();
  const state={id:eid,model,variantId:variant.id,promptSha256,repeat,outputs,seen};states.push(state);
  providers.push({id:()=>eid,label:eid,callApi:async(_prompt,context)=>{
   const input=inputs.get(context?.vars?.caseId);
   if(!input||seen.has(input.caseId)||attempts.length>=p.limits.maxCalls)fail('INVALID_SCHEDULING');
   seen.add(input.caseId);
   const result=await request(p,model,variant,input,conn);
   const a={id:experimentId+'-a'+(attempts.length+1),evaluationId:eid,caseId:input.caseId,model,variantId:variant.id,promptSha256,repeat,input_tokens:result.usage?.inputTokens??null,output_tokens:result.usage?.outputTokens??null,latency_ms:result.latency_ms,status:result.error?'error':'success',cost_usd:result.cost_usd,cost_source:result.cost_source,rate_date:result.rate_date,rate_source:result.rate_source,score:null};attempts.push(a);
   if(result.item)outputs.push(result.item);
   const payload=result.item?{missing:false,...result.item}:{missing:true};delete payload.caseId;
   return {output:JSON.stringify(payload)};
  }});
 }
 try{
  const promptfoo=require('promptfoo');
  await promptfoo.evaluate({description:'Sandworm multi-model repeated experiment',prompts:['{{caseId}}'],providers,sharing:false,writeLatestResults:false,tests:dataset.cases.map(c=>({vars:{caseId:c.id,caseSpec:JSON.stringify(c)},assert:[{type:'javascript',value:'file://'+path.join(__dirname,'assertion.cjs')}]}))},{cache:false,maxConcurrency:1,showProgressBar:false});
  if(attempts.length!==budget.calls||states.some(s=>s.seen.size!==dataset.cases.length))fail('INCOMPLETE_EXPERIMENT');
  for(const s of states){
   const r=engine.evaluateObjects(dataset,{schemaVersion:1,models:[{id:'evaluation',outputs:s.outputs}]},{nfc:true,whitespace:true});
   evaluations.push({id:s.id,model:s.model,variantId:s.variantId,promptSha256:s.promptSha256,repeat:s.repeat,score:r.models[0].score,expectedAttempts:dataset.cases.length,completedAttempts:attempts.filter(a=>a.evaluationId===s.id&&a.status==='success').length});
  }
  const report={kind:'sandworm-experiment/v1',schemaVersion:1,experimentId,createdAt:new Date().toISOString(),datasetId:dataset.datasetId,datasetSha256:digest(datasetRaw),planSha256:digest(planRaw),normalization:{nfc:true,whitespace:true},attempts,evaluations};
  reportEngine.validate(report);
  if(Buffer.byteLength(JSON.stringify(report,null,2)+'\n')>engine.LIMITS.bytes)fail('OUTPUT_LIMIT');
  return report;
 }finally{try{fs.rmSync(configDir,{recursive:true,force:true});}catch(_){}}
}
function readRaw(file){
 let fd;try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
  const s=fs.fstatSync(fd);if(!s.isFile()||s.size>engine.LIMITS.bytes)fail('INPUT_LIMIT');
  const b=Buffer.alloc(engine.LIMITS.bytes+1);let n=0;
  while(n<b.length){const count=fs.readSync(fd,b,n,b.length-n,null);if(!count)break;n+=count;}
  if(n>engine.LIMITS.bytes)fail('INPUT_LIMIT');
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b.subarray(0,n));
 }catch(e){if(e instanceof BridgeError)throw e;fail('INPUT_READ_FAILED');}finally{if(fd!==undefined)fs.closeSync(fd);}
}
async function main(args){
 const [mode,datasetFile,planFile,outputFile,optIn]=args;
 if(!['preflight','run'].includes(mode)||!datasetFile||!planFile||args.length!==(mode==='preflight'?3:5)||mode==='run'&&(!outputFile||optIn!=='--allow-network'))fail('INVALID_ARGUMENTS');
 const datasetRaw=readRaw(datasetFile),planRaw=readRaw(planFile),budget=planFor(engine.parse(datasetRaw),engine.parse(planRaw));
 if(mode==='preflight'){console.log(JSON.stringify({status:'ready',...budget,note:'Requested token bound; no dollar cap and no request sent.'}));return;}
 let fd;try{fd=fs.openSync(outputFile,'wx',0o600);}catch(_){fail('OUTPUT_WRITE_FAILED');}
 try{const report=await runExperiment(datasetRaw,planRaw,{allowNetwork:true});fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'evaluated',experimentId:report.experimentId,calls:budget.calls}));}
 catch(e){try{fs.unlinkSync(outputFile);}catch(_){}throw e;}finally{fs.closeSync(fd);}
}
module.exports={planFor,costFor,request,runExperiment,readRaw};
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({error:e instanceof BridgeError?e.message:'EXPERIMENT_FAILED'}));process.exitCode=2;});
