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

// ---- Compact controls used by the reading plan, inline rows and side panel ----
export function TextButton({ theme, icon, label, onPress, disabled = false, active = false }: { theme: Theme; icon: string; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const color = active ? theme.colors.accent : theme.colors.foregroundMuted;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 7, borderRadius: 6,
      backgroundColor: pressed || hovered ? theme.colors.surface2 : 'transparent', opacity: disabled ? 0.4 : 1,
    })}>
    <Icon name={icon} size={12} color={color} />
    <Text style={{ color, fontSize: 12 }}>{label}</Text>
  </Pressable>;
}
export function IconButton({ theme, icon, label, onPress, disabled = false, primary = false }: { theme: Theme; icon: string; label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
      width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: primary ? theme.colors.accent : pressed || hovered ? theme.colors.surface2 : 'transparent', opacity: disabled ? 0.4 : 1,
    })}>
    <Icon name={icon} size={15} color={primary ? theme.colors.accentForeground ?? theme.colors.surface0 : theme.colors.foreground} />
  </Pressable>;
}
export function Chip({ theme, label, tone = 'muted' }: { theme: Theme; label: string; tone?: 'muted' | 'on' }) {
  return <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99, backgroundColor: theme.colors.surface2 }}>
    <Text style={{ fontSize: 11, color: tone === 'on' ? theme.colors.accent : theme.colors.foregroundMuted }}>{label}</Text>
  </View>;
}
export function SwitchRow({ theme, label, detail, value, onChange, disabled = false }: { theme: Theme; label: string; detail?: string; value: boolean; onChange: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={onChange}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{label}</Text>
      {detail ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{detail}</Text> : null}
    </View>
    <View style={{ width: 32, height: 18, borderRadius: 9, padding: 2, backgroundColor: value ? theme.colors.accent : theme.colors.border, alignItems: value ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.surface0 }} />
    </View>
  </Pressable>;
}
export function MiniPlayer({ runtime, theme, showStatus = true }: { runtime: VoiceRuntime; theme: Theme; showStatus?: boolean }) {
  const audio = useVoice(runtime);
  const busy = !!audio.current || !!audio.pending;
  const paused = audio.status === 'paused' || audio.status === 'error';
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 }}>
    <IconButton theme={theme} icon="SkipBack" label="Previous" disabled={!runtime.queue.history().items.length} onPress={() => runtime.previous()} />
    <IconButton theme={theme} icon="RotateCcw" label="Replay" onPress={() => runtime.queue.replay()} />
    <IconButton theme={theme} icon={paused ? 'Play' : 'Pause'} label={paused ? 'Resume' : 'Pause'} primary disabled={!busy}
      onPress={() => paused ? runtime.queue.resume() : runtime.queue.pause()} />
    <IconButton theme={theme} icon="SkipForward" label="Next" disabled={!busy} onPress={() => runtime.next()} />
    <IconButton theme={theme} icon="Square" label="Stop" disabled={!busy && !runtime.armed} onPress={() => runtime.stop()} />
    {showStatus ? <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginLeft: 4, flexShrink: 1 }}>
      {audio.status === 'stopping' ? 'Finishing sentence…' : busy ? `${audio.status} · ${audio.pending} left` : 'Idle'}
    </Text> : null}
  </View>;
}
// Light markdown for replaced rows: fenced code as a monospace block, headings bold.
export function RichText({ text, theme, italic = false }: { text: string; theme: Theme; italic?: boolean }) {
  const parts = removeMessageDividers(text).split(/```[^\n]*\n?/);
  return <View style={{ gap: 6 }}>{parts.map((part, i) => {
    if (!part.trim()) return null;
    if (i % 2) return <View key={i} style={{ backgroundColor: theme.colors.surface2, borderRadius: 6, padding: 8 }}>
      <Text selectable style={{ color: theme.colors.foreground, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 }}>{part.replace(/\n$/, '')}</Text>
    </View>;
    return <Text key={i} selectable style={{ color: theme.colors.foreground, fontSize: 14, lineHeight: 22, fontStyle: italic ? 'italic' : 'normal' }}>
      {part.trim().split('\n').map((line, j, all) => {
        const heading = /^#{1,6}\s+/.test(line);
        const body = line.replace(/^#{1,6}\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1');
        return <Text key={j} style={{ color: theme.colors.foreground, fontWeight: heading ? '700' : '400' }}>{body}{j < all.length - 1 ? '\n' : ''}</Text>;
      })}
    </Text>;
  })}</View>;
}
