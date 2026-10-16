# Changelog

## Unreleased

- Restore the original Paseo message UI by default, with a persistent show/hide button at the top of Reading plan. Toggling needs no agent restart or conversation reload.
- Compact Reading plan with expand/shrink controls and clearer user, assistant and exposed-thinking roles in the optional view.
- Single-row Start reading, Stop, Exclude and Preview actions, with range controls inside Preview.
- Omit decorative divider lines from plugin text and speech while preserving stored messages and fenced source.
- Keep appearance changes separate from audio settings so playback and queued sentences are preserved.

## 1.0.0

Initial source release preparation.

- Native Paseo header reading plan, composer voice control and inline text-message actions.
- Incremental assistant narration and optional exposed-thinking/sent-message narration.
- Shared start/end ranges, full spoken previews and sentence highlighting.
- Serial client playback with Pause, Resume, Stop, Skip and Replay.
- Edge Neural cloud speech and configurable local Kokoro CPU inference.
- Official persisted settings, explicit cloud consent and content filtering.
- Canonical/projected timeline reconciliation, duplicate suppression and reconnect/cancellation handling.
- Portable first-install configuration, hash-verified Python setup and automated verification.
