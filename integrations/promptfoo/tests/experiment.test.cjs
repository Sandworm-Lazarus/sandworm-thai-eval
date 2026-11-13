'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../experiment.cjs');
const dataset={schemaVersion:1,datasetId:'fixture',cases:[{id:'c1',weight:1,assertions:{exact:'ok'}}]};
function plan(){return {schemaVersion:1,models:['synthetic-a','synthetic-b'],variants:[{id:'v1',instruction:'fixture'}],repeats:2,responseFormat:'text',inputs:[{caseId:'c1',text:'fixture'}],limits:{maxCalls:4,maxOutputTokens:16,timeoutMs:1000},costPolicy:{providerUsageCostUsd:false,rates:[]}};}
test('matrix cap includes models, prompts, repeats and cases before network',()=>{
 assert.equal(api.planFor(dataset,plan()).calls,4);
 const p=plan();p.repeats=3;assert.throws(()=>api.planFor(dataset,p),/CALL_BUDGET/);
});
test('zero repeats, duplicate model, undocumented cost source and invalid date rejected',()=>{
 for(const patch of [p=>p.repeats=0,p=>p.models=['x','x'],p=>p.costPolicy.rawKey='SECRET',p=>p.costPolicy.rates=[{model:'synthetic-a',inputUsdPerMillion:1,outputUsdPerMillion:2,date:'2026-02-30',source:'fixture'}]]){
 const p=plan();patch(p);assert.throws(()=>api.planFor(dataset,p));
 }
});
test('provider cost requires explicit USD semantic opt-in; missing tokens preserve unknown',()=>{
 const p=plan();assert.equal(api.costFor({usage:{cost:1}},null,'synthetic-a',p.costPolicy).cost_usd,null);
 p.costPolicy.providerUsageCostUsd=true;assert.equal(api.costFor({usage:{cost:0}},null,'synthetic-a',p.costPolicy).cost_usd,0);
 p.costPolicy.rates=[{model:'synthetic-a',inputUsdPerMillion:1,outputUsdPerMillion:2,date:'2026-11-13',source:'Synthetic rate only'}];
 assert.equal(api.costFor({},null,'synthetic-a',p.costPolicy).cost_usd,null);
 assert.equal(api.costFor({},{inputTokens:10,outputTokens:20},'synthetic-a',p.costPolicy).cost_usd,0.00005);
});
test('preflight blocks network without explicit opt in',async()=>{
 await assert.rejects(api.runExperiment(JSON.stringify(dataset),JSON.stringify(plan())),/NETWORK_OPT_IN_REQUIRED/);
});
test('credentials are headers only and raw upstream failure cannot escape',async()=>{
 const p=plan(),v=p.variants[0],input=p.inputs[0];let wire;
 const result=await api.request(p,'synthetic-a',v,input,{endpoint:'https://example.invalid/v1/chat/completions',key:'SYNTHETIC-SECRET'},async(url,init)=>{wire=init;return new Response('PRIVATE-UPSTREAM-PAYLOAD',{status:401});});
 assert.equal(wire.headers.authorization,'Bearer SYNTHETIC-SECRET');assert.equal(wire.redirect,'error');assert(!wire.body.includes('SYNTHETIC-SECRET'));
 assert.equal(result.error,'API_HTTP_ERROR');assert(!JSON.stringify(result).includes('PRIVATE-UPSTREAM-PAYLOAD'));
});
test('malformed output retains reported usage/cost rather than pretending failed requests are free',async()=>{
 const p=plan();p.costPolicy.providerUsageCostUsd=true;
 const r=await api.request(p,'synthetic-a',p.variants[0],p.inputs[0],{endpoint:'https://example.invalid/v1/chat/completions',key:''},async()=>new Response(JSON.stringify({choices:[],usage:{prompt_tokens:10,completion_tokens:20,cost:.01}})));
 assert(r.error);assert.equal(r.usage.inputTokens,10);assert.equal(r.cost_usd,.01);
});
