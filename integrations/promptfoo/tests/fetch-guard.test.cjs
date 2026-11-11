'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('scoped transport guard blocks non-allowlisted endpoint before original fetch',async()=>{
 const calls=[];globalThis.fetch=async(...args)=>{calls.push(args);return new Response('{}');};
 const guard=require('../fetch-guard.cjs').installFetchGuard('http://127.0.0.1:1234/v1/chat/completions');
 for(const [url,opts]of [['https://r.promptfoo.app/',{method:'POST'}],['http://127.0.0.1:1234/v1/other',{method:'POST',redirect:'error'}],['http://127.0.0.1:1234/v1/chat/completions',{method:'POST'}],['http://127.0.0.1:1234/v1/chat/completions',{method:'GET',redirect:'error'}]])await assert.rejects(fetch(url,opts),/UNAPPROVED_FETCH_BLOCKED/);
 assert.equal(calls.length,0);assert.equal(guard.blocked,4);
 await fetch('http://127.0.0.1:1234/v1/chat/completions',{method:'POST',redirect:'error'});assert.equal(calls.length,1);assert.equal(guard.allowed,1);
});
