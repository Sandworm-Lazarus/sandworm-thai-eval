'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const engine=require('../../dist/engine.js');
const MAX=1024*1024;
class BridgeError extends Error {constructor(code){super(code);this.name='BridgeError';}}
function fail(c){throw new BridgeError(c);}
function parse(raw){if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX)fail('INPUT_LIMIT');try{return engine.parse(raw);}catch(_){fail('INVALID_JSON_OR_LIMIT');}}
function validate(dataset,candidates){try{engine.evaluateObjects(dataset,candidates,{nfc:true,whitespace:true});}catch(_){fail('INVALID_EVAL_SCHEMA');}}
function configFor(dataset,candidates){
 validate(dataset,candidates);
 return {description:'Sandworm Thai Eval / saved-output provider',prompts:['{{caseId}}'],sharing:false,writeLatestResults:false,
 providers:candidates.models.map(model=>({id:'file://'+path.join(__dirname,'saved-provider.cjs'),label:model.id,config:{modelId:model.id,outputs:model.outputs}})),
 tests:dataset.cases.map(c=>({vars:{caseId:c.id,caseSpec:JSON.stringify(c)},assert:[{type:'javascript',value:'file://'+path.join(__dirname,'assertion.cjs')}]}))};
}
function unwrap(summary){const v=summary?.results;return Array.isArray(v)?v:(v&&Array.isArray(v.results)?v.results:null);}
function importSummary(summary,dataset){
 let rows=unwrap(summary);if(!rows||rows.length>2000)fail('INVALID_PROMPTFOO_REPORT');
 const known=new Set(dataset?.cases?.map(c=>c.id));const models=new Map();const seen=new Set();
 for(const row of rows){
  const model=row?.provider?.label||row?.provider?.id;const caseId=row?.testCase?.vars?.caseId;
  if(typeof model!=='string'||!known.has(caseId))fail('UNKNOWN_RESULT_ID');
  const key=JSON.stringify([model,caseId]);if(seen.has(key))fail('DUPLICATE_RESULT');seen.add(key);
  let output=row?.response?.output;
  if(typeof output!=='string'||output.length>40000)fail('INVALID_PROVIDER_OUTPUT');
  let payload;try{payload=parse(output);}catch(_){fail('INVALID_PROVIDER_OUTPUT');}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.missing!=='boolean')fail('INVALID_PROVIDER_OUTPUT');
  if(!models.has(model))models.set(model,[]);
  if(!payload.missing){
   if(typeof payload.text!=='string')fail('INVALID_PROVIDER_OUTPUT');
   const item={caseId,text:payload.text};
   if(payload.citations!==undefined)item.citations=payload.citations;
   if(payload.abstained!==undefined)item.abstained=payload.abstained;
   models.get(model).push(item);
  }
 }
 const candidates={schemaVersion:1,models:[...models].map(([id,outputs])=>({id,outputs}))};validate(dataset,candidates);return candidates;
}
let evaluationStarted=false;
async function runSaved(dataset,candidates){
 if(evaluationStarted)fail('ONE_EVALUATION_PER_PROCESS');
 validate(dataset,candidates);evaluationStarted=true;
 require('./fetch-guard.cjs').installFetchGuard();
 const runtime=path.join(__dirname,'.runtime');fs.mkdirSync(runtime,{recursive:true,mode:0o700});
 const configDir=fs.mkdtempSync(path.join(runtime,'promptfoo-'));
 fs.chmodSync(configDir,0o700);
 // Set these before loading upstream. No model provider, cloud sync, or sharing is configured.
 process.env.PROMPTFOO_DISABLE_TELEMETRY='1';process.env.PROMPTFOO_DISABLE_SHARING='1';
 process.env.PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS='1';
 process.env.PROMPTFOO_CONFIG_DIR=configDir;
 process.env.PROMPTFOO_DISABLE_REMOTE_GENERATION='1';
 try{
 const promptfoo=require('promptfoo');const config=configFor(dataset,candidates);
 const record=await promptfoo.evaluate(config,{cache:false,maxConcurrency:1,showProgressBar:false});
 const summary=await record.toEvaluateSummary();
 const imported=importSummary(summary,dataset);
 const report=await engine.evaluate(JSON.stringify(dataset),JSON.stringify(imported),{nfc:true,whitespace:true});
 return {summary,candidates:imported,report};
 }finally{try{fs.rmSync(configDir,{recursive:true,force:true});}catch(_){/* best effort on platforms retaining upstream handles */}}
}
function read(file){try{const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>MAX)fail('INPUT_LIMIT');const buffer=Buffer.alloc(MAX+1);let used=0;while(used<buffer.length){const n=fs.readSync(fd,buffer,used,buffer.length-used,null);if(n===0)break;used+=n;}if(used>MAX)fail('INPUT_LIMIT');let raw;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used));}catch(_){fail('INVALID_UTF8');}return parse(raw);}finally{fs.closeSync(fd);}}catch(e){if(e instanceof BridgeError)throw e;fail('INPUT_READ_FAILED');}}
function write(file,value){try{const raw=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(raw)>MAX)fail('OUTPUT_LIMIT');fs.writeFileSync(file,raw,{flag:'wx',mode:0o600});}catch(e){if(e instanceof BridgeError)throw e;fail('OUTPUT_WRITE_FAILED');}}
async function main(args){
 const [mode,datasetFile,inputFile,outputFile]=args;
 if(!['config','run','import'].includes(mode)||!datasetFile||!inputFile||!outputFile)fail('USAGE: config|run|import dataset.json candidates-or-report.json output.json');
 const dataset=read(datasetFile),input=read(inputFile);
 if(mode==='config'){write(outputFile,configFor(dataset,input));console.log('{"status":"config-created","provider":"saved-outputs-only"}');}
 else if(mode==='import'){write(outputFile,importSummary(input,dataset));console.log('{"status":"candidates-imported"}');}
 else {const result=await runSaved(dataset,input);write(outputFile,result.report);console.log(JSON.stringify({status:'evaluated',models:result.report.models.length}));}
}
module.exports={parse,validate,configFor,importSummary,runSaved,BridgeError,read,write};
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify({error:e instanceof BridgeError?e.message:'EVALUATION_FAILED'}));process.exitCode=2;});
