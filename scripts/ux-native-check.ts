// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { homedir } from "node:os";
import { join } from "node:path";
// Read-only native checks plus public canned offline synthesis. No timeline audio is generated.
import assert from 'node:assert/strict';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { createPaseoApi } from '@getpaseo/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { settingsSchema } from '../shared/settings';
import { TimelineReader } from '../shared/timeline';
import { resolveMessage, voiceRowSchema } from '../shared/presentation';
const agentId = process.argv[2];
if (!agentId) throw new Error('Provide the explicitly scoped test conversation ID.');
const client = new DaemonClient({
  url: process.env.PASEO_WS_URL ?? "ws://127.0.0.1:6767/ws", clientId: 'voice-ux-check', clientType: 'cli', appVersion: process.env.PASEO_CHECK_APP_VERSION ?? "0.12.0",
  localCredential: async () => (await readFile(process.env.PASEO_LOCAL_CREDENTIAL_FILE ?? join(homedir(), ".paseo/local-credential"), 'utf8')).trim(),
  reconnect: { enabled: false }, logger: { debug() {}, info() {}, warn() {}, error() {} },
});
let api: ReturnType<typeof createPaseoApi> | undefined;
try {
  await client.connect();
  const state = await client.invokePluginRpc('ai-voice-reader', 'settings.voice.read', {}) as any;
  assert.equal(state.status, 'ready');
  const settings = settingsSchema.parse(state.values);
  assert.equal(settings.backend, 'kokoro');
  assert.equal(settings.enabled, true);
  assert.equal(settings.userMessages, false);

  api = createPaseoApi(client);
  const page = await api.agents.ref(agentId).timeline.refetch({ direction: 'tail', projection: 'canonical', limit: 200 });
  assert.equal(page.error, null);
  let emitted = 0;
  const reader = new TimelineReader(agentId, () => settings, () => emitted++);
  reader.ingest(page.epoch, page.entries, false, page.agent?.status === 'idle', page.projection);
  reader.ingest(page.epoch, page.entries, true, false, page.projection);
  assert.equal(emitted, 0);
  let resolved = 0;
  for (const message of reader.messages) {
    const row = voiceRowSchema.parse({ text: message.text, kind: message.kind, phase: message.complete ? 'complete' : 'streaming', providerMessageId: message.providerMessageId });
    const match = resolveMessage(reader.messages, row, new Date(message.timestamp ?? ''));
    assert.equal(match?.id, message.id);
    resolved++;
  }
  assert.ok(resolved > 0);
  const audio = await client.invokePluginRpc('ai-voice-reader', 'voice.synthesize', { text: 'The expanded reading plan is ready for review.', kind: 'assistant_message' }) as { base64: string; mimeType: string };
  const wav = Buffer.from(audio.base64, 'base64');
  assert.equal(audio.mimeType, 'audio/wav');
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  const after = await client.invokePluginRpc('ai-voice-reader', 'settings.voice.read', {}) as any;
  assert.deepEqual(settings, settingsSchema.parse(after.values));
  const result = {
    passed: true, agentId, provider: page.agent?.provider, projection: page.projection,
    sourceRowsResolved: resolved, duplicateNarrations: emitted,
    settingsUnchangedByCheck: true, backend: settings.backend, sentMessagesEnabled: settings.userMessages,
    backendSynthesis: { content: 'public canned sentence', mimeType: audio.mimeType, bytes: wav.length },
    timelineContentWritten: false, timelineContentSentToTts: false, clientAudioPlayed: false,
  };
  await mkdir('evidence/ux-update', { recursive: true });
  await writeFile('evidence/ux-update/native-check.json', JSON.stringify(result, null, 2) + '\n');
  console.log(result);
} finally { await api?.dispose(); await client.close(); }
