# Architecture and limitations

## Data flow

```text
Provider-published Paseo timeline
            |
            v
Owned timeline subscription + paged reconciliation
            |
            v
Kind filters -> source-offset sentence boundaries -> content sanitization
            |
            v
One AudioQueue per connected plugin client
            |
            v
Validated synthesis RPC -> server policy -> supervised Python stdio worker
            |                                  |
            |                           Edge cloud or local Kokoro
            v
client.playAudio() -> the connected Paseo client
```

The server registers official persistent settings and `agent.turn_started` / `agent.turn_ended` hooks. Hooks retain bounded, content-free turn revisions and outcomes. They never read an entire earlier snapshot aloud on completion. Each client owns its automatic-playback arm, chosen target and serial queue.

## Streaming identity and recovery

`TimelineReader` accepts canonical chunks and projected snapshots. Message identity uses the agent, epoch and source sequence. Projected rows keep a stable `seqStart` while their text and `seqEnd` grow. Consumed source offsets prevent repetition as filters change the text that is actually spoken.

Initial history is consumed silently. Duplicate pages do not requeue content. Canceled tails are consumed without speech, replacement epochs invalidate selections, and rewritten projected text removes pending agent audio without replaying the replacement. Reconnect fetches after the saved cursor; stale cursors or gaps cause a visible rebase.

## Native UI

The official transformer API replaces assistant, user-message and exposed-reasoning text rows with plugin-rendered React Native rows. It does not expose an additive action slot inside the built-in message renderer. Full source text remains selectable; the plugin does not reproduce every built-in Markdown style. Tools and other timeline types retain their host renderers.

The transformer has no source-sequence field. Inline actions therefore resolve an unambiguous source match using kind, accumulated text, optional provider message ID and timestamp. Ambiguous or unloaded matches leave range actions disabled. The reading plan provides direct selection of exact retained source rows.

Range boundaries and message exclusions are client-local and shared between the inline rows, header and panel. They are not persisted across plugin reload. Settings such as backend, voice, speed and privacy preferences use the official host-scoped settings API and do persist.

## Playback behavior

- `client.playAudio()` is the only playback API. Sound plays on the connected client even when the daemon is elsewhere.
- Paseo 0.11.4 has no mid-file pause, cancel or seek handle. Pause, Stop and Skip take effect at sentence boundaries. Long prose is divided into segments of at most 350 characters.
- Stop clears pending speech and turns automatic narration off. Range playback also disarms automatic narration. Replay appends the current or last sentence.
- An in-flight synthesis is invalidated by a generation change. An already playing file finishes before the next file can start.
- Current-agent scope follows explicit choices in this plugin and its composer pill; the SDK has no active-composer focus event. Merely mounting a timeline row observes history without changing the narration target.
- Live history retains at most 1,500 messages and the queue at most 256 segments. Overflow pauses with a visible error; choose a smaller range.
- Suspended or disconnected clients and browser audio gesture restrictions can delay or reject playback. Errors are shown; Resume retries failed pending speech.

## Providers

The tests validate compatible event schemas for Codex, Claude, OpenCode, OpenCode V2, Copilot, Pi, OMP, Antigravity, Muse, Goose and Cursor. Native integration has been exercised with Codex. This list is fixture coverage, not a guarantee that every provider is available or tested live on a particular host.

Only provider-published reasoning is available. Hidden model reasoning is never accessed. Compatibility depends on the provider publishing supported text and lifecycle events.
