'use strict';
// Real pinned Promptfoo + loopback HTTP, synthetic models/rates only. No paid API.
const http=require('node:http'),assert=require('node:assert/strict');
const {runExperiment}=require('./experiment.cjs'),api=require('../../dist/experiment.js');
const dataset={schemaVersion:1,datasetId:'synthetic-matrix',cases:[{id:'one',weight:1,assertions:{exact:'hello'}},{id:'two',weight:3,assertions:{exact:'world'}}]};
const plan={schemaVersion:1,models:['synthetic-a','synthetic-b'],variants:[{id:'good',instruction:'GOOD'},{id:'bad',instruction:'BAD'}],repeats:2,responseFormat:'text',inputs:[{caseId:'one',text:'one'},{caseId:'two',text:'two'}],limits:{maxCalls:16,maxOutputTokens:16,timeoutMs:5000},costPolicy:{providerUsageCostUsd:true,rates:[{model:'synthetic-b',inputUsdPerMillion:1,outputUsdPerMillion:2,date:'2026-11-13',source:'Synthetic fixture only'}]}};
let calls=0;const server=http.createServer((req,res)=>{
 assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');let raw='';
 req.on('data',b=>{raw+=b;});req.on('end',()=>{
 const p=JSON.parse(raw);calls++;
 const correct=p.messages[0].content==='GOOD'&&(p.model==='synthetic-a'||p.messages[1].content==='one');
 const text=correct?(p.messages[1].content==='one'?'hello':'world'):'wrong';
 const usage={prompt_tokens:10,completion_tokens:20};if(p.model==='synthetic-a')usage.cost=.003;
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:text}}],usage}));
 });});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const endpoint='http://127.0.0.1:'+server.address().port+'/v1/chat/completions';let transport;
 const r=await runExperiment(JSON.stringify(dataset),JSON.stringify(plan),{allowNetwork:true,mode:'local-mock',env:{SANDWORM_MODEL_URL:endpoint},guardObserver:g=>transport=g});
 assert.equal(calls,16);assert.equal(r.attempts.length,16);assert.equal(r.evaluations.length,8);
 assert.equal(transport.allowed,16);assert(transport.blocked>=1);
 const summary=api.summarize([r]);
 assert.equal(summary.find(x=>x.model==='synthetic-a'&&x.variantId==='good').scoreMean,100);
 assert.equal(summary.find(x=>x.model==='synthetic-b'&&x.variantId==='good').scoreMean,25);
 assert.equal(summary.find(x=>x.model==='synthetic-a'&&x.variantId==='bad').scoreMean,0);
 assert(r.attempts.every(a=>a.cost_usd!==null));
 const serialized=JSON.stringify(r);assert(!serialized.includes('GOOD'));assert(!serialized.includes('hello'));assert(!serialized.includes(endpoint));
 console.log(JSON.stringify({status:'pass',scope:'synthetic actual Promptfoo plus loopback only',calls,evaluations:r.evaluations.length}));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(()=>{console.error('EXPERIMENT_SMOKE_FAILED');process.exitCode=1;});
