// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { removeMessageDividers } from "../shared/text";
import type { VoiceRuntime } from './runtime';

type Theme = PluginHostProps['theme'];
export function useVoice(runtime: VoiceRuntime) {
  useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
  return useSyncExternalStore(runtime.queue.subscribe, runtime.queue.snapshot, runtime.queue.snapshot);
}
export function VoiceButton({ theme, label, icon, onPress, disabled = false, primary = false, dense = false, expanded }: {
  theme: Theme; label: string; icon?: string; onPress: () => void; disabled?: boolean; primary?: boolean; dense?: boolean; expanded?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: dense ? 8 : 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1,
      borderColor: primary ? theme.colors.accent : theme.colors.border, backgroundColor: theme.colors.surface2,
      opacity: disabled ? 0.45 : pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 7 })}>
    {icon ? <Icon name={icon} size={15} color={primary ? theme.colors.accent : theme.colors.foregroundMuted} /> : null}
    <Text style={{ color: theme.colors.foreground, fontSize: dense ? 12 : 13, fontWeight: primary ? '600' : '400' }}>{label}</Text>
  </Pressable>;
}
export function FullText({ text: source, current, offset, theme }: { text: string; current?: string; offset?: number; theme: Theme }) {
  const text = removeMessageDividers(source);
  const at = current ? (offset !== undefined && text.slice(offset, offset + current.length) === current ? offset : text.indexOf(current)) : -1;
  return <Text selectable style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 23, flexShrink: 1 }}>
    {at < 0 ? text : <>{text.slice(0, at)}<Text style={{ color: theme.colors.foreground, backgroundColor: theme.colors.surface2, fontWeight: '700', textDecorationLine: 'underline' }}>{current}</Text>{text.slice(at + current!.length)}</>}
  </Text>;
}
export function Transport({ runtime, theme, compact = false }: { runtime: VoiceRuntime; theme: Theme; compact?: boolean }) {
  const audio = useVoice(runtime);
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <VoiceButton theme={theme} label={audio.status === 'paused' || audio.status === 'error' ? 'Resume' : 'Pause'} icon={audio.status === 'paused' || audio.status === 'error' ? 'Play' : 'Pause'}
        onPress={() => audio.status === 'paused' || audio.status === 'error' ? runtime.queue.resume() : runtime.queue.pause()} disabled={!audio.current && !audio.pending} primary />
      <VoiceButton theme={theme} label="Skip" icon="SkipForward" onPress={() => runtime.queue.skip()} disabled={!audio.current && !audio.pending} />
      <VoiceButton theme={theme} label="Stop" icon="Square" onPress={() => runtime.stop()} disabled={audio.status === 'idle' && !runtime.armed} />
      <VoiceButton theme={theme} label="Replay" icon="RotateCcw" onPress={() => runtime.queue.replay()} />
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
      {audio.status === 'stopping' ? 'Finishing current sentence…' : audio.status} · {audio.pending} sentences queued
    </Text>
    {!compact ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Pause, Stop and Skip take effect after the current sentence.</Text> : null}
    {audio.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>{audio.error}</Text> : null}
  </View>;
}

export function MessageActions({ theme, excluded, preview, canStart, canStop, canExclude, onStart, onStop, onExclude, onPreview }: {
  theme: Theme; excluded: boolean; preview: boolean; canStart: boolean; canStop: boolean; canExclude: boolean;
  onStart: () => void; onStop: () => void; onExclude: () => void; onPreview: () => void;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
    <VoiceButton theme={theme} label="Start reading" onPress={onStart} disabled={!canStart} dense />
    <VoiceButton theme={theme} label="Stop" onPress={onStop} disabled={!canStop} dense />
    <VoiceButton theme={theme} label={excluded ? 'Include' : 'Exclude'} onPress={onExclude} disabled={!canExclude} dense />
    <VoiceButton theme={theme} label="Preview" onPress={onPreview} expanded={preview} dense />
  </ScrollView>;
}
