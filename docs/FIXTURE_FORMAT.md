# Fixture format v1

Only the documented properties are accepted. JSON object members must be unique after escape decoding. UTF-8 inputs are limited to 1 MiB each and 32 nesting levels. The `evaluate()` API takes JSON **strings**, not file paths.

## Dataset

```json
{
  "schemaVersion": 1,
  "datasetId": "thai-demo-v1",
  "cases": [
    {
      "id": "city",
      "weight": 2,
      "assertions": {
        "contains": ["กรุงเทพมหานคร"],
        "notContains": ["เชียงใหม่"],
        "citations": ["city-guide-01"],
        "abstain": false
      }
    }
  ]
}
```

Required properties: `schemaVersion`, `datasetId`, `cases`; each case requires `id`, `weight`, `assertions`. There must be 1–200 cases and each case must have at least one assertion. Case IDs must be unique. Weight is a finite number `0 < weight <= 1000`; fractional weights are allowed.

Optional assertions may be combined. All must pass:

| Property | Type and meaning |
| --- | --- |
| `exact` | String, up to 32,768 code units; an empty expectation is allowed |
| `contains` | Nonempty array of nonblank required substrings |
| `notContains` | Nonempty array of nonblank forbidden substrings |
| `json` | Object containing only `requiredKeys`, an array of own top-level key names; empty list means any valid JSON object |
| `citations` | Array of unique IDs; exact set equality, order-independent; `[]` requires no citations |
| `abstain` | Boolean; requires an explicit `abstained` boolean in the candidate output |

Lists permit up to 50 unique strings of at most 512 code units. Citation IDs additionally follow the ID rules below. JSON assertions check the raw answer string, never markdown code-fence extraction. A syntax error, duplicate member, array, scalar, or missing key fails that rule. Key types, nested paths, semantic correctness, and JSON Schema are outside this schema-lite check.

## Candidate outputs

```json
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "candidate-01",
      "outputs": [
        {
          "caseId": "city",
          "text": "เมืองหลวงคือกรุงเทพมหานคร",
          "citations": ["city-guide-01"],
          "abstained": false
        }
      ]
    }
  ]
}
```

Required properties: `schemaVersion`, `models`; each model requires `id`, `outputs`; each output requires `caseId`, `text`. There must be 1–10 model sets with unique IDs. Each output text is at most 32,768 UTF-16 code units. Optional `citations` and `abstained` are metadata supplied by the caller, not inferred by the evaluator. Missing `citations` behaves as `[]`; missing `abstained` fails an abstention assertion even if its expectation is `false`.

Unknown case IDs and repeated outputs for one case reject the entire input. A model with `outputs: []` is accepted and earns 0: every case is missing. Missing outputs do not disappear from the denominator.

All dataset, case, model, and citation IDs use `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. Use opaque IDs, not personal identifiers.

## Normalization and report

Options default to `{ "nfc": true, "whitespace": true }`.

- NFC uses JavaScript `String.normalize('NFC')` for text assertions only.
- Whitespace normalization replaces Unicode `\s` runs with one ASCII space and trims both ends.
- No case folding, Thai word segmentation, stemming, translation, punctuation removal, or semantic judgment.
- JSON keys and citation metadata are not normalized.

The JSON report includes per-model totals and per-case rule reasons, but omits all raw/expected answer text. `datasetSha256` and `candidatesSha256` hash the exact UTF-8 source strings, including whitespace and trailing newlines. They identify bytes; they do not certify authorship, correctness, or trust. Normalization settings are included separately, so an identical input hash with different settings can legitimately produce different scores.
