'use strict';
// The only network path in this bridge. Promptfoo supplies scheduling and assertions;
// this adapter owns endpoint selection, request limits, response bounds and redaction.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const bridge=require('./bridge.cjs'),engine=require('../../dist/engine.js');
const bundleEngine=require('../../dist/promptfoo-bundle.js');
const {BridgeError}=bridge;
const fail=code=>{throw new BridgeError(code);};
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function fields(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!own(v,k)))fail('INVALID_LIVE_PLAN');}
function planFor(dataset,plan){
 fields(plan,['schemaVersion','model','responseFormat','variants','inputs','limits']);
 if(plan.schemaVersion!==1||typeof plan.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(plan.model)||!['text','sandworm-json'].includes(plan.responseFormat))fail('INVALID_LIVE_PLAN');
 if(!Array.isArray(plan.variants)||!plan.variants.length||plan.variants.length>10||!Array.isArray(plan.inputs))fail('INVALID_LIVE_PLAN');
 const seen=new Set();for(const v of plan.variants){fields(v,['id','instruction']);if(typeof v.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(v.id)||seen.has(v.id)||typeof v.instruction!=='string'||!v.instruction.trim()||v.instruction.length>8192)fail('INVALID_LIVE_PLAN');seen.add(v.id);}
 bridge.validate(dataset,{schemaVersion:1,models:plan.variants.map(v=>({id:v.id,outputs:[]}))});
 const known=new Set(dataset.cases.map(c=>c.id)),inputSeen=new Set();
 for(const input of plan.inputs){fields(input,['caseId','text']);if(!known.has(input.caseId)||inputSeen.has(input.caseId)||typeof input.text!=='string'||!input.text.trim()||input.text.length>8192)fail('INVALID_LIVE_PLAN');inputSeen.add(input.caseId);}
 if(inputSeen.size!==known.size)fail('INCOMPLETE_LIVE_INPUTS');
 fields(plan.limits,['maxCalls','maxOutputTokens','timeoutMs']);
 const limits=plan.limits;
 for(const [k,min,max]of [['maxCalls',1,200],['maxOutputTokens',1,4096],['timeoutMs',100,120000]])if(!Number.isSafeInteger(limits[k])||limits[k]<min||limits[k]>max)fail('INVALID_LIVE_LIMITS');
 const calls=plan.inputs.length*plan.variants.length;if(calls>limits.maxCalls)fail('CALL_BUDGET_EXCEEDED');
 return {calls,maxOutputTokens:calls*limits.maxOutputTokens};
}
function endpointFor(raw){
 let u;try{u=new URL(raw);}catch(_){fail('INVALID_ENDPOINT');}
 const local=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
 if(u.username||u.password||u.search||u.hash||u.href.length>2048||!(u.protocol==='https:'||(u.protocol==='http:'&&local)))fail('INVALID_ENDPOINT');
 if(!u.pathname.endsWith('/chat/completions'))fail('INVALID_ENDPOINT');
 return u.href;
}
function connection(env=process.env){
 const endpoint=endpointFor(env.SANDWORM_MODEL_URL);
 const key=env.SANDWORM_MODEL_API_KEY||'';
 if(typeof key!=='string'||key.length>4096||/[\r\n]/.test(key))fail('INVALID_API_KEY');
 return {endpoint,key};
}
async function boundedJson(response){
 if(!response.body)fail('INVALID_API_RESPONSE');
 const chunks=[];let size=0;const reader=response.body.getReader();
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)fail('API_RESPONSE_LIMIT');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch(_){fail('INVALID_API_RESPONSE');}
 try{return engine.parse(text);}catch(_){fail('INVALID_API_RESPONSE');}
}
function usageFor(value){
 const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
 if(!value||!valid(value.prompt_tokens)||!valid(value.completion_tokens))return null;
 return {inputTokens:value.prompt_tokens,outputTokens:value.completion_tokens};
}
async function requestAnswer(plan,variant,input,conn,fetchImpl=fetch){
 const started=performance.now();
 try{
  const headers={'content-type':'application/json'};if(conn.key)headers.authorization='Bearer '+conn.key;
  const body=JSON.stringify({model:plan.model,messages:[{role:'system',content:variant.instruction},{role:'user',content:input.text}],max_tokens:plan.limits.maxOutputTokens,stream:false});
  if(Buffer.byteLength(body)>131072)fail('API_REQUEST_LIMIT');
  const response=await fetchImpl(conn.endpoint,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(plan.limits.timeoutMs),body});
  if(!response.ok){await response.body?.cancel().catch(()=>{});fail('API_HTTP_ERROR');}
  const value=await boundedJson(response),content=value?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||content.length>32768)fail('INVALID_API_RESPONSE');
  let item={caseId:input.caseId,text:content};
  if(plan.responseFormat==='sandworm-json'){
   let parsed;try{parsed=engine.parse(content);}catch(_){fail('INVALID_STRUCTURED_ANSWER');}
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!['text','citations','abstained'].includes(k)))fail('INVALID_STRUCTURED_ANSWER');
   item={...parsed,caseId:input.caseId};
  }
  // Reuse the actual candidate schema, including citation IDs and text bounds.
  bridge.validate({schemaVersion:1,datasetId:'response',cases:[{id:input.caseId,weight:1,assertions:{contains:['unused']}}]},{schemaVersion:1,models:[{id:variant.id,outputs:[item]}]});
  return {item,usage:usageFor(value.usage),durationMs:Math.round(performance.now()-started),error:null};
 }catch(e){return {item:null,usage:null,durationMs:Math.round(performance.now()-started),error:e instanceof BridgeError?e.message:'API_REQUEST_FAILED'};}
}
let started=false;
async function runLive(dataset,plan,{allowNetwork=false,env=process.env,mode='live-api',guardObserver=()=>{}}={}){
 const preflight=planFor(dataset,plan);if(!allowNetwork)fail('NETWORK_OPT_IN_REQUIRED');
 const conn=connection(env);if(!['live-api','local-mock'].includes(mode))fail('INVALID_RUN_MODE');
 if(mode==='local-mock'&&!['127.0.0.1','[::1]','localhost'].includes(new URL(conn.endpoint).hostname))fail('INVALID_MOCK_ENDPOINT');
 if(started)fail('ONE_EVALUATION_PER_PROCESS');started=true;
 const guard=require('./fetch-guard.cjs').installFetchGuard(conn.endpoint);guardObserver(guard);
 const runtime=path.join(__dirname,'.runtime');fs.mkdirSync(runtime,{recursive:true,mode:0o700});
 const configDir=fs.mkdtempSync(path.join(runtime,'promptfoo-live-'));fs.chmodSync(configDir,0o700);
 Object.assign(process.env,{PROMPTFOO_DISABLE_TELEMETRY:'1',PROMPTFOO_DISABLE_SHARING:'1',PROMPTFOO_DISABLE_UPDATE:'1',PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS:'1',PROMPTFOO_DISABLE_REMOTE_GENERATION:'1',PROMPTFOO_CONFIG_DIR:configDir,LOG_LEVEL:'silent'});
 const inputs=new Map(plan.inputs.map(i=>[i.caseId,i]));let calls=0;
 const run={engine:'promptfoo',engineVersion:'0.125.1',mode,model:plan.model,createdAt:new Date().toISOString(),plannedCalls:preflight.calls,variants:[]};
 const providers=plan.variants.map(variant=>{
  const metric={id:variant.id,promptSha256:crypto.createHash('sha256').update(variant.instruction).digest('hex'),calls:0,errors:0,inputTokens:0,outputTokens:0,usageComplete:true,durationMs:0,costUsd:null};run.variants.push(metric);
  return {id:()=>variant.id,label:variant.id,callApi:async(_prompt,context)=>{
   if(++calls>plan.limits.maxCalls)fail('CALL_BUDGET_EXCEEDED');
   const input=inputs.get(context?.vars?.caseId);if(!input)fail('UNKNOWN_RESULT_ID');
   const result=await requestAnswer(plan,variant,input,conn);metric.calls++;metric.durationMs+=result.durationMs;
   if(result.error)metric.errors++;
   if(result.usage){metric.inputTokens+=result.usage.inputTokens;metric.outputTokens+=result.usage.outputTokens;}else metric.usageComplete=false;
   const payload=result.item?{missing:false,...result.item}:{missing:true};delete payload.caseId;
   // Never return upstream HTTP errors, headers, endpoint or credential to Promptfoo.
   return {output:JSON.stringify(payload)};
  }};
 });
 try{
  const promptfoo=require('promptfoo');
  const record=await promptfoo.evaluate({description:'Sandworm bounded prompt-version API run',prompts:['{{caseId}}'],providers,sharing:false,writeLatestResults:false,tests:dataset.cases.map(c=>({vars:{caseId:c.id,caseSpec:JSON.stringify(c)},assert:[{type:'javascript',value:'file://'+path.join(__dirname,'assertion.cjs')}]}))},{cache:false,maxConcurrency:1,showProgressBar:false});
  const summary=await record.toEvaluateSummary();
  const candidates=bridge.importSummary(summary,dataset);
  const bundle={schemaVersion:1,kind:'sandworm-promptfoo-run',dataset,candidates,run};
  bundleEngine.validate(bundle);if(Buffer.byteLength(JSON.stringify(bundle,null,2)+'\n')>engine.LIMITS.bytes)fail('OUTPUT_LIMIT');
  return bundle;
 }finally{try{fs.rmSync(configDir,{recursive:true,force:true});}catch(_){/* interrupted/locked runtime directory stays ignored */}}
}
async function main(args){
 const [command,datasetFile,planFile,outputFile,optIn]=args;
 if(!['preflight','run'].includes(command)||!datasetFile||!planFile||(command==='run'&&(!outputFile||optIn!=='--allow-network'))||args.length>(command==='run'?5:3))fail('USAGE_LIVE_PREFLIGHT_OR_RUN_ALLOW_NETWORK');
 const dataset=bridge.read(datasetFile),plan=bridge.read(planFile),budget=planFor(dataset,plan);
 if(command==='preflight'){console.log(JSON.stringify({status:'ready',...budget,costUsd:null,note:'No request sent. Output-token bound is not a dollar cap.'}));return;}
 // Reserve output before any paid request, rejecting existing files and symlinks.
 let fd;try{fd=fs.openSync(outputFile,'wx',0o600);}catch(_){fail('OUTPUT_WRITE_FAILED');}
 try{const bundle=await runLive(dataset,plan,{allowNetwork:true});fs.writeFileSync(fd,JSON.stringify(bundle,null,2)+'\n');console.log(JSON.stringify({status:'evaluated',variants:bundle.run.variants.length,calls:budget.calls,errors:bundle.run.variants.reduce((n,v)=>n+v.errors,0)}));}
 catch(e){try{fs.unlinkSync(outputFile);}catch(_){}throw e;}finally{fs.closeSync(fd);}
}
module.exports={planFor,endpointFor,connection,boundedJson,usageFor,requestAnswer,runLive};
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({error:e instanceof BridgeError?e.message:'EVALUATION_FAILED'}));process.exitCode=2;});
