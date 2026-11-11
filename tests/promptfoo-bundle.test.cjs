'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../dist/engine.js'),bundleEngine=require('../dist/promptfoo-bundle.js');
const fixture=()=>structuredClone(require('../integrations/promptfoo/fixtures/live-bundle.json'));
test('captured actual Promptfoo HTTP bundle recomputes weighted prompt scores',()=>{const b=bundleEngine.parse(JSON.stringify(fixture()));assert.deepEqual(engine.evaluateObjects(b.dataset,b.candidates).models.map(m=>m.score),[25,100]);});
test('bundle rejects arbitrary precomputed score, secrets, and foreign fields',()=>{for(const mutate of [b=>b.score=100,b=>b.run.apiKey='INERT',b=>b.run.variants[0].score=100,b=>b.run.variants[0].costUsd=0]){const b=fixture();mutate(b);assert.throws(()=>bundleEngine.validate(b));}});
test('bundle rejects duplicate variant IDs and dishonest call counts',()=>{for(const mutate of [b=>b.run.variants[1].id=b.run.variants[0].id,b=>b.run.plannedCalls++,b=>b.run.variants[0].calls++,b=>b.run.variants[0].errors++]){const b=fixture();mutate(b);assert.throws(()=>bundleEngine.validate(b));}});
test('bundle rejects duplicate JSON keys, unknown variant and malformed prompt fingerprint',()=>{assert.throws(()=>bundleEngine.parse('{"kind":1,"kind":2}'));for(const mutate of [b=>b.run.variants[0].id='unknown',b=>b.run.variants[0].promptSha256='x',b=>b.run.variants[0].inputTokens=Infinity]){const b=fixture();mutate(b);assert.throws(()=>bundleEngine.validate(b));}});
test('missing usage remains visibly incomplete and unpriced',()=>{const b=fixture();b.run.variants[0].usageComplete=false;bundleEngine.validate(b);assert.equal(b.run.variants[0].costUsd,null);});

test('impossible calendar date is rejected rather than normalized',()=>{const b=fixture();b.run.createdAt='2026-02-31T00:00:00.000Z';assert.throws(()=>bundleEngine.validate(b));});
