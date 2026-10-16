// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import contribute from "../index.server";
import { settingsSchema } from "../shared/settings";
function fixture() {
  const handlers = new Map<string, (input: any) => Promise<any>>();
  const hooks = new Map<string, (event: any) => void>();
  let values = settingsSchema.parse({});
  const server = {
    registerSettings(def: any) {
      assert.equal(def.id, "voice");
      return {
        read: async () => ({ status: "ready", values, revision: "1" }),
        subscribe() {
          return () => {};
        },
      };
    },
    handle(contract: any, handler: any) {
      handlers.set(contract.name, handler);
    },
    on(name: string, handler: any) {
      hooks.set(name, handler);
      return () => {
        hooks.delete(name);
      };
    },
  } as unknown as PluginServerContext;
  return {
    handlers,
    hooks,
    cleanup: contribute(server),
    set(p: object) {
      values = settingsSchema.parse(p);
    },
  };
}
test("official server settings registration and agent.turn_ended hooks, including cancellations", async () => {
  const f = fixture();
  try {
    const agent = { id: "a" };
    f.hooks.get("agent.turn_started")!({ agent, turnId: "same" });
    let result = await f.handlers.get("voice.turn-status")!({});
    assert.equal(result.turns[0].outcome, "running");
    f.hooks.get("agent.turn_ended")!({
      agent,
      turnId: "same",
      outcome: { kind: "completed" },
      timeline: [
        {
          type: "assistant_message",
          text: "Old history must not be narrated.",
        },
      ],
    });
    result = await f.handlers.get("voice.turn-status")!({});
    assert.equal(result.turns[0].outcome, "completed");
    assert.equal(result.turns[0].revision, 2);
    f.hooks.get("agent.turn_ended")!({
      agent,
      turnId: "same",
      outcome: { kind: "canceled" },
      timeline: [],
    });
    result = await f.handlers.get("voice.turn-status")!({});
    assert.equal(result.turns[0].outcome, "canceled");
  } finally {
    await f.cleanup();
  }
  assert.equal(f.hooks.size, 0);
});
test("server enforces master, cloud, exposed reasoning and secret policy before launching worker", async () => {
  const f = fixture();
  const synth = f.handlers.get("voice.synthesize")!;
  try {
    await assert.rejects(
      synth({ text: "Hello.", kind: "assistant_message" }),
      /disabled/,
    );
    f.set({ enabled: true });
    await assert.rejects(synth({ text: "Sent text.", kind: "user_message" }), /content type is disabled/);
    await assert.rejects(
      synth({ text: "Hello.", kind: "assistant_message" }),
      /Microsoft/,
    );
    f.set({ enabled: true, cloudConsent: true, reasoning: true });
    await assert.rejects(
      synth({ text: "Exposed reasoning.", kind: "reasoning" }),
      /separate consent/,
    );
    await assert.rejects(
      synth({ text: "api_key=privatevalue", kind: "assistant_message" }),
      /secret/,
    );
    await assert.rejects(
      synth({ text: "const x = 1;", kind: "assistant_message" }),
      /Sensitive/,
    );
  } finally {
    await f.cleanup();
  }
});
