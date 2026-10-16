// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const settingsSchema = z.object({
  enabled: z.boolean().default(false),
  inlineControls: z.boolean().default(false),
  compactPlan: z.boolean().default(true),
  backend: z.enum(["edge", "kokoro"]).default("edge"),
  cloudConsent: z.boolean().default(false),
  cloudReasoningConsent: z.boolean().default(false),
  cloudSensitiveConsent: z.boolean().default(false),
  edgeVoice: z
    .string()
    .regex(/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/)
    .default("en-US-AriaNeural"),
  kokoroVoice: z.number().int().min(0).max(10).default(0),
  speed: z.number().min(0.5).max(2).default(1),
  scope: z.enum(["current", "all"]).default("current"),
  assistant: z.boolean().default(true),
  userMessages: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  code: z.boolean().default(false),
  json: z.boolean().default(false),
  logs: z.boolean().default(false),
  secrets: z.boolean().default(false),
  pythonPath: z
    .string()
    .default("python3"),
  workerPath: z
    .string()
    .default(""),
  kokoroModelDir: z
    .string()
    .default(""),
});
export type Preferences = z.output<typeof settingsSchema>;
export const preferences = defineSettings({
  id: "voice",
  scope: "host",
  version: 1,
  schema: settingsSchema,
});
export const edgeVoices = [
  ["Aria · English US", "en-US-AriaNeural"],
  ["Jenny · English US", "en-US-JennyNeural"],
  ["Guy · English US", "en-US-GuyNeural"],
  ["Sonia · English UK", "en-GB-SoniaNeural"],
  ["Ryan · English UK", "en-GB-RyanNeural"],
  ["Salma · Arabic Egypt", "ar-EG-SalmaNeural"],
  ["Shakir · Arabic Egypt", "ar-EG-ShakirNeural"],
  ["Denise · French", "fr-FR-DeniseNeural"],
  ["Katja · German", "de-DE-KatjaNeural"],
  ["Elvira · Spanish", "es-ES-ElviraNeural"],
].map(([label, value]) => ({ label, value }));
export const kokoroVoices = [
  "af",
  "af_bella",
  "af_nicole",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_michael",
  "bf_emma",
  "bf_isabella",
  "bm_george",
  "bm_lewis",
].map((label, i) => ({ label, value: String(i) }));
