(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(['dataset', 'candidates', 'nfc', 'whitespace', 'evaluate-btn', 'export-btn', 'status', 'error', 'empty', 'report', 'case-count', 'model-count', 'best-score', 'summary-body', 'model-select', 'case-results', 'provenance'].map(id => [id, byId(id)]));
  let currentReport = null, currentRun = null, revision = 0;
  function clearResults(message) {
    revision++; currentReport = null; currentRun = null; byId('runner-export').disabled = true; byId('runner-status').textContent = 'ยังไม่ได้นำเข้าผล API · หน้าเว็บนี้ประมวลผลไฟล์ในเครื่อง';
    ui['export-btn'].disabled = true; ui.report.hidden = true; ui.empty.hidden = false;
    for (const id of ['case-count', 'model-count', 'best-score']) ui[id].textContent = '—';
    ui['summary-body'].replaceChildren(); ui['case-results'].replaceChildren(); ui['model-select'].replaceChildren(); ui.provenance.textContent = '';
    ui.error.hidden = true; ui.error.textContent = ''; ui.status.textContent = message;
  }
  function error(message) { ui.error.textContent = message; ui.error.hidden = false; }
  const el = (tag, value, className) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; if (className) node.className = className; return node; };
  function renderCases() {
    ui['case-results'].replaceChildren();
    if (!currentReport) return;
    const model = currentReport.models.find(m => m.modelId === ui['model-select'].value);
    if (!model) return;
    for (const c of model.cases) {
      const card = el('article', undefined, 'result-card ' + (c.passed ? 'pass' : 'fail'));
      const heading = el('div', undefined, 'case-title'); heading.append(el('strong', c.caseId), el('span', (c.passed ? 'PASS' : 'FAIL') + ' / น้ำหนัก ' + c.weight)); card.append(heading);
      const checks = el('div', undefined, 'checks');
      for (const check of c.checks) checks.append(el('span', check.rule + ': ' + (check.passed ? 'ผ่าน' : check.reason), 'check-tag ' + (check.passed ? 'pass' : 'fail')));
      card.append(checks); ui['case-results'].append(card);
    }
  }
  function render(report, run = null) {
    currentRun = run; byId('runner-export').disabled = !run;
    if (run) byId('runner-status').textContent = (run.mode === 'local-mock' ? 'ข้อมูลสังเคราะห์จาก mock API' : 'ผล API ที่นำเข้า') + ' · ' + run.model + ' · ' + run.plannedCalls + ' requests · คำนวณคะแนนใหม่แล้ว; metadata การรันมาจากไฟล์และยังไม่ยืนยันความแท้ ต้นทุนยังไม่ทราบ';
    currentReport = report; ui.empty.hidden = true; ui.report.hidden = false; ui['export-btn'].disabled = false;
    ui['case-count'].textContent = report.models[0].totalCases; ui['model-count'].textContent = report.models.length; ui['best-score'].textContent = Math.max(...report.models.map(m => m.score)).toFixed(1) + '%';
    for (const m of report.models) {
      const metric = run && run.variants.find(v => v.id === m.modelId);
      const row = el('tr'); for (const value of [m.modelId, m.score.toFixed(2) + '%', m.passedCases + ' / ' + m.totalCases, m.missingCases, m.passedWeight + ' / ' + m.totalWeight, metric ? metric.calls + ' / ' + metric.errors : '—', metric ? (metric.usageComplete ? '' : 'ไม่ครบ: ') + metric.inputTokens + ' / ' + metric.outputTokens + (metric.usageComplete ? '' : ' ที่รายงาน') : '—', metric ? (metric.durationMs / 1000).toFixed(2) + ' s' : '—']) row.append(el('td', value)); ui['summary-body'].append(row);
      const option = el('option', m.modelId); option.value = m.modelId; ui['model-select'].append(option);
    }
    ui.provenance.textContent = JSON.stringify({ datasetId: report.datasetId, normalization: report.normalization, scoring: report.scoring, provenance: report.provenance, importedRun: run }, null, 2); renderCases();
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  for (const id of ['dataset', 'candidates', 'nfc', 'whitespace']) ui[id].addEventListener('input', () => clearResults('ข้อมูลหรือกฎเปลี่ยนแล้ว กรุณาประเมินใหม่'));
  ui['model-select'].addEventListener('change', renderCases);
  byId('demo-btn').addEventListener('click', () => { clearResults('โหลดข้อมูลสมมติแล้ว ไม่มีผลคะแนนจากโมเดลจริง'); ui.dataset.value = JSON.stringify(ThaiEvalExamples.dataset, null, 2); ui.candidates.value = JSON.stringify(ThaiEvalExamples.candidates, null, 2); });
  byId('clear-btn').addEventListener('click', () => { clearResults('ล้างข้อมูลและผลลัพธ์แล้ว'); ui.dataset.value = ''; ui.candidates.value = ''; byId('dataset-file').value = ''; byId('candidates-file').value = ''; byId('runner-file').value = ''; });
  ui['evaluate-btn'].addEventListener('click', async () => {
    clearResults('กำลังประเมินและคำนวณ SHA-256…'); const capturedRevision = revision;
    try {
      const report = await ThaiEval.evaluate(ui.dataset.value, ui.candidates.value, { nfc: ui.nfc.checked, whitespace: ui.whitespace.checked });
      if (capturedRevision !== revision) return;
      render(report); ui.status.textContent = 'ประเมินแล้ว · ทุกเคสใช้ตัวหารเดียวกัน รวมเคสที่ขาดคำตอบ';
    } catch (err) {
      if (capturedRevision !== revision) return;
      error(err instanceof ThaiEval.EvalError ? err.message : 'ไม่สามารถประเมินข้อมูลชุดนี้ได้'); ui.status.textContent = 'ไม่มีรายงานที่ส่งออกได้ กรุณาตรวจรูปแบบ JSON';
    }
  });
  ui['export-btn'].addEventListener('click', () => { if (currentReport) download(currentReport, 'thai-eval-report.json'); });
  byId('fixtures-btn').addEventListener('click', () => { try { download(ThaiEval.parse(ui.dataset.value), 'thai-eval-dataset.json'); } catch (_) { error('ต้องมีชุดเกณฑ์ JSON ที่อ่านได้ก่อนดาวน์โหลด'); } });
  byId('runner-file').addEventListener('change', async event => {
    clearResults('กำลังนำเข้า Promptfoo bundle…'); const capturedRevision = revision;
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) { ui.status.textContent = 'ยังไม่ได้เลือกไฟล์'; return; }
    if (file.size > ThaiEval.LIMITS.bytes || !/\.json$/i.test(file.name)) { error('เลือกไฟล์ .json ขนาดไม่เกิน 1 MiB'); return; }
    try {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (capturedRevision !== revision) return;
      const bundle = ThaiEvalPromptfoo.parse(raw);
      const datasetText = JSON.stringify(bundle.dataset, null, 2), candidatesText = JSON.stringify(bundle.candidates, null, 2);
      const report = await ThaiEval.evaluate(datasetText, candidatesText, { nfc: ui.nfc.checked, whitespace: ui.whitespace.checked });
      if (capturedRevision !== revision) return;
      ui.dataset.value = datasetText; ui.candidates.value = candidatesText;
      render(report, bundle.run); ui.status.textContent = 'นำเข้าผล Promptfoo และคำนวณคะแนนใหม่แล้ว · ตรวจสอบก่อนแชร์รายงาน';
    } catch (_) { if (capturedRevision === revision) { error('นำเข้าไม่ได้: ต้องเป็น Promptfoo bundle ของ Sandworm ที่ถูกต้อง'); ui.status.textContent = 'ไม่มีรายงานที่ส่งออกได้'; } }
  });
  byId('runner-export').addEventListener('click', () => {
    if (currentReport && currentRun) download({ schemaVersion: 1, kind: 'sandworm-promptfoo-reviewed-report', report: currentReport, run: currentRun }, 'thai-eval-promptfoo-comparison.json');
  });
  for (const target of ['dataset', 'candidates']) byId(target + '-file').addEventListener('change', async event => {
    clearResults('กำลังอ่านไฟล์ที่เลือก…'); const capturedRevision = revision; const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) { ui.status.textContent = 'ยังไม่ได้เลือกไฟล์'; return; }
    if (file.size > ThaiEval.LIMITS.bytes || !/\.json$/i.test(file.name)) { error('เลือกไฟล์ .json ขนาดไม่เกิน 1 MiB'); return; }
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (capturedRevision !== revision) return;
      ThaiEval.parse(content); ui[target].value = content; ui.status.textContent = 'นำเข้าไฟล์แล้ว กรุณาประเมินข้อมูล';
    } catch (_) { if (capturedRevision === revision) error('อ่านไฟล์ไม่ได้ ต้องเป็น UTF-8 JSON ที่ถูกต้อง'); }
  });
}());
