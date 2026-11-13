# Experiment Workbench

Compare multiple models, prompt versions and repeated evaluations on the **same exact dataset bytes**. The additive worker uses the installed pinned Promptfoo evaluator. The original saved-output and single-model workers remain available.

## Run on your worker host

Node.js >=22.22.0 and the integration dependencies are required. Install on a dedicated worker host; the browser never needs an API key.

```sh
cd integrations/promptfoo
npm ci
node experiment.cjs preflight your-dataset.json your-plan.json
# Set SANDWORM_MODEL_URL and optionally SANDWORM_MODEL_API_KEY in your environment.
node experiment.cjs run your-dataset.json your-plan.json experiment.local.json --allow-network
```

Use [the plan example](../integrations/promptfoo/fixtures/experiment-plan.json) as a schema template, replacing its model names and inputs. Every dataset case needs exactly one input with the same case ID. Evaluation expectations stay local and are never sent to the provider. Inputs and system instructions are sent to the one selected endpoint. Different model IDs must be served by that same endpoint. A different endpoint requires a separate worker run. Keys and endpoints cannot be configured in a plan.

The matrix is **models × prompt versions × repeats × dataset cases**. Maximum 10 models, 10 prompt versions, 10 repeats, 100 dataset evaluations and **200 actual HTTP requests overall**, bounded by the smaller explicit maxCalls. No retries or automatic repairs occur. Calls are sequential, each with a 100–120,000 ms timeout. There is no dollar cap. maxOutputTokens is a requested provider limit, not proof of actual billing. Preflight checks the whole matrix before loading Promptfoo or making any network request.

Endpoint restrictions, bounded JSON bodies, env-only credentials, no redirects, telemetry/sharing flags and the pinned global-fetch transport guard follow the original worker. This guard is not an OS firewall; run the worker with an appropriate host egress policy.

## Prices and missing information

The worker records provider-supplied prompt_tokens/completion_tokens only when both are valid. Missing usage stays null.

Cost policy has two explicit paths:

- Leave providerUsageCostUsd false unless your chosen endpoint documents **usage.cost as a total USD amount for that individual response**. If enabled, a finite nonnegative usage.cost is recorded as provider-reported. No other response field or currency is guessed.
- Optional rates entries provide model, inputUsdPerMillion, outputUsdPerMillion, date (YYYY-MM-DD), and source (1–256 characters). These are **user-supplied dated estimates**, not automatically verified prices. A model's rate is used only when complete token usage is available and no opted-in provider cost is available.

No price or usage means unknown cost, never free. Zero is an explicitly supplied known price. Rate calculation does not account for cached/batch/reasoning/tool/image/audio charges, tax or subscriptions. Failed HTTP requests can still incur charges; cost is unknown unless valid usage/cost was received. An invalid answer with valid usage retains that recorded usage and cost. The UI shows known subtotal and priced-call coverage, and only shows a total when every attempt has a cost.

## Offline comparison

Open the existing Thai Eval Studio and find **EXPERIMENT WORKBENCH**. Import up to ten reports, each <=1 MiB. Import is atomic: incompatible dataset hashes, duplicate experiment/evaluation/attempt IDs, truncated evaluation attempt sets and mismatched relationships reject the batch without replacing the previous view. A revised prompt with the same variant ID remains a separate group because the prompt SHA-256 differs.

Each HTTP request is an attempt. A dataset evaluation is one model × prompt × repeat. Scores are calculated with the existing canonical engine (NFC + whitespace normalization enabled); all assertions per case must pass, missing/error answers fail and retain their weight in the denominator.

For comparison, the UI averages **only evaluations whose API calls all succeeded**, and shows complete-evaluation coverage beside it. Raw scores for failed evaluations remain in the JSON. Review error rate and coverage alongside quality: excluding incomplete evaluations can introduce selection bias. These are descriptive means/ranges, not statistical significance or a public leaderboard.

Importing content-free reports cannot independently recompute their original scores. Imported scores, hashes and price metadata are **unverified sender claims**. SHA-256 is not a signature. The worker generated scores from its local raw outputs; the browser displays the reported metrics without pretending to regrade answers that the report intentionally omits.

## Shared report contract

kind = sandworm-experiment/v1; schemaVersion = 1.

Top level: experimentId, createdAt (canonical ISO UTC), datasetId, datasetSha256, planSha256, normalization {nfc:true,whitespace:true}, attempts, evaluations.

Each attempt: id, evaluationId, caseId, model, variantId, promptSha256, repeat, nullable input_tokens/output_tokens, latency_ms, status (success/error), nullable cost_usd, cost_source (unknown/provider-reported/user-rate), nullable rate_date/rate_source, score:null.

Each evaluation: id, model, variantId, promptSha256, repeat, score (0–100), expectedAttempts, completedAttempts. expectedAttempts is the dataset case count; completedAttempts is the count of successful linked attempts. Every evaluation must contain each case exactly once. All evaluations in the report must have the same case-ID set. Reports preserve no raw answers, expected phrases, instructions, endpoint or credentials. IDs, model names and rate sources remain visible: review them before sharing.

Reports can be imported into the matching AI Run Ledger experiment workspace. Keep the exact same dataset bytes when pooling runs. Stable run-specific UUID prefixes avoid collisions; aliases from unrelated exporters must not be merged blindly.

[The synthetic report](../examples/experiment.synthetic.json) has invented scores, labels and placeholder hash values solely to demonstrate the schema. It is not a measured model result and its hashes do not identify a real dataset.

## Validation and limits

Meaningful report and worker tests cover matrix caps, cost provenance/unknowns, duplicate or truncated attempts, incomplete quality coverage, unsafe metadata, and content-safe failures. experiment-smoke.cjs uses real pinned Promptfoo and a loopback HTTP server with two synthetic models × two prompts × two repeats × two weighted cases (16 requests). No authenticated or paid model API is used.

```sh
npm run check
npm test --prefix integrations/promptfoo
node integrations/promptfoo/experiment-smoke.cjs
```

These commands are configured in the new hosted experiment workflow. Hosted checks are pending execution; this change does not claim a passing npm suite, a commercial-provider run, or visual browser QA. The pure report schema/aggregation has a small isolated V8 check, which is separate from the Node.js test suite.
