'use strict';
// Scoped guard for the pinned Promptfoo 0.125.1 global-fetch transport.
// This is not an OS firewall and does not claim to constrain arbitrary packages.
// In 0.125.1 telemetry.recordTelemetryDisabled() still calls r.promptfoo.app.
let installed=false;
function installFetchGuard(allowedEndpoint=null){
 if(installed)throw new Error('FETCH_GUARD_ALREADY_INSTALLED');installed=true;
 const original=globalThis.fetch;
 const counts={blocked:0,allowed:0};
 globalThis.fetch=async function(input,init={}){
  let raw;try{raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;}catch(_){raw='';}
  const method=String(init.method||(typeof input==='object'&&input.method)||'GET').toUpperCase();
  if(!allowedEndpoint||raw!==allowedEndpoint||method!=='POST'||init.redirect!=='error'){
   counts.blocked++;throw new Error('UNAPPROVED_FETCH_BLOCKED');
  }
  counts.allowed++;return original(input,init);
 };
 return counts;
}
module.exports={installFetchGuard};
