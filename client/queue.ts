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
export class AudioQueue {
  private queue: Speech[] = [];
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
  private publish(status: QueueState["status"], error?: string) {
    this.state = {
      status,
      pending: this.queue.length,
      current: this.current,
      error,
    };
    for (const fn of this.listeners) fn();
  }
  enqueue(items: Speech[]) {
    if (this.closed) return;
    if (this.queue.length + items.length > 256) {
      this.paused = true;
      this.publish(
        "error",
        "Narration backlog exceeds 256 sentences. Stop, then choose a smaller range.",
      );
      return;
    }
    this.queue.push(...items);
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
    this.queue = [];
    this.paused = true;
    this.publish(this.busy ? "stopping" : "idle");
  }
  skip() {
    if (this.busy) {
      this.generation++;
      this.publish("stopping");
    } else {
      this.queue.shift();
      this.publish(this.paused ? "paused" : "idle");
      void this.pump();
    }
  }
  replay() {
    const s = this.current ?? this.last;
    if (!s) return;
    this.enqueue([{ ...s }]);
    this.resume();
  }
  items(): readonly Speech[] { return [...(this.current ? [this.current] : []), ...this.queue]; }
  removeMessage(agentId: string, messageId: string) {
    this.queue = this.queue.filter(s => s.agentId !== agentId || s.messageId !== messageId);
    if (this.current?.agentId === agentId && this.current.messageId === messageId) this.generation++;
    this.publish(this.paused ? "paused" : this.state.status);
  }
  removeAgent(id: string) {
    this.queue = this.queue.filter((s) => s.agentId !== id);
    if (this.current?.agentId === id) this.generation++;
    this.publish(this.paused ? "paused" : this.state.status);
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
      while (!this.closed && !this.paused && this.queue.length) {
        const generation = this.generation;
        const speech = this.queue.shift()!;
        this.current = speech;
        this.publish("synthesizing");
        try {
          const audio = await this.synth(speech);
          if (this.closed || generation !== this.generation) continue;
          // A pause during synthesis retains this sentence; no audio starts while paused.
          if (this.paused) {
            this.queue.unshift(speech);
            break;
          }
          this.publish("playing");
          await this.play(audio);
          if (generation === this.generation) this.last = speech;
        } catch (error) {
          if (this.closed || generation !== this.generation) continue;
          this.queue.unshift(speech);
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
          if (this.state.status === "error") this.publish("error", this.state.error);
        }
      }
      if (!this.closed) this.publish(this.paused ? "paused" : "idle");
    } finally {
      this.busy = false;
      if (!this.closed && !this.paused && this.queue.length) void this.pump();
    }
  }
}
