// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { z } from 'zod';
import type { ReadMessage } from './timeline';
import { allowKind, sanitize, type SpeechKind } from './text';
import type { Preferences } from './settings';

export const voiceRowSchema = z.object({
  text: z.string(),
  kind: z.enum(['assistant_message', 'reasoning', 'user_message']),
  phase: z.enum(['streaming', 'complete']),
  providerMessageId: z.string().optional(),
});
export type VoiceRow = z.output<typeof voiceRowSchema>;
export const kindLabel = (kind: SpeechKind) => kind === 'reasoning' ? 'Exposed thinking' : kind === 'user_message' ? 'You' : 'Assistant';

// The public transformer does not expose seqStart. Resolve only an unambiguous
// source match. Never choose the first of two identical historical responses.
export function resolveMessage(messages: readonly ReadMessage[], row: VoiceRow, timestamp: Date): ReadMessage | undefined {
  let candidates = messages.filter(m => m.kind === row.kind &&
    (m.text === row.text || (row.phase === 'streaming' && (m.text.startsWith(row.text) || row.text.startsWith(m.text)))));
  if (row.providerMessageId) candidates = candidates.filter(m => m.providerMessageId === row.providerMessageId);
  if (candidates.length > 1) {
    const time = timestamp.getTime();
    candidates = candidates.filter(m => m.timestamp && new Date(m.timestamp).getTime() === time);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function spokenText(message: Pick<ReadMessage, 'kind' | 'text'>, p: Preferences) {
  return allowKind(message.kind, p) ? sanitize(message.text, p) : '';
}
