// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import {
  preferences,
  edgeVoices,
  kokoroVoices,
  type Preferences,
} from "../shared/settings";
import { diagnostics } from "../shared/contracts";
import type { VoiceRuntime } from "./runtime";

type Ready = Extract<
  SettingsState<typeof preferences.schema>,
  { status: "ready" }
>;
function Paths({
  settings,
  onClose,
}: {
  settings: Ready;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    values: settings.values,
    revision: settings.revision,
  }));
  const field = (
    key: "pythonPath" | "workerPath" | "kokoroModelDir",
    label: string,
  ) => (
    <SettingsInput
      key={key}
      label={label}
      initialValue={draft.values[key]}
      disabled={settings.saving}
      onChangeText={(v) =>
        setDraft((d) => ({ ...d, values: { ...d.values, [key]: v } }))
      }
    />
  );
  return (
    <SettingsSection title="Local TTS paths (on the daemon machine)">
      <SettingsCard>
        {field("pythonPath", "Python executable")}
        {field("workerPath", "Plugin TTS worker")}
        {field("kokoroModelDir", "Kokoro model directory")}
        <SettingsAction
          label="Save path changes"
          actionLabel="Save"
          disabled={settings.saving}
          onPress={() => {
            void settings.save(draft.values, draft.revision).then((ok) => {
              if (ok) onClose();
            });
          }}
        />
        <SettingsAction
          label="Discard draft / reload latest"
          actionLabel="Reload"
          onPress={onClose}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
function Controls({
  settings,
  theme,
  runtime,
}: {
  settings: Ready;
  theme: PluginSurfaceProps["theme"];
  runtime: VoiceRuntime;
}) {
  const p = settings.values;
  const [pathsOpen, setPathsOpen] = useState(!p.workerPath);
  const probe = useRpc(diagnostics);
  const check = useMutation({ mutationFn: () => probe({}) });
  const save = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    void settings.save({ ...p, [key]: value }, settings.revision);
  };
  const toggle = (
    key:
      | "enabled"
      | "inlineControls"
      | "compactPlan"
      | "assistant"
      | "userMessages"
      | "reasoning"
      | "code"
      | "json"
      | "logs"
      | "secrets"
      | "cloudConsent"
      | "cloudReasoningConsent"
      | "cloudSensitiveConsent",
    label: string,
    hint?: string,
  ) => (
    <SettingsSwitch
      key={key}
      label={label}
      hint={hint}
      value={p[key]}
      disabled={settings.saving}
      onValueChange={(v) => save(key, v)}
    />
  );
  const text = { color: theme.colors.foreground };
  return (
    <View style={{ gap: 16 }}>
      <SettingsSection title="Voice playback">
        <SettingsCard>
          {toggle(
            "enabled",
            "Enable AI Voice Reader",
            "Master switch. Then press Voice On on the agent you want to hear on this client.",
          )}
          <SettingsSelect
            label="TTS backend"
            value={p.backend}
            options={[
              { label: "Edge Neural · Microsoft cloud", value: "edge" },
              { label: "Kokoro · fully offline CPU", value: "kokoro" },
            ]}
            disabled={settings.saving}
            onValueChange={(v) => save("backend", v)}
          />
          {p.backend === "edge" ? (
            <SettingsSelect
              label="Edge voice"
              value={p.edgeVoice}
              options={edgeVoices}
              disabled={settings.saving}
              onValueChange={(v) => save("edgeVoice", v)}
            />
          ) : (
            <SettingsSelect
              label="Kokoro English voice"
              value={String(p.kokoroVoice)}
              options={kokoroVoices}
              disabled={settings.saving}
              onValueChange={(v) => save("kokoroVoice", Number(v))}
            />
          )}
          <SettingsSelect
            label="Playback speed"
            value={String(p.speed)}
            options={[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => ({
              label: `${v}×`,
              value: String(v),
            }))}
            disabled={settings.saving}
            onValueChange={(v) => save("speed", Number(v))}
          />
          <SettingsSelect
            label="Automatic narration scope"
            value={p.scope}
            options={[
              { label: "Current narration target", value: "current" },
              { label: "All active agents on this host", value: "all" },
            ]}
            disabled={settings.saving}
            onValueChange={(v) => save("scope", v)}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Message appearance">
        <SettingsCard>
          {toggle("inlineControls", "Inline voice messages (replaces Paseo's message view)", "Experimental. Paseo's plugin API can only replace whole messages, so markdown, images and attachments are not shown while this is on. Prefer the Voice side panel, which leaves the conversation untouched.")}
          {toggle("compactPlan", "Compact reading plan", "Keep the header plan small; expand it for full text and range selection.")}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Cloud TTS privacy">
        <SettingsCard>
          {toggle(
            "cloudConsent",
            "I allow narration text to be sent to Microsoft Edge TTS",
            "Cloud TTS sends selected readable text to Microsoft. Text may be private. Redaction is best-effort. Kokoro processes it locally without network calls.",
          )}
          {toggle(
            "cloudReasoningConsent",
            "Allow exposed reasoning to Microsoft",
            "Separate opt-in. Only provider-published reasoning timeline text is available. Hidden model reasoning is never accessed.",
          )}
          {toggle(
            "cloudSensitiveConsent",
            "Allow code and sensitive text to Microsoft",
            "High-risk opt-in. Applies only when corresponding content filters are also enabled. Do not enable for secrets or confidential code.",
          )}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Content filters">
        <SettingsCard>
          {toggle("assistant", "Assistant responses")}
          {toggle("userMessages", "Sent messages", "Off by default. Includes your sent text in narration and reading ranges.")}
          {toggle(
            "reasoning",
            "Exposed reasoning",
            "Provider-published timeline items only; availability varies by provider.",
          )}
          {toggle("code", "Source code blocks and inline code")}
          {toggle("json", "Raw JSON")}
          {toggle(
            "logs",
            "Log and stack-trace text",
            "Applies inside assistant/reasoning text. Tool-call timeline items are always excluded.",
          )}
          {toggle(
            "secrets",
            "Text matching secret patterns",
            "Off by default. Pattern matching cannot identify every secret. Prefer offline Kokoro for private text.",
          )}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Backend check">
        <SettingsCard>
          <SettingsAction
            label="Check local Python packages and model files"
            actionLabel={check.isPending ? "Checking…" : "Check"}
            disabled={check.isPending}
            onPress={() => check.mutate()}
          />
          <SettingsAction
            label="Play public canned sentences on this client"
            actionLabel="Test voice"
            onPress={() => {
              runtime.testVoice();
              runtime.client.openScreen({ screenId: "reader" });
            }}
          />
          <SettingsAction
            label="Playback and range selector"
            actionLabel="Open reader"
            onPress={() => {
              runtime.client.openScreen({ screenId: "reader" });
            }}
          />
        </SettingsCard>
        {check.data ? (
          <Text style={text}>
            Edge package: {check.data.edge ? "ready" : "missing"} · Kokoro
            package: {check.data.kokoro ? "ready" : "missing"} · Local model:{" "}
            {check.data.model ? "ready" : "missing"}. {check.data.detail}
          </Text>
        ) : null}
        {check.error ? (
          <Text accessibilityRole="alert" style={text}>
            {check.error.message}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.foregroundMuted }}>
          Pause, Stop, and Skip apply at sentence boundaries. Paseo 0.11.4
          exposes no mid-file pause/cancel handle. Narration starts from new
          output; use the range panel to read history. Current scope follows the
          agent chosen in this plugin, since the SDK exposes no active-composer
          focus event.
        </Text>
      </SettingsSection>
      <SettingsAction
        label="Python and local model paths"
        actionLabel={pathsOpen ? "Close editor" : "Edit paths"}
        onPress={() => setPathsOpen((v) => !v)}
      />
      {pathsOpen ? (
        <Paths settings={settings} onClose={() => setPathsOpen(false)} />
      ) : null}
      {settings.saveError ? (
        <Text accessibilityRole="alert" style={text}>
          {settings.saveError}
        </Text>
      ) : null}
    </View>
  );
}
export function createSettings(runtime: VoiceRuntime) {
  return function VoiceSettings({ theme }: PluginSurfaceProps) {
    const settings = useSettings(preferences);
    useEffect(() => {
      if (settings.status === "ready") runtime.setSettings(settings.values);
    }, [
      settings.status,
      settings.status === "ready" ? settings.revision : undefined,
    ]);
    if (settings.status === "loading")
      return (
        <Text style={{ color: theme.colors.foreground }}>
          Loading voice settings…
        </Text>
      );
    if (settings.status !== "ready")
      return (
        <SettingsSection title="Voice settings unavailable">
          <Text
            accessibilityRole="alert"
            style={{ color: theme.colors.foreground }}
          >
            {settings.error}
          </Text>
          <SettingsAction
            label="Read saved settings again"
            actionLabel="Reload"
            onPress={() => {
              void settings.reload();
            }}
          />
          {settings.status === "invalid" ? (
            <SettingsAction
              label="Explicitly restore defaults"
              actionLabel="Reset"
              onPress={() => {
                void settings.reset();
              }}
            />
          ) : null}
        </SettingsSection>
      );
    return <Controls settings={settings} theme={theme} runtime={runtime} />;
  };
}
