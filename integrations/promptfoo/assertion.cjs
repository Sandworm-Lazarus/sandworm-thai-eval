'use strict';
const engine=require('../../dist/engine.js');
module.exports=(output,context)=>{
 try{
  const c=JSON.parse(context.vars.caseSpec),payload=engine.parse(output);
  const item={caseId:c.id,text:payload.text};
  if(payload.citations!==undefined)item.citations=payload.citations;
  if(payload.abstained!==undefined)item.abstained=payload.abstained;
  const report=engine.evaluateObjects({schemaVersion:1,datasetId:'promptfoo-single-case',cases:[c]},{schemaVersion:1,models:[{id:'saved-output',outputs:payload.missing?[]:[item]}]},{nfc:true,whitespace:true});
  const pass=report.models[0].score===100;
  return {pass,score:pass?1:0,reason:pass?'Sandworm assertions passed':'Sandworm assertions failed or output missing'};
 }catch(_){return {pass:false,score:0,reason:'INVALID_SAVED_OUTPUT'};}
};
