// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { settingsSchema } from "../shared/settings";
import { VoiceRuntime } from "../client/runtime";
import type { PluginClientContext } from "@getpaseo/plugin/client";

// Native host stubs let us exercise the plugin's React trees without installing it in Paseo.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function components() {
  const r = await build({
    stdin: {
      contents: `export {createReader} from './client/reader'; export {createSettings} from './client/settings'; export {createVoiceRow,registerVoiceTimeline} from './client/timeline'; export {createHeaderPlan} from './client/reader'; export {createVoiceRail} from './client/rail'; export {default as contributeClient} from './index.client';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    external: [
      "react",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@getpaseo/plugin",
      "zod",
    ],
    plugins: [
      {
        name: "native-host-test-stubs",
        setup(b) {
          b.onResolve(
            { filter: /^(react-native|@getpaseo\/plugin\/client(?:\/(?:ui|react-native))?)$/ },
            (a) => ({ path: a.path, namespace: "host-stub" }),
          );
          b.onLoad({ filter: /.*/, namespace: "host-stub" }, (a) => ({
            loader: "js",
            contents:
              a.path === "react-native"
                ? `export const View='View',Text='Text',ScrollView='ScrollView',Pressable='Pressable',TextInput='TextInput';`
                : a.path.endsWith("/react-native")
                  ? `export const Icon='Icon'; export const useRevealedText=(text)=>text;`
                : a.path.endsWith("/ui")
                  ? `export const SettingsAction='SettingsAction',SettingsCard='SettingsCard',SettingsInput='SettingsInput',SettingsSection='SettingsSection',SettingsSelect='SettingsSelect',SettingsSwitch='SettingsSwitch';`
                  : `export const useSettings=()=>globalThis.__voiceSettings; export const useRpc=()=>async()=>({edge:true,kokoro:true,model:true,detail:'local test'});`,
          }));
        },
      },
    ],
  });
  const file = resolve("evidence/ui-test.bundle.mjs");
  await mkdir(resolve("evidence"), { recursive: true });
  await writeFile(file, r.outputFiles[0].contents);
  return import(pathToFileURL(file).href);
}
const themes = [
  {
    name: "light",
    colors: {
      foreground: "#111111",
      foregroundMuted: "#555555",
      surface0: "#ffffff",
      surface2: "#eeeeee",
      accent: "#0000aa",
      border: "#888888",
    },
  },
  {
    name: "dark",
    colors: {
      foreground: "#eeeeee",
      foregroundMuted: "#bbbbbb",
      surface0: "#111111",
      surface2: "#333333",
      accent: "#aaaaff",
      border: "#777777",
    },
  },
];
test("native reader and settings render in compact/wide layouts and light/dark theme", async () => {
  const { createReader, createSettings } = await components();
  for (const theme of themes)
    for (const compact of [false, true]) {
      let cleanup!: ReactTestRenderer;
      const client = {
        rpc: async () => ({}),
        playAudio: async () => {},
        openSettings() {},
        openScreen() {},
      } as unknown as PluginClientContext;
      const runtime = new VoiceRuntime(client);
      runtime.agents.set("a", {
        id: "a",
        workspaceId: "w",
        provider: "codex",
        title: "UI test",
      });
      runtime.viewed = "a";
      runtime.target = "a";
      runtime.feeds.set("a", {
        reader: {
          messages: [
            {
              id: "e:0",
              seq: 0,
              endSeq: 0,
              kind: "assistant_message",
              text: "A completed response.",
              complete: true,
            },
          ],
        },
        dispose() {},
      } as any);
      const values = settingsSchema.parse({ compactPlan: false });
      (globalThis as any).__voiceSettings = {
        status: "ready",
        values,
        revision: "1",
        saving: false,
        saveError: null,
        save: async () => true,
        reload: async () => {},
        reset: async () => true,
      };
      const Reader = createReader(runtime),
        Settings = createSettings(runtime);
      const props = {
        theme,
        layout: { compact, platform: "web" },
        host: { id: "local", label: "Local" },
      };
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      try {
        await act(async () => {
          cleanup = create(
            React.createElement(
              QueryClientProvider,
              { client: queryClient },
              React.createElement(
                React.Fragment,
                null,
                React.createElement(Reader, props),
                React.createElement(Settings, props),
              ),
            ),
          );
        });
        const texts = cleanup.root.findAllByType("Text" as any);
        for (const text of texts)
          assert.ok(
            text.props.style?.color,
            `Missing theme color in ${theme.name}/${compact}: ${JSON.stringify(text.props.style)} ${text.children.filter((c: any) => typeof c === "string").join("").slice(0, 60)}`,
          );
        for (const label of [
          "Play",
          "Test voice",
          "Pause",
          "Stop",
          "Previous",
          "Next",
          "Replay",
          "Auto-read new replies",
          "Voice controls in messages",
          "Open voice side panel",
          "Read codex message",
          "Read codex message now",
        ])
          assert.ok(
            cleanup.root
              .findAllByType("Pressable" as any)
              .some((n) => n.props.accessibilityLabel === label),
          );
        const switches = cleanup.root.findAllByType("SettingsSwitch" as any);
        assert.ok(
          switches.some((n) => n.props.label === "Enable AI Voice Reader"),
        );
        assert.ok(
          switches.some((n) => n.props.label.includes("Microsoft Edge")),
        );
        assert.ok(switches.some((n) => n.props.label === "Exposed reasoning"));
        assert.equal(cleanup.root.findAllByType("div" as any).length, 0);
      } finally {
        await act(async () => {
          cleanup?.unmount();
        });
        queryClient.clear();
        runtime.dispose();
      }
    }
});

test("client entry cleanup and reload register surfaces exactly once per load", async () => {
  const { contributeClient } = await components();
  let active = 0;
  const add = () => {
    active++;
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        active--;
      }
    };
  };
  const pageInfo = { nextCursor: null, hasMore: false };
  const directory = async () => ({
    subscription: {
      subscribe(o: any) {
        o.snapshot({ entries: [], pageInfo });
      },
      release: async () => {},
    },
  });
  const client = {
    addSettingsScreen: add,
    addScreen: add,
    addWorkspacePanel: add,
    addCommandCenterItem: add,
    addSlashCommand: add,
    addTimelineRenderer: add,
    addTimelineTransformer: add,
    rpc: async () => ({
      status: "ready",
      values: settingsSchema.parse({}),
      revision: "1",
    }),
    playAudio: async () => {},
    paseo: { agents: { list: directory }, workspaces: { list: directory } },
  };
  for (let i = 0; i < 2; i++) {
    const cleanup = contributeClient(client);
    await new Promise((r) => setImmediate(r));
    assert.equal(active, 9);
    await cleanup();
    assert.equal(active, 0);
  }
});

test('expanded plan and inline rows share ranges, reveal full thinking and retain long messages without clipping', async () => {
  const { createReader, createVoiceRow, createHeaderPlan } = await components();
  const { TimelineReader } = await import('../shared/timeline');
  const body = 'Opening sentence. ' + 'The entire message remains visible and selectable. '.repeat(35) + 'Final visible sentence.';
  for (const theme of themes) for (const compact of [false, true]) {
    const played: string[] = [];
    const client = { rpc: async (_c: any, input: any) => ({ base64: input.text, mimeType: 'audio/wav' }), playAudio: async (a: any) => { played.push(a.base64); }, openSettings() {} } as unknown as PluginClientContext;
    const runtime = new VoiceRuntime(client);
    runtime.settings = settingsSchema.parse({ enabled: true, backend: 'kokoro', reasoning: true, compactPlan: false, inlineControls: true });
    runtime.agents.set('a', { id: 'a', workspaceId: 'w', provider: 'codex', title: 'Design test' });
    const reader = new TimelineReader('a', () => runtime.settings, () => {});
    reader.ingest('e', [
      { seqStart: 0, seqEnd: 0, item: { type: 'user_message', text: 'Please review.' } },
      { seqStart: 1, seqEnd: 1, item: { type: 'reasoning', text: 'Exposed thinking in full.' } },
      { seqStart: 2, seqEnd: 2, item: { type: 'assistant_message', text: body } },
    ], false, true);
    runtime.feeds.set('a', { reader, dispose() {} } as any);
    const Row = createVoiceRow(runtime), Plan = createHeaderPlan(runtime), Reader = createReader(runtime);
    const props = { theme, layout: { compact, platform: 'web' }, host: { id: 'local', label: 'Local' } };
    let view!: ReactTestRenderer;
    const texts = () => view.root.findAllByType('Text' as any).map(n => n.children.filter(c => typeof c === 'string').join('')).join('\n');
    const press = async (label: string, occurrence = 0) => {
      const buttons = view.root.findAllByType('Pressable' as any).filter(n => n.props.accessibilityLabel === label);
      assert.ok(buttons[occurrence], label);
      await act(async () => { buttons[occurrence].props.onPress(); });
    };
    try {
      await act(async () => {
        view = create(React.createElement(React.Fragment, null,
          React.createElement(Row, { ...props, agentId: 'a', timestamp: new Date(), item: { data: { kind: 'reasoning', phase: 'complete', text: 'Exposed thinking in full.' } } }),
          React.createElement(Row, { ...props, agentId: 'a', timestamp: new Date(), item: { data: { kind: 'assistant_message', phase: 'complete', text: body } } }),
          React.createElement(Plan, { ...props, workspaceId: 'w', context: 'workspace', close() {} }),
          React.createElement(Reader, { ...props, workspaceId: 'w' }),
        ));
      });
      assert.match(texts(), /Final visible sentence/);
      await press('Expand thinking');
      assert.match(texts(), /Exposed thinking in full/);
      await press('More voice actions', 0);
      await press('More voice actions', 1);
      await press('Range start', 0);
      await press('Range end', 1);
      assert.match(texts(), /READING RANGE/);
      assert.match(texts(), /END OF RANGE/);
      assert.match(texts(), /Selected range/);
      await press('Included', 0);
      await press('Play range');
      assert.ok(played.length > 1);
      assert.equal(played.some(s => s.includes('Exposed thinking')), false);
      assert.equal(played.some(s => s.includes('Please review')), false);
      assert.ok(played.at(-1)?.includes('Final visible sentence'));
      for (const text of view.root.findAllByType('Text' as any)) assert.ok(text.props.style.color, `Missing themed text in ${theme.name}/${compact}`);
    } finally {
      await act(async () => { view?.unmount(); });
      runtime.dispose();
    }
  }
});

test('inline playback keeps Resume beside a message paused between sentences', async () => {
  const { createVoiceRow } = await components();
  const { TimelineReader } = await import('../shared/timeline');
  let release!: () => void;
  const gate = new Promise<void>(r => release = r);
  const client = { rpc: async () => ({ base64: 'sound', mimeType: 'audio/wav' }), playAudio: async () => gate, openSettings() {} } as unknown as PluginClientContext;
  const runtime = new VoiceRuntime(client);
  runtime.settings = settingsSchema.parse({ enabled: true, backend: 'kokoro' });
  runtime.agents.set('a', { id: 'a', workspaceId: 'w', provider: 'codex' });
  const reader = new TimelineReader('a', () => runtime.settings, () => {});
  reader.ingest('e', [{ seqStart: 0, seqEnd: 0, item: { type: 'assistant_message', text: 'First. Second.' } }], false, true);
  runtime.feeds.set('a', { reader, dispose() {} } as any);
  const Row = createVoiceRow(runtime);
  let view!: ReactTestRenderer;
  const press = async (label: string) => { await act(async () => { view.root.findAllByType('Pressable' as any).find(n => n.props.accessibilityLabel === label)!.props.onPress(); }); };
  try {
    await act(async () => { view = create(React.createElement(Row, { theme: themes[1], layout: { compact: false }, agentId: 'a', timestamp: new Date(), item: { data: { kind: 'assistant_message', text: 'First. Second.', phase: 'complete' } } })); });
    await press('Read');
    await press('Pause');
    await act(async () => { release(); await new Promise(r => setImmediate(r)); });
    assert.equal(runtime.queue.snapshot().status, 'paused');
    assert.ok(view.root.findAllByType('Pressable' as any).some(n => n.props.accessibilityLabel === 'Resume'));
    await press('Resume');
    assert.equal(runtime.queue.snapshot().pending, 0);
  } finally { release(); await act(async () => view?.unmount()); runtime.dispose(); }
});

test('live appearance toggle restores host rows without restarting agents or touching queued audio', async () => {
  const { registerVoiceTimeline } = await components();
  const transforms = new Map<string, any>();
  let rendererCount = 0;
  const client = {
    addTimelineRenderer() { rendererCount++; return () => { rendererCount--; }; },
    addTimelineTransformer(entry: any) {
      assert.equal(transforms.has(entry.id), false);
      transforms.set(entry.id, entry);
      return () => { transforms.delete(entry.id); };
    },
    rpc: async () => ({}), playAudio: async () => {},
  } as unknown as PluginClientContext;
  const runtime = new VoiceRuntime(client);
  const cleanup = registerVoiceTimeline(client, runtime);
  try {
    assert.equal(transforms.size, 0); // host UI is the default
    assert.equal(rendererCount, 1);
    runtime.queue.pause();
    runtime.queue.enqueue([{ agentId: 'a', messageId: 'm', kind: 'assistant_message', text: 'Still queued.' }]);
    const queueBefore = runtime.queue.snapshot();
    runtime.armed = true;
    runtime.target = 'a';
    const settings = runtime.settings;
    runtime.setSettings({ ...settings, inlineControls: true });
    assert.equal(transforms.size, 2);
    const assistant = transforms.get('voice-assistant');
    const source = { type: 'assistant_message', text: 'Hello.' };
    assert.equal(assistant.transform({ item: source, phase: 'complete' }).items[0].kind, 'voice-message');
    runtime.setSettings({ ...settings, inlineControls: false, compactPlan: false });
    assert.equal(transforms.size, 0); // removing registrations exposes original host renderer
    assert.equal(runtime.queue.snapshot(), queueBefore);
    assert.equal(runtime.armed, true);
    assert.equal(runtime.target, 'a');
    runtime.setSettings({ ...settings, inlineControls: true });
    runtime.changed();
    assert.equal(transforms.size, 2); // no duplicate registrations on unrelated updates
  } finally { cleanup(); cleanup(); runtime.dispose(); }
  assert.equal(transforms.size, 0);
  assert.equal(rendererCount, 0);
});

test('header saves appearance with official settings and keeps four message actions on a single row', async () => {
  const { createHeaderPlan, createVoiceRow, registerVoiceTimeline } = await components();
  for (const theme of themes) for (const compact of [false, true]) {
    let values = settingsSchema.parse({ enabled: true, backend: 'kokoro' });
    let revision = 1;
    let writes = 0;
    const registrations = new Set<string>();
    const client = {
      rpc: async (contract: any, input: any) => {
        if (contract.name === 'settings.voice.read') return { status: 'ready', revision: String(revision), values };
        if (contract.name === 'settings.voice.write') {
          assert.equal(input.revision, String(revision));
          values = settingsSchema.parse(input.values); writes++;
          return { status: 'saved', revision: String(++revision), values };
        }
        throw new Error('Unexpected RPC: ' + contract.name);
      },
      addTimelineRenderer: () => () => {},
      addTimelineTransformer: (entry: any) => { registrations.add(entry.id); return () => { registrations.delete(entry.id); }; },
      playAudio: async () => {}, openSettings() {},
    } as unknown as PluginClientContext;
    const runtime = new VoiceRuntime(client);
    runtime.settings = values;
    runtime.viewed = 'a';
    runtime.agents.set('a', { id: 'a', workspaceId: 'w', provider: 'codex', title: 'Example agent' });
    const { TimelineReader } = await import('../shared/timeline');
    const reader = new TimelineReader('a', () => runtime.settings, () => {});
    reader.ingest('e', [
      { seqStart: 0, seqEnd: 0, item: { type: 'user_message', text: 'A sent message.' } },
      { seqStart: 1, seqEnd: 1, item: { type: 'reasoning', text: 'Visible thinking.' } },
      { seqStart: 2, seqEnd: 2, item: { type: 'assistant_message', text: 'Response.\n---\nMore detail.' } },
    ], false, true);
    runtime.feeds.set('a', { reader, dispose() {} } as any);
    const cleanup = registerVoiceTimeline(client, runtime);
    const Plan = createHeaderPlan(runtime), Row = createVoiceRow(runtime);
    const props = { theme, host: { id: 'local', label: 'Local' }, layout: { compact, platform: 'web' } };
    let view!: ReactTestRenderer;
    const press = async (label: string) => { await act(async () => { view.root.findAllByType('Pressable' as any).find(n => n.props.accessibilityLabel === label)!.props.onPress(); }); };
    try {
      await act(async () => { view = create(React.createElement(Plan, { ...props, workspaceId: 'w', context: 'workspace', close() {} })); });
      assert.equal(view.root.findAllByType('SettingsSelect' as any).length, 0);
      assert.equal(registrations.size, 0);
      await press('Voice controls in messages');
      assert.equal(registrations.size, 2);
      assert.equal(runtime.settings.inlineControls, true);
      await press('Voice controls in messages');
      assert.equal(registrations.size, 0);
      await press('Expand reading plan');
      assert.equal(view.root.findAllByType('SettingsSelect' as any).length, 1);
      assert.equal(runtime.settings.compactPlan, false);
      await press('Shrink reading plan');
      assert.equal(view.root.findAllByType('SettingsSelect' as any).length, 0);
      assert.equal(writes, 4);
      assert.equal(values.backend, 'kokoro');
      await act(async () => { view.update(React.createElement(React.Fragment, null, ...reader.messages.map(m => React.createElement(Row, { ...props, key: m.id, agentId: 'a', timestamp: new Date(), item: { data: { kind: m.kind, text: m.text, phase: 'complete' } } })))); });
      const rows = view.root.findAllByType('View' as any).filter(n => / message$/.test(n.props.accessibilityLabel ?? ''));
      assert.deepEqual(rows.map(n => n.props.accessibilityLabel), ['You message', 'Thinking message', 'codex message']);
      const strip = ['Read from here', 'Read', 'Included', 'More voice actions'];
      for (const row of rows.slice(1)) {
        const labels = row.findAllByType('Pressable' as any).map(n => n.props.accessibilityLabel);
        for (const label of strip) assert.ok(labels.includes(label), label);
        assert.equal(labels.includes('Stop'), false, 'stop lives in the player, not on every message');
      }
      assert.equal(view.root.findAllByType('Text' as any).some(n => n.children.includes('Response.\n---\nMore detail.')), false);
    } finally { await act(async () => view?.unmount()); cleanup(); runtime.dispose(); }
  }
});

test('voice side panel adds controls without replacing Paseo message rendering', async () => {
  const { createVoiceRail, createHeaderPlan } = await components();
  const transformers: string[] = [];
  const opened: any[] = [];
  const client = {
    addTimelineRenderer: () => () => {},
    addTimelineTransformer: (entry: any) => { transformers.push(entry.id); return () => {}; },
    openPanel: (id: string, options: any) => { opened.push({ id, ...options }); },
    playAudio: async () => {}, openSettings() {},
  } as unknown as PluginClientContext;
  const runtime = new VoiceRuntime(client);
  runtime.settings = settingsSchema.parse({ enabled: true, backend: 'kokoro' });
  runtime.agents.set('a', { id: 'a', workspaceId: 'w', provider: 'codex', title: 'Example agent' });
  const { TimelineReader } = await import('../shared/timeline');
  const reader = new TimelineReader('a', () => runtime.settings, () => {});
  reader.ingest('e', [
    { seqStart: 0, seqEnd: 0, item: { type: 'user_message', text: 'A sent message with an image.' } },
    { seqStart: 1, seqEnd: 1, item: { type: 'assistant_message', text: 'Response one.' } },
    { seqStart: 2, seqEnd: 2, item: { type: 'user_message', text: 'Follow-up question.' } },
    { seqStart: 3, seqEnd: 3, item: { type: 'assistant_message', text: 'Response two.' } },
  ], false, true);
  runtime.feeds.set('a', { reader, dispose() {} } as any);
  assert.equal(reader.messages.length, 4);
  const Rail = createVoiceRail(runtime), Plan = createHeaderPlan(runtime);
  const props = { theme: themes[1], host: { id: 'local', label: 'Local' }, layout: { compact: false, platform: 'web' } };
  let view!: ReactTestRenderer;
  const pressables = () => view.root.findAllByType('Pressable' as any);
  try {
    await act(async () => { view = create(React.createElement(Rail, { ...props, context: 'agent', workspaceId: 'w', agentId: 'a' })); });
    assert.deepEqual(transformers, [], 'the side panel must not replace host timeline rows');
    assert.equal(pressables().filter(n => n.props.accessibilityLabel === 'Read').length, 4);
    const skip = pressables().filter(n => n.props.accessibilityLabel === 'Skip');
    await act(async () => { skip[3].props.onPress(); });
    assert.equal(runtime.isExcluded('a', reader.messages[3].id), true);
    assert.equal(pressables().filter(n => n.props.accessibilityLabel === 'Include').length, 1);
    await act(async () => { view.update(React.createElement(Plan, { ...props, workspaceId: 'w', close() {} })); });
    await act(async () => { pressables().find(n => n.props.accessibilityLabel === 'Open voice side panel')!.props.onPress(); });
    assert.deepEqual(opened, [{ id: 'voice-rail', workspaceId: 'w', agentId: 'a', location: 'explorer' }]);
  } finally { await act(async () => view?.unmount()); runtime.dispose(); }
});

test('side panel tabs switch between now playing and all messages, with sentence and section playback', async () => {
  const { createVoiceRail } = await components();
  const synthesized: string[] = [];
  const client = {
    addTimelineRenderer: () => () => {}, addTimelineTransformer: () => () => {},
    openPanel: () => {}, openSettings() {},
    rpc: async (_c: any, input: any) => { synthesized.push(input.text); return { base64: input.text, mimeType: 'audio/wav' }; },
    playAudio: () => new Promise<void>(() => {}),
  } as unknown as PluginClientContext;
  const runtime = new VoiceRuntime(client);
  runtime.settings = settingsSchema.parse({ enabled: true, backend: 'kokoro' });
  runtime.agents.set('a', { id: 'a', workspaceId: 'w', provider: 'codex', title: 'Example agent' });
  const { TimelineReader } = await import('../shared/timeline');
  const reader = new TimelineReader('a', () => runtime.settings, () => {});
  reader.ingest('e', [
    { seqStart: 0, seqEnd: 0, item: { type: 'user_message', text: 'Question?' } },
    { seqStart: 1, seqEnd: 1, item: { type: 'assistant_message', text: 'Alpha one. Beta two. Gamma three.' } },
  ], false, true);
  runtime.feeds.set('a', { reader, dispose() {} } as any);
  const Rail = createVoiceRail(runtime);
  const props = { theme: themes[1], host: { id: 'local', label: 'Local' }, layout: { compact: false, platform: 'web' }, context: 'agent', workspaceId: 'w', agentId: 'a' };
  let view!: ReactTestRenderer;
  const find = (label: string) => view.root.findAllByType('Pressable' as any).find(n => n.props.accessibilityLabel === label);
  const press = async (label: string) => { const b = find(label); assert.ok(b, label); await act(async () => { b!.props.onPress(); await new Promise(r => setImmediate(r)); }); };
  try {
    await act(async () => { view = create(React.createElement(Rail, props)); });
    assert.ok(find('Read'), 'all messages tab is the default');
    await press('Now playing');
    assert.equal(find('Read'), undefined, 'now playing hides the message list');
    await press('All messages');
    const pick = view.root.findAllByType('Pressable' as any).filter(n => n.props.accessibilityLabel === 'Pick part');
    assert.equal(pick[0].props.disabled, true, 'sent messages are not narrated by default');
    await act(async () => { pick[1].props.onPress(); });
    assert.equal(runtime.railFocus, true);
    assert.deepEqual(synthesized, [], 'pick part loads the message without playing');
    await press('Play from sentence 2');
    assert.equal(synthesized.at(-1), 'Beta two.');
    await press('Select text');
    const input = view.root.findByType('TextInput' as any);
    await act(async () => { input.props.onSelectionChange({ nativeEvent: { selection: { start: 11, end: 20 } } }); });
    await press('Play selection');
    assert.equal(synthesized.at(-1), 'Beta two.');
    assert.equal(runtime.queue.snapshot().pending, 1, 'a selection queues only the selected part');
    await press('All messages');
    assert.ok(find('Read'));
  } finally { await act(async () => view?.unmount()); runtime.dispose(); }
});
