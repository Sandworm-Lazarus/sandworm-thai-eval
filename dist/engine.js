(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ThaiEval = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ bytes: 1048576, cases: 200, models: 10, text: 32768, depth: 32 });
  const messages = Object.freeze({ INPUT: 'Input must be bounded JSON text.', JSON: 'Invalid JSON input.', SCHEMA: 'Input does not match the documented schema.', ID: 'Invalid or duplicate identifier.', OUTPUT: 'Output references an unknown or duplicate case.', OPTIONS: 'Invalid normalization options.', HASH: 'SHA-256 is unavailable in this browser context.' });
  class EvalError extends Error { constructor(code) { super(messages[code] || messages.SCHEMA); this.name = 'EvalError'; this.code = code; } }
  const fail = code => { throw new EvalError(code); };
  const bytes = value => new TextEncoder().encode(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fields = (value, allowed, required) => {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !own(value, key))) fail('SCHEMA');
  };
  const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) fail('ID'); return value; };
  const text = value => { if (typeof value !== 'string' || value.length > LIMITS.text) fail('SCHEMA'); return value; };
  const stringList = (value, identifiers = false) => {
    if (!Array.isArray(value) || value.length > 50 || value.some(s => typeof s !== 'string' || !s.trim().length || s.length > 512) || new Set(value).size !== value.length) fail('SCHEMA');
    if (identifiers) value.forEach(id);
  };
  function parse(raw) {
    if (typeof raw !== 'string' || bytes(raw).length > LIMITS.bytes) fail('INPUT');
    // Bound nesting before native parsing, ignoring braces inside JSON strings.
    let depth = 0, quoted = false, escaped = false;
    for (const ch of raw) {
      if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
      else if (ch === '"') quoted = true;
      else if (ch === '{' || ch === '[') { if (++depth > LIMITS.depth) fail('INPUT'); }
      else if (ch === '}' || ch === ']') depth--;
    }
    let value;
    try { value = JSON.parse(raw); } catch (_) { fail('JSON'); }
    // Native parsing validates syntax; this pass rejects ambiguous duplicate object members.
    const stack = [];
    for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)) {
      const token = match[0], top = stack[stack.length - 1];
      if (token === '{') stack.push({ keys: new Set(), key: true });
      else if (token === '[') stack.push({ array: true });
      else if (token === '}' || token === ']') stack.pop();
      else if (token === ',' && top && !top.array) top.key = true;
      else if (token[0] === '"' && top && !top.array && top.key) {
        const key = JSON.parse(token); if (top.keys.has(key)) fail('JSON');
        top.keys.add(key); top.key = false;
      }
    }
    return value;
  }
  function validateDataset(value) {
    fields(value, ['schemaVersion', 'datasetId', 'cases'], ['schemaVersion', 'datasetId', 'cases']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.cases) || !value.cases.length || value.cases.length > LIMITS.cases) fail('SCHEMA');
    id(value.datasetId);
    const ids = new Set();
    for (const c of value.cases) {
      fields(c, ['id', 'weight', 'assertions'], ['id', 'weight', 'assertions']);
      id(c.id); if (ids.has(c.id)) fail('ID'); ids.add(c.id);
      if (!Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 1000) fail('SCHEMA');
      const a = c.assertions;
      fields(a, ['exact', 'contains', 'notContains', 'json', 'citations', 'abstain'], []);
      if (!Object.keys(a).length) fail('SCHEMA');
      if (own(a, 'exact')) text(a.exact);
      for (const field of ['contains', 'notContains']) if (own(a, field)) { stringList(a[field]); if (!a[field].length) fail('SCHEMA'); }
      if (own(a, 'json')) { fields(a.json, ['requiredKeys'], ['requiredKeys']); stringList(a.json.requiredKeys); }
      if (own(a, 'citations')) stringList(a.citations, true);
      if (own(a, 'abstain') && typeof a.abstain !== 'boolean') fail('SCHEMA');
    }
    return value;
  }
  function validateCandidates(value, dataset) {
    fields(value, ['schemaVersion', 'models'], ['schemaVersion', 'models']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.models) || !value.models.length || value.models.length > LIMITS.models) fail('SCHEMA');
    const ids = new Set(), cases = new Set(dataset.cases.map(c => c.id));
    for (const model of value.models) {
      fields(model, ['id', 'outputs'], ['id', 'outputs']); id(model.id);
      if (ids.has(model.id)) fail('ID'); ids.add(model.id);
      if (!Array.isArray(model.outputs) || model.outputs.length > LIMITS.cases) fail('SCHEMA');
      const outputIds = new Set();
      for (const o of model.outputs) {
        fields(o, ['caseId', 'text', 'citations', 'abstained'], ['caseId', 'text']); id(o.caseId); text(o.text);
        if (!cases.has(o.caseId) || outputIds.has(o.caseId)) fail('OUTPUT'); outputIds.add(o.caseId);
        if (own(o, 'citations')) stringList(o.citations, true);
        if (own(o, 'abstained') && typeof o.abstained !== 'boolean') fail('SCHEMA');
      }
    }
    return value;
  }
  function options(value) {
    if (value === undefined) return { nfc: true, whitespace: true };
    if (!object(value) || Object.keys(value).some(k => !['nfc', 'whitespace'].includes(k)) || Object.values(value).some(v => typeof v !== 'boolean')) fail('OPTIONS');
    return { nfc: value.nfc ?? true, whitespace: value.whitespace ?? true };
  }
  function normalize(value, config) {
    let result = value;
    if (config.nfc) result = result.normalize('NFC');
    if (config.whitespace) result = result.replace(/\s+/gu, ' ').trim();
    return result;
  }
  function checkCase(c, output, config) {
    if (!output) return { caseId: c.id, weight: c.weight, passed: false, missing: true, checks: [{ rule: 'output', passed: false, reason: 'missing_output' }] };
    const a = c.assertions, actual = normalize(output.text, config), checks = [];
    const check = (rule, passed, reason) => checks.push({ rule, passed, reason: passed ? 'matched' : reason });
    if (own(a, 'exact')) check('exact', actual === normalize(a.exact, config), 'text_mismatch');
    if (own(a, 'contains')) check('contains', a.contains.every(s => actual.includes(normalize(s, config))), 'required_phrase_missing');
    if (own(a, 'notContains')) check('notContains', a.notContains.every(s => !actual.includes(normalize(s, config))), 'forbidden_phrase_present');
    if (own(a, 'json')) {
      let parsed, valid = true;
      try { parsed = parse(output.text); } catch (_) { valid = false; }
      check('json', valid && object(parsed) && a.json.requiredKeys.every(k => own(parsed, k)), 'json_object_or_key_mismatch');
    }
    if (own(a, 'citations')) {
      const actualCitations = output.citations || [];
      check('citations', actualCitations.length === a.citations.length && a.citations.every(s => actualCitations.includes(s)), 'citation_set_mismatch');
    }
    if (own(a, 'abstain')) check('abstain', own(output, 'abstained') && output.abstained === a.abstain, 'abstention_flag_mismatch');
    return { caseId: c.id, weight: c.weight, passed: checks.every(c => c.passed), missing: false, checks };
  }
  function evaluateObjects(dataset, candidates, config) {
    config = options(config); validateDataset(dataset); validateCandidates(candidates, dataset);
    const totalWeight = dataset.cases.reduce((sum, c) => sum + c.weight, 0);
    const models = candidates.models.map(model => {
      const outputs = new Map(model.outputs.map(o => [o.caseId, o]));
      const cases = dataset.cases.map(c => checkCase(c, outputs.get(c.id), config));
      const passedWeight = cases.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
      return { modelId: model.id, totalCases: cases.length, passedCases: cases.filter(c => c.passed).length, missingCases: cases.filter(c => c.missing).length, passedWeight, totalWeight, score: passedWeight / totalWeight * 100, cases };
    });
    return { tool: 'sandworm-thai-eval', toolVersion: '0.1.0', schemaVersion: 1, datasetId: dataset.datasetId, normalization: config, scoring: 'All assertions per case must pass. Missing outputs fail. Weighted score = passed weight / total dataset weight × 100.', models };
  }
  async function sha256(raw) {
    const crypto = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
    if (crypto) return Array.from(new Uint8Array(await crypto.digest('SHA-256', bytes(raw))), n => n.toString(16).padStart(2, '0')).join('');
    if (typeof module === 'object' && module.exports && typeof require === 'function') return require('node:crypto').createHash('sha256').update(raw, 'utf8').digest('hex');
    fail('HASH');
  }
  async function evaluate(datasetText, candidatesText, config) {
    const report = evaluateObjects(parse(datasetText), parse(candidatesText), config);
    report.provenance = { algorithm: 'SHA-256', hashScope: 'Exact UTF-8 input strings; formatting changes the digest.', datasetSha256: await sha256(datasetText), candidatesSha256: await sha256(candidatesText) };
    return report;
  }
  return Object.freeze({ LIMITS, EvalError, parse, normalize, evaluateObjects, evaluate, sha256 });
}));
