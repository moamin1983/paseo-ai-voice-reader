// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRevealedText, Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginClientContext, PluginTimelineItemProps } from '@getpaseo/plugin/client';
import { voiceRowSchema, kindLabel, spokenText, type VoiceRow } from '../shared/presentation';
import { allowKind } from '../shared/text';
import { FullText, MessageActions, Transport, VoiceButton, useVoice } from './voice-ui';
import type { VoiceRuntime } from './runtime';

export function createVoiceRow(runtime: VoiceRuntime) {
  return function VoiceRowView({ agentId, item, timestamp, theme, layout }: PluginTimelineItemProps<VoiceRow>) {
    const audio = useVoice(runtime);
    const data = item.data;
    const revealed = useRevealedText(data.text, data.phase);
    const [expanded, setExpanded] = useState(data.kind !== 'reasoning');
    const [preview, setPreview] = useState(false);
    useEffect(() => runtime.watchAgent(agentId), [agentId]);
    const source = runtime.resolveRow(agentId, data, timestamp);
    const selection = runtime.selection(agentId);
    const nextSpeech = audio.current ?? runtime.queue.items()[0];
    const current = nextSpeech?.agentId === agentId && source?.id === nextSpeech?.messageId ? nextSpeech : undefined;
    const active = !!current;
    const excluded = !!source && runtime.isExcluded(agentId, source.id);
    const allowed = allowKind(data.kind, runtime.settings);
    const readable = spokenText(data, runtime.settings);
    const complete = data.phase === 'complete';
    const canSelect = complete && !!source?.complete;
    const start = source && selection?.start === source.id;
    const end = source && selection?.end === source.id;
    const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
    const read = () => runtime.playMessage(agentId, { id: source?.id ?? `row:${timestamp.getTime()}:${data.kind}`, kind: data.kind, text: data.text });
    const mine = data.kind === 'user_message';
    const thinking = data.kind === 'reasoning';
    const agent = runtime.agents.get(agentId);
    const role = mine ? 'You' : thinking ? 'Exposed thinking' : `Assistant · ${agent?.provider ?? 'AI'}`;
    return <View accessibilityLabel={`${role} message`} style={{
      gap: 8, padding: layout.compact ? 10 : 14, marginVertical: 8,
      alignSelf: mine ? 'flex-end' : 'stretch', maxWidth: mine ? '92%' : '100%',
      marginLeft: thinking ? (layout.compact ? 10 : 24) : 0,
      borderRadius: mine ? 14 : 8,
      backgroundColor: mine ? theme.colors.surface2 : theme.colors.surface0,
    }}>
      {start ? <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '600' }}>Start of selected range</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Icon name={data.kind === 'reasoning' ? 'Brain' : data.kind === 'user_message' ? 'User' : 'MessageSquare'} size={16} color={theme.colors.foregroundMuted} />
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: '700' }}>{role}</Text>
        <Text style={muted}>{data.phase === 'streaming' ? 'Streaming' : 'Complete'} · {!allowed ? 'Not included · filter off' : excluded ? 'Excluded' : readable ? 'Included' : 'No spoken text after filters'}</Text>
      </View>
      {active ? <View style={{ borderColor: theme.colors.accent, borderWidth: 1, borderRadius: 12, backgroundColor: theme.colors.surface0, padding: layout.compact ? 12 : 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="Volume2" size={16} color={theme.colors.accent} /><Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>{audio.status === 'paused' ? 'Paused' : audio.status === 'error' ? 'Playback needs attention' : 'Reading'} {kindLabel(data.kind).toLowerCase()}</Text></View>
        <FullText text={readable} current={current?.text} offset={current?.offset} theme={theme} />
        <Transport runtime={runtime} theme={theme} />
        {data.text !== readable ? <VoiceButton theme={theme} label={expanded ? 'Hide original message' : 'Show full original message'} icon="FileText" onPress={() => setExpanded(v => !v)} /> : null}
        {expanded && data.text !== readable ? <FullText text={revealed} theme={theme} /> : null}
      </View> : <>
        {expanded ? <FullText text={revealed} theme={theme} /> : null}
        {data.kind === 'reasoning' ? <VoiceButton theme={theme} label={expanded ? 'Collapse thinking text' : 'Show full thinking text'} icon={expanded ? 'ChevronDown' : 'ChevronRight'} onPress={() => setExpanded(v => !v)} /> : null}
      </>}
      <MessageActions theme={theme} excluded={excluded} preview={preview} canStart={complete} canExclude={!!source && allowed}
        canStop={!!audio.current || !!audio.pending || runtime.armed}
        onStart={read} onStop={() => runtime.stop()} onExclude={() => source && runtime.toggleExcluded(agentId, source.id)} onPreview={() => setPreview(v => !v)} />
      {preview ? <View style={{ borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 }}>
        <Text style={muted}>Full spoken text · {excluded ? 'excluded until included again' : allowed ? 'current filters' : 'content filter is off'}</Text>
        <FullText text={readable || 'This message will not be narrated with the current filters.'} theme={theme} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <VoiceButton theme={theme} label="Start range here" onPress={() => source && runtime.setBoundary(agentId, source.id, 'start')} disabled={!canSelect} />
          <VoiceButton theme={theme} label="End range here" onPress={() => source && runtime.setBoundary(agentId, source.id, 'end')} disabled={!canSelect} />
        </View>
      </View> : null}
      {complete && !source ? <Text style={muted}>Range actions become available when this message is loaded in the reading plan. Identical messages without a source match can be selected there.</Text> : null}
      {end ? <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '600' }}>End of selected range</Text> : null}
    </View>;
  };
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
    transformers = [
      client.addTimelineTransformer({ id: 'voice-assistant', query: { itemType: 'assistant_message' }, transform }),
      client.addTimelineTransformer({ id: 'voice-thinking', query: { itemType: 'reasoning' }, transform }),
      client.addTimelineTransformer({ id: 'voice-sent', query: { itemType: 'user_message' }, transform }),
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
