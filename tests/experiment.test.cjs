'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../dist/experiment.js'),fixture=require('../examples/experiment.synthetic.json');
const copy=()=>structuredClone(fixture);
test('synthetic report derives score, unknown total and exact coverage',()=>{
 const r=api.parse(JSON.stringify(copy())),s=api.summarize([r])[0];
 assert.equal(s.scoreMean,75);assert.equal(s.totalCostUsd,null);assert.equal(s.knownCostUsd,0);assert.equal(s.pricedCalls,0);assert.equal(s.eligibleEvaluations,1);
});
test('failed calls remain in report but incomplete evaluation excluded from quality mean',()=>{
 const r=copy();r.attempts[0].status='error';r.evaluations[0].completedAttempts=0;r.evaluations[0].score=0;
 const s=api.summarize([r])[0];assert.equal(s.errors,1);assert.equal(s.scoreMean,null);assert.equal(s.eligibleEvaluations,0);
});
test('all priced calls required for total and zero is a known rate',()=>{
 const r=copy();Object.assign(r.attempts[0],{cost_usd:0,cost_source:'user-rate',rate_date:'2026-11-13',rate_source:'Synthetic fixture, not a provider price'});
 assert.equal(api.summarize([r])[0].totalCostUsd,0);
});
test('different exact dataset bytes, reused IDs and changed prompt hash cannot merge silently',()=>{
 const a=copy(),b=copy();b.experimentId='other';b.attempts[0].id='other-a';b.evaluations[0].id='other-e';b.attempts[0].evaluationId='other-e';
 b.datasetSha256='d'.repeat(64);assert.throws(()=>api.summarize([a,b]));b.datasetSha256=a.datasetSha256;
 b.evaluations[0].promptSha256='e'.repeat(64);b.attempts[0].promptSha256='e'.repeat(64);
 assert.equal(api.summarize([a,b]).length,2);assert.throws(()=>api.summarize([a,a]));
});
test('truncated, duplicate case and forged completion reports fail',()=>{
 for(const patch of [r=>r.evaluations[0].expectedAttempts=2,r=>r.evaluations[0].completedAttempts=0,r=>r.attempts.push({...r.attempts[0],id:'other'})]){
 const r=copy();patch(r);assert.throws(()=>api.validate(r));
 }
});
test('unknown fields, nonfinite costs, wrong relationship and invalid dates fail safely',()=>{
 for(const patch of [r=>r.raw='PRIVATE',r=>r.attempts[0].cost_usd=Infinity,r=>r.attempts[0].evaluationId='missing',r=>Object.assign(r.attempts[0],{cost_usd:1,cost_source:'user-rate',rate_date:'2026-02-30',rate_source:'fixture'})]){
 const r=copy();patch(r);assert.throws(()=>api.validate(r),/INVALID_EXPERIMENT_REPORT/);
 }
 assert.throws(()=>api.parse('{"kind":1,"kind":2}'),/INVALID_EXPERIMENT_REPORT/);
});
test('missing usage is unknown, never fabricated zero tokens',()=>{
 const r=copy();r.attempts[0].input_tokens=null;r.attempts[0].output_tokens=null;
 assert.equal(api.summarize([r])[0].usageCalls,0);r.attempts[0].output_tokens=2;assert.throws(()=>api.validate(r));
});

test('Ledger-produced v1 fixture imports with UTC timestamp lacking fractional seconds',()=>{
 const r=api.parse(JSON.stringify(require('../examples/ledger-v1.synthetic.json')));
 const groups=api.summarize([r]);assert.equal(groups.length,2);
 const priced=groups.find(g=>g.model==='demo-indigo'),partial=groups.find(g=>g.model==='demo-saffron');
 assert.equal(priced.scoreMean,93);assert.equal(priced.totalCostUsd,.006);
 assert.equal(partial.scoreMean,85);assert.equal(partial.totalCostUsd,null);assert.equal(partial.pricedCalls,1);
});

test('same hash with different case sets across reports and duplicate evaluation slots rejected',()=>{
 const a=copy(),b=copy();b.experimentId='other-exp';b.attempts[0].id='other-a';b.evaluations[0].id='other-e';b.attempts[0].evaluationId='other-e';b.attempts[0].caseId='different-case';
 assert.throws(()=>api.summarize([a,b]));
 const r=copy();r.evaluations.push({...r.evaluations[0],id:'duplicate-slot'});
 r.attempts.push({...r.attempts[0],id:'duplicate-slot-a',evaluationId:'duplicate-slot'});
 assert.throws(()=>api.validate(r));
});
