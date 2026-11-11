# Threat model

Thai Eval Studio processes untrusted user-selected text in the current page. Its trust boundary ends at the user's browser and operating system.

## Controls

- The static browser UI makes no model/API/network calls, telemetry, cookies, browser persistence, or automatic URL opening. The optional worker is a separate trust boundary described below.
- CSP blocks connections, forms, remote scripts, and object embeds. Local fonts are embedded data URLs. Loading a hosted page still retrieves static assets from its host.
- Dynamic UI uses text nodes and `textContent`; candidate content is never interpreted as HTML or executable code.
- JSON byte, depth, case/model count, identifier, list, weight, and string limits bound the work. Duplicate decoded JSON members and unknown properties are rejected.
- Stable error messages do not include malformed source content, filenames, or original exception causes.
- Every data/configuration edit invalidates the report. Revision checks discard stale asynchronous file reads and evaluations.
- Exported reports omit raw answers and expected phrases. They retain user-defined IDs and hashes; these are not guaranteed anonymous.

## Limits

A malicious browser extension, compromised host serving a modified app, or compromised machine can still read data. CSP and local processing do not protect against these actors. JavaScript engine/Unicode behavior is inherited from the runtime. A 1 MiB maximum is a resource bound, not a guarantee of identical response time on all devices.

Citations and abstention are caller-supplied metadata. A matching citation ID says nothing about whether that source exists or supports the answer. Exact/phrase matching can be gamed and is not a semantic quality or truthfulness assessment. This is an evaluation aid, not a model safety certification.

SHA-256 binds the report to exact inputs; it is not a signature or trust score. Input hashes may permit guessing low-entropy input content. Keep private fixtures and identifiers private when appropriate.

The **download dataset** action intentionally exports the original expected text. The **download report** action exports only the evaluation record described above. Downloads and the browser's normal file history are controlled by the user and browser.

## Optional Promptfoo worker boundary

`integrations/promptfoo/live.cjs` intentionally sends the selected plan's instructions and inputs to the endpoint in `SANDWORM_MODEL_URL` after `--allow-network`. API keys are environment-only. HTTPS is required except explicit loopback HTTP; redirects and credential/query-bearing URLs are rejected. Calls are serial, with no retry, finite counts/timeouts and bounded request/response sizes. Expected assertions remain local. Provider errors are collapsed into safe codes/missing outputs. Output files are exclusive mode 0600.

Bundles contain raw model answers and dataset expectations; treat them as private. Browser import recomputes scores and labels run metadata as unverified. Comparison exports omit raw answers, retain prompt hashes and user IDs/model names, and do not establish authenticity. A requested output-token limit is not a guaranteed monetary cap.

Pinned Promptfoo 0.125.1 still attempts a telemetry-disabled feature event. A guard installed before its import blocks that global-fetch transport and allows only the explicitly selected model endpoint, POST and non-redirecting requests. Saved-output runs allow no fetch. This is not an OS firewall or a boundary against arbitrary malicious dependencies/direct sockets. Use a locked dependency tree and container/network egress policy for stronger isolation. Each evaluation gets a private temporary profile; cleanup is best effort after process interruption. No existing user Promptfoo profile is intentionally loaded.
