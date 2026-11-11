'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const live=require('../live.cjs'),bundle=require('../../../dist/promptfoo-bundle.js');
const plan=()=>structuredClone(require('../fixtures/live-plan.json')),data=()=>structuredClone(require('../fixtures/live-dataset.json'));
const response=(content,usage)=>new Response(JSON.stringify({choices:[{message:{content}}],usage}),{headers:{'content-type':'application/json'}});
const request=(p=plan(),f=async()=>response('{"text":"สวัสดีครับ"}',{prompt_tokens:3,completion_tokens:2}))=>live.requestAnswer(p,p.variants[0],p.inputs[0],{endpoint:'https://example.invalid/v1/chat/completions',key:''},f);
test('preflight exact matrix bounds requests and output tokens',()=>assert.deepEqual(live.planFor(data(),plan()),{calls:4,maxOutputTokens:1024}));
test('over-budget matrix fails before network',()=>{const p=plan();p.limits.maxCalls=3;assert.throws(()=>live.planFor(data(),p),/CALL_BUDGET/);});
test('duplicate prompt IDs, missing inputs, unknown fields and invalid limits are rejected',()=>{
 for(const mutate of [p=>p.variants[1].id=p.variants[0].id,p=>p.inputs.pop(),p=>p.secret='not-allowed',p=>p.limits.maxCalls=201,p=>p.limits.timeoutMs=0,p=>p.limits.maxOutputTokens=Infinity,p=>p.inputs.push(p.inputs[0])]){const p=plan();mutate(p);assert.throws(()=>live.planFor(data(),p));}
});
test('only HTTPS or explicit loopback HTTP allowed, no credential or query-bearing URL',()=>{
 assert.equal(live.endpointFor('http://127.0.0.1:1234/v1/chat/completions'),'http://127.0.0.1:1234/v1/chat/completions');
 for(const u of ['http://example.invalid/v1/chat/completions','https://user:pass@example.invalid/v1/chat/completions','https://example.invalid/v1/chat/completions?key=inert','https://example.invalid/v1/chat/completions#x','file:///chat/completions','https://example.invalid/other'])assert.throws(()=>live.endpointFor(u),/INVALID_ENDPOINT/);
});
test('network requires explicit opt-in before checking provider endpoint',async()=>await assert.rejects(live.runLive(data(),plan()),/NETWORK_OPT_IN/));
test('request wire fields preserve prompt and input exactly with env-only auth and no redirects',async()=>{
 const p=plan();let captured;
 const result=await live.requestAnswer(p,p.variants[0],p.inputs[0],{endpoint:'https://example.invalid/v1/chat/completions',key:'INERT_TEST_VALUE'},async(url,init)=>{captured={url,init};return response('{"text":"สวัสดีครับ","citations":[],"abstained":false}',{prompt_tokens:3,completion_tokens:2});});
 assert.equal(result.error,null);assert.equal(captured.init.redirect,'error');assert.equal(captured.init.headers.authorization,'Bearer INERT_TEST_VALUE');
 const sent=JSON.parse(captured.init.body);assert.deepEqual(sent.messages,[{role:'system',content:p.variants[0].instruction},{role:'user',content:p.inputs[0].text}]);assert.equal(sent.max_tokens,256);assert.equal(sent.stream,false);
 assert.deepEqual(result.usage,{inputTokens:3,outputTokens:2});assert.ok(!JSON.stringify(result).includes('INERT_TEST_VALUE'));
});
test('HTTP error content never escapes safe result',async()=>{const r=await request(plan(),async()=>new Response('PRIVATE_UPSTREAM_PAYLOAD',{status:401}));assert.equal(r.error,'API_HTTP_ERROR');assert.equal(r.item,null);assert.ok(!JSON.stringify(r).includes('PRIVATE'));});
test('transport exception never exposes source URL or data',async()=>{const r=await request(plan(),async()=>{throw Error('PRIVATE_UPSTREAM_PAYLOAD');});assert.equal(r.error,'API_REQUEST_FAILED');assert.ok(!JSON.stringify(r).includes('PRIVATE'));});
test('response byte cap and invalid UTF-8 fail safely',async()=>{for(const body of ['x'.repeat(131073),new Uint8Array([255])]){const r=await request(plan(),async()=>new Response(body));assert.equal(r.item,null);assert.ok(['API_RESPONSE_LIMIT','INVALID_API_RESPONSE'].includes(r.error));}});
test('duplicate nested fields and unknown structured-answer fields rejected',async()=>{for(const content of ['{"text":"a","text":"b"}','{"text":"a","extra":"private"}','{"text":"a","citations":["not a valid ID"]}']){const r=await request(plan(),async()=>response(content));assert.equal(r.item,null);}});
test('plain text response mode retains JSON-looking text without interpreting it',async()=>{const p=plan();p.responseFormat='text';const r=await request(p,async()=>response('{"status":"ok"}'));assert.equal(r.item.text,'{"status":"ok"}');});
test('missing or partial usage stays unknown rather than zero-cost claim',()=>{assert.equal(live.usageFor(undefined),null);assert.equal(live.usageFor({prompt_tokens:3}),null);assert.equal(live.usageFor({prompt_tokens:-1,completion_tokens:2}),null);});
test('invalid output path aborts CLI before any network',()=>{
 const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'promptfoo-live-test-'));
 try{const out=path.join(dir,'existing.json');fs.writeFileSync(out,'keep');const r=cp.spawnSync(process.execPath,[path.join(__dirname,'../live.cjs'),'run',path.join(__dirname,'../fixtures/live-dataset.json'),path.join(__dirname,'../fixtures/live-plan.json'),out,'--allow-network'],{encoding:'utf8',timeout:3000,env:{...process.env,SANDWORM_MODEL_URL:'https://example.invalid/v1/chat/completions'}});assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).error,'OUTPUT_WRITE_FAILED');assert.equal(fs.readFileSync(out,'utf8'),'keep');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
