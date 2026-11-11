'use strict';
// Actual Promptfoo evaluator + real HTTP requests, synthetic loopback responses only.
const http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs');
const live=require('./live.cjs'),engine=require('../../dist/engine.js');
const dataset=require('./fixtures/live-dataset.json'),plan=require('./fixtures/live-plan.json');
async function smoke(){
 const requests=[];
 const server=http.createServer(async(req,res)=>{
  try{let body='';for await(const part of req){body+=part;if(body.length>20000)throw Error('request limit');}
   const data=JSON.parse(body);requests.push(data);
   assert.equal(req.url,'/v1/chat/completions');assert.equal(req.method,'POST');assert.equal(req.headers.authorization,undefined);
   assert.equal(data.max_tokens,256);assert.equal(data.stream,false);assert.equal(data.model,plan.model);
   const variant=data.messages[0].content===plan.variants[1].instruction?'v2':'v1';
   const grounding=data.messages[1].content.includes('city-guide-01');
   const payload={text:grounding?(variant==='v2'?'กรุงเทพมหานคร':'เชียงใหม่'):'สวัสดีครับ',citations:grounding&&variant==='v2'?['city-guide-01']:[],abstained:false};
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}));
  }catch(_){res.writeHead(500);res.end('{}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  let guard;
  const bundle=await live.runLive(dataset,plan,{allowNetwork:true,mode:'local-mock',guardObserver:g=>guard=g,env:{SANDWORM_MODEL_URL:'http://127.0.0.1:'+server.address().port+'/v1/chat/completions'}});
  assert.equal(guard.allowed,4);assert.ok(guard.blocked>=1,'pinned telemetry-disabled event must be blocked before transport');
  assert.equal(requests.length,4);assert.deepEqual(bundle.run.variants.map(v=>v.calls),[2,2]);assert.deepEqual(bundle.run.variants.map(v=>v.errors),[0,0]);
  assert.deepEqual(bundle.run.variants.map(v=>[v.inputTokens,v.outputTokens,v.usageComplete]),[[40,20,true],[40,20,true]]);
  const report=engine.evaluateObjects(bundle.dataset,bundle.candidates,{nfc:true,whitespace:true});assert.deepEqual(report.models.map(v=>v.score),[25,100]);
  assert.ok(!JSON.stringify(bundle).includes('127.0.0.1'));assert.ok(!JSON.stringify(bundle).includes('authorization'));
  // Stable fixture strips variable latency/time but preserves genuine observed output.
  bundle.run.createdAt='2026-11-11T00:00:00.000Z';for(const v of bundle.run.variants)v.durationMs=0;
  if(process.argv.includes('--refresh-fixture'))fs.writeFileSync(__dirname+'/fixtures/live-bundle.json',JSON.stringify(bundle,null,2)+'\n');
  console.log(JSON.stringify({status:'pass',engine:'promptfoo',version:'0.125.1',transport:'real-loopback-http',requests:4,weightedScores:[25,100],paidModelCalls:0,unapprovedFetchesBlocked:guard.blocked}));
 }finally{await new Promise(resolve=>server.close(resolve));server.closeAllConnections();}
}
smoke().catch(()=>{console.error('LIVE_SMOKE_FAILED');process.exitCode=1;});
