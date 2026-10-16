// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import type {
  PluginClientContext,
  PluginScreenProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { createReader, createHeaderPlan } from "./client/reader";
import { createSettings } from "./client/settings";
import { registerVoiceTimeline } from "./client/timeline";
import { VoiceRuntime } from "./client/runtime";

export default function contribute(client: PluginClientContext) {
  const runtime = new VoiceRuntime(client);
  const Reader = createReader(runtime);
  runtime.headerContent = createHeaderPlan(runtime);
  const cleanups = [
    registerVoiceTimeline(client, runtime),
    client.addSettingsScreen({
      id: "voice",
      title: "AI Voice Reader",
      icon: "Volume2",
      Component: createSettings(runtime),
    }),
    client.addScreen({
      id: "reader",
      title: "AI Voice Reader",
      Component: (p: PluginScreenProps) => <Reader {...p} />,
    }),
    client.addWorkspacePanel({
      id: "reader",
      title: "Voice Reader",
      icon: "Volume2",
      context: "workspace",
      Component: (p: PluginWorkspacePanelProps) => <Reader {...p} />,
    }),
    client.addCommandCenterItem({
      id: "settings",
      title: "AI Voice Reader: settings and privacy",
      icon: "Settings",
      context: "global",
      onSelect: () => client.openSettings("voice"),
    }),
    client.addCommandCenterItem({
      id: "reader",
      title: "AI Voice Reader: playback and message range",
      icon: "Volume2",
      context: "agent",
      onSelect: ({ agent, openPanel }) => {
        runtime.select(agent.id);
        openPanel("reader");
      },
    }),
    client.addSlashCommand({
      name: "voice",
      argumentHint: "",
      description: "Open native narration controls and message range",
      context: "agent",
      onSubmit: ({ agent, openPanel }) => {
        runtime.select(agent.id);
        openPanel("reader");
      },
    }),
  ];
  void runtime.start();
  return () => {
    runtime.dispose();
    for (const remove of cleanups) void remove();
  };
}
