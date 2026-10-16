// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMessage, spokenText, voiceRowSchema } from '../shared/presentation';
import { TimelineReader } from '../shared/timeline';
import { settingsSchema } from '../shared/settings';
import { speechSegments } from '../shared/text';

test('timeline actions resolve duplicate text by source time and fail closed when ambiguous', () => {
  const p = settingsSchema.parse({});
  const reader = new TimelineReader('a', () => p, () => {});
  reader.ingest('e', [
    { seqStart: 0, seqEnd: 0, timestamp: '2026-10-16T10:00:00Z', item: { type: 'assistant_message', text: 'Repeated.' } },
    { seqStart: 1, seqEnd: 1, item: { type: 'tool_call' } },
    { seqStart: 2, seqEnd: 2, timestamp: '2026-10-16T10:01:00Z', item: { type: 'assistant_message', text: 'Repeated.' } },
  ], false, true);
  const row = voiceRowSchema.parse({ kind: 'assistant_message', text: 'Repeated.', phase: 'complete' });
  assert.equal(resolveMessage(reader.messages, row, new Date('2026-10-16T10:01:00Z'))?.seq, 2);
  assert.equal(resolveMessage(reader.messages, row, new Date('2026-10-16T12:00:00Z')), undefined);
});
test('spoken preview uses exactly the content-kind and sanitization filters', () => {
  const p = settingsSchema.parse({});
  const source = 'Readable prose.\n```ts\nconst hidden = 1;\n```\nNext sentence.';
  assert.equal(spokenText({ kind: 'assistant_message', text: source }, p), 'Readable prose.\n\nNext sentence.');
  assert.equal(spokenText({ kind: 'reasoning', text: 'Exposed thought.' }, p), '');
  assert.equal(spokenText({ kind: 'user_message', text: 'My sent message.' }, p), '');
  assert.equal(spokenText({ kind: 'user_message', text: 'My sent message.' }, { ...p, userMessages: true }), 'My sent message.');
});
test('repeated sentences retain distinct source offsets for playback highlighting', () => {
  assert.deepEqual(speechSegments('Again. Again.'), [{ text: 'Again.', offset: 0 }, { text: 'Again.', offset: 7 }]);
});
