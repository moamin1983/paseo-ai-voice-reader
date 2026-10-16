// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { settingsRpc } from "@getpaseo/plugin";
import type {
  PluginButtonRegistration,
  PluginButtonContentProps,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { resolveMessage, type VoiceRow } from "../shared/presentation";
import { allowKind, sanitize, speechSegments } from "../shared/text";
import type { ReadMessage } from "../shared/timeline";
import { settingsSchema, type Preferences } from "../shared/settings";
import { synthesize, turnStatus } from "../shared/contracts";
import { TimelineReader } from "../shared/timeline";
import { AudioQueue } from "./queue";

type Agent = {
  id: string;
  workspaceId?: string | null;
  title?: string | null;
  provider: string;
};
type Api = PluginClientContext["paseo"];
type Unsubscribe = ReturnType<
  ReturnType<Api["agents"]["ref"]>["timeline"]["subscribe"]
>;

class AgentFeed {
  readonly reader: TimelineReader;
  private unsubscribe?: Unsubscribe;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private fetching = false;
  private dirty = false;
  private initialized = false;
  private generation = 0;
  private final = false;
  private canceled = false;
  constructor(
    readonly id: string,
    private runtime: VoiceRuntime,
  ) {
    this.reader = new TimelineReader(
      id,
      () => runtime.settings,
      (s) => { if (!runtime.isExcluded(id, s.messageId)) runtime.queue.enqueue([s]); },
      () => runtime.queue.removeAgent(id),
    );
    this.observe();
  }
  private observe() {
    if (this.disposed) return;
    const unsubscribe = this.runtime.client.paseo.agents
      .ref(this.id)
      .timeline.subscribe(({ event }) => {
        if (event.type === "error") {
          this.runtime.error("Timeline disconnected: " + event.error);
          this.unsubscribe?.();
          this.unsubscribe = undefined;
          this.timer = setTimeout(() => {
            this.timer = undefined;
            this.observe();
          }, 3000);
          return;
        }
        if (event.type === "replacement") {
          this.generation++;
          this.runtime.queue.removeAgent(this.id);
          this.reader.reset();
          this.initialized = false;
          this.final = false;
          this.canceled = false;
        }
        if (event.type === "turn_started") {
          this.canceled = false;
          this.final = false;
        }
        if (event.type === "turn_canceled" || event.type === "turn_failed")
          this.end(true);
        if (event.type === "turn_completed") this.end(false);
        this.request();
      });
    this.unsubscribe = unsubscribe;
    void unsubscribe.ready
      .then(() => this.request())
      .catch(() => {
        /* error event schedules retry */
      });
  }
  end(canceled: boolean) {
    this.final = true;
    this.canceled = canceled;
    if (canceled) this.runtime.queue.removeAgent(this.id);
    this.request();
  }
  request() {
    if (this.disposed) return;
    this.dirty = true;
    if (this.fetching || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, 120);
  }
  private async refresh() {
    if (this.disposed || this.fetching) return;
    this.fetching = true;
    try {
      while (this.dirty && !this.disposed) {
        this.dirty = false;
        const handle = this.runtime.client.paseo.agents.ref(this.id);
        let more = true;
        while (more && !this.disposed) {
          const initial = !this.initialized;
          const generation = this.generation;
          const page = await handle.timeline.refetch(
            initial
              ? { direction: "tail", projection: "canonical", limit: 200 }
              : {
                  direction: "after",
                  projection: "canonical",
                  limit: 200,
                  cursor: {
                    epoch: this.reader.epoch,
                    seq: this.reader.lastSeq,
                  },
                },
          );
          if (this.disposed) return;
          if (generation !== this.generation) {
            this.dirty = true;
            break;
          }
          if (page.error) throw new Error(page.error);
          if (
            !initial &&
            (page.reset ||
              page.staleCursor ||
              page.gap ||
              page.epoch !== this.reader.epoch)
          ) {
            this.runtime.queue.removeAgent(this.id);
            this.reader.reset();
            this.initialized = false;
            this.runtime.error(
              "Timeline changed or history has a gap. Rebased without replaying history.",
            );
            continue;
          }
          this.reader.ingest(
            page.epoch,
            page.entries,
            !initial && !this.canceled && this.runtime.shouldSpeak(this.id),
            false,
            page.projection,
          );
          this.initialized = true;
          if (initial && page.entries.length === 0)
            this.reader.lastSeq = page.window.maxSeq;
          more = page.hasNewer;
          if (more && page.entries.length === 0)
            throw new Error("Timeline paging made no progress.");
          if (
            !more &&
            (this.final ||
              page.agent?.status === "idle" ||
              page.agent?.status === "closed" ||
              page.agent?.status === "error")
          ) {
            this.reader.finish(
              !initial && !this.canceled && this.runtime.shouldSpeak(this.id),
            );
            this.final = false;
          }
          this.runtime.changed();
        }
      }
    } catch (error) {
      if (!this.disposed) {
        this.runtime.error(
          error instanceof Error ? error.message : "Timeline read failed.",
        );
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.request();
        }, 3000);
      }
    } finally {
      this.fetching = false;
      if (this.dirty) this.request();
    }
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.unsubscribe?.();
  }
}
export class VoiceRuntime {
  settings = settingsSchema.parse({});
  readonly queue: AudioQueue;
  readonly agents = new Map<string, Agent>();
  readonly feeds = new Map<string, AgentFeed>();
  headerContent?: ComponentType<PluginButtonContentProps>;
  private watched = new Map<string, number>();
  private ranges = new Map<string, { epoch: string; start: string; end: string }>();
  private exclusions = new Set<string>();
  armed = false;
  target?: string;
  viewed?: string;
  notice = "";
  savingAppearance = false;
  appearanceError = "";
  private appearanceGeneration = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  private disposed = false;
  private abort = new AbortController();
  private directory?: Awaited<
    ReturnType<Api["agents"]["list"]>
  >["subscription"];
  private workspaceDirectory?: Awaited<
    ReturnType<Api["workspaces"]["list"]>
  >["subscription"];
  private snapshotIds = new Set<string>();
  private directoryEpoch = 0;
  private pills = new Map<string, PluginButtonRegistration>();
  private headers = new Map<string, PluginButtonRegistration>();
  private poll?: ReturnType<typeof setInterval>;
  private polling = false;
  private turnRevisions = new Map<string, number>();
  constructor(readonly client: PluginClientContext) {
    this.queue = new AudioQueue(
      (s) => client.rpc(synthesize, { text: s.text, kind: s.kind }),
      (a) => client.playAudio(a),
    );
    this.queue.subscribe(() => this.updateHeaders());
  }
  private headerLabel = "";
  private updateHeaders() {
    const { status, pending, current } = this.queue.snapshot();
    const label = status === "paused" ? "Paused"
      : status === "error" ? "Voice needs attention"
      : current || pending ? `Reading · ${pending} left`
      : "Reading plan";
    if (label === this.headerLabel) return;
    this.headerLabel = label;
    for (const header of this.headers.values()) header.update({ label });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;
  changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  error(message: string) {
    this.notice = message;
    this.changed();
  }
  shouldSpeak(id: string) {
    return (
      this.settings.enabled &&
      this.armed &&
      (this.settings.scope === "all" || this.target === id)
    );
  }
  setSettings(p: Preferences) {
    if (JSON.stringify(p) === JSON.stringify(this.settings)) return;
    const { inlineControls: _oldInline, compactPlan: _oldCompact, ...oldAudio } = this.settings;
    const { inlineControls: _inline, compactPlan: _compact, ...nextAudio } = p;
    const audioChanged = JSON.stringify(oldAudio) !== JSON.stringify(nextAudio);
    this.settings = p;
    if (audioChanged) {
      this.queue.stop();
      if (!p.enabled) this.armed = false;
      if (p.enabled && this.armed) this.queue.resume();
      this.syncFeeds();
      this.updatePills();
    }
    this.changed();
  }
  async setAppearance(patch: Partial<Pick<Preferences, "inlineControls" | "compactPlan">>) {
    if (this.disposed || this.savingAppearance) return;
    this.savingAppearance = true;
    this.appearanceError = "";
    this.appearanceGeneration++;
    this.changed();
    try {
      const rpc = settingsRpc("voice");
      const current = await this.client.rpc(rpc.read, {});
      if (this.disposed) return;
      if (current.status !== "ready") throw new Error(current.error);
      const values = { ...settingsSchema.parse(current.values), ...patch };
      const result = await this.client.rpc(rpc.write, { revision: current.revision, values });
      if (this.disposed) return;
      if (result.status !== "saved") throw new Error(result.error);
      this.setSettings(settingsSchema.parse(result.values));
    } catch (error) {
      if (!this.disposed) this.appearanceError = error instanceof Error ? error.message : "Unable to save display preference.";
    } finally {
      this.savingAppearance = false;
      if (!this.disposed) this.changed();
    }
  }
  async start() {
    void this.observeWorkspaces();
    void this.pollState();
    this.poll = setInterval(() => {
      void this.pollState();
    }, 2000);
    try {
      const result = await this.client.paseo.agents.list({
        scope: "active",
        filter: { includeArchived: false },
        page: { limit: 200 },
        subscribe: {},
        signal: this.abort.signal,
      });
      if (this.disposed) {
        await result.subscription.release();
        return;
      }
      this.directory = result.subscription;
      result.subscription.subscribe({
        snapshot: ({ entries, pageInfo }) => {
          const epoch = ++this.directoryEpoch;
          this.snapshotIds = new Set(entries.map((e) => e.agent.id));
          for (const { agent } of entries) this.register(agent);
          void this.finishDirectory(pageInfo.nextCursor, epoch).catch((e) =>
            this.error(e instanceof Error ? e.message : "Agent paging failed."),
          );
          this.syncFeeds();
          this.changed();
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const u = message.payload;
          if (u.kind === "upsert") {
            this.snapshotIds.add(u.agent.id);
            this.register(u.agent);
          } else {
            this.snapshotIds.delete(u.agentId);
            this.removeAgent(u.agentId);
          }
          this.syncFeeds();
          this.changed();
        },
        error: (error) => this.error(String(error)),
      });
    } catch (error) {
      if (!this.disposed)
        this.error(
          error instanceof Error
            ? error.message
            : "Agent directory unavailable.",
        );
    }
  }
  private async pollState() {
    if (this.disposed || this.polling) return;
    this.polling = true;
    try {
      const appearanceGeneration = this.appearanceGeneration;
      const state = await this.client.rpc(settingsRpc("voice").read, {});
      if (this.disposed) return;
      if (!this.savingAppearance && appearanceGeneration === this.appearanceGeneration) {
        if (state.status === "ready") this.setSettings(settingsSchema.parse(state.values));
        else {
          this.setSettings({ ...this.settings, enabled: false });
          this.error(state.error);
        }
      }
      if (!this.feeds.size) return;
      const { turns } = await this.client.rpc(turnStatus, {});
      if (this.disposed) return;
      for (const turn of turns) {
        const previous = this.turnRevisions.get(turn.agentId);
        this.turnRevisions.set(turn.agentId, turn.revision);
        if (
          previous !== undefined &&
          previous !== turn.revision &&
          turn.outcome !== "running"
        )
          this.feeds.get(turn.agentId)?.end(turn.outcome !== "completed");
      }
    } catch (error) {
      if (!this.disposed)
        this.error(
          error instanceof Error
            ? error.message
            : "Voice connection unavailable.",
        );
    } finally {
      this.polling = false;
    }
  }
  private register(agent: Agent) {
    const old = this.agents.get(agent.id);
    if (old?.workspaceId !== agent.workspaceId) {
      this.pills.get(agent.id)?.remove();
      this.pills.delete(agent.id);
    }
    this.agents.set(agent.id, agent);
    if (!agent.workspaceId) return;
    const workspaceId = agent.workspaceId;
    this.registerWorkspace(workspaceId);
    if (!this.pills.has(agent.id))
      this.pills.set(
        agent.id,
        this.client.addComposerPill({
          id: "voice",
          workspaceId,
          agentId: agent.id,
          button: {
            title: "Automatic voice narration",
            icon: "Volume2",
            label: "Voice Off",
            behavior: { kind: "action", onPress: () => this.toggle(agent.id) },
          },
        }),
      );
    this.updatePills();
  }
  private async finishDirectory(cursor: string | null, epoch: number) {
    while (cursor && !this.disposed && epoch === this.directoryEpoch) {
      const page = await this.client.paseo.agents.list({
        scope: "active",
        filter: { includeArchived: false },
        page: { limit: 200, cursor },
      });
      if (this.disposed || epoch !== this.directoryEpoch) return;
      for (const { agent } of page.entries) {
        this.snapshotIds.add(agent.id);
        this.register(agent);
      }
      if (cursor === page.pageInfo.nextCursor)
        throw new Error("Agent directory paging made no progress.");
      cursor = page.pageInfo.nextCursor;
    }
    if (this.disposed || epoch !== this.directoryEpoch) return;
    for (const id of this.agents.keys())
      if (!this.snapshotIds.has(id)) this.removeAgent(id);
    this.syncFeeds();
    this.changed();
  }
  private registerWorkspace(workspaceId: string) {
    if (!this.headers.has(workspaceId))
      this.headers.set(
        workspaceId,
        this.client.addHeaderButton({
          id: "voice",
          workspaceId,
          button: {
            title: "What will be read",
            label: this.headerLabel || "Reading plan",
            icon: "Volume2",
            behavior: this.headerContent ? { kind: "popover", Content: this.headerContent } : {
              kind: "menu",
              items: [
                {
                  kind: "item",
                  id: "panel",
                  title: "Voice playback and message range",
                  icon: "Volume2",
                  behavior: {
                    kind: "action",
                    onPress: () =>
                      this.client.openPanel("reader", { workspaceId }),
                  },
                },
                {
                  kind: "item",
                  id: "test",
                  title: "Test voice",
                  icon: "Volume2",
                  behavior: {
                    kind: "action",
                    onPress: () => {
                      this.testVoice();
                      this.client.openPanel("reader", { workspaceId });
                    },
                  },
                },
                {
                  kind: "item",
                  id: "settings",
                  title: "Voice settings and privacy",
                  icon: "Settings",
                  behavior: {
                    kind: "action",
                    onPress: () => this.client.openSettings("voice"),
                  },
                },
                {
                  kind: "item",
                  id: "stop",
                  title: "Stop narration",
                  icon: "Square",
                  behavior: { kind: "action", onPress: () => this.stop() },
                },
              ],
            },
          },
        }),
      );
  }
  private async observeWorkspaces() {
    try {
      const result = await this.client.paseo.workspaces.list({
        subscribe: {},
        page: { limit: 200 },
      });
      if (this.disposed) {
        await result.subscription.release();
        return;
      }
      this.workspaceDirectory = result.subscription;
      result.subscription.subscribe({
        snapshot: ({ entries, pageInfo }) => {
          for (const w of entries) this.registerWorkspace(w.id);
          void (async () => {
            let cursor = pageInfo.nextCursor;
            while (cursor && !this.disposed) {
              const p = await this.client.paseo.workspaces.list({
                page: { limit: 200, cursor },
              });
              if (this.disposed) return;
              for (const w of p.entries) this.registerWorkspace(w.id);
              if (cursor === p.pageInfo.nextCursor) break;
              cursor = p.pageInfo.nextCursor;
            }
          })().catch(() => this.error("Workspace directory paging failed."));
        },
        update: (message) => {
          if (message.type !== "workspace_update") return;
          const u = message.payload;
          if (u.kind === "upsert") this.registerWorkspace(u.workspace.id);
          else {
            this.headers.get(u.id)?.remove();
            this.headers.delete(u.id);
          }
        },
      });
    } catch (error) {
      if (!this.disposed)
        this.error(
          error instanceof Error
            ? error.message
            : "Workspace directory unavailable.",
        );
    }
  }
  private updatePills() {
    for (const [id, pill] of this.pills)
      pill.update({
        label: this.shouldSpeak(id) ? "Voice On" : "Voice Off",
        icon: this.shouldSpeak(id) ? "Volume2" : "VolumeX",
      });
  }
  private removeAgent(id: string) {
    this.agents.delete(id);
    this.pills.get(id)?.remove();
    this.pills.delete(id);
    this.feeds.get(id)?.dispose();
    this.feeds.delete(id);
    this.queue.removeAgent(id);
    this.turnRevisions.delete(id);
  }
  toggle(id: string) {
    if (!this.settings.enabled) {
      this.client.openSettings("voice");
      return;
    }
    if (this.shouldSpeak(id)) {
      this.stop();
      return;
    }
    this.target = id;
    this.armed = true;
    this.notice = "";
    this.queue.stop();
    this.queue.resume();
    this.syncFeeds();
    this.updatePills();
    this.changed();
  }
  select(id: string) {
    if (this.viewed === id) return;
    this.viewed = id;
    if (this.settings.scope === "current" && this.target !== id) {
      this.target = id;
      this.queue.stop();
      this.queue.resume();
    }
    this.syncFeeds();
    this.updatePills();
    this.changed();
  }
  private syncFeeds() {
    const desired = new Set([...this.watched.keys()].filter(id => this.agents.has(id)));
    if (this.viewed && this.agents.has(this.viewed)) desired.add(this.viewed);
    if (this.armed && this.settings.enabled) {
      if (this.settings.scope === "all")
        for (const id of this.agents.keys()) desired.add(id);
      else if (this.target) desired.add(this.target);
    }
    for (const [id, f] of this.feeds)
      if (!desired.has(id)) {
        f.dispose();
        this.feeds.delete(id);
      }
    for (const id of desired)
      if (!this.feeds.has(id)) this.feeds.set(id, new AgentFeed(id, this));
  }
  stop() {
    this.armed = false;
    this.queue.stop();
    this.syncFeeds();
    this.updatePills();
    this.changed();
  }
  testVoice() {
    if (!this.settings.enabled) {
      this.client.openSettings("voice");
      return;
    }
    this.stop();
    this.queue.enqueue(
      [
        "This is the Paseo voice reader test.",
        "Audio is playing on this connected client.",
        "You can now test pause, resume, stop, skip, and replay.",
      ].map((text, index) => ({
        agentId: "voice-test",
        messageId: `voice-test-${index}`,
        kind: "assistant_message" as const,
        text,
      })),
    );
    this.queue.resume();
    this.notice = "Playing public test sentences. No timeline text is used.";
    this.changed();
  }
  playRange(id: string, start: string, end: string) {
    if (!this.settings.enabled) {
      this.client.openSettings("voice");
      return;
    }
    try {
      const feed = this.feeds.get(id);
      if (!feed) throw new Error("Wait for timeline history.");
      const items = feed.reader.range(start, end).filter(s => !this.isExcluded(id, s.messageId));
      if (!items.length)
        throw new Error(
          "Range contains no completed messages allowed by the current filters.",
        );
      this.stop();
      this.queue.enqueue(items);
      this.queue.resume();
      this.notice = "";
      this.changed();
    } catch (error) {
      this.error(error instanceof Error ? error.message : "Invalid range.");
    }
  }
  watchAgent(id: string) {
    this.watched.set(id, (this.watched.get(id) ?? 0) + 1);
    this.syncFeeds();
    return () => {
      const remaining = (this.watched.get(id) ?? 1) - 1;
      if (remaining) this.watched.set(id, remaining);
      else this.watched.delete(id);
      if (!this.disposed) this.syncFeeds();
    };
  }
  resolveRow(id: string, row: VoiceRow, timestamp: Date) {
    return resolveMessage(this.feeds.get(id)?.reader.messages ?? [], row, timestamp);
  }
  selection(id: string) {
    const saved = this.ranges.get(id);
    const feed = this.feeds.get(id);
    if (!saved || saved.epoch !== feed?.reader.epoch ||
        !feed.reader.messages.some(m => m.id === saved.start) ||
        !feed.reader.messages.some(m => m.id === saved.end)) return undefined;
    return saved;
  }
  setBoundary(id: string, messageId: string, boundary: "start" | "end") {
    const reader = this.feeds.get(id)?.reader;
    const message = reader?.messages.find(m => m.id === messageId);
    if (!reader || !message?.complete) return;
    this.select(id);
    const previous = this.selection(id);
    const range = { epoch: reader.epoch, start: previous?.start ?? messageId, end: previous?.end ?? messageId, [boundary]: messageId };
    const a = reader.messages.findIndex(m => m.id === range.start);
    const b = reader.messages.findIndex(m => m.id === range.end);
    if (a > b) { if (boundary === "start") range.end = messageId; else range.start = messageId; }
    this.ranges.set(id, range);
    this.changed();
  }
  clearRange(id: string) { this.ranges.delete(id); this.changed(); }
  isExcluded(id: string, messageId: string) { return this.exclusions.has(id + "/" + messageId); }
  toggleExcluded(id: string, messageId: string) {
    const key = id + "/" + messageId;
    if (this.exclusions.has(key)) this.exclusions.delete(key);
    else { this.exclusions.add(key); this.queue.removeMessage(id, messageId); }
    this.changed();
  }
  /** Read a message; `from`/`to` are offsets into its spoken (filtered) text. */
  playMessage(id: string, message: Pick<ReadMessage, "id" | "kind" | "text">, from = 0, to?: number) {
    if (!this.settings.enabled || !allowKind(message.kind, this.settings)) {
      this.notice = "Enable this content type in Voice settings before reading it.";
      this.changed();
      this.client.openSettings("voice");
      return;
    }
    const text = sanitize(message.text, this.settings);
    if (!text) { this.error("No readable text after filtering."); return; }
    const section = to !== undefined && to > from;
    // A selected section is segmented on its own; otherwise the whole message is
    // queued so Previous can step back to sentences before the starting point.
    const segments = section
      ? speechSegments(text.slice(from, to)).map(s => ({ ...s, offset: s.offset + from }))
      : speechSegments(text);
    if (!segments.length) { this.error("Nothing readable in that selection."); return; }
    const start = section ? 0 : Math.max(0, segments.findLastIndex(s => s.offset <= from));
    this.select(id);
    this.stop();
    const base = this.queue.history().items.length;
    this.queue.enqueue(segments.map(segment => ({ agentId: id, messageId: message.id, kind: message.kind, ...segment })));
    this.queue.seek(base + start);
    this.notice = "";
    this.changed();
  }
  /** Load a message into Now playing, paused at its first sentence, so a part can be picked. */
  focusMessage(id: string, message: Pick<ReadMessage, "id" | "kind" | "text">) {
    const text = sanitize(message.text, this.settings);
    if (!text) { this.error("No readable text after filtering."); return; }
    this.select(id);
    this.stop();
    const base = this.queue.history().items.length;
    this.queue.enqueue(speechSegments(text).map(segment => ({ agentId: id, messageId: message.id, kind: message.kind, ...segment })));
    this.queue.cue(base);
    this.showNowPlaying(id);
  }
  previous() { this.queue.previous(); }
  next() { this.queue.next(); }
  /** Message text (spoken form) for what is playing now, or what played last. */
  nowPlaying() {
    const { items, playing, next } = this.queue.history();
    const speech = items[playing] ?? items[next] ?? items[next - 1];
    if (!speech) return undefined;
    const source = this.feeds.get(speech.agentId)?.reader.messages.find(m => m.id === speech.messageId);
    const sentences = source
      ? speechSegments(sanitize(source.text, this.settings))
      : items.filter(s => s.agentId === speech.agentId && s.messageId === speech.messageId).map(s => ({ text: s.text, offset: s.offset ?? 0 }));
    return { speech, source, sentences, active: playing >= 0 };
  }
  /** Side panel tab: true focuses on what is playing, false lists all messages. */
  railFocus = false;
  setRailFocus(value: boolean) { this.railFocus = value; this.changed(); }
  /** Open the side panel focused on the current playback. */
  showNowPlaying(agentId: string) {
    const workspaceId = this.agents.get(agentId)?.workspaceId;
    this.railFocus = true;
    this.changed();
    if (workspaceId) this.client.openPanel("voice-rail", { workspaceId, agentId, location: "explorer" });
  }
  async loadOlder(id: string) {
    const feed = this.feeds.get(id);
    if (!feed) return;
    // Historical range reader is deliberately separate from the live dedup cursor.
    const page = await this.client.paseo.agents.ref(id).timeline.refetch({
      direction: "before",
      projection: "canonical",
      limit: 200,
      cursor: {
        epoch: feed.reader.epoch,
        seq: feed.reader.messages[0]?.seq ?? feed.reader.lastSeq,
      },
    });
    if (this.disposed || feed !== this.feeds.get(id)) return;
    if (page.error || page.epoch !== feed.reader.epoch || page.staleCursor)
      throw new Error("History epoch changed. Refresh the panel.");
    const old = new TimelineReader(
      id,
      () => this.settings,
      () => {},
    );
    old.ingest(page.epoch, page.entries, false, true, page.projection);
    feed.reader.prepend(old.messages);
    this.changed();
    if (!page.hasOlder) this.error("Beginning of retained timeline reached.");
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    if (this.poll) clearInterval(this.poll);
    void this.directory?.release().catch(() => {});
    void this.workspaceDirectory?.release().catch(() => {});
    for (const f of this.feeds.values()) f.dispose();
    this.feeds.clear();
    for (const p of this.pills.values()) p.remove();
    for (const h of this.headers.values()) h.remove();
    this.pills.clear();
    this.headers.clear();
    this.watched.clear();
    this.ranges.clear();
    this.exclusions.clear();
    this.queue.dispose();
    this.agents.clear();
    this.listeners.clear();
  }
}
