// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginAgentPanelProps, PluginHostProps } from '@getpaseo/plugin/client';
import { spokenText } from '../shared/presentation';
import type { ReadMessage } from '../shared/timeline';
import { allowKind } from '../shared/text';
import { FullText, MiniPlayer, TextButton, IconButton, useVoice } from './voice-ui';
import type { VoiceRuntime } from './runtime';

type Theme = PluginHostProps['theme'];

// Side panel beside the agent chat. Paseo keeps rendering the conversation
// itself (markdown, images, attachments); this panel only adds voice controls.
// Two tabs: "Now playing" focuses on the message being read, sentence by
// sentence; "All messages" lists the conversation.
export function createVoiceRail(runtime: VoiceRuntime) {
  return function VoiceRail({ agentId, theme }: PluginAgentPanelProps) {
    useVoice(runtime);
    useEffect(() => runtime.watchAgent(agentId), [agentId]);
    useEffect(() => { runtime.select(agentId); }, [agentId]);
    const range = runtime.selection(agentId);
    const on = runtime.shouldSpeak(agentId);
    const focus = runtime.railFocus;
    const audio = runtime.queue.snapshot();
    return <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View style={{ padding: 10, gap: 8, borderBottomWidth: 1, borderColor: theme.colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: theme.colors.surface2, borderRadius: 8, padding: 2, flex: 1 }}>
            <Tab theme={theme} label="Now playing" icon="AudioLines" selected={focus} onPress={() => runtime.setRailFocus(true)}
              badge={audio.current || audio.pending ? '●' : undefined} />
            <Tab theme={theme} label="All messages" icon="List" selected={!focus} onPress={() => runtime.setRailFocus(false)} />
          </View>
          <IconButton theme={theme} icon={on ? 'Volume2' : 'VolumeX'} label={on ? 'Auto-read on' : 'Auto-read off'} onPress={() => runtime.toggle(agentId)} />
          <IconButton theme={theme} icon="Settings" label="Voice settings" onPress={() => runtime.client.openSettings('voice')} />
        </View>
        <MiniPlayer runtime={runtime} theme={theme} />
        {range ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: theme.colors.accent, fontSize: 12, flex: 1 }}>Range selected</Text>
          <TextButton theme={theme} icon="Play" label="Play range" active onPress={() => runtime.playRange(agentId, range.start, range.end)} />
          <IconButton theme={theme} icon="X" label="Clear range" onPress={() => runtime.clearRange(agentId)} />
        </View> : null}
        {audio.error || runtime.notice ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground, fontSize: 12 }}>{audio.error || runtime.notice}</Text> : null}
      </View>
      {focus ? <NowPlaying runtime={runtime} theme={theme} /> : <AllMessages runtime={runtime} theme={theme} agentId={agentId} />}
    </View>;
  };
}

function Tab({ theme, label, icon, selected, onPress, badge }: { theme: Theme; label: string; icon: string; selected: boolean; onPress: () => void; badge?: string }) {
  const color = selected ? theme.colors.foreground : theme.colors.foregroundMuted;
  return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 26, borderRadius: 6,
      backgroundColor: selected ? theme.colors.surface0 : 'transparent' }}>
    <Icon name={icon} size={12} color={color} />
    <Text style={{ color, fontSize: 12, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    {badge ? <Text style={{ color: theme.colors.accent, fontSize: 8 }}>{badge}</Text> : null}
  </Pressable>;
}

function NowPlaying({ runtime, theme }: { runtime: VoiceRuntime; theme: Theme }) {
  const audio = useVoice(runtime);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const now = runtime.nowPlaying();
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  if (!now) return <View style={{ padding: 14, gap: 6 }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>Nothing is playing.</Text>
    <Text style={muted}>Press Read on a message, or open All messages to choose one.</Text>
  </View>;
  const { speech, source, sentences } = now;
  const text = source ? spokenText(source, runtime.settings) : sentences.map(s => s.text).join(' ');
  const at = sentences.findIndex(s => s.offset === (speech.offset ?? 0) && s.text === speech.text);
  const current = at >= 0 ? at : sentences.findIndex(s => s.text === speech.text);
  const agent = runtime.agents.get(speech.agentId);
  const role = speech.kind === 'user_message' ? 'You' : speech.kind === 'reasoning' ? 'Thinking' : agent?.provider ?? 'Assistant';
  const state = audio.current ? audio.status : audio.pending ? (audio.status === 'paused' ? 'paused' : 'next up') : 'last played';
  const playFrom = (offset: number, end?: number) => {
    if (source) { runtime.playMessage(speech.agentId, source, offset, end); return; }
    // No timeline source (e.g. the voice test): jump inside the session playlist.
    const items = runtime.queue.history().items;
    const index = items.findIndex(s => s.messageId === speech.messageId && (s.offset ?? 0) === offset);
    if (index >= 0) runtime.queue.seek(index);
  };
  const upcoming = runtime.queue.items().find(s => s.agentId !== speech.agentId || s.messageId !== speech.messageId);
  const hasSelection = selection.end > selection.start;
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={speech.kind === 'reasoning' ? 'Brain' : speech.kind === 'user_message' ? 'User' : 'MessageSquare'} size={14} color={theme.colors.accent} />
      <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: '600' }}>{role}</Text>
      <Text style={{ ...muted, flex: 1 }} numberOfLines={1}>· {state}{current >= 0 ? ` · sentence ${current + 1} of ${sentences.length}` : ''}</Text>
      <TextButton theme={theme} icon={selecting ? 'List' : 'TextSelect'} label={selecting ? 'Sentences' : 'Select text'} active={selecting}
        onPress={() => { setSelecting(v => !v); setSelection({ start: 0, end: 0 }); }} />
    </View>
    {selecting ? <View style={{ gap: 8 }}>
      <Text style={muted}>Highlight any part of the text, then press Play selection.</Text>
      <TextInput accessibilityLabel="Message text for selection" value={text} editable={false} multiline scrollEnabled={false}
        onSelectionChange={e => setSelection(e.nativeEvent.selection)}
        style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 22, padding: 10, borderRadius: 8, borderWidth: 1,
          borderColor: theme.colors.border, backgroundColor: theme.colors.surface1 ?? theme.colors.surface2, minHeight: 120 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
        <TextButton theme={theme} icon="Play" label="Play selection" active={hasSelection} disabled={!hasSelection || !source}
          onPress={() => playFrom(selection.start, selection.end)} />
        <TextButton theme={theme} icon="ListStart" label="Play from selection" disabled={!hasSelection || !source}
          onPress={() => playFrom(selection.start)} />
        <Text style={muted}>{hasSelection ? `${selection.end - selection.start} characters selected` : 'No selection'}</Text>
      </View>
      {!source ? <Text style={muted}>Selection playback works on conversation messages.</Text> : null}
    </View> : <View style={{ gap: 2 }}>
      {sentences.map((s, i) => {
        const playing = i === current;
        return <Pressable key={`${s.offset}:${i}`} accessibilityRole="button" accessibilityLabel={`Play from sentence ${i + 1}`} onPress={() => playFrom(s.offset)}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
            flexDirection: 'row', gap: 8, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6,
            borderLeftWidth: 3, borderColor: playing ? theme.colors.accent : 'transparent',
            backgroundColor: playing || pressed || hovered ? theme.colors.surface2 : 'transparent',
          })}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, width: 18, textAlign: 'right', marginTop: 2 }}>{i + 1}</Text>
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: !playing && i < current ? theme.colors.foregroundMuted : theme.colors.foreground, fontWeight: playing ? '600' : '400' }}>{s.text}</Text>
        </Pressable>;
      })}
      <Text style={{ ...muted, marginTop: 4 }}>Tap a sentence to read from there. ⏮ Previous and ⏭ Next step one sentence at a time.</Text>
    </View>}
    {upcoming ? <View style={{ marginTop: 6, gap: 2, paddingTop: 8, borderTopWidth: 1, borderColor: theme.colors.border }}>
      <Text style={muted}>Up next</Text>
      <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 13 }}>{upcoming.text}</Text>
    </View> : null}
  </ScrollView>;
}

function AllMessages({ runtime, theme, agentId }: { runtime: VoiceRuntime; theme: Theme; agentId: string }) {
  const [limit, setLimit] = useState(30);
  const messages = runtime.feeds.get(agentId)?.reader.messages ?? [];
  const visible = messages.slice(-limit);
  const last = [...messages].reverse().find(m => m.complete);
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, gap: 2 }}>
    {messages.length > limit ? <Pressable onPress={() => setLimit(n => n + 50)} style={{ padding: 8 }}>
      <Text style={{ ...muted, textAlign: 'center' }}>Show earlier messages</Text>
    </Pressable> : null}
    {!messages.length ? <Text style={{ ...muted, padding: 8 }}>Waiting for messages from this agent.</Text> : null}
    {visible.map(m => <RailRow key={m.id} m={m} agentId={agentId} runtime={runtime} theme={theme}
      onPlayFrom={() => last && runtime.playRange(agentId, m.id, last.id)} />)}
  </ScrollView>;
}

function RailRow({ m, agentId, runtime, theme, onPlayFrom }: { m: ReadMessage; agentId: string; runtime: VoiceRuntime; theme: Theme; onPlayFrom: () => void }) {
  const audio = useVoice(runtime);
  const [open, setOpen] = useState(false);
  const range = runtime.selection(agentId);
  const excluded = runtime.isExcluded(agentId, m.id);
  const allowed = allowKind(m.kind, runtime.settings);
  const spoken = spokenText(m, runtime.settings);
  const willRead = m.complete && allowed && !excluded && !!spoken;
  const speaking = audio.current?.agentId === agentId && audio.current?.messageId === m.id;
  const messages = runtime.feeds.get(agentId)?.reader.messages ?? [];
  const index = messages.findIndex(x => x.id === m.id);
  const from = range ? messages.findIndex(x => x.id === range.start) : -1;
  const to = range ? messages.findIndex(x => x.id === range.end) : -1;
  const inRange = range && index >= from && index <= to;
  const role = m.kind === 'user_message' ? { label: 'You', icon: 'User', color: theme.colors.foreground }
    : m.kind === 'reasoning' ? { label: 'Thinking', icon: 'Brain', color: theme.colors.foregroundMuted }
    : { label: runtime.agents.get(agentId)?.provider ?? 'Assistant', icon: 'MessageSquare', color: theme.colors.accent };
  const status = !m.complete ? 'streaming' : !allowed ? 'filter off' : excluded ? 'skipped' : !spoken ? 'nothing to read' : speaking ? 'speaking' : 'will read';
  return <View style={{
    borderLeftWidth: 3, borderColor: inRange ? theme.colors.accent : 'transparent',
    borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, gap: 4,
    backgroundColor: speaking ? theme.colors.surface2 : 'transparent', opacity: willRead || speaking ? 1 : 0.55,
  }}>
    <Pressable onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityLabel={`${role.label} message, ${status}. ${open ? 'Collapse' : 'Expand'}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={role.icon} size={13} color={role.color} />
        <Text style={{ color: role.color, fontSize: 12, fontWeight: '600' }}>{role.label}</Text>
        <Text style={{ color: speaking ? theme.colors.accent : theme.colors.foregroundMuted, fontSize: 11 }}>· {status}</Text>
        {range?.start === m.id ? <Text style={{ color: theme.colors.accent, fontSize: 11 }}>· start</Text> : null}
        {range?.end === m.id ? <Text style={{ color: theme.colors.accent, fontSize: 11 }}>· end</Text> : null}
      </View>
      {open || speaking
        ? <FullText text={spoken || m.text} current={speaking ? audio.current?.text : undefined} offset={speaking ? audio.current?.offset : undefined} theme={theme} />
        : <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 19, fontStyle: m.kind === 'reasoning' ? 'italic' : 'normal' }}>{spoken || m.text}</Text>}
    </Pressable>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      <TextButton theme={theme} icon="Play" label="Read" disabled={!m.complete} onPress={() => runtime.playMessage(agentId, m)} />
      <TextButton theme={theme} icon="ListStart" label="From here" disabled={!m.complete} onPress={onPlayFrom} />
      <TextButton theme={theme} icon={excluded ? 'Eye' : 'EyeOff'} label={excluded ? 'Include' : 'Skip'} disabled={!allowed} onPress={() => runtime.toggleExcluded(agentId, m.id)} />
      <TextButton theme={theme} icon="TextSelect" label="Pick part" disabled={!m.complete || !spoken} onPress={() => runtime.focusMessage(agentId, m)} />
      {open ? <>
        <TextButton theme={theme} icon="ArrowDownToLine" label="Range start" disabled={!m.complete} onPress={() => runtime.setBoundary(agentId, m.id, 'start')} />
        <TextButton theme={theme} icon="ArrowUpToLine" label="Range end" disabled={!m.complete} onPress={() => runtime.setBoundary(agentId, m.id, 'end')} />
      </> : null}
    </View>
  </View>;
}
