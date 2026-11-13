(function(){'use strict';
const api=globalThis.SandwormExperiment;
const file=document.getElementById('experiment-file'),clear=document.getElementById('experiment-clear'),body=document.getElementById('experiment-body'),status=document.getElementById('experiment-status'),provenance=document.getElementById('experiment-provenance');
if(!file||!clear||!body||!status||!provenance)return;
let revision=0,reports=[];
const fmt=n=>n===null?'ไม่ทราบ':new Intl.NumberFormat('th-TH',{maximumFractionDigits:4}).format(n);
function render(){
 body.replaceChildren();
 for(const r of api.summarize(reports)){
  const tr=document.createElement('tr');
  for(const value of [r.model,r.variantId+' / '+r.promptSha256.slice(0,12),r.eligibleEvaluations+' / '+r.evaluations,fmt(r.scoreMean)+' ('+fmt(r.scoreMin)+'–'+fmt(r.scoreMax)+')',r.calls+' / '+r.errors,fmt(r.totalCostUsd)+' USD',fmt(r.knownCostUsd)+' / '+r.pricedCalls+' จาก '+r.calls,fmt(r.p50Ms)+' / '+fmt(r.p95Ms),r.usageCalls+' จาก '+r.calls]){
   const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);
  }
  body.appendChild(tr);
 }
 provenance.textContent=JSON.stringify(reports.map(r=>({experimentId:r.experimentId,datasetId:r.datasetId,datasetSha256:r.datasetSha256,planSha256:r.planSha256,createdAt:r.createdAt,normalization:r.normalization})),null,2);
}
file.addEventListener('change',async()=>{
 const mine=++revision,selected=Array.from(file.files||[]);
 if(!selected.length)return;
 try{
  if(selected.length>10||reports.length+selected.length>10||selected.some(f=>f.size>api.LIMIT))throw Error();
  const pending=await Promise.all(selected.map(async f=>api.parse(await f.text())));
  if(mine!==revision)return;
  const next=reports.concat(pending);api.summarize(next);reports=next;render();
  status.textContent='นำเข้า '+reports.length+' การทดลอง · คะแนนและ metadata เป็นข้อมูลจากผู้ส่ง ยังไม่ยืนยันความถูกต้องของต้นทาง';
 }catch(_){if(mine===revision)status.textContent='นำเข้าไม่ได้: ตรวจรูปแบบ ขนาดไฟล์ dataset เดียวกัน และ ID ที่ไม่ซ้ำ · ผลเดิมยังอยู่';}
 file.value='';
});
clear.addEventListener('click',()=>{revision++;reports=[];body.replaceChildren();provenance.textContent='';file.value='';status.textContent='ล้างการทดลองแล้ว';});
})();
