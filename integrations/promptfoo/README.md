# Promptfoo bridge / ส่วนต่อยอด Thai Eval

Run the **actual pinned Promptfoo 0.125.1** evaluator over saved answers **or a live OpenAI-compatible Chat Completions endpoint**. Compare prompt versions with Sandworm's canonical weighted scoring and import the API bundle into the existing offline Thai Eval Studio. API credentials stay in the Node.js worker. The default validation uses synthetic local fixtures and loopback HTTP only; it makes no paid model calls.

## Reproduce

Node.js >=22.22.0; verified with Node.js 24.22.1.

```sh
cd integrations/promptfoo
npm ci --no-audit --no-fund
npm test
npm run smoke
node bridge.cjs run fixtures/dataset.json fixtures/candidates.json report.local.json
```

`run` invokes Promptfoo's official Node API with the shipped saved-output provider and local JavaScript assertion. It sets the upstream telemetry/sharing/remote-generation flags before loading upstream, disables cache and sharing, and sets `writeLatestResults:false`. Promptfoo initializes a unique checkout-local `.runtime/promptfoo-*` directory for each invocation instead of using an existing user profile. The additional fetch guard blocks upstream fetch calls in saved-output mode; see the exact-version transport scope below. Use an OS/container egress policy for stronger isolation. Cleanup of the temporary profile is best effort; interrupted processes may leave a local-only directory. Because upstream configuration is process-global, `runSaved()` allows one evaluation per Node process; launch a new process for another evaluation. Concurrent processes use distinct profile directories.

Generate a portable-for-this-checkout Promptfoo configuration, or import an exported report produced by this bridge:

```sh
node bridge.cjs config fixtures/dataset.json fixtures/candidates.json config.local.json
node bridge.cjs import fixtures/dataset.json fixtures/promptfoo-export.json candidates.local.json
```

Config paths refer to the installed checkout's trusted `saved-provider.cjs` and `assertion.cjs`. Rebuild the config after moving the checkout. This adapter only imports the saved-output payload format it generates; it does not claim to accept arbitrary provider responses. For real API calls use the bounded `live.cjs` worker below; arbitrary Promptfoo YAML, remote prompts, scripts and arbitrary exported provider responses are not accepted. Candidate answers, expectations and citations are raw content in configuration/import files; treat them as private. The final Sandworm report omits raw answers and expected text but retains IDs.

## Scoring and regression evidence

Promptfoo's default case totals are unweighted. Sandworm recomputes its canonical weighted score using the original evaluator, preserving missing answers, citations, abstention, NFC and whitespace settings. The five-case synthetic smoke yields **6/10 unweighted passes**; Sandworm model scores are **100% and 10%**. These are fixtures, not model benchmarks.

`fixtures/promptfoo-export.json` is a minimized capture of an actual Promptfoo execution containing only importer-required fields and synthetic outputs. Tests reject duplicate results, unknown case IDs, malformed payloads, duplicate JSON keys and inputs larger than 1 MiB. On the verified Linux host, input files are opened with `O_NONBLOCK|O_NOFOLLOW` and must be regular files; FIFOs and symlink inputs fail without echoing their paths. `npm run validate` writes a SHA-256 manifest and records tests plus the upstream smoke.

ภาษาไทย: มีทั้งโหมดคำตอบที่บันทึกไว้และตัวรัน API จริง เปรียบเทียบ prompt หลายรุ่นโดยใช้เกณฑ์ชุดเดียวกัน หน้าเว็บนำเข้า bundle แล้วคำนวณคะแนนใหม่พร้อมแสดงจำนวนเรียก API, ข้อผิดพลาด, token และเวลารวม ชุดทดสอบใช้ mock HTTP ในเครื่อง ไม่ใช่คะแนนโมเดลจริง


## Live API runner and self-host

The plan separates **inputs sent to the model** from the evaluation dataset (expected answers stay local). Each variant has a stable ID and a complete system instruction. A run tests one model against up to 10 prompt versions. Use a separate run for another model. `responseFormat: "text"` grades plain text; `"sandworm-json"` requires model content `{"text":"…","citations":[],"abstained":false}`. The instruction must ask for that shape. No automatic repair, retries or LLM judge is used.

```sh
# From integrations/promptfoo, inspect the 4-request plan without connecting anywhere:
node live.cjs preflight fixtures/live-dataset.json fixtures/live-plan.json

# Set the full URL of YOUR chosen compatible endpoint, including /chat/completions.
export SANDWORM_MODEL_URL=http://127.0.0.1:8000/v1/chat/completions
# Set SANDWORM_MODEL_API_KEY using your shell/secret manager when authentication is required.
# Never put a key in the plan, URL, repository or browser.
node live.cjs run fixtures/live-dataset.json fixtures/live-plan.json run.local.json --allow-network
```

Replace `model` and prompts in your private plan before a real run. The URL is read only from the environment. Remote URLs require HTTPS; HTTP is allowed only for literal loopback/localhost. Redirects, URL userinfo, query strings and fragments are rejected. Custom headers, URL templates, tool calls and third-party Promptfoo plugins are not supported. Conventional `max_tokens` Chat Completions compatibility is required; providers using another request schema need a separate reviewed adapter.

The worker runs locally or on your VPS/container, including an endpoint you self-host. It does not require Promptfoo Cloud. The browser UI can be served separately as static files (`npm run serve` from the repo root). No permanent service or public listener is created by the worker.

Limits: 1 MiB plan/dataset/output; at most 200 HTTP requests per run; one request at a time; no retries; 128 KiB request/response body; 32,768 answer characters; 100–120,000 ms per-request timeout; at most 4,096 requested output tokens per call. `max_tokens` is a **requested provider limit, not a guaranteed token or dollar budget**. Input tokens and provider billing rules also affect charges. The preflight prints the requested output-token upper bound, with cost explicitly unknown. No model price or zero-cost claim is invented. Reported token usage is provider-supplied; missing/partial usage is marked incomplete. `durationMs` sums measured HTTP durations, not end-to-end evaluation time. Failed calls become missing answers, count as errors, and fail the original weighted cases without leaking HTTP bodies.

Output is reserved exclusively before a request, mode 0600, so existing output files and symlinks cannot be overwritten. It contains **raw answers and expected dataset text**: keep the bundle private. The run metadata omits the endpoint, key and system instructions, retaining prompt SHA-256 values and variant IDs. SHA-256 identifies bytes; it does not establish authorship or factual correctness.

## Import into Thai Eval Studio

1. Open the existing UI and select **นำเข้า Promptfoo bundle**.
2. The UI validates the bounded schema and recomputes every weighted score from included dataset/candidates under the selected normalization. It does not trust an imported score.
3. Compare prompt versions, API/error counts, input/output tokens and API time in the table. Details include prompt fingerprints and imported run metadata.
4. **ดาวน์โหลดผลเปรียบเทียบ API** exports the recalculated report plus run metadata, without raw answers or expected text. IDs/model names can still be sensitive. The normal report export preserves the original canonical report format.

Editing data/normalization invalidates both scores and API metadata. Import races cannot overwrite newer edits. Imported metadata is labelled unverified; this is not cryptographic attestation. `fixtures/live-bundle.json` was produced by actual Promptfoo plus four real loopback HTTP calls (scores 25% / 100%); latency and timestamp are normalized solely for a stable synthetic fixture.

## Pinned transport guard and telemetry finding

In installed Promptfoo **0.125.1**, `dist/src/telemetry-C04d25BM.cjs` calls `recordTelemetryDisabled()` even with `PROMPTFOO_DISABLE_TELEMETRY=1`; that method sends a feature event to `r.promptfoo.app`. Disabling PostHog/telemetry alone therefore did not eliminate fetch attempts in our smoke.

`fetch-guard.cjs` is installed **before importing Promptfoo**. It rejects all global `fetch` calls except an exact selected endpoint with POST and `redirect: "error"`; saved-output mode allows none. The pinned upstream telemetry transport uses that global-fetch path. Live smoke asserts four allowed loopback requests and at least one blocked upstream event before transport. This is a tested guard for this dependency version, **not a process firewall**: it does not constrain direct sockets or arbitrary malicious dependencies. Keep the package lock and use OS/container egress controls for a stronger boundary. It intentionally remains installed until the one-evaluation worker exits; do not embed this runner in a shared application process.

Validation:

```sh
npm run validate             # unit tests + saved-output smoke + actual loopback API smoke
npm run smoke:api            # no external model, key or paid account required
```

Official API references checked 2026-11-11: [Node package](https://www.promptfoo.dev/docs/usage/node-package/), [custom JavaScript provider](https://www.promptfoo.dev/docs/providers/custom-api/). The implementation uses the documented `evaluate()` / `toEvaluateSummary()` contract and a bounded custom provider object. No authenticated commercial provider was tested. Browser interaction is covered by controller tests; the new UI was not visually browser-tested in this environment.

## Attribution

Original bridge code: repository MIT license. [Promptfoo](https://github.com/promptfoo/promptfoo) is MIT licensed; the dependency and its notices are installed from npm rather than copied into this repository. Exact dependency resolution is in `package-lock.json`. No upstream branding or hosted-service/enterprise entitlement is claimed.
