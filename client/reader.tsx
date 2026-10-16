// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginButtonContentProps, PluginHostProps, PluginSurfaceProps } from '@getpaseo/plugin/client';
import { SettingsSelect } from '@getpaseo/plugin/client/ui';
import { spokenText } from '../shared/presentation';
import type { ReadMessage } from "../shared/timeline";
import { allowKind } from '../shared/text';
import { FullText, IconButton, MiniPlayer, SwitchRow, TextButton, useVoice } from './voice-ui';
import type { VoiceRuntime } from './runtime';

type Theme = PluginHostProps['theme'];
type Props = PluginHostProps & { workspaceId?: string; popover?: boolean; close?: () => void };
export function createReadingPlan(runtime: VoiceRuntime) {
  return function ReadingPlan({ theme, layout, workspaceId, popover = false, close }: Props) {
    useVoice(runtime);
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
    const visible = range ? messages.slice(from, to + 1) : messages.slice(-(compact ? 6 : limit));
    const included = visible.filter(m => m.complete && !runtime.isExcluded(id, m.id) && spokenText(m, runtime.settings));
    const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
    const on = !!id && runtime.shouldSpeak(id);
    const agent = runtime.agents.get(id);
    const play = () => {
      runtime.select(id);
      if (range) runtime.playRange(id, range.start, range.end);
      else if (visible.length) runtime.playRange(id, visible[0].id, visible[visible.length - 1].id);
    };
    const openRail = () => {
      const ws = agent?.workspaceId ?? workspaceId;
      if (!ws || !id) return;
      runtime.select(id);
      runtime.client.openPanel('voice-rail', { workspaceId: ws, agentId: id, location: 'explorer' });
      close?.();
    };
    const divider = { borderBottomWidth: 1, borderColor: theme.colors.border };
    return <View style={{ flex: popover ? undefined : 1, width: popover && !layout.compact ? (compact ? 400 : 540) : undefined, maxWidth: '100%', backgroundColor: theme.colors.surface0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, ...divider }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: '600', flex: 1 }}>Reading plan</Text>
        <IconButton theme={theme} icon="Volume2" label="Test voice" onPress={() => runtime.testVoice()} />
        <IconButton theme={theme} icon="Settings" label="Voice settings" onPress={() => runtime.client.openSettings('voice')} />
        <IconButton theme={theme} icon={compact ? 'Maximize2' : 'Minimize2'} label={compact ? 'Expand reading plan' : 'Shrink reading plan'}
          disabled={runtime.savingAppearance} onPress={() => { void runtime.setAppearance({ compactPlan: !compact }); }} />
        {close ? <IconButton theme={theme} icon="X" label="Close reading plan" onPress={close} /> : null}
      </View>
      <ScrollView style={popover ? { maxHeight: compact ? 440 : layout.compact ? 600 : 640 } : { flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
        <View style={{ paddingHorizontal: 12, ...divider }}>
          <SwitchRow theme={theme} label="Auto-read new replies" value={on} disabled={!id} onChange={() => runtime.toggle(id)}
            detail={`${runtime.settings.scope === 'all' ? 'all agents' : 'this agent'} · ${runtime.settings.backend === 'kokoro' ? 'Kokoro offline' : 'Edge cloud'} · ${runtime.settings.speed}×`} />
          <SwitchRow theme={theme} label="Voice controls in messages" value={runtime.settings.inlineControls} disabled={runtime.savingAppearance}
            detail="Redraws AI replies and thinking; your messages and images stay native"
            onChange={() => { void runtime.setAppearance({ inlineControls: !runtime.settings.inlineControls }); }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Open voice side panel" disabled={!id} onPress={openRail}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, opacity: id ? 1 : 0.5 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13, flex: 1 }}>Voice side panel<Text style={muted}>  · leaves the chat untouched</Text></Text>
            <Icon name="PanelRight" size={15} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
        {runtime.appearanceError || runtime.notice ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground, fontSize: 12, paddingHorizontal: 12, paddingTop: 8 }}>{runtime.appearanceError || runtime.notice}</Text> : null}
        {!compact ? <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <SettingsSelect label="Agent" value={id} disabled={!agents.length}
            options={agents.map(a => ({ label: `${a.title ?? a.id} · ${a.provider}`, value: a.id }))}
            onValueChange={value => { setSelected(value); runtime.select(value); }} />
        </View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 }}>
          <Text style={{ ...muted, flex: 1 }}>{range ? `Selected range · ${included.length} to read` : `Latest ${visible.length} messages · ${included.length} to read`}</Text>
          {!compact ? <TextButton theme={theme} icon="History" label="Load older" disabled={!id}
            onPress={() => { void runtime.loadOlder(id).catch(e => runtime.error(e instanceof Error ? e.message : 'History read failed.')); }} /> : null}
        </View>
        <View style={{ padding: 6, gap: 2 }}>
          {!messages.length ? <Text style={{ ...muted, padding: 6 }}>Waiting for messages from this agent.</Text> : null}
          {!range && !compact && messages.length > limit ? <TextButton theme={theme} icon="ChevronUp" label="Show earlier messages" onPress={() => setLimit(n => n + 50)} /> : null}
          {visible.map(m => <PlanRow key={m.id} message={m} runtime={runtime} agentId={id} theme={theme} />)}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
        <View style={{ flex: 1, minWidth: 0 }}><MiniPlayer runtime={runtime} theme={theme} showStatus={!compact} /></View>
        {range ? <TextButton theme={theme} icon="X" label="Clear range" onPress={() => runtime.clearRange(id)} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={range ? 'Play range' : 'Play'} disabled={!included.length} onPress={play}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 8,
            backgroundColor: theme.colors.accent, opacity: !included.length ? 0.45 : pressed ? 0.75 : 1 })}>
          <Icon name="Play" size={13} color={theme.colors.accentForeground ?? theme.colors.surface0} />
          <Text style={{ color: theme.colors.accentForeground ?? theme.colors.surface0, fontSize: 13, fontWeight: '600' }}>{range ? 'Play range' : 'Play'}</Text>
        </Pressable>
      </View>
    </View>;
  };
}
function PlanRow({ message: m, runtime, agentId: id, theme }: { message: ReadMessage; runtime: VoiceRuntime; agentId: string; theme: Theme }) {
  const audio = useVoice(runtime);
  const [open, setOpen] = useState(false);
  const range = runtime.selection(id);
  const excluded = runtime.isExcluded(id, m.id);
  const allowed = allowKind(m.kind, runtime.settings);
  const spoken = spokenText(m, runtime.settings);
  const speaking = audio.current?.agentId === id && audio.current?.messageId === m.id;
  const checked = allowed && !excluded && !!spoken;
  const role = m.kind === 'user_message' ? 'You' : m.kind === 'reasoning' ? 'Thinking' : runtime.agents.get(id)?.provider ?? 'Assistant';
  const status = !m.complete ? 'streaming' : speaking ? 'speaking' : !allowed ? 'filter off' : excluded ? 'skipped' : !spoken ? 'filtered' : 'will read';
  const tag = range?.start === m.id ? ' · start' : range?.end === m.id ? ' · end' : '';
  return <View style={{ flexDirection: 'row', gap: 8, padding: 6, borderRadius: 8, alignItems: 'flex-start', backgroundColor: speaking ? theme.colors.surface2 : 'transparent' }}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`Read ${role} message`} accessibilityState={{ checked, disabled: !allowed }}
      disabled={!allowed} onPress={() => runtime.toggleExcluded(id, m.id)}
      style={{ width: 16, height: 16, marginTop: 2, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
        borderColor: checked ? theme.colors.accent : theme.colors.border, backgroundColor: checked ? theme.colors.accent : 'transparent' }}>
      {checked ? <Icon name="Check" size={11} color={theme.colors.accentForeground ?? theme.colors.surface0} /> : null}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${role} message`} onPress={() => setOpen(v => !v)} style={{ flex: 1, gap: 2, opacity: checked || speaking ? 1 : 0.6 }}>
      <Text style={{ fontSize: 11, color: speaking ? theme.colors.accent : theme.colors.foregroundMuted }}>{role} · {status}{tag}</Text>
      {open || speaking
        ? <FullText text={spoken || m.text} current={speaking ? audio.current?.text : undefined} offset={speaking ? audio.current?.offset : undefined} theme={theme} />
        : <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 19 }}>{spoken || m.text}</Text>}
      {open ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
        <TextButton theme={theme} icon="Volume2" label="Read" disabled={!m.complete} onPress={() => runtime.playMessage(id, m)} />
        <TextButton theme={theme} icon="ArrowDownToLine" label="Range start" disabled={!m.complete} onPress={() => runtime.setBoundary(id, m.id, 'start')} />
        <TextButton theme={theme} icon="ArrowUpToLine" label="Range end" disabled={!m.complete} onPress={() => runtime.setBoundary(id, m.id, 'end')} />
      </View> : null}
    </Pressable>
    <IconButton theme={theme} icon="Play" label={`Read ${role} message now`} disabled={!m.complete} onPress={() => runtime.playMessage(id, m)} />
  </View>;
}
export function createReader(runtime: VoiceRuntime) {
  const Plan = createReadingPlan(runtime);
  return function Reader(props: PluginSurfaceProps & { workspaceId?: string }) { return <Plan {...props} />; };
}
export function createHeaderPlan(runtime: VoiceRuntime) {
  const Plan = createReadingPlan(runtime);
  return function HeaderPlan(props: PluginButtonContentProps) { return <Plan {...props} popover />; };
}
