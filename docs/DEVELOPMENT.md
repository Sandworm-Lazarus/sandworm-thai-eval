# Development record

## 0.1.0 — 2026-11-11

Implemented an original browser-local Thai evaluation workspace with a no-dependency Node-compatible engine. The interface follows the Sandworm navy/coral theme and bundles the font licenses. The synthetic corpus covers Thai phrase checking, exact matching, structured JSON, citation metadata, and abstention metadata.

Scoring deliberately uses one full dataset denominator for every model. Missing answers fail; duplicate/unknown IDs and unsupported assertions reject the input. Combining assertions is an AND, with no hidden partial credit. This makes the baseline reproducible and avoids making the small fixture appear to rank real models.

Reports include exact UTF-8 input SHA-256 digests, settings, weights, totals, and case reasons. Original answer/expected text is omitted. Report invalidation and asynchronous revision guards prevent exporting stale results after edits or file imports.

## Local validation

Node.js 24.22.1: **40 tests passed** via `npm test` (33 engine tests and 7 controller tests). Controller tests use a minimal DOM harness; they test state and engine integration, not browser rendering.

Covered: Thai text, NFC and whitespace toggles, weighted denominator, missing/duplicate/unknown IDs, malformed/duplicate-key JSON, JSON own keys, citation set equality, abstention flags, bounds, sanitized errors, deterministic hashes, report omission of source text, model selection, export, invalidation, and asynchronous races.

`node examples/run.cjs` reproduces `examples/expected-report.json`, including file hashes. `npm run check` runs the shared verification runner and writes `reports/validation.json` with source/fixture SHA-256 records. See that generated record for the actual check result.

Browser render/responsive observations, when performed by the release workflow, are distinct from these harness tests. This document does not claim hosted CI, real-model accuracy, physical-device compatibility, or an offline network-disabled browser test.

## Structure

- `dist/engine.js`: strict schema validation, bounded JSON parser wrapper, deterministic assertions and scoring, SHA-256 report binding.
- `dist/app.js`: imports, invalidation, evaluation, safe rendering, report/fixture downloads.
- `dist/examples.js`: clearly labeled synthetic browser fixture.
- `examples/`: matching standalone JSON fixtures and reproducible Node runner.
- `tests/`: behavioral engine and controller tests.

Keep new metrics explicit and version the schema before changing score semantics. Never execute submitted code inside this browser process. Real-model studies need separately collected outputs, model/configuration provenance, and representative held-out cases; the bundled fixture is not that study.

## 2026-11-11 — Promptfoo live API + UI import

Added an explicit opt-in Chat Completions worker, separate question/prompt plan, bounded requests and private bundle output. Promptfoo remains the actual evaluator; the existing engine recomputes canonical weighted scores. Added offline UI import, prompt metrics and comparison export. A pinned upstream telemetry-disabled feature event was observed and is blocked before transport by an exact-endpoint fetch guard. Added request/response and output safety regressions plus actual loopback HTTP smoke. See the integration README and validation receipts for test scope; visual QA of the new panel remains unavailable.
