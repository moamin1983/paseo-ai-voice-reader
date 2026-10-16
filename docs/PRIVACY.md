# Privacy and data flow

## What the plugin reads

The plugin observes the host's active agent directory, workspace directory and compatible agent timelines. It uses assistant text, optional provider-published reasoning and optional sent-message text. Tool-call, error, notification and plugin timeline rows are not narrated.

Automatic speech is off after load or reload. Enabling the master setting does not arm every client. Exposed reasoning and sent-message narration default to off. Hidden model reasoning is never available to this plugin.

## Where narration goes

| Backend | Processing | Network behavior |
| --- | --- | --- |
| Kokoro | Local CPU inference in a supervised worker on the daemon machine | No inference network calls; dependencies and weights must first be prepared separately |
| Edge Neural | Microsoft's TTS service through `edge-tts` | Selected readable narration text leaves the daemon and is sent to Microsoft |

Generated audio is returned to the connected Paseo client through the plugin RPC and played with `client.playAudio()`. With a remote daemon, text is processed on that host and audio is transported to the client through Paseo.

The plugin does not silently switch backends. Edge requires explicit general cloud consent. Sending exposed reasoning or code/sensitive content to Edge requires additional consent. Consent is enforced on the server before synthesis, not only in the interface.

## Filtering and storage

Defaults exclude code blocks, inline code, raw JSON, common log/stack-trace lines and known secret patterns. These filters are best-effort. They cannot detect arbitrary private information, every programming language, or every possible secret. Choose Kokoro for confidential content.

Production narration and audio remain in memory and private stdio pipes. The plugin does not write transcripts or narration audio to disk, put narration into process arguments, or log request text/vendor error bodies. Host-scoped settings are persisted by Paseo's official plugin settings API. Range selections, exclusions and queue state are held in client memory.

Paseo and agent providers have their own storage and privacy behavior, independent of this plugin.

## Setup and tests

`./scripts/setup-tts.sh` is an explicit manual action. It creates a plugin-local Python environment and downloads locked packages from PyPI using artifact hashes. Activation and backend checks do not install software. Model weights are obtained separately and are not included in this repository.

Unit and UI tests use synthetic fixtures. Optional synthesis tests use public canned sentences and save generated audio under the ignored `evidence/` directory. The Edge test runs only with `RUN_EDGE_TTS=1`. Optional native checks operate only on the agent ID supplied by the person running the check; transcript text stays in memory and is not sent to TTS by timeline checks.
