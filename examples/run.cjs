'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('../dist/engine.js');
(async () => {
  const dataset = fs.readFileSync(path.join(__dirname, 'dataset.json'), 'utf8');
  const candidates = fs.readFileSync(path.join(__dirname, 'candidates.json'), 'utf8');
  process.stdout.write(JSON.stringify(await evaluate(dataset, candidates), null, 2) + '\n');
})().catch(() => { process.stderr.write('Example evaluation failed.\n'); process.exitCode = 1; });
