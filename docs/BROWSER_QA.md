# Browser observations

Date: 2026-11-11 (Asia/Bangkok). Version: 0.1.0.

Chrome over local HTTP: the synthetic example was loaded, processing completed, and the displayed results were checked against the test fixture. A report was downloaded through the UI and parsed as valid JSON. Where present, export was disabled until the review checkbox was selected. The bundled fonts, theme, panels and result layout were visually inspected. The [project cover](cover.svg) is an illustration, not browser evidence. QA screenshots are retained in the owner-private source checkout and omitted from the public repository. All browser examples used fabricated data.

This is not a complete browser matrix or a test of production server enforcement. Direct file:// launch and physical mobile devices were not verified. Automated tests and exact source hashes are recorded separately in [validation.json](../reports/validation.json).

## Promptfoo API integration update — 2026-11-11

The observations above apply to the earlier 0.1.0 UI, not the newly added Promptfoo import panel. The managed browser runtime was unavailable for this update; no visual/browser claim is made for the new panel. Controller tests cover actual bundle import and score recomputation, per-version metrics, private-answer-free comparison export, invalid files, reset and stale asynchronous imports. Static CSP/asset checks also pass. API transport smoke is a real loopback HTTP fixture, not a hosted provider benchmark.
