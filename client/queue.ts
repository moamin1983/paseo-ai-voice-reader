// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import type { Speech } from "../shared/text";
export type Audio = { base64: string; mimeType: string };
export type QueueState = {
  status: "idle" | "synthesizing" | "playing" | "paused" | "error" | "stopping";
  pending: number;
  current?: Speech;
  error?: string;
};
// The queue is a playlist with a cursor. Played sentences stay in the playlist so
// Previous can step back through them; pending sentences are playlist[cursor..].
const HISTORY = 512;
export class AudioQueue {
  private playlist: Speech[] = [];
  private cursor = 0;
  private playingIndex = -1;
  private lastIndex = -1;
  private moved = false;
  private last?: Speech;
  private current?: Speech;
  private paused = false;
  private busy = false;
  private closed = false;
  private generation = 0;
  private state: QueueState = { status: "idle", pending: 0 };
  private listeners = new Set<() => void>();
  constructor(
    private synth: (speech: Speech) => Promise<Audio>,
    private play: (audio: Audio) => Promise<void>,
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private get pending() { return this.playlist.length - this.cursor; }
  private publish(status: QueueState["status"], error?: string) {
    this.state = {
      status,
      pending: this.pending,
      current: this.current,
      error,
    };
    for (const fn of this.listeners) fn();
  }
  private trim() {
    const extra = this.cursor - HISTORY;
    if (extra <= 0) return;
    this.playlist.splice(0, extra);
    this.cursor -= extra;
    this.playingIndex -= extra;
    this.lastIndex -= extra;
  }
  enqueue(items: Speech[]) {
    if (this.closed) return;
    if (this.pending + items.length > 256) {
      this.paused = true;
      this.publish(
        "error",
        "Narration backlog exceeds 256 sentences. Stop, then choose a smaller range.",
      );
      return;
    }
    this.playlist.push(...items);
    this.publish(this.state.status);
    void this.pump();
  }
  pause() {
    this.paused = true;
    this.publish("paused");
  }
  resume() {
    if (this.closed) return;
    this.paused = false;
    this.publish(this.busy ? "playing" : "idle");
    void this.pump();
  }
  stop() {
    this.generation++;
    this.playlist.splice(this.cursor);
    this.paused = true;
    this.publish(this.busy ? "stopping" : "idle");
  }
  /** Next: finish the current sentence early (at its end) or drop the next pending one. */
  skip() {
    if (this.busy && this.current && !this.moved) {
      this.moved = true;
      this.generation++;
      this.publish("stopping");
    } else {
      this.cursor = Math.min(this.playlist.length, this.cursor + 1);
      this.publish(this.paused ? "paused" : this.busy ? this.state.status : "idle");
      void this.pump();
    }
  }
  next() { this.skip(); }
  /** Previous: step back one sentence per press; playback continues forward from there. */
  previous() {
    if (!this.playlist.length) return;
    if (this.current && !this.moved) this.cursor = Math.max(0, this.playingIndex - 1);
    else this.cursor = Math.max(0, this.cursor - 1);
    this.moved = true;
    this.publish(this.paused ? "paused" : this.state.status);
    void this.pump();
  }
  /** Jump to a sentence already in the playlist. */
  seek(index: number) {
    if (index < 0 || index >= this.playlist.length) return;
    this.cursor = index;
    this.moved = true;
    this.resume();
  }
  /** Move the cursor without starting playback. */
  cue(index: number) {
    if (index < 0 || index >= this.playlist.length) return;
    this.cursor = index;
    this.moved = true;
    this.publish(this.paused ? "paused" : this.state.status);
  }
  replay() {
    const index = this.current ? this.playingIndex : this.lastIndex;
    if (index < 0 || !this.playlist[index]) return;
    this.cursor = index;
    this.moved = true;
    this.resume();
  }
  items(): readonly Speech[] { return [...(this.current ? [this.current] : []), ...this.playlist.slice(this.cursor)]; }
  /** Every sentence of this session, with the index of the one playing (or next). */
  history() {
    return { items: this.playlist as readonly Speech[], playing: this.current ? this.playingIndex : -1, next: this.cursor };
  }
  removeMessage(agentId: string, messageId: string) {
    this.dropPending(s => s.agentId === agentId && s.messageId === messageId);
    if (this.current?.agentId === agentId && this.current.messageId === messageId) this.generation++;
    this.publish(this.paused ? "paused" : this.state.status);
  }
  removeAgent(id: string) {
    this.dropPending(s => s.agentId === id);
    if (this.current?.agentId === id) this.generation++;
    this.publish(this.paused ? "paused" : this.state.status);
  }
  private dropPending(match: (s: Speech) => boolean) {
    this.playlist = [...this.playlist.slice(0, this.cursor), ...this.playlist.slice(this.cursor).filter(s => !match(s))];
  }
  dispose() {
    this.closed = true;
    this.stop();
    this.current = undefined;
    this.last = undefined;
    this.listeners.clear();
  }
  private async pump() {
    if (this.closed || this.busy || this.paused) return;
    this.busy = true;
    try {
      while (!this.closed && !this.paused && this.cursor < this.playlist.length) {
        const generation = this.generation;
        const index = this.cursor++;
        const speech = this.playlist[index];
        this.current = speech;
        this.playingIndex = index;
        this.moved = false;
        this.publish("synthesizing");
        try {
          const audio = await this.synth(speech);
          if (this.closed || generation !== this.generation) continue;
          // A pause during synthesis retains this sentence; no audio starts while paused.
          if (this.paused) {
            if (!this.moved) this.cursor = index;
            break;
          }
          this.publish("playing");
          await this.play(audio);
          this.lastIndex = index;
          if (generation === this.generation) this.last = speech;
        } catch (error) {
          if (this.closed || generation !== this.generation) continue;
          if (!this.moved) this.cursor = index;
          this.paused = true;
          this.publish(
            "error",
            error instanceof Error
              ? error.message
              : "Playback failed. Press Resume to retry.",
          );
          return;
        } finally {
          this.current = undefined;
          this.trim();
          if (this.state.status === "error") this.publish("error", this.state.error);
        }
      }
      if (!this.closed) this.publish(this.paused ? "paused" : "idle");
    } finally {
      this.busy = false;
      if (!this.closed && !this.paused && this.cursor < this.playlist.length) void this.pump();
    }
  }
}
