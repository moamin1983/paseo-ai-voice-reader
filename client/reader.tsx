// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { PluginButtonContentProps, PluginHostProps, PluginSurfaceProps } from '@getpaseo/plugin/client';
import { SettingsSelect } from '@getpaseo/plugin/client/ui';
import { kindLabel, spokenText } from '../shared/presentation';
import type { ReadMessage } from "../shared/timeline";
import { allowKind } from '../shared/text';
import { FullText, MessageActions, Transport, VoiceButton, useVoice } from './voice-ui';
import type { VoiceRuntime } from './runtime';

type Props = PluginHostProps & { workspaceId?: string; popover?: boolean; close?: () => void };
export function createReadingPlan(runtime: VoiceRuntime) {
  return function ReadingPlan({ theme, layout, workspaceId, popover = false, close }: Props) {
    const audio = useVoice(runtime);
    const compact = runtime.settings.compactPlan;
    const agents = [...runtime.agents.values()].filter(a => !workspaceId || a.workspaceId === workspaceId);
    const [selected, setSelected] = useState(runtime.viewed ?? runtime.target ?? '');
    const [limit, setLimit] = useState(20);
    const id = agents.some(a => a.id === selected) ? selected : agents[0]?.id ?? '';
    useEffect(() => id ? runtime.watchAgent(id) : undefined, [id]);
    useEffect(() => setLimit(20), [id]);
    const messages = runtime.feeds.get(id)?.reader.messages ?? [];
    const range = runtime.selection(id);
    const from = messages.findIndex(m => m.id === range?.start);
    const to = messages.findIndex(m => m.id === range?.end);
    const visible = range ? messages.slice(from, to + 1) : messages.slice(-limit);
    const included = visible.filter(m => m.complete && !runtime.isExcluded(id, m.id) && spokenText(m, runtime.settings));
    const queued = runtime.queue.items();
    const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
    const button = (label: string, onPress: () => void, icon?: string, disabled = false, primary = false) => <VoiceButton key={label} theme={theme} label={label} icon={icon} onPress={onPress} disabled={disabled} primary={primary} />;
    const play = () => {
      runtime.select(id);
      if (range) runtime.playRange(id, range.start, range.end);
      else if (visible.length) runtime.playRange(id, visible[0].id, visible[visible.length - 1].id);
    };
    return <View style={{ flex: popover ? undefined : 1, width: popover && !layout.compact ? (compact ? 420 : 560) : undefined, maxWidth: '100%', backgroundColor: theme.colors.surface0 }}>
      <ScrollView style={popover ? { maxHeight: compact ? 390 : layout.compact ? 620 : 660 } : { flex: 1 }} contentContainerStyle={{ padding: compact || layout.compact ? 12 : 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 20, fontWeight: '600' }}>What will be read</Text>
          {close ? button('Close reading plan', close, 'X') : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {button(runtime.settings.inlineControls ? 'Hide message voice UI' : 'Show message voice UI', () => { void runtime.setAppearance({ inlineControls: !runtime.settings.inlineControls }); }, runtime.settings.inlineControls ? 'EyeOff' : 'Eye', runtime.savingAppearance)}
          {button(compact ? 'Expand reading plan' : 'Shrink reading plan', () => { void runtime.setAppearance({ compactPlan: !compact }); }, compact ? 'ChevronDown' : 'ChevronUp', runtime.savingAppearance)}
        </View>
        {runtime.appearanceError ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>{runtime.appearanceError}</Text> : null}
        {compact ? <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{runtime.agents.get(id)?.title ?? 'Choose an agent in the expanded plan'}</Text> : null}
        <Text style={muted}>{runtime.settings.scope === 'all' ? 'Automatic narration: all active agents' : 'Automatic narration: chosen agent'} · {runtime.settings.backend === 'kokoro' ? 'Kokoro offline' : 'Edge cloud'} · {runtime.settings.speed}×</Text>
        {!compact ? <SettingsSelect label="Reading plan for agent" value={id} disabled={!agents.length}
          options={agents.map(a => ({ label: `${a.title ?? a.id} · ${a.provider}`, value: a.id }))}
          onValueChange={value => { setSelected(value); runtime.select(value); }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {button(runtime.shouldSpeak(id) ? 'Voice Off' : 'Voice On', () => runtime.toggle(id), runtime.shouldSpeak(id) ? 'VolumeX' : 'Volume2', !id)}
          {button('Settings', () => runtime.client.openSettings('voice'), 'Settings')}
          {button('Test voice', () => runtime.testVoice(), 'Volume2')}
        </View>
        {!compact && queued.length ? <View style={{ borderColor: theme.colors.accent, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>Current playback · exact remaining text</Text>
          {queued.map((s, i) => <View key={`${s.agentId}:${s.messageId}:${i}`} style={{ gap: 3 }}>
            <Text style={muted}>{i === 0 && audio.current ? audio.status : 'Queued'} · {runtime.agents.get(s.agentId)?.title ?? (s.agentId === 'voice-test' ? 'Voice test' : s.agentId)} · {kindLabel(s.kind)}</Text>
            <FullText text={s.text} current={i === 0 ? audio.current?.text : undefined} theme={theme} />
          </View>)}
        </View> : !queued.length ? <Text style={muted}>{runtime.armed ? 'Waiting for newly completed sentences. Earlier messages below are a preview until you press Play.' : 'Automatic voice is off. The messages below are a preview until you press Play.'}</Text> : null}
        {compact && queued[0] ? <View style={{ gap: 5 }}><Text style={muted}>Current / next sentence · {runtime.agents.get(queued[0].agentId)?.title ?? 'Voice playback'}</Text><FullText text={queued[0].text} theme={theme} /></View> : null}
        <Transport runtime={runtime} theme={theme} compact={compact} />
        {runtime.notice ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>{runtime.notice}</Text> : null}
        {compact ? <View style={{ gap: 8 }}>
          <Text style={muted}>{range ? `${included.length} items in selected range` : 'Expand for full message text, agent selection and range controls.'}</Text>
          {range ? <View style={{ flexDirection: 'row', gap: 8 }}>{button('Play', play, 'Play', !included.length, true)}{button('Clear range', () => runtime.clearRange(id), 'X')}</View> : null}
        </View> : <>
        <Text style={{ color: theme.colors.foreground, fontWeight: '600', fontSize: 16 }}>{range ? 'Selected reading range' : `Recent ${visible.length} loaded messages · preview`}</Text>
        <Text style={muted}>{range ? 'Start and end are included.' : 'Choose a start and end beside any message, or play this preview.'} {included.length} complete items will be read. Code, JSON, log text and possible secrets follow your content filters. Only exposed thinking is available.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {button('Play', play, 'Play', !included.length, true)}
          {range ? button('Clear range', () => runtime.clearRange(id), 'X') : null}
          {button('Load older timeline messages', () => { void runtime.loadOlder(id).catch(e => runtime.error(e instanceof Error ? e.message : 'History read failed.')); }, 'History', !id)}
          {!range && messages.length > limit ? button('Show more loaded messages', () => setLimit(n => n + 50), 'ChevronUp') : null}
        </View>
        {!messages.length ? <Text style={muted}>Waiting for timeline messages. Choose an agent with conversation history.</Text> : null}
        {visible.map(m => <PlanMessage key={m.id} message={m} runtime={runtime} agentId={id} theme={theme} />)}
        </>}
      </ScrollView>
    </View>;
  };
}
function PlanMessage({ message: m, runtime, agentId: id, theme }: { message: ReadMessage; runtime: VoiceRuntime; agentId: string; theme: PluginHostProps['theme'] }) {
  const audio = useVoice(runtime);
  const [preview, setPreview] = useState(false);
  const range = runtime.selection(id);
  const excluded = runtime.isExcluded(id, m.id);
  const allowed = allowKind(m.kind, runtime.settings);
  const spoken = spokenText(m, runtime.settings);
  const active = audio.current?.agentId === id && audio.current?.messageId === m.id;
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  return <View style={{ borderWidth: 1, borderColor: active || range?.start === m.id || range?.end === m.id ? theme.colors.accent : theme.colors.border, borderRadius: 10, padding: 10, gap: 10 }}>
    {range?.start === m.id ? <Text style={{ color: theme.colors.accent, fontWeight: '600', fontSize: 12 }}>Start of selected range</Text> : null}
    <Text style={{ color: theme.colors.foreground, fontWeight: '700' }}>{m.kind === "user_message" ? "You · sent message" : m.kind === "reasoning" ? "Exposed thinking" : `Assistant · ${runtime.agents.get(id)?.provider ?? "AI"}`} · {!m.complete ? 'Streaming' : !allowed ? 'Not included · filter off' : excluded ? 'Excluded' : spoken ? 'Included' : 'Filtered out'}</Text>
    <FullText text={spoken || m.text} current={active ? audio.current?.text : undefined} offset={active ? audio.current?.offset : undefined} theme={theme} />
    {!spoken ? <Text style={muted}>Source shown for reference. This text will not be read with the current filters.</Text> : null}
    <MessageActions theme={theme} excluded={excluded} preview={preview} canStart={m.complete} canExclude={allowed}
      canStop={!!audio.current || !!audio.pending || runtime.armed}
      onStart={() => runtime.playMessage(id, m)} onStop={() => runtime.stop()}
      onExclude={() => runtime.toggleExcluded(id, m.id)} onPreview={() => setPreview(v => !v)} />
    {preview ? <View style={{ gap: 10 }}>
      <Text style={muted}>Full spoken preview and reading range</Text>
      <FullText text={spoken || 'This message is excluded by the content filters.'} theme={theme} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <VoiceButton theme={theme} label="Start range here" onPress={() => runtime.setBoundary(id, m.id, 'start')} disabled={!m.complete} />
        <VoiceButton theme={theme} label="End range here" onPress={() => runtime.setBoundary(id, m.id, 'end')} disabled={!m.complete} />
      </View>
      {spoken && spoken !== m.text ? <OriginalText text={m.text} theme={theme} /> : null}
    </View> : null}
    {range?.end === m.id ? <Text style={{ color: theme.colors.accent, fontWeight: '600', fontSize: 12 }}>End of selected range</Text> : null}
  </View>;
}
function OriginalText({ text, theme }: { text: string; theme: PluginHostProps['theme'] }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}><VoiceButton theme={theme} label={open ? 'Hide original message' : 'Show full original message'} icon="FileText" onPress={() => setOpen(v => !v)} />{open ? <FullText text={text} theme={theme} /> : null}</View>;
}
export function createReader(runtime: VoiceRuntime) {
  const Plan = createReadingPlan(runtime);
  return function Reader(props: PluginSurfaceProps & { workspaceId?: string }) { return <Plan {...props} />; };
}
export function createHeaderPlan(runtime: VoiceRuntime) {
  const Plan = createReadingPlan(runtime);
  return function HeaderPlan(props: PluginButtonContentProps) { return <Plan {...props} popover />; };
}
