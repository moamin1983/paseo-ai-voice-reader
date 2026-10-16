// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { PluginButtonContentProps, PluginHostProps, PluginSurfaceProps } from '@getpaseo/plugin/client';
import { SettingsSelect } from '@getpaseo/plugin/client/ui';
import { kindLabel, spokenText } from '../shared/presentation';
import { allowKind } from '../shared/text';
import { FullText, Transport, VoiceButton, useVoice } from './voice-ui';
import type { VoiceRuntime } from './runtime';

type Props = PluginHostProps & { workspaceId?: string; popover?: boolean; close?: () => void };
export function createReadingPlan(runtime: VoiceRuntime) {
  return function ReadingPlan({ theme, layout, workspaceId, popover = false, close }: Props) {
    const audio = useVoice(runtime);
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
    return <View style={{ flex: popover ? undefined : 1, width: popover && !layout.compact ? 560 : undefined, maxWidth: '100%', backgroundColor: theme.colors.surface0 }}>
      <ScrollView style={popover ? { maxHeight: layout.compact ? 620 : 660 } : { flex: 1 }} contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 20, fontWeight: '600' }}>What will be read</Text>
          {close ? button('Close reading plan', close, 'X') : null}
        </View>
        <Text style={muted}>{runtime.settings.scope === 'all' ? 'Automatic narration: all active agents' : 'Automatic narration: chosen agent'} · {runtime.settings.backend === 'kokoro' ? 'Kokoro offline' : 'Edge cloud'} · {runtime.settings.speed}×</Text>
        <SettingsSelect label="Reading plan for agent" value={id} disabled={!agents.length}
          options={agents.map(a => ({ label: `${a.title ?? a.id} · ${a.provider}`, value: a.id }))}
          onValueChange={value => { setSelected(value); runtime.select(value); }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {button(runtime.shouldSpeak(id) ? 'Voice Off' : 'Voice On', () => runtime.toggle(id), runtime.shouldSpeak(id) ? 'VolumeX' : 'Volume2', !id)}
          {button('Settings', () => runtime.client.openSettings('voice'), 'Settings')}
          {button('Test voice', () => runtime.testVoice(), 'Volume2')}
        </View>
        {queued.length ? <View style={{ borderColor: theme.colors.accent, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>Current playback · exact remaining text</Text>
          {queued.map((s, i) => <View key={`${s.agentId}:${s.messageId}:${i}`} style={{ gap: 3 }}>
            <Text style={muted}>{i === 0 && audio.current ? audio.status : 'Queued'} · {runtime.agents.get(s.agentId)?.title ?? (s.agentId === 'voice-test' ? 'Voice test' : s.agentId)} · {kindLabel(s.kind)}</Text>
            <FullText text={s.text} current={i === 0 ? audio.current?.text : undefined} theme={theme} />
          </View>)}
        </View> : <Text style={muted}>{runtime.armed ? 'Waiting for newly completed sentences. Earlier messages below are a preview until you press Play.' : 'Automatic voice is off. The messages below are a preview until you press Play.'}</Text>}
        <Transport runtime={runtime} theme={theme} />
        {runtime.notice ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>{runtime.notice}</Text> : null}
        <Text style={{ color: theme.colors.foreground, fontWeight: '600', fontSize: 16 }}>{range ? 'Selected reading range' : `Recent ${visible.length} loaded messages · preview`}</Text>
        <Text style={muted}>{range ? 'Start and end are included.' : 'Choose a start and end beside any message, or play this preview.'} {included.length} complete items will be read. Code, JSON, log text and possible secrets follow your content filters. Only exposed thinking is available.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {button('Play', play, 'Play', !included.length, true)}
          {range ? button('Clear range', () => runtime.clearRange(id), 'X') : null}
          {button('Load older timeline messages', () => { void runtime.loadOlder(id).catch(e => runtime.error(e instanceof Error ? e.message : 'History read failed.')); }, 'History', !id)}
          {!range && messages.length > limit ? button('Show more loaded messages', () => setLimit(n => n + 50), 'ChevronUp') : null}
        </View>
        {!messages.length ? <Text style={muted}>Waiting for timeline messages. Choose an agent with conversation history.</Text> : null}
        {visible.map(m => {
          const excluded = runtime.isExcluded(id, m.id);
          const allowed = allowKind(m.kind, runtime.settings);
          const spoken = spokenText(m, runtime.settings);
          const active = audio.current?.agentId === id && audio.current?.messageId === m.id;
          return <View key={m.id} style={{ borderWidth: 1, borderColor: active || range?.start === m.id || range?.end === m.id ? theme.colors.accent : theme.colors.border, borderRadius: 10, padding: 12, gap: 10 }}>
            {range?.start === m.id ? <Text style={{ color: theme.colors.accent, fontWeight: '600', fontSize: 12 }}>Start of selected range</Text> : null}
            <Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>{kindLabel(m.kind)} · {!m.complete ? 'Streaming' : !allowed ? 'Not included · filter off' : excluded ? 'Excluded' : spoken ? 'Included' : 'Filtered out'}</Text>
            <FullText text={spoken || m.text} current={active ? audio.current?.text : undefined} offset={active ? audio.current?.offset : undefined} theme={theme} />
            {!spoken ? <Text style={muted}>Source shown for reference. This text will not be read with the current filters.</Text> : null}
            {spoken && spoken !== m.text ? <OriginalText text={m.text} theme={theme} /> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {button('Read message', () => runtime.playMessage(id, m), 'Play', !m.complete)}
              {button('Start reading here', () => runtime.setBoundary(id, m.id, 'start'), 'ListStart', !m.complete)}
              {button('Stop reading here', () => runtime.setBoundary(id, m.id, 'end'), 'ListEnd', !m.complete)}
              {button(excluded ? 'Include in reading' : 'Exclude from reading', () => runtime.toggleExcluded(id, m.id), undefined, !allowed)}
            </View>
            {range?.end === m.id ? <Text style={{ color: theme.colors.accent, fontWeight: '600', fontSize: 12 }}>End of selected range</Text> : null}
          </View>;
        })}
      </ScrollView>
    </View>;
  };
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
