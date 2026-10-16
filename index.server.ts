// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import type { PluginServerContext } from "@getpaseo/plugin/server";
import { preferences } from "./shared/settings";
import { diagnostics, synthesize, turnStatus } from "./shared/contracts";
import { allowKind, cloudPolicy, hasSecret, sanitize } from "./shared/text";
import { SpeechWorker } from "./server/worker";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  const worker = new SpeechWorker();
  const turns = new Map<
    string,
    {
      agentId: string;
      revision: number;
      outcome: "running" | "completed" | "failed" | "canceled";
    }
  >();
  let revision = 0;
  function record(
    agentId: string,
    outcome: "running" | "completed" | "failed" | "canceled",
  ) {
    turns.delete(agentId);
    turns.set(agentId, { agentId, revision: ++revision, outcome });
    if (turns.size > 1000) turns.delete(turns.keys().next().value!);
  }
  // Hook snapshots contain earlier conversation. Never narrate the whole snapshot on turn end.
  const removeStart = server.on("agent.turn_started", (e) =>
    record(e.agent.id, "running"),
  );
  const removeEnd = server.on("agent.turn_ended", (e) =>
    record(e.agent.id, e.outcome.kind),
  );
  server.handle(turnStatus, () => ({ turns: [...turns.values()] }));
  server.handle(diagnostics, async () => {
    const s = await settings.read();
    if (s.status !== "ready") throw new Error(s.error);
    return diagnostics.output.parse(
      await worker.request(s.values, { op: "probe" }),
    );
  });
  server.handle(synthesize, async ({ text, kind }) => {
    const s = await settings.read();
    if (s.status !== "ready") throw new Error(s.error);
    const p = s.values;
    if (!p.enabled) throw new Error("Voice is disabled in master settings.");
    if (!allowKind(kind, p)) throw new Error("This content type is disabled.");
    if (!p.secrets && hasSecret(text))
      throw new Error(
        "Possible secret blocked. Use local speech and explicitly enable sensitive text if intended.",
      );
    if (p.backend === "edge") cloudPolicy(text, kind, p);
    const safe = sanitize(text, p);
    if (!safe) throw new Error("No readable text after filtering.");
    const audio = synthesize.output.parse(
      await worker.request(p, {
        backend: p.backend,
        text: safe,
        speed: p.speed,
        voice: p.backend === "edge" ? p.edgeVoice : p.kokoroVoice,
      }),
    );
    const latest = await settings.read();
    if (latest.status !== "ready" || latest.revision !== s.revision)
      throw new Error(
        "Voice settings changed during synthesis. Retry with current settings.",
      );
    return audio;
  });
  return () => {
    removeStart();
    removeEnd();
    worker.dispose();
    turns.clear();
  };
}
