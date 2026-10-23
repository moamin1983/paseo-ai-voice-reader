// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

// Metadata-only native check: no agent mutations, transcript writes, or TTS.
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { createPaseoApi } from '@getpaseo/client';
import { settingsSchema } from '../shared/settings';
const agentId = process.argv[2];
if (!agentId) throw new Error('Provide the explicitly scoped conversation ID.');
const client = new DaemonClient({
  url: process.env.PASEO_WS_URL ?? 'ws://127.0.0.1:6767/ws', clientId: 'voice-appearance-check', clientType: 'cli', appVersion: process.env.PASEO_CHECK_APP_VERSION ?? "0.12.0",
  localCredential: async () => (await readFile(process.env.PASEO_LOCAL_CREDENTIAL_FILE ?? join(homedir(), '.paseo/local-credential'), 'utf8')).trim(),
  reconnect: { enabled: false }, logger: { debug() {}, info() {}, warn() {}, error() {} },
});
let api: ReturnType<typeof createPaseoApi> | undefined;
try {
  await client.connect();
  const settings = await client.invokePluginRpc('ai-voice-reader', 'settings.voice.read', {}) as any;
  assert.equal(settings.status, 'ready');
  const values = settingsSchema.parse(settings.values);
  assert.equal(values.inlineControls, false, 'Original message UI should be restored.');
  assert.equal(values.compactPlan, true, 'Reading plan should be compact.');
  let audioSettingsPreserved: boolean | null = null;
  if (process.env.VOICE_SETTINGS_BASELINE) {
    const previous = JSON.parse(await readFile(process.env.VOICE_SETTINGS_BASELINE, 'utf8'));
    const { inlineControls: _i, compactPlan: _c, ...audio } = values;
    const { inlineControls: _pi, compactPlan: _pc, ...before } = settingsSchema.parse(previous.values);
    assert.deepEqual(audio, before, 'Existing audio and privacy settings must be preserved.');
    audioSettingsPreserved = true;
  }
  api = createPaseoApi(client);
  const page = await api.agents.ref(agentId).timeline.refetch({ direction: 'tail', limit: 200, projection: 'canonical' });
  assert.equal(page.error, null);
  const counts: Record<string, number> = {};
  for (const row of page.entries) counts[row.item.type] = (counts[row.item.type] ?? 0) + 1;
  assert.ok(counts.user_message > 0 && counts.assistant_message > 0);
  const result = { passed: true, originalMessageUi: true, compactPlan: true, audioSettingsPreserved,
    timelineReadable: true, rowTypes: counts, agentRestarted: false, agentMutations: 0, transcriptWritten: false, audioPlayed: false };
  await mkdir('evidence/appearance', { recursive: true });
  await writeFile('evidence/appearance/native-check.json', JSON.stringify(result, null, 2) + '\n');
  console.log(result);
} finally { await api?.dispose(); await client.close(); }
