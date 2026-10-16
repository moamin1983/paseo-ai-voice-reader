// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
export const speechKind = z.enum(["assistant_message", "reasoning", "user_message"]);
export const synthesize = defineRpc({
  name: "voice.synthesize",
  input: z.object({
    text: z.string().min(1).max(5000),
    kind: speechKind,
  }),
  output: z.object({
    base64: z.string().max(12_000_000),
    mimeType: z.enum(["audio/wav", "audio/mpeg"]),
  }),
});
export const diagnostics = defineRpc({
  name: "voice.diagnostics",
  input: z.object({}),
  output: z.object({
    edge: z.boolean(),
    kokoro: z.boolean(),
    model: z.boolean(),
    detail: z.string(),
  }),
});
export const turnStatus = defineRpc({
  name: "voice.turn-status",
  input: z.object({}),
  output: z.object({
    turns: z.array(
      z.object({
        agentId: z.string(),
        revision: z.number(),
        outcome: z.enum(["running", "completed", "failed", "canceled"]),
      }),
    ),
  }),
});
