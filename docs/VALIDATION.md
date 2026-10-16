# Validation

Checked on **2026-10-16** with Node.js **22.22.1**, npm **8.6.0**, Python **3.14.4**, and the installed Paseo **0.11.4** SDK. This is a local verification summary; the included GitHub Actions template is inactive and has not run on GitHub.

| Check | Result |
| --- | --- |
| TypeScript against the installed SDK | Pass |
| Unit, runtime, schema, queue and native-host UI suite | 61 passed, 0 failed |
| Prior publication clean checkout | Fresh `npm ci --ignore-scripts`, typecheck, the then-current 57 tests, bundle checks and package dry run passed without pre-existing evidence files |
| Client/server bundle boundaries | Pass; no private host imports or client Node APIs |
| Native UI audit | Pass; React Native primitives, no DOM/audio elements |
| Python dependency lock | All 15 transitive packages pinned with PyPI artifact SHA-256 digests; pip hash-enforced resolver dry run passed |
| Real local Kokoro synthesis | Pass; public canned text produced a complete 101,322-byte WAV |
| Offline inference boundary | Pass; synthesis succeeded with socket connection, send and DNS entrypoints denied; zero observed network attempts |
| Edge integration in this preparation | Skipped intentionally; no new cloud request |
| Public files | CVs, local settings, credentials, model weights, generated audio, evidence and development dependencies excluded from Git |

## Appearance update

The current 61-test suite includes live transformer removal/re-registration, settings conflict handling, queue preservation during appearance changes, compact/expanded plans, distinct user/assistant/thinking roles and single-row actions in light/dark and compact/wide layouts. Decorative divider removal preserves fenced source and list items.

The plugin was reloaded once to load the implementation; this does not restart an agent. Subsequent show/hide and expand/shrink actions use settings and live registrations without plugin reload or agent lifecycle operations. Native settings and timeline metadata confirm that the original UI choice is active, compact mode is enabled, saved audio settings are unchanged, and retained user and assistant rows remain readable. The user confirmed that normal Paseo messages are visible again with the message voice UI off. The optional enhanced view was exercised through host-stub tests; its final desktop appearance has not been captured by automation.

## Native desktop evidence

During earlier development, the plugin was reloaded successfully in the installed desktop daemon. The user confirmed the header/composer controls and audible playback of all three public Kokoro test sentences. Native timeline checks exercised the Codex test conversation, reconciled projected rows and emitted no speech for a duplicated page. The publication preparation reloaded the existing plugin successfully, resolved 38 source rows in its scoped native check, and verified that saved offline settings stayed unchanged. No timeline content was sent to TTS or written to disk by that check.

Those are distinct from automated UI tests. Host-stub rendering validates behavior in light/dark and compact/wide configurations, not pixel-exact appearance. Audible live automatic narration, the revised interface's visual acceptance, and manual range/pause/skip behavior still need final client acceptance. Live Claude/OpenCode sessions were not launched; their compatible event schemas are tested.

## Dependency audit

The production-only npm audit reports **0 vulnerabilities**. The project declares no separately installed production npm dependencies: runtime host modules are supplied by Paseo.

The complete development tree reports **20 affected entries: 15 high and 5 moderate**, within React Native/Metro/Jest-related transitive development dependencies. This is not a clean whole-tree security audit. Host-aligned SDK/React Native versions were retained rather than applying forced, potentially incompatible upgrades. Review the development findings before a general release, and run `npm audit` in your own environment for current details. Paseo's own host dependency security is outside this repository-only audit.

## Reproduce

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build:check
npm pack --dry-run --ignore-scripts
```

Optional synthesis checks are documented in the README. They require separately prepared Python packages and model files. Generated local receipts are stored under ignored `evidence/`; private transcripts are not part of the public evidence.
