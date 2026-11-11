'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {runSaved}=require('./bridge.cjs');
(async()=>{
 const dataset=JSON.parse(fs.readFileSync(__dirname+'/fixtures/dataset.json','utf8'));
 const candidates=JSON.parse(fs.readFileSync(__dirname+'/fixtures/candidates.json','utf8'));
 const result=await runSaved(dataset,candidates);
 console.log(JSON.stringify({upstream:'promptfoo-0.125.1',successes:result.summary.stats.successes,failures:result.summary.stats.failures,weightedScores:result.report.models.map(m=>m.score)}));
 assert.equal(result.report.models[0].score,100);assert.equal(result.report.models[1].score,10);
 const captured={version:result.summary.version,results:result.summary.results.map(r=>({provider:r.provider,testCase:{vars:{caseId:r.testCase.vars.caseId}},response:{output:r.response.output}}))};
 fs.writeFileSync(__dirname+'/fixtures/promptfoo-export.json',JSON.stringify(captured,null,2)+'\n');
})();
