// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { homedir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { SpeechWorker } from "../server/worker";
import { settingsSchema } from "../shared/settings";
import { diagnostics, synthesize } from "../shared/contracts";
const p = settingsSchema.parse({
  pythonPath: process.env.VOICE_PYTHON_PATH ?? resolve(".venv/bin/python"),
  workerPath: resolve("server/tts_worker.py"),
  kokoroModelDir: process.env.KOKORO_MODEL_DIR ?? resolve(homedir(), ".paseo/models/local-speech/kokoro-en-v0_19"),
});
test("local backend probe and real offline Kokoro generation", async () => {
  const worker = new SpeechWorker();
  try {
    const probe = diagnostics.output.parse(
      await worker.request(p, { op: "probe" }),
    );
    assert.equal(probe.edge, true);
    assert.equal(probe.kokoro, true);
    assert.equal(probe.model, true);
    const audio = synthesize.output.parse(
      await worker.request(p, {
        backend: "kokoro",
        text: "This is a local voice reader test.",
        speed: 1,
        voice: 0,
      }),
    );
    const bytes = Buffer.from(audio.base64, "base64");
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString(), "WAVE");
    assert.ok(bytes.length > 1000);
    await mkdir("evidence", { recursive: true });
    await writeFile("evidence/kokoro-smoke.wav", bytes);
    console.log(
      "Offline WAV generated:",
      bytes.length,
      "bytes. No timeline data used.",
    );
  } finally {
    worker.dispose();
  }
});
test(
  "real Edge Neural generation using public canned text only",
  { skip: process.env.RUN_EDGE_TTS !== "1" },
  async () => {
    const worker = new SpeechWorker();
    try {
      const audio = synthesize.output.parse(
        await worker.request(p, {
          backend: "edge",
          text: "This is a voice reader test.",
          speed: 1,
          voice: "en-US-AriaNeural",
        }),
      );
      const bytes = Buffer.from(audio.base64, "base64");
      assert.ok(bytes.length > 500);
      await writeFile("evidence/edge-smoke.mp3", bytes);
      console.log(
        "Edge MP3 generated:",
        bytes.length,
        "bytes. Only public canned text sent.",
      );
    } finally {
      worker.dispose();
    }
  },
);
