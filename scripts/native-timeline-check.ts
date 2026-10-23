// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { homedir } from "node:os";
import { join } from "node:path";
// Reads this test conversation locally. Writes metadata only, never timeline text.
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi } from "@getpaseo/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { settingsSchema } from "../shared/settings";
import { TimelineReader } from "../shared/timeline";
const id = process.argv[2];
if (!id) throw new Error("Provide the explicit test-conversation agent ID.");
const client = new DaemonClient({
  url: process.env.PASEO_WS_URL ?? "ws://127.0.0.1:6767/ws",
  clientId: "ai-voice-reader-timeline-check",
  clientType: "cli",
  appVersion: process.env.PASEO_CHECK_APP_VERSION ?? "0.12.0",
  localCredential: async () =>
    (await readFile(process.env.PASEO_LOCAL_CREDENTIAL_FILE ?? join(homedir(), ".paseo/local-credential"), "utf8")).trim(),
  reconnect: { enabled: false },
  logger: { debug() {}, info() {}, warn() {}, error() {} },
});
let release: (() => void) | undefined;
try {
  await client.connect();
  const api = createPaseoApi(client);
  const agent = api.agents.ref(id);
  let events = 0;
  const sub = agent.timeline.subscribe(() => {
    events++;
  });
  release = sub;
  await sub.ready;
  const page = await agent.timeline.refetch({
    direction: "tail",
    projection: "canonical",
    limit: 200,
  });
  console.log("Timeline response metadata:", {
    error: page.error,
    projection: page.projection,
    entries: page.entries.length,
    reset: page.reset,
    gap: page.gap,
    staleCursor: page.staleCursor,
  });
  if (page.error) throw new Error("Native timeline read failed.");
  const s = (await client.invokePluginRpc(
    "ai-voice-reader",
    "settings.voice.read",
    {},
  )) as { status: string; values: unknown };
  const p = settingsSchema.parse(s.values);
  let emitted = 0;
  const reader = new TimelineReader(
    id,
    () => p,
    () => {
      emitted++;
    },
  );
  reader.ingest(
    page.epoch,
    page.entries,
    false,
    page.agent?.status === "idle",
    page.projection,
  );
  reader.ingest(page.epoch, page.entries, true, false, page.projection);
  if (emitted !== 0)
    throw new Error("Duplicate history page emitted narration.");
  const complete = reader.messages.filter((m) => m.complete);
  let rangeSentences = 0;
  if (complete.length) {
    const first = complete[Math.max(0, complete.length - 2)],
      last = complete.at(-1)!;
    rangeSentences = reader.range(first.id, last.id).length;
    if (first.id !== last.id) {
      let rejected = false;
      try {
        reader.range(last.id, first.id);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("Reversed range accepted.");
    }
  }
  const next = await agent.timeline.refetch({
    direction: "after",
    projection: "canonical",
    limit: 200,
    cursor: { epoch: page.epoch, seq: reader.lastSeq },
  });
  reader.ingest(next.epoch, next.entries, false, false, next.projection);
  const result = {
    passed: true,
    agentId: id,
    provider: page.agent?.provider,
    projection: page.projection,
    epoch: page.epoch,
    timelineRows: page.entries.length,
    readableMessages: reader.messages.length,
    completedMessages: complete.length,
    rangeSentences,
    duplicateNarrations: emitted,
    afterCursorRows: next.entries.length,
    subscriptionEstablished: true,
    liveEventsObserved: events,
    transcriptWritten: false,
    audioPlayed: false,
    externalTtsUsed: false,
  };
  await mkdir("evidence/native", { recursive: true });
  await writeFile(
    "evidence/native/timeline-rpc.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
  await api.dispose();
} finally {
  release?.();
  await client.close();
}
