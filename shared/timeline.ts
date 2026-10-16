// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import {
  allowKind,
  completedEnd,
  sanitize,
  sentences,
  speechSegments,
  type Speech,
  type SpeechKind,
} from "./text";
import type { Preferences } from "./settings";
// Structural view of SDK timeline rows. The daemon may return canonical chunks or merged projected rows.
export type CanonicalRow = {
  seqStart: number;
  seqEnd: number;
  turnId?: string;
  timestamp?: string;
  item: { type: string; text?: string; messageId?: string };
};
export type ReadMessage = {
  id: string;
  seq: number;
  endSeq: number;
  kind: SpeechKind;
  text: string;
  complete: boolean;
  turnId?: string;
  providerMessageId?: string;
  timestamp?: string;
};

export class TimelineReader {
  epoch = "";
  lastSeq = -1;
  messages: ReadMessage[] = [];
  private consumed = new Map<string, number>();
  private active?: ReadMessage;
  private projection?: "canonical" | "projected";
  private projectedMessages = new Map<number, ReadMessage>();
  private activeTurnId?: string;
  private activeMessageId?: string;
  constructor(
    readonly agentId: string,
    private settings: () => Preferences,
    private emit: (speech: Speech) => void,
    private invalidate: () => void = () => {},
  ) {}
  ingest(
    epoch: string,
    rows: readonly CanonicalRow[],
    speak: boolean,
    final = false,
    projection: "canonical" | "projected" = "canonical",
  ): void {
    if (epoch !== this.epoch) this.reset(epoch);
    if (this.projection && this.projection !== projection) {
      this.reset(epoch);
      this.invalidate();
      speak = false;
    }
    this.projection = projection;
    if (projection === "projected") {
      this.ingestProjected(rows, speak, final);
      return;
    }
    for (const row of [...rows].sort((a, b) => a.seqStart - b.seqStart)) {
      if (row.seqEnd <= this.lastSeq) continue;
      if (row.seqStart <= this.lastSeq)
        throw new Error("Canonical rows must not overlap the consumed cursor.");
      this.lastSeq = row.seqEnd;
      const { item } = row;
      if (item.type !== "assistant_message" && item.type !== "reasoning" && item.type !== "user_message") {
        this.finish(speak);
        continue;
      }
      const kind = item.type;
      const identity = `${kind}:${row.turnId ?? ""}:${item.messageId ?? ""}`;
      const same =
        kind !== "user_message" &&
        this.active &&
        this.active.kind === kind &&
        this.activeTurnId === row.turnId &&
        this.active.endSeq + 1 === row.seqStart &&
        (kind === "reasoning" ||
          item.messageId === undefined ||
          item.messageId === this.activeMessageId);
      if (!same) {
        this.finish(speak);
        this.activeTurnId = row.turnId;
        this.activeMessageId = item.messageId;
        this.active = {
          id: `${epoch}:${row.seqStart}|${identity}`,
          seq: row.seqStart,
          endSeq: row.seqEnd,
          kind,
          text: "",
          complete: false,
          turnId: row.turnId,
          providerMessageId: item.messageId,
          timestamp: row.timestamp,
        };
        this.messages.push(this.active);
      }
      const active = this.active!;
      active.text += item.text ?? "";
      active.endSeq = row.seqEnd;
      this.read(active, speak, false);
      if (kind === "user_message") this.finish(speak);
    }
    if (final) this.finish(speak);
    // Bound retained text and offsets while preserving the current stream.
    while (this.messages.length > 1500) {
      const m = this.messages.shift()!;
      this.consumed.delete(m.id);
    }
  }
  private ingestProjected(
    rows: readonly CanonicalRow[],
    speak: boolean,
    final: boolean,
  ): void {
    // seqStart is a stable display anchor; seqEnd grows as the daemon merges streamed chunks.
    // Compare every row to the cursor at page start. A tool update can have an early anchor
    // and a late seqEnd; advancing the cursor per row must not hide later text in the same page.
    const previousCursor = this.lastSeq;
    for (const row of [...rows].sort((a, b) => a.seqStart - b.seqStart)) {
      if (row.seqEnd <= previousCursor) continue;
      this.lastSeq = Math.max(this.lastSeq, row.seqEnd);
      const { item } = row;
      if (item.type !== "assistant_message" && item.type !== "reasoning" && item.type !== "user_message") {
        if (this.active && row.seqStart > this.active.seq) this.finish(speak);
        continue;
      }
      let message = this.projectedMessages.get(row.seqStart);
      if (!message) {
        if (this.active && row.seqStart > this.active.seq) this.finish(speak);
        const identity = `${item.type}:${row.turnId ?? ""}:${item.messageId ?? ""}`;
        message = {
          id: `${this.epoch}:${row.seqStart}|${identity}`,
          seq: row.seqStart,
          endSeq: row.seqEnd,
          kind: item.type,
          text: "",
          complete: false,
          turnId: row.turnId,
          providerMessageId: item.messageId,
          timestamp: row.timestamp,
        };
        this.projectedMessages.set(row.seqStart, message);
        this.messages.push(message);
        this.messages.sort((a, b) => a.seq - b.seq);
      }
      const text = item.text ?? "";
      const rewritten =
        message.kind !== item.type || !text.startsWith(message.text);
      if (rewritten) {
        this.invalidate();
        message.kind = item.type;
        message.text = text;
        message.endSeq = row.seqEnd;
        this.consumed.set(message.id, text.length);
        if (this.active === message) this.finish(false);
        continue;
      }
      if (message.text === text) {
        message.endSeq = row.seqEnd;
        continue;
      }
      if (
        this.active &&
        this.active !== message &&
        this.active.seq < message.seq
      )
        this.finish(speak);
      message.text = text;
      message.endSeq = row.seqEnd;
      message.complete = false;
      if (!this.active || this.active.seq <= message.seq) this.active = message;
      this.read(message, speak, false);
      if (message.kind === "user_message" && this.active === message) this.finish(speak);
    }
    if (final) this.finish(speak);
    while (this.messages.length > 1500) {
      const message = this.messages.shift()!;
      this.projectedMessages.delete(message.seq);
      this.consumed.delete(message.id);
    }
  }
  finish(speak: boolean): void {
    if (!this.active) return;
    this.active.complete = true;
    this.read(this.active, speak, true);
    this.active = undefined;
  }
  private read(m: ReadMessage, speak: boolean, flush: boolean): void {
    const start = this.consumed.get(m.id) ?? 0;
    const end = completedEnd(m.text, flush);
    if (end <= start) return;
    this.consumed.set(m.id, end);
    const p = this.settings();
    if (!speak || !allowKind(m.kind, p)) return;
    // Sanitize the whole prefix before slicing, so an open fence cannot leak later lines.
    const prefix = sanitize(m.text.slice(0, end), p);
    const before = sanitize(m.text.slice(0, start), p);
    const fresh = prefix.startsWith(before)
      ? prefix.slice(before.length).trim()
      : "";
    let cursor = before.length;
    for (const text of sentences(fresh)) {
      const offset = prefix.indexOf(text, cursor);
      cursor = offset + text.length;
      this.emit({ agentId: this.agentId, messageId: m.id, kind: m.kind, text, offset });
    }
  }
  reset(epoch = ""): void {
    this.epoch = epoch;
    this.lastSeq = -1;
    this.messages = [];
    this.active = undefined;
    this.consumed.clear();
    this.projectedMessages.clear();
    this.projection = undefined;
  }
  prepend(older: ReadMessage[]): void {
    const last = older.at(-1),
      first = this.messages[0];
    if (
      last &&
      first &&
      last.endSeq + 1 === first.seq &&
      first.kind !== "user_message" &&
      last.kind === first.kind &&
      last.turnId === first.turnId &&
      (first.kind === "reasoning" ||
        first.providerMessageId === undefined ||
        last.providerMessageId === first.providerMessageId)
    ) {
      // Preserve the live object's identity and advance its source offset over newly loaded history.
      const consumed = this.consumed.get(first.id) ?? 0;
      first.text = last.text + first.text;
      first.seq = last.seq;
      first.providerMessageId = last.providerMessageId;
      if (this.active === first) this.activeMessageId = last.providerMessageId;
      this.consumed.set(first.id, last.text.length + consumed);
      older = older.slice(0, -1);
    }
    const seen = new Set(this.messages.map((m) => m.id));
    this.messages.unshift(...older.filter((m) => !seen.has(m.id)));
  }
  range(start: string, end: string): Speech[] {
    const a = this.messages.findIndex((m) => m.id === start),
      b = this.messages.findIndex((m) => m.id === end);
    if (a < 0 || b < a)
      throw new Error(
        "Select a start and end in chronological order from this timeline epoch.",
      );
    const p = this.settings();
    return this.messages
      .slice(a, b + 1)
      .filter((m) => m.complete && allowKind(m.kind, p))
      .flatMap((m) =>
        speechSegments(sanitize(m.text, p)).map(({ text, offset }) => ({
          agentId: this.agentId,
          messageId: m.id,
          kind: m.kind,
          text,
          offset,
        })),
      );
  }
}
