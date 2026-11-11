'use strict';
module.exports=class SavedOutputProvider{
 constructor(options){this.config=options.config;}
 id(){return this.config.modelId;}
 async callApi(prompt,context){
  const item=this.config.outputs.find(x=>x.caseId===context.vars.caseId);
  return {output:JSON.stringify(item?{missing:false,text:item.text,...(item.citations!==undefined?{citations:item.citations}:{}),...(item.abstained!==undefined?{abstained:item.abstained}:{})}:{missing:true})};
 }
};
