// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import type { Preferences } from "./settings";
export type SpeechKind = "assistant_message" | "reasoning" | "user_message";
export type Speech = {
  agentId: string;
  messageId: string;
  text: string;
  kind: SpeechKind;
  offset?: number;
};

// Defense in depth, not a promise to detect arbitrary secrets. Explicit cloud consent is mandatory.
export function hasSecret(text: string): boolean {
  return /-----BEGIN[\s\S]*PRIVATE KEY|\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{16,})|\b(?:api[_-]?key|password|secret|access[_-]?token|authorization)\s*[=:]\s*\S{4,}/i.test(
    text,
  );
}
export function hasCode(text: string): boolean {
  return /```|~~~|`[^`]+`|^\s{4}\S|(?:^|\n)\s*(?:import |export |def |class |function |const |let |var |SELECT |INSERT |#!)|[{};]\s*$|=>|\bconsole\.(?:log|error)\(/m.test(
    text,
  );
}
function stripStructured(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    const array =
      ch === "[" &&
      /^\s*(?:[\[\{\"\d-]|true\b|false\b|null\b|\])/.test(text.slice(i + 1));
    const object = ch === "{" && /^\s*(?:"|}|$)/.test(text.slice(i + 1));
    if (!object && !array) {
      out += ch;
      i++;
      continue;
    }
    const stack: string[] = [];
    let quoted = false,
      escaped = false;
    do {
      const c = text[i++];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') {
        quoted = true;
        continue;
      }
      if (c === "{" || c === "[") stack.push(c);
      else if (c === "}" || c === "]") stack.pop();
    } while (i < text.length && stack.length);
    out += " ";
  }
  return out;
}
export function sanitize(text: string, p: Preferences): string {
  if (!p.secrets && hasSecret(text)) return "";
  if (!p.json) text = stripStructured(text);
  if (!p.code) {
    text = text.replace(
      /(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\1[^\n]*(?:\n|$)|$)/g,
      "\n",
    );
    text = text.replace(/`[^`]*(?:`|$)/g, " ");
    text = text
      .split("\n")
      .filter((line) => !/^\s{4}\S/.test(line) && !hasCode(line))
      .join("\n");
  }

  if (!p.logs)
    text = text
      .split("\n")
      .filter(
        (line) =>
          !/^\s*(?:at \S+|Traceback|File ".*", line |\w*Error:|\[?(?:DEBUG|INFO|WARN|ERROR)\b|\d{4}-\d\d-\d\dT)/.test(
            line,
          ),
      )
      .join("\n");
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[ \t]*#{1,6}\s*/gm, "")
    .replace(/[*_]{1,3}/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function speechSegments(text: string): { text: string; offset: number }[] {
  let cursor = 0;
  return sentences(text).map(sentence => {
    const offset = text.indexOf(sentence, cursor);
    cursor = offset + sentence.length;
    return { text: sentence, offset };
  });
}
export function allowKind(kind: SpeechKind, p: Preferences): boolean {
  return kind === "assistant_message" ? p.assistant : kind === "user_message" ? p.userMessages : p.reasoning;
}
export function cloudPolicy(
  text: string,
  kind: SpeechKind,
  p: Preferences,
): void {
  if (!p.cloudConsent)
    throw new Error(
      "Edge sends narration to Microsoft. Enable cloud consent in Voice settings or choose offline Kokoro.",
    );
  if (kind === "reasoning" && !p.cloudReasoningConsent)
    throw new Error(
      "Cloud narration of exposed reasoning needs separate consent. Choose Kokoro to keep it offline.",
    );
  if (
    !p.cloudSensitiveConsent &&
    (hasCode(text) || hasSecret(text) || /^[\[{]/.test(text.trim()))
  )
    throw new Error(
      "Sensitive or code-like text blocked from cloud TTS. Choose offline Kokoro or explicitly allow sensitive cloud content.",
    );
}
// Return source offsets. Keeping source offsets prevents filtering from shifting the dedup cursor.
export function completedEnd(text: string, flush = false): number {
  if (flush) return text.length;
  let end = 0;
  const re = /[.!?。！？؟](?:["'”’)]*)(?=\s|$)|\n\n/g;
  for (const match of text.matchAll(re)) {
    const pos = match.index!;
    if (
      text[pos] === "." &&
      /\d/.test(text[pos - 1] ?? "") &&
      /\d/.test(text[pos + 1] ?? "")
    )
      continue;
    const word = text.slice(0, pos).match(/([\p{L}.]+)$/u)?.[1] ?? "";
    if (
      text[pos] === "." &&
      /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)$/i.test(word)
    )
      continue;
    end = pos + match[0].length;
  }
  return end;
}
export function sentences(text: string): string[] {
  const chunks = text.match(/[^.!?。！？؟]+(?:[.!?。！？؟]+["'”’)]*|$)/g) ?? [
    text,
  ];
  return chunks.flatMap((s) => {
    // Bound the unavoidable SDK stop latency; split long prose at word boundaries.
    const out: string[] = [];
    while (s.length > 350) {
      let cut = s.lastIndexOf(" ", 350);
      if (cut < 100) cut = 350;
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (s.trim()) out.push(s.trim());
    return out;
  });
}
