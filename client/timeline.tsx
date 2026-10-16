// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRevealedText, Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginClientContext, PluginTimelineItemProps } from '@getpaseo/plugin/client';
import { voiceRowSchema, spokenText, type VoiceRow } from '../shared/presentation';
import { allowKind } from '../shared/text';
import { Chip, FullText, MiniPlayer, RichText, TextButton, useVoice } from './voice-ui';
import type { VoiceRuntime } from './runtime';

export function createVoiceRow(runtime: VoiceRuntime) {
  return function VoiceRowView({ agentId, item, timestamp, theme, layout }: PluginTimelineItemProps<VoiceRow>) {
    const audio = useVoice(runtime);
    const data = item.data;
    const thinking = data.kind === 'reasoning';
    const mine = data.kind === 'user_message';
    const revealed = useRevealedText(data.text, data.phase);
    const [open, setOpen] = useState(!thinking);
    const [more, setMore] = useState(false);
    useEffect(() => runtime.watchAgent(agentId), [agentId]);
    const source = runtime.resolveRow(agentId, data, timestamp);
    const messages = runtime.feeds.get(agentId)?.reader.messages ?? [];
    const selection = runtime.selection(agentId);
    const current = audio.current ?? runtime.queue.items()[0];
    const speaking = !!source && current?.agentId === agentId && current.messageId === source.id;
    const excluded = !!source && runtime.isExcluded(agentId, source.id);
    const allowed = allowKind(data.kind, runtime.settings);
    const readable = spokenText(data, runtime.settings);
    const complete = data.phase === 'complete';
    const canSelect = complete && !!source?.complete;
    const willRead = complete && allowed && !excluded && !!readable;
    const index = source ? messages.findIndex(m => m.id === source.id) : -1;
    const from = selection ? messages.findIndex(m => m.id === selection.start) : -1;
    const to = selection ? messages.findIndex(m => m.id === selection.end) : -1;
    const inRange = index >= 0 && from >= 0 && index >= from && index <= to;
    const last = [...messages].reverse().find(m => m.complete);
    const read = () => runtime.playMessage(agentId, { id: source?.id ?? `row:${timestamp.getTime()}:${data.kind}`, kind: data.kind, text: data.text });
    const readFromHere = () => source && last && runtime.playRange(agentId, source.id, last.id);
    const status = !complete ? 'streaming' : speaking ? 'speaking' : !allowed ? 'filter off' : excluded ? 'skipped' : !readable ? 'nothing to read' : 'will read';
    const role = mine ? 'You' : thinking ? 'Thinking' : runtime.agents.get(agentId)?.provider ?? 'Assistant';
    const edge = speaking || inRange ? theme.colors.accent : willRead ? theme.colors.accent : 'transparent';
    return <View accessibilityLabel={`${role} message`} style={{ marginVertical: 6 }}>
      {selection?.start === source?.id && source ? <RangeLabel theme={theme} label="Reading range" icon="ChevronDown" /> : null}
      <View style={{
        paddingLeft: 12, paddingVertical: 4, gap: 4,
        borderLeftWidth: inRange ? 4 : 2, borderColor: edge,
        opacity: willRead || speaking || !complete ? 1 : 0.55,
      }}>
        <View style={thinking ? {
          backgroundColor: theme.colors.surface1, borderRadius: 8, padding: layout.compact ? 8 : 10, gap: 4,
          borderLeftWidth: 2, borderStyle: 'dashed', borderColor: theme.colors.foregroundMuted,
        } : { gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={thinking ? (open ? 'Collapse thinking' : 'Expand thinking') : `${role} header`}
            disabled={!thinking} onPress={() => setOpen(v => !v)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Icon name={thinking ? 'Brain' : mine ? 'User' : 'MessageSquare'} size={14} color={thinking ? theme.colors.foregroundMuted : theme.colors.foreground} />
            <Text style={{ color: thinking ? theme.colors.foregroundMuted : theme.colors.foreground, fontSize: 13, fontWeight: '600' }}>{role}</Text>
            <Chip theme={theme} label={speaking ? 'speaking' : status} tone={willRead || speaking ? 'on' : 'muted'} />
            {thinking && !open ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>· tap to expand</Text> : null}
          </Pressable>
          {speaking
            ? <FullText text={readable} current={current?.text} offset={current?.offset} theme={theme} />
            : open
              ? <RichText text={revealed} theme={theme} italic={thinking} />
              : <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 13, fontStyle: 'italic' }}>{revealed}</Text>}
        </View>
        {speaking ? <MiniPlayer runtime={runtime} theme={theme} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          <TextButton theme={theme} icon="Play" label="Read from here" disabled={!canSelect || !last} onPress={readFromHere} />
          <TextButton theme={theme} icon="Volume2" label="Read" disabled={!complete} onPress={read} />
          <TextButton theme={theme} icon={excluded ? 'EyeOff' : 'Check'} label={excluded ? 'Skipped' : 'Included'} active={!excluded && allowed}
            disabled={!source || !allowed} onPress={() => source && runtime.toggleExcluded(agentId, source.id)} />
          {speaking ? <TextButton theme={theme} icon="Pin" label="Show in side panel" onPress={() => runtime.showNowPlaying(agentId)} /> : null}
          <TextButton theme={theme} icon="Ellipsis" label="More voice actions" onPress={() => setMore(v => !v)} active={more} />
        </View>
        {more ? <View style={{ gap: 6, paddingTop: 2 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            <TextButton theme={theme} icon="ArrowDownToLine" label="Range start" disabled={!canSelect} onPress={() => source && runtime.setBoundary(agentId, source.id, 'start')} />
            <TextButton theme={theme} icon="ArrowUpToLine" label="Range end" disabled={!canSelect} onPress={() => source && runtime.setBoundary(agentId, source.id, 'end')} />
            {selection ? <TextButton theme={theme} icon="X" label="Clear range" onPress={() => runtime.clearRange(agentId)} /> : null}
            <TextButton theme={theme} icon="TextSelect" label="Pick part to read" disabled={!complete || !readable}
              onPress={() => runtime.focusMessage(agentId, { id: source?.id ?? `row:${timestamp.getTime()}:${data.kind}`, kind: data.kind, text: data.text })} />
          </View>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Spoken text · {excluded ? 'skipped' : allowed ? 'current filters' : 'content filter is off'}</Text>
          <FullText text={readable || 'Nothing will be read from this message with the current filters.'} theme={theme} />
          {complete && !source ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Range actions unlock once this message is matched in the reading plan.</Text> : null}
        </View> : null}
      </View>
      {selection?.end === source?.id && source ? <RangeLabel theme={theme} label="End of range" icon="ChevronUp" /> : null}
    </View>;
  };
}
function RangeLabel({ theme, label, icon }: { theme: PluginTimelineItemProps['theme']; label: string; icon: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 4 }}>
    <Icon name={icon} size={12} color={theme.colors.accent} />
    <Text style={{ color: theme.colors.accent, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
  </View>;
}
export function registerVoiceTimeline(client: PluginClientContext, runtime: VoiceRuntime) {
  const removeRenderer = client.addTimelineRenderer({ kind: 'voice-message', version: 1, schema: voiceRowSchema, Component: createVoiceRow(runtime) });
  let transformers: (() => void | Promise<void>)[] = [];
  let showing: boolean | undefined;
  let disposed = false;
  const transform = ({ item, phase }: { item: { type: VoiceRow['kind']; text: string; messageId?: string }; phase: 'streaming' | 'complete' }) => ({
    items: [{ type: 'plugin' as const, kind: 'voice-message', version: 1,
      data: { text: item.text, kind: item.type, phase, ...(item.messageId ? { providerMessageId: item.messageId } : {}) } }],
  });
  const clear = () => {
    const previous = transformers;
    transformers = [];
    for (const remove of previous) void remove();
  };
  const sync = () => {
    const next = runtime.settings.inlineControls;
    if (showing === next) return;
    showing = next;
    clear();
    if (!next) return;
    // Removing the registrations makes the host rebuild existing rows using its
    // original renderers. A captured settings flag alone would leave memoized rows.
    // Sent messages are never replaced: the host renders their images and attachments.
    transformers = [
      client.addTimelineTransformer({ id: 'voice-assistant', query: { itemType: 'assistant_message' }, transform }),
      client.addTimelineTransformer({ id: 'voice-thinking', query: { itemType: 'reasoning' }, transform }),
    ];
  };
  sync();
  const unsubscribe = runtime.subscribe(sync);
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe(); clear(); void removeRenderer();
  };
}
