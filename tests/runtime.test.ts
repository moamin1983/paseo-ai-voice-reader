// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { VoiceRuntime } from "../client/runtime";
import { settingsSchema } from "../shared/settings";
import type { CanonicalRow } from "../shared/timeline";

function fixture(projection: "canonical" | "projected" = "canonical") {
  let epoch = "e";
  let status = "idle";
  let rows: CanonicalRow[] = [
    {
      seqStart: 0,
      seqEnd: 0,
      item: { type: "assistant_message", text: "Old." },
    },
  ];
  let listener: ((x: any) => void) | undefined;
  let releases = 0;
  let removed = 0;
  let registered = 0;
  const spoken: string[] = [];
  const played: string[] = [];
  const settings = settingsSchema.parse({ enabled: true, backend: "kokoro" });
  const reg = () => {
    registered++;
    let alive = true;
    return {
      update() {},
      remove() {
        if (alive) {
          alive = false;
          removed++;
        }
      },
    };
  };
  const pageInfo = { nextCursor: null, prevCursor: null, hasMore: false };
  const agent = {
    id: "a",
    workspaceId: "w",
    provider: "codex",
    title: "Test agent",
  };
  const client = {
    paseo: {
      agents: {
        list: async () => ({
          entries: [{ agent }],
          pageInfo,
          subscription: {
            subscribe(o: any) {
              o.snapshot({ entries: [{ agent }], pageInfo });
            },
            release: async () => {
              releases++;
            },
          },
        }),
        ref: () => ({
          timeline: {
            subscribe(fn: any) {
              listener = fn;
              const unsub = Object.assign(
                () => {
                  listener = undefined;
                },
                {
                  ready: Promise.resolve(),
                  release: async () => {
                    listener = undefined;
                  },
                },
              );
              return unsub;
            },
            refetch: async (options: any) => {
              const projected =
                projection === "projected"
                  ? [
                      {
                        ...rows[0],
                        seqEnd: rows.at(-1)!.seqEnd,
                        item: {
                          type: "assistant_message",
                          text: rows.map((r) => r.item.text ?? "").join(""),
                        },
                      },
                    ]
                  : rows;
              const entries =
                options.direction === "after"
                  ? projected.filter((r) => r.seqEnd > options.cursor.seq)
                  : projected;
              return {
                epoch,
                projection,
                entries,
                agent: { status },
                error: null,
                reset: false,
                staleCursor: false,
                gap: false,
                window: { maxSeq: rows.at(-1)?.seqEnd ?? -1 },
                hasNewer: false,
              };
            },
          },
        }),
      },
      workspaces: {
        list: async () => ({
          entries: [{ id: "w" }, { id: "empty" }],
          pageInfo,
          subscription: {
            subscribe(o: any) {
              o.snapshot({ entries: [{ id: "w" }, { id: "empty" }], pageInfo });
            },
            release: async () => {
              releases++;
            },
          },
        }),
      },
    },
    rpc: async (contract: any, input: any) => {
      if (contract.name === "settings.voice.read")
        return { status: "ready", revision: "1", values: settings };
      if (contract.name === "voice.turn-status") return { turns: [] };
      if (contract.name === "voice.synthesize") {
        spoken.push(input.text);
        return { base64: input.text, mimeType: "audio/wav" };
      }
      throw new Error(contract.name);
    },
    playAudio: async (audio: any) => {
      played.push(audio.base64);
    },
    addHeaderButton: reg,
    addComposerPill: reg,
    openSettings() {},
    openScreen() {},
    openPanel() {},
  } as unknown as PluginClientContext;
  const runtime = new VoiceRuntime(client);
  return {
    runtime,
    spoken,
    played,
    settings,
    stats: () => ({ releases, removed, registered }),
    event(type: string) {
      listener?.({ agentId: "a", event: { type } });
    },
    add(text: string, kind = "assistant_message") {
      status = "running";
      rows.push({
        seqStart: rows.length,
        seqEnd: rows.length,
        item: { type: kind, text },
      });
    },
    complete() {
      status = "idle";
      listener?.({ event: { type: "turn_completed" } });
    },
    replace() {
      epoch = "new";
      rows = [
        {
          seqStart: 0,
          seqEnd: 0,
          item: { type: "assistant_message", text: "Replaced history." },
        },
      ];
      listener?.({ event: { type: "replacement", epoch } });
    },
  };
}
test("native runtime registers header even for empty workspace, deduplicates streaming and reconnect history", async () => {
  const f = fixture();
  try {
    await f.runtime.start();
    await delay(5);
    assert.equal(f.stats().registered, 3);
    f.runtime.toggle("a");
    await delay(150);
    assert.equal(f.spoken.length, 0);
    f.event("turn_started");
    f.add("Hello");
    f.event("timeline");
    await delay(150);
    assert.equal(f.spoken.length, 0);
    f.add(" world.");
    f.event("timeline");
    f.event("timeline");
    await delay(150);
    assert.deepEqual(f.spoken, ["Hello world."]);
    f.event("subscription_restored");
    await delay(150);
    assert.deepEqual(f.spoken, ["Hello world."]);
    f.add("Recovered.");
    f.event("subscription_restored");
    await delay(150);
    assert.deepEqual(f.spoken, ["Hello world.", "Recovered."]);
    f.add("Final tail");
    f.complete();
    f.complete();
    await delay(150);
    assert.deepEqual(f.spoken, ["Hello world.", "Recovered.", "Final tail"]);
    assert.deepEqual(f.played, f.spoken);
  } finally {
    f.runtime.dispose();
  }
  assert.equal(f.stats().releases, 2);
  assert.equal(f.stats().removed, f.stats().registered);
});
test("range playback includes selected endpoints and replacement invalidates them", async () => {
  const f = fixture();
  try {
    await f.runtime.start();
    await delay(5);
    f.runtime.select("a");
    await delay(150);
    const m = f.runtime.feeds.get("a")!.reader.messages[0];
    f.runtime.playRange("a", m.id, m.id);
    await delay(10);
    assert.deepEqual(f.played, ["Old."]);
    f.replace();
    await delay(150);
    f.runtime.playRange("a", m.id, m.id);
    assert.match(f.runtime.notice, /chronological/);
    assert.deepEqual(f.played, ["Old."]);
  } finally {
    f.runtime.dispose();
  }
});
test("cancel suppresses partial text, reload harness starts unarmed and does not replay history", async () => {
  const f = fixture();
  await f.runtime.start();
  await delay(5);
  f.runtime.toggle("a");
  await delay(150);
  f.add("Canceled partial");
  f.event("turn_canceled");
  await delay(150);
  assert.deepEqual(f.spoken, []);
  f.runtime.dispose();
  const after = f.stats();
  assert.equal(after.removed, after.registered);
  const g = fixture();
  try {
    await g.runtime.start();
    await delay(5);
    assert.equal(g.runtime.armed, false);
    assert.equal(g.runtime.feeds.size, 0);
    assert.deepEqual(g.played, []);
  } finally {
    g.runtime.dispose();
  }
});
test("scope changes select current versus all agents and master-off disarms the client", () => {
  const f = fixture();
  try {
    f.runtime.agents.set("a", {
      id: "a",
      workspaceId: "w",
      provider: "claude",
    });
    f.runtime.agents.set("b", {
      id: "b",
      workspaceId: "w",
      provider: "opencode-v2",
    });
    f.runtime.setSettings({ ...f.settings, scope: "all" });
    f.runtime.toggle("a");
    assert.equal(f.runtime.shouldSpeak("a"), true);
    assert.equal(f.runtime.shouldSpeak("b"), true);
    assert.equal(f.runtime.feeds.size, 2);
    f.runtime.setSettings({ ...f.settings, scope: "current" });
    assert.equal(f.runtime.shouldSpeak("a"), true);
    assert.equal(f.runtime.shouldSpeak("b"), false);
    assert.equal(f.runtime.feeds.size, 1);
    f.runtime.setSettings({ ...f.settings, enabled: false });
    assert.equal(f.runtime.armed, false);
    assert.equal(f.runtime.feeds.size, 0);
  } finally {
    f.runtime.dispose();
  }
});

test("Test voice uses the native playback queue with canned text and disarms automatic narration", async () => {
  const f = fixture();
  try {
    f.runtime.setSettings(f.settings);
    f.runtime.armed = true;
    f.runtime.testVoice();
    await delay(10);
    assert.equal(f.runtime.armed, false);
    assert.equal(f.played.length, 3);
    assert.deepEqual(f.played, f.spoken);
    assert.equal(f.played[0], "This is the Paseo voice reader test.");
    assert.ok(f.played.every((text) => !text.includes("Old.")));
  } finally {
    f.runtime.dispose();
  }
});

test("runtime honors a daemon that returns projected rows despite canonical requests", async () => {
  const f = fixture("projected");
  try {
    await f.runtime.start();
    await delay(5);
    f.runtime.toggle("a");
    await delay(150);
    f.event("turn_started");
    f.add(" New sentence.");
    f.event("timeline");
    await delay(150);
    assert.deepEqual(f.spoken, ["New sentence."]);
    f.event("subscription_restored");
    await delay(150);
    assert.deepEqual(f.spoken, ["New sentence."]);
    assert.equal(f.runtime.feeds.get("a")!.reader.messages.length, 1);
  } finally {
    f.runtime.dispose();
  }
});

test('range boundaries and exclusions are shared, chronological and invalidated on replacement', async () => {
  const f = fixture();
  try {
    await f.runtime.start();
    const unwatch = f.runtime.watchAgent('a');
    await delay(150);
    f.add('Thinking.', 'reasoning');
    f.add('Answer.');
    f.complete();
    await delay(150);
    const messages = f.runtime.feeds.get('a')!.reader.messages;
    f.runtime.setBoundary('a', messages[0].id, 'start');
    f.runtime.setBoundary('a', messages[2].id, 'end');
    assert.equal(f.runtime.selection('a')?.end, messages[2].id);
    f.runtime.toggleExcluded('a', messages[0].id);
    f.runtime.playRange('a', messages[0].id, messages[2].id);
    await delay(10);
    assert.deepEqual(f.played, ['Answer.']);
    f.replace();
    await delay(150);
    assert.equal(f.runtime.selection('a'), undefined);
    unwatch();
  } finally { f.runtime.dispose(); }
});
test('mounting timeline rows observes history without changing the automatic narration target', async () => {
  const f = fixture();
  try {
    await f.runtime.start();
    const release1 = f.runtime.watchAgent('a');
    const release2 = f.runtime.watchAgent('a');
    await delay(150);
    assert.equal(f.runtime.target, undefined);
    assert.equal(f.runtime.armed, false);
    assert.deepEqual(f.played, []);
    release1();
    assert.equal(f.runtime.feeds.size, 1);
    release2();
    assert.equal(f.runtime.feeds.size, 0);
  } finally { f.runtime.dispose(); }
});
