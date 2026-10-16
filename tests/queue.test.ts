// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioQueue } from "../client/queue";
import type { Speech } from "../shared/text";
const speech = (text: string, agentId = "a"): Speech => ({
  text,
  agentId,
  kind: "assistant_message",
  messageId: text,
});
const audio = { base64: "c291bmQ=", mimeType: "audio/wav" };
const tick = () => new Promise<void>((r) => setImmediate(r));
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
test("two agent sessions share one serial playback queue", async () => {
  const g = gate();
  let concurrent = 0,
    max = 0;
  const played: string[] = [];
  const q = new AudioQueue(
    async (s) => ({ ...audio, base64: s.text }),
    async (a) => {
      max = Math.max(max, ++concurrent);
      played.push(a.base64);
      await g.promise;
      concurrent--;
    },
  );
  q.enqueue([speech("one"), speech("two", "b")]);
  await tick();
  assert.deepEqual(played, ["one"]);
  g.resolve();
  await tick();
  assert.deepEqual(played, ["one", "two"]);
  assert.equal(max, 1);
  q.dispose();
});
test("pause/resume takes effect after current sentence", async () => {
  const g = gate();
  const played: string[] = [];
  const q = new AudioQueue(
    async (s) => ({ ...audio, base64: s.text }),
    async (a) => {
      played.push(a.base64);
      await g.promise;
    },
  );
  q.enqueue([speech("one"), speech("two")]);
  await tick();
  q.pause();
  g.resolve();
  await tick();
  assert.deepEqual(played, ["one"]);
  q.resume();
  await tick();
  assert.deepEqual(played, ["one", "two"]);
  q.dispose();
});
test("stop during synthesis prevents playback, and resume waits for old in-flight work", async () => {
  const g = gate();
  const played: string[] = [];
  const q = new AudioQueue(
    async (s) => {
      if (s.text === "old") await g.promise;
      return { ...audio, base64: s.text };
    },
    async (a) => {
      played.push(a.base64);
    },
  );
  q.enqueue([speech("old")]);
  q.stop();
  q.enqueue([speech("new")]);
  q.resume();
  await tick();
  assert.deepEqual(played, []);
  g.resolve();
  await tick();
  assert.deepEqual(played, ["new"]);
  q.dispose();
});
test("pause during synthesis retains unplayed sentence", async () => {
  const g = gate();
  let count = 0;
  const q = new AudioQueue(
    async () => {
      await g.promise;
      return audio;
    },
    async () => {
      count++;
    },
  );
  q.enqueue([speech("one")]);
  q.pause();
  g.resolve();
  await tick();
  assert.equal(count, 0);
  assert.equal(q.snapshot().pending, 1);
  q.resume();
  await tick();
  assert.equal(count, 1);
  q.dispose();
});
test("skip, replay, and cancellation remove pending agent audio", async () => {
  const g = gate();
  const played: string[] = [];
  const q = new AudioQueue(
    async (s) => ({ ...audio, base64: s.text }),
    async (a) => {
      played.push(a.base64);
      await g.promise;
    },
  );
  q.enqueue([speech("one"), speech("two"), speech("other", "b")]);
  await tick();
  q.skip();
  q.removeAgent("a");
  g.resolve();
  await tick();
  assert.deepEqual(played, ["one", "other"]);
  q.replay();
  await tick();
  assert.deepEqual(played, ["one", "other", "other"]);
  q.dispose();
});
test("errors are visible and retryable; cleanup never starts stale playback", async () => {
  let fail = true,
    count = 0;
  const q = new AudioQueue(
    async () => {
      if (fail) throw new Error("No network");
      return audio;
    },
    async () => {
      count++;
    },
  );
  q.enqueue([speech("one")]);
  await tick();
  assert.equal(q.snapshot().status, "error");
  assert.equal(q.snapshot().pending, 1);
  fail = false;
  q.resume();
  await tick();
  assert.equal(count, 1);
  const g = gate();
  const stale = new AudioQueue(
    async () => {
      await g.promise;
      return audio;
    },
    async () => {
      count++;
    },
  );
  stale.enqueue([speech("late")]);
  stale.dispose();
  g.resolve();
  await tick();
  assert.equal(count, 1);
  q.dispose();
});

test('excluding a message removes its queued sentences while preserving other sessions', async () => {
  const g = gate();
  const played: string[] = [];
  const q = new AudioQueue(async s => ({ ...audio, base64: s.text }), async a => { played.push(a.base64); await g.promise; });
  q.enqueue([speech('one'), { ...speech('two'), messageId: 'one' }, speech('other', 'b')]);
  await tick();
  q.removeMessage('a', 'one');
  assert.equal(q.items().filter(s => s.agentId === 'a').length, 1); // in-flight sentence finishes
  g.resolve();
  await tick();
  assert.deepEqual(played, ['one', 'other']);
  q.dispose();
});

test("previous steps back one sentence per press and next steps forward", async () => {
  const gates: (() => void)[] = [];
  const played: string[] = [];
  const q = new AudioQueue(
    async (s) => ({ ...audio, base64: s.text }),
    async (a) => { played.push(a.base64); await new Promise<void>((r) => gates.push(r)); },
  );
  const finish = async () => { await tick(); gates.shift()?.(); await tick(); };
  q.enqueue([speech("one"), speech("two"), speech("three"), speech("four")]);
  await tick();
  await finish(); // one
  await finish(); // two
  assert.deepEqual(played, ["one", "two", "three"]);
  q.previous(); // while "three" plays: go back to "two"
  q.previous(); // and once more to "one"
  await finish(); // three ends, then one starts
  assert.deepEqual(played, ["one", "two", "three", "one"]);
  await finish(); // one ends, two continues forward
  assert.equal(played.at(-1), "two");
  q.next(); // finish "two" early
  q.next(); // and skip "three"
  await finish();
  assert.equal(played.at(-1), "four");
  await finish();
  assert.equal(q.snapshot().status, "idle");
  q.previous(); // idle: replays the last sentence
  await tick();
  assert.equal(played.at(-1), "four");
  q.dispose();
});
