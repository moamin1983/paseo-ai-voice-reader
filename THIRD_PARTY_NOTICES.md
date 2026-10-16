# Third-party software and models

GNU GPL version 2 only applies to the original project code identified by its source notices. It does not change the licenses of independent dependencies, the Paseo host, or separately obtained models.

- Paseo supplies `@getpaseo/plugin`, React, React Native, Zod and the other documented host modules at runtime. Development copies are pinned through `package-lock.json`; their upstream notices remain applicable.
- The Python speech environment is installed separately from the hash-locked requirements. `edge-tts` is distributed under LGPLv3; see its upstream package license. `sherpa-onnx` and all transitive packages retain their own upstream licenses and installed notices.
- The repository contains no third-party model weights. Review the license of the exact Kokoro model and voice data you obtain before using or redistributing them.
- Paseo and referenced product or company names belong to their respective owners. No endorsement or affiliation is implied.

Project-specific banner artwork is included with the project under its license. The design-preview image uses synthetic, public sample text.
