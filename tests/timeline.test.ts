// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import { TimelineReader, type CanonicalRow } from "../shared/timeline";
import { settingsSchema } from "../shared/settings";
import type { Speech } from "../shared/text";
import {
  AgentStreamMessageSchema,
  AgentTimelineEntryPayloadSchema,
} from "@getpaseo/protocol/messages";
const p = settingsSchema.parse({ enabled: true, reasoning: true });
function row(
  seq: number,
  text: string,
  type = "assistant_message",
  turnId = "turn",
): CanonicalRow {
  return { seqStart: seq, seqEnd: seq, turnId, item: { type, text } };
}
function setup() {
  const spoken: Speech[] = [];
  const reader = new TimelineReader(
    "a",
    () => p,
    (s) => spoken.push(s),
  );
  return { spoken, reader };
}
test("streamed sentences and duplicated pages read once; completion flushes partial", () => {
  const { reader, spoken } = setup();
  reader.ingest("e", [row(0, "Old.")], false, true);
  reader.ingest("e", [row(1, "Hello")], true);
  assert.equal(spoken.length, 0);
  reader.ingest("e", [row(2, " there. Next")], true);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Hello there."],
  );
  reader.ingest("e", [row(2, " there. Next")], true);
  reader.ingest("e", [row(3, " sentence")], true, true);
  reader.finish(true);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Hello there.", "Next sentence"],
  );
});
test("reasoning, assistant, tool boundaries and inclusive ranges", () => {
  const { reader, spoken } = setup();
  reader.ingest(
    "e",
    [
      row(0, "Think.", "reasoning"),
      row(1, "Result."),
      row(2, "private log", "tool_call"),
      row(3, "Last."),
    ],
    false,
    true,
  );
  assert.equal(spoken.length, 0);
  assert.equal(reader.messages.length, 3);
  const [a, b, c] = reader.messages;
  assert.deepEqual(
    reader.range(a.id, c.id).map((s) => s.text),
    ["Think.", "Result.", "Last."],
  );
  assert.deepEqual(
    reader.range(b.id, b.id).map((s) => s.text),
    ["Result."],
  );
  assert.throws(() => reader.range(c.id, a.id), /chronological/);
});
test("replacement invalidates range IDs and suppresses baseline replay", () => {
  const { reader, spoken } = setup();
  reader.ingest("old", [row(0, "Old.")], false, true);
  const id = reader.messages[0].id;
  reader.ingest("new", [row(0, "New.")], false, true);
  assert.throws(() => reader.range(id, id));
  assert.equal(spoken.length, 0);
});
test("canceled partial tail is consumed silently", () => {
  const { reader, spoken } = setup();
  reader.ingest("e", [row(0, "Unfinished")], true);
  reader.finish(false);
  reader.ingest(
    "e",
    [row(1, "Next.", "assistant_message", "next")],
    true,
    true,
  );
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Next."],
  );
});
test("open source fences cannot leak on later streamed sentences", () => {
  const { reader, spoken } = setup();
  reader.ingest("e", [row(0, "Hello.\n```ts\n")], true);
  reader.ingest(
    "e",
    [row(1, "private secret code.\n"), row(2, "```\nDone.")],
    true,
    true,
  );
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Hello.", "Done."],
  );
});
for (const provider of [
  "codex",
  "claude",
  "opencode",
  "opencode-v2",
  "copilot",
  "pi",
  "omp",
  "antigravity",
  "muse",
  "goose",
  "cursor",
])
  test(`installed schema accepts compatible events from ${provider}`, () => {
    for (const type of ["assistant_message", "reasoning"]) {
      const payload = AgentStreamMessageSchema.parse({
        type: "agent_stream",
        payload: {
          agentId: "a",
          provider,
          epoch: "e",
          seq: 2,
          timestamp: new Date().toISOString(),
          event: {
            type: "timeline",
            provider,
            item: { type, text: "Hello." },
            turnId: "t",
          },
        },
      });
      assert.equal(payload.payload.event.type, "timeline");
      AgentTimelineEntryPayloadSchema.parse({
        ...row(2, "Hello.", type),
        provider,
        timestamp: new Date().toISOString(),
        sourceSeqRanges: [{ startSeq: 2, endSeq: 2 }],
        collapsed: ["identity"],
      });
    }
    for (const type of ["turn_completed", "turn_canceled", "turn_failed"])
      AgentStreamMessageSchema.parse({
        type: "agent_stream",
        payload: {
          agentId: "a",
          timestamp: new Date().toISOString(),
          event: { type, provider, turnId: "t", reason: "test", error: "test" },
        },
      });
  });
test("older pages merge a split message without replaying its loaded prefix", () => {
  const { reader, spoken } = setup();
  reader.ingest("e", [row(2, "current")], false);
  const old = new TimelineReader(
    "a",
    () => p,
    () => {},
  );
  old.ingest("e", [row(0, "Old "), row(1, "prefix ")], false, true);
  reader.prepend(old.messages);
  assert.equal(reader.messages[0].text, "Old prefix current");
  reader.ingest("e", [row(3, " tail.")], true, true);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["current tail."],
  );
});
test("assistant chunks retain first messageId when subsequent chunks omit it, matching Paseo projection", () => {
  const { reader, spoken } = setup();
  const first = row(0, "Hello");
  first.item.messageId = "m1";
  reader.ingest("e", [first, row(1, " world.")], true, true);
  assert.equal(reader.messages.length, 1);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Hello world."],
  );
});

test("projected streaming rows append only new sentences at a stable anchor", () => {
  const { reader, spoken } = setup();
  const projected = (end: number, text: string): CanonicalRow => ({
    seqStart: 1,
    seqEnd: end,
    turnId: "t",
    item: { type: "assistant_message", text },
  });
  reader.ingest("e", [projected(1, "Hello")], true, false, "projected");
  reader.ingest(
    "e",
    [projected(2, "Hello world. Next")],
    true,
    false,
    "projected",
  );
  reader.ingest(
    "e",
    [projected(2, "Hello world. Next")],
    true,
    false,
    "projected",
  );
  reader.ingest(
    "e",
    [projected(3, "Hello world. Next sentence.")],
    true,
    true,
    "projected",
  );
  assert.equal(reader.messages.length, 1);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Hello world.", "Next sentence."],
  );
  assert.equal(reader.lastSeq, 3);
});
test("projected overlap after baseline never repeats already completed text", () => {
  const { reader, spoken } = setup();
  reader.ingest(
    "e",
    [{ ...row(1, "Old. Partial"), seqEnd: 3 }],
    false,
    false,
    "projected",
  );
  reader.ingest(
    "e",
    [{ ...row(1, "Old. Partial completed."), seqEnd: 5 }],
    true,
    true,
    "projected",
  );
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["Partial completed."],
  );
});
test("a late tool update on an earlier projected anchor does not hide newer text", () => {
  const { reader, spoken } = setup();
  reader.ingest("e", [row(0, "Old.")], false, true, "projected");
  reader.ingest(
    "e",
    [
      { ...row(1, "tool", "tool_call"), seqEnd: 10 },
      { ...row(3, "New text."), seqEnd: 9 },
    ],
    true,
    true,
    "projected",
  );
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["New text."],
  );
  assert.equal(reader.lastSeq, 10);
});
test("projected text revisions invalidate queued content without replaying the replacement", () => {
  const spoken: Speech[] = [];
  let invalidated = 0;
  const reader = new TimelineReader(
    "a",
    () => p,
    (s) => spoken.push(s),
    () => {
      invalidated++;
    },
  );
  reader.ingest("e", [row(1, "First.")], true, false, "projected");
  reader.ingest(
    "e",
    [{ ...row(1, "Revised."), seqEnd: 2 }],
    true,
    false,
    "projected",
  );
  assert.equal(invalidated, 1);
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["First."],
  );
  reader.ingest(
    "e",
    [{ ...row(1, "Revised. New sentence."), seqEnd: 3 }],
    true,
    true,
    "projected",
  );
  assert.deepEqual(
    spoken.map((s) => s.text),
    ["First.", "New sentence."],
  );
});

test('sent messages are distinct completed rows, excluded by default and opt in without replay', () => {
  let settings = settingsSchema.parse({ enabled: true });
  const spoken: Speech[] = [];
  const reader = new TimelineReader('a', () => settings, s => spoken.push(s));
  reader.ingest('e', [row(0, 'Sent one', 'user_message'), row(1, 'Sent two', 'user_message'), row(2, 'Answer.')], true, true);
  assert.equal(reader.messages.length, 3);
  assert.ok(reader.messages.every(m => m.complete));
  assert.deepEqual(spoken.map(s => s.text), ['Answer.']);
  settings = { ...settings, userMessages: true };
  reader.ingest('e', [row(3, 'New sent message', 'user_message')], true);
  assert.deepEqual(spoken.map(s => s.text), ['Answer.', 'New sent message']);
  assert.deepEqual(reader.range(reader.messages[0].id, reader.messages[1].id).map(s => s.text), ['Sent one', 'Sent two']);
});
test('projected sent rows are completed immediately and duplicate updates are silent', () => {
  const settings = settingsSchema.parse({ userMessages: true });
  const spoken: Speech[] = [];
  const reader = new TimelineReader('a', () => settings, s => spoken.push(s));
  const entry = row(0, 'A sent message without punctuation', 'user_message');
  reader.ingest('e', [entry], true, false, 'projected');
  reader.ingest('e', [entry], true, false, 'projected');
  assert.equal(reader.messages[0].complete, true);
  assert.equal(spoken.length, 1);
});
