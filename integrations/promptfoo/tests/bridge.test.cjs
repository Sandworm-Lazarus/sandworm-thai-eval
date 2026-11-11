'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const bridge=require('../bridge.cjs'),engine=require('../../../dist/engine.js');
const data=()=>JSON.parse(fs.readFileSync(__dirname+'/../fixtures/dataset.json','utf8'));
const candidates=()=>JSON.parse(fs.readFileSync(__dirname+'/../fixtures/candidates.json','utf8'));
const summary=()=>JSON.parse(fs.readFileSync(__dirname+'/../fixtures/promptfoo-export.json','utf8'));
test('upstream captured export roundtrips every output including missing case',()=>assert.deepEqual(bridge.importSummary(summary(),data()),candidates()));
test('weighted scoring remains 100 and 10 rather than upstream unweighted 100 and 20',()=>{const report=engine.evaluateObjects(data(),bridge.importSummary(summary(),data()),{nfc:true,whitespace:true});assert.deepEqual(report.models.map(m=>m.score),[100,10]);});
test('generated config only uses shipped local provider and no sharing',()=>{const c=bridge.configFor(data(),candidates());assert.equal(c.sharing,false);assert.equal(c.writeLatestResults,false);assert.ok(c.providers.every(p=>p.id.endsWith('/saved-provider.cjs')));assert.equal(c.tests.length,5);});
test('duplicate raw JSON keys are rejected',()=>assert.throws(()=>bridge.parse('{"x":1,"x":2}'),/INVALID_JSON/));
test('oversize JSON is rejected',()=>assert.throws(()=>bridge.parse(' '.repeat(1048577)),/INPUT_LIMIT/));
test('unknown source case is rejected',()=>{const s=summary();s.results[0].testCase.vars.caseId='injected';assert.throws(()=>bridge.importSummary(s,data()),/UNKNOWN_RESULT_ID/);});
test('duplicate result is rejected',()=>{const s=summary();s.results.push(s.results[0]);assert.throws(()=>bridge.importSummary(s,data()),/DUPLICATE_RESULT/);});
test('malformed provider payload is rejected',()=>{const s=summary();s.results[0].response.output='raw-private-answer';assert.throws(()=>bridge.importSummary(s,data()),/INVALID_PROVIDER_OUTPUT/);});
test('unknown candidate fields cannot change provider execution',()=>{const c=candidates();c.models[0].provider='openai:unasked';assert.throws(()=>bridge.configFor(data(),c),/INVALID_EVAL_SCHEMA/);});
test('wrapped upstream output format imports',()=>assert.deepEqual(bridge.importSummary({results:summary()},data()),candidates()));
test('citation and abstention metadata survive import',()=>{const a=bridge.importSummary(summary(),data()).models[0].outputs;assert.deepEqual(a[3].citations,['city-guide-01']);assert.equal(a[4].abstained,true);});
test('missing output produces failed assertion with no invented text',()=>{const f=require('../assertion.cjs');assert.equal(f('{"missing":true}',{vars:{caseSpec:JSON.stringify(data().cases[0])}}).pass,false);});

test('nested duplicate payload fields are rejected',()=>{const s=summary();s.results[0].response.output='{"missing":false,"text":"first","text":"second"}';assert.throws(()=>bridge.importSummary(s,data()),/INVALID_PROVIDER_OUTPUT/);});
test('nested escaped duplicate payload fields are rejected',()=>{const s=summary();s.results[0].response.output=String.raw`{"missing":false,"text":"first","te\u0078t":"second"}`;assert.throws(()=>bridge.importSummary(s,data()),/INVALID_PROVIDER_OUTPUT/);});

test('CLI rejects FIFO promptly with no raw path leakage',()=>{
 const os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sandworm-bridge-test-'));
 try{
  const fifo=path.join(dir,'private-source-name.fifo');const mk=cp.spawnSync('mkfifo',[fifo],{encoding:'utf8',timeout:2000});assert.equal(mk.status,0);
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,'../bridge.cjs'),'config',fifo,path.join(__dirname,'../fixtures/candidates.json'),path.join(dir,'out.json')],{encoding:'utf8',timeout:3000});
  assert.equal(r.error,undefined);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).error,'INPUT_LIMIT');assert.ok(!r.stderr.includes('private-source-name'));assert.ok(!fs.existsSync(path.join(dir,'out.json')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI rejects symlink input without disclosing its target',()=>{
 const os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sandworm-bridge-test-'));
 try{
  const link=path.join(dir,'private-target-link.json');fs.symlinkSync(path.join(__dirname,'../fixtures/dataset.json'),link);
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,'../bridge.cjs'),'config',link,path.join(__dirname,'../fixtures/candidates.json'),path.join(dir,'out.json')],{encoding:'utf8',timeout:3000});
  assert.equal(r.error,undefined);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).error,'INPUT_READ_FAILED');assert.ok(!r.stderr.includes('private-target-link'));assert.ok(!fs.existsSync(path.join(dir,'out.json')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
