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
      contents: `export {createReader} from './client/reader'; export {createSettings} from './client/settings'; export {createVoiceRow} from './client/timeline'; export {createHeaderPlan} from './client/reader'; export {default as contributeClient} from './index.client';`,
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
                ? `export const View='View',Text='Text',ScrollView='ScrollView',Pressable='Pressable';`
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
      const values = settingsSchema.parse({});
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
            `Missing theme color in ${theme.name}/${compact}`,
          );
        for (const label of [
          "Play",
          "Test voice",
          "Pause",
          "Stop",
          "Skip",
          "Replay",
          "Voice On",
          "Start reading here",
          "Stop reading here",
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
    assert.equal(active, 10);
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
    runtime.settings = settingsSchema.parse({ enabled: true, backend: 'kokoro', reasoning: true });
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
      assert.equal(view.root.findAllByType('Text' as any).filter(n => n.props.numberOfLines !== undefined).length, 0);
      await press('Show full thinking text');
      await press('Start reading here', 0);
      await press('Stop reading here', 1);
      assert.match(texts(), /Start of selected range/);
      assert.match(texts(), /End of selected range/);
      assert.match(texts(), /Selected reading range/);
      await press('Exclude from reading', 0);
      await press('Play');
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
    await press('Read message');
    await press('Pause');
    await act(async () => { release(); await new Promise(r => setImmediate(r)); });
    assert.equal(runtime.queue.snapshot().status, 'paused');
    assert.ok(view.root.findAllByType('Pressable' as any).some(n => n.props.accessibilityLabel === 'Resume'));
    await press('Resume');
    assert.equal(runtime.queue.snapshot().pending, 0);
  } finally { release(); await act(async () => view?.unmount()); runtime.dispose(); }
});
