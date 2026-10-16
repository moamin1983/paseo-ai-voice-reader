// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechWorker } from '../server/worker';
import { settingsSchema } from '../shared/settings';

test('new installations fail with actionable setup guidance instead of using author-machine paths', async () => {
  const settings = settingsSchema.parse({});
  assert.equal(settings.pythonPath, 'python3');
  assert.equal(settings.workerPath, '');
  assert.equal(settings.kokoroModelDir, '');
  const worker = new SpeechWorker();
  try {
    await assert.rejects(worker.request(settings, { op: 'probe' }), /absolute plugin TTS worker path/);
    await assert.rejects(worker.request({ ...settings, workerPath: 'relative/worker.py' }, { op: 'probe' }), /Voice settings/);
  } finally { worker.dispose(); }
});
