'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const engine = require('../dist/engine.js');
class Element {
  constructor(tag = 'div') { this.tag = tag; this.value = ''; this.checked = false; this.hidden = false; this.disabled = false; this.textContent = ''; this.children = []; this.handlers = {}; this.files = []; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  async fire(type) { for (const fn of this.handlers[type] || []) await fn({ target: this }); }
  append(...children) { this.children.push(...children); if (this.tag === 'select' && !this.value && children.length) this.value = children[0].value; }
  replaceChildren(...children) { this.children = []; if (this.tag === 'select') this.value = ''; this.append(...children); }
  click() { return this.fire('click'); }
  remove() {}
}
function setup(overrides = {}) {
  const nodes = new Map();
  const ids = [...fs.readFileSync(require.resolve('../dist/index.html'), 'utf8').matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  for (const id of ids) nodes.set(id, new Element(id === 'model-select' ? 'select' : 'div'));
  nodes.get('nfc').checked = true; nodes.get('whitespace').checked = true; nodes.get('export-btn').disabled = true;
  const document = { getElementById: id => nodes.get(id), createElement: tag => new Element(tag), body: new Element('body') };
  const downloads = [];
  const context = vm.createContext({ document, ThaiEval: { ...engine, ...overrides }, TextDecoder, Blob, setTimeout: fn => fn(), URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:synthetic'; }, revokeObjectURL() {} } });
  vm.runInContext(fs.readFileSync(require.resolve('../dist/examples.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../dist/app.js'), 'utf8'), context);
  return { n: id => nodes.get(id), downloads };
}
async function demo(s) { await s.n('demo-btn').fire('click'); await s.n('evaluate-btn').fire('click'); }
test('synthetic demo integrates real engine, summary, case picker, and report export', async () => { const s = setup(); await demo(s); assert.equal(s.n('case-count').textContent, 5); assert.equal(s.n('model-count').textContent, 2); assert.equal(s.n('best-score').textContent, '100.0%'); assert.equal(s.n('summary-body').children.length, 2); assert.equal(s.n('case-results').children.length, 5); assert.equal(s.n('export-btn').disabled, false); await s.n('export-btn').fire('click'); const report = JSON.parse(await s.downloads[0].text()); assert.deepEqual(report.models.map(m => m.score), [100, 10]); assert(!JSON.stringify(report).includes('กรุณาส่งรหัสผ่าน')); });
test('changing data or normalization invalidates result and disables download', async () => { for (const id of ['dataset', 'candidates', 'nfc', 'whitespace']) { const s = setup(); await demo(s); await s.n(id).fire('input'); assert.equal(s.n('export-btn').disabled, true); assert.equal(s.n('report').hidden, true); assert.equal(s.n('summary-body').children.length, 0); await s.n('export-btn').fire('click'); assert.equal(s.downloads.length, 0); } });
test('clear removes inputs and all report state', async () => { const s = setup(); await demo(s); await s.n('clear-btn').fire('click'); assert.equal(s.n('dataset').value, ''); assert.equal(s.n('candidates').value, ''); assert.equal(s.n('case-results').children.length, 0); assert.equal(s.n('export-btn').disabled, true); });
test('stale asynchronous evaluation never overwrites later edits', async () => { let finish; const deferred = new Promise(resolve => { finish = resolve; }); const s = setup({ evaluate: () => deferred }); await s.n('demo-btn').fire('click'); const pending = s.n('evaluate-btn').fire('click'); await s.n('dataset').fire('input'); finish({ models: [] }); await pending; assert.equal(s.n('export-btn').disabled, true); assert.equal(s.n('report').hidden, true); });
test('stale asynchronous file load does not overwrite manual input', async () => { let finish; const s = setup(); const buffer = new Promise(resolve => { finish = resolve; }); s.n('dataset-file').files = [{ name: 'sample.json', size: 2, arrayBuffer: () => buffer }]; const pending = s.n('dataset-file').fire('change'); s.n('dataset').value = 'manual'; await s.n('dataset').fire('input'); finish(new TextEncoder().encode('{}').buffer); await pending; assert.equal(s.n('dataset').value, 'manual'); });
test('invalid UTF-8, oversized files, and malformed JSON are rejected without raw payload', async () => { const s = setup(); s.n('dataset-file').files = [{ name: 'sample.json', size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer }]; await s.n('dataset-file').fire('change'); assert.equal(s.n('error').hidden, false); s.n('dataset-file').files = [{ name: 'sample.json', size: 1048577, arrayBuffer: async () => { throw new Error('must not read'); } }]; await s.n('dataset-file').fire('change'); assert(s.n('error').textContent.includes('1 MiB')); s.n('dataset').value = '{SYNTHETIC-SECRET'; await s.n('evaluate-btn').fire('click'); assert(!s.n('error').textContent.includes('SECRET')); assert.equal(s.n('export-btn').disabled, true); });
test('switching model updates detailed cases without recalculating scores', async () => { const s = setup(); await demo(s); s.n('model-select').value = 'synthetic-B'; await s.n('model-select').fire('change'); assert.equal(s.n('case-results').children.filter(n => n.className.includes('fail')).length, 4); });
