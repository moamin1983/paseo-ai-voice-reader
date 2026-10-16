// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { homedir } from "node:os";
import { join } from "node:path";
// Integration diagnostics for the installed plugin. Never plays daemon-local audio.
// Uses the installed SDK's RPC transport and keeps credentials out of output.
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const client = new DaemonClient({
  url: process.env.PASEO_WS_URL ?? "ws://127.0.0.1:6767/ws",
  clientId: "ai-voice-reader-native-check",
  clientType: "cli",
  appVersion: "0.11.4",
  localCredential: async () =>
    (await readFile(process.env.PASEO_LOCAL_CREDENTIAL_FILE ?? join(homedir(), ".paseo/local-credential"), "utf8")).trim(),
  reconnect: { enabled: false },
  logger: { debug() {}, info() {}, warn() {}, error() {} },
});
const call = (method, input = {}) =>
  client.invokePluginRpc("ai-voice-reader", method, input);
await mkdir("evidence/native", { recursive: true });
try {
  await client.connect();
  const s = await call("settings.voice.read");
  if (s.status !== "ready") throw new Error("Plugin settings unavailable.");
  if (process.argv.includes("--prepare-offline")) {
    if (s.values.backend === "edge" && !s.values.cloudConsent) {
      let blocked = false;
      try {
        await call("voice.synthesize", {
          text: "Public test sentence.",
          kind: "assistant_message",
        });
      } catch (e) {
        blocked = /Microsoft|consent/.test(e.message);
      }
      if (!blocked)
        throw new Error("Expected cloud consent guard to reject synthesis.");
      await writeFile(
        "evidence/native/cloud-guard.json",
        JSON.stringify(
          {
            passed: true,
            unconsented_request_rejected: true,
            content: "public canned sentence",
          },
          null,
          2,
        ) + "\n",
      );
    }
    const saved = await call("settings.voice.write", {
      revision: s.revision,
      values: {
        ...s.values,
        backend: "kokoro",
        enabled: true,
        assistant: true,
      },
    });
    if (saved.status !== "saved")
      throw new Error("Official plugin settings write did not commit.");
    console.log(
      "Offline Kokoro selected through official plugin settings API.",
    );
  }
  const current = await call("settings.voice.read");
  await writeFile(
    "evidence/native/settings-current.json",
    JSON.stringify(current, null, 2) + "\n",
  );
  const probe = await call("voice.diagnostics");
  await writeFile(
    "evidence/native/diagnostics.json",
    JSON.stringify(probe, null, 2) + "\n",
  );
  console.log("Backend diagnostics:", probe);
  if (current.values.backend !== "kokoro")
    throw new Error("Native integration check requires offline Kokoro.");
  const audio = await call("voice.synthesize", {
    text: "This is the Paseo voice reader native backend test.",
    kind: "assistant_message",
  });
  const bytes = Buffer.from(audio.base64, "base64");
  if (
    audio.mimeType !== "audio/wav" ||
    bytes.subarray(0, 4).toString() !== "RIFF"
  )
    throw new Error("Expected a complete WAV file from native plugin RPC.");
  await writeFile("evidence/native/kokoro-rpc.wav", bytes);
  const result = {
    passed: true,
    plugin: "ai-voice-reader",
    backend: "kokoro",
    transport: "installed Paseo plugin RPC",
    mimeType: audio.mimeType,
    bytes: bytes.length,
    content: "public canned text",
    settingsRevision: current.revision,
  };
  await writeFile(
    "evidence/native/backend-rpc.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log("Installed backend synthesis:", result);
} finally {
  await client.close();
}
