// Copyright (C) 2026 Mohamed Tawfik Amin
// SPDX-License-Identifier: GPL-2.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsSchema } from "../shared/settings";
import { sanitize, cloudPolicy, completedEnd, sentences } from "../shared/text";
const p = settingsSchema.parse({});
test("safe defaults disable automatic speech, cloud, reasoning, secrets and code", () => {
  for (const k of [
    "enabled",
    "cloudConsent",
    "cloudReasoningConsent",
    "cloudSensitiveConsent",
    "reasoning",
    "code",
    "json",
    "logs",
    "secrets",
  ] as const)
    assert.equal(p[k], false);
});
test("filter closed and open source fences, inline code and indented code", () => {
  assert.equal(
    sanitize("Hello.\n```ts\nconst x = 1;\n```\nWorld.", p),
    "Hello.\n\nWorld.",
  );
  assert.equal(sanitize("Hello.\n```ts\nprivate code here.", p), "Hello.");
  assert.equal(sanitize("Hello `private()` world.", p), "Hello world.");
  assert.equal(sanitize("Hello.\n    private code.", p), "Hello.");
});
test("raw JSON and stack traces are excluded", () => {
  assert.equal(
    sanitize('Intro.\n{\n"private": "value"\n}\nDone.', p),
    "Intro.\n\nDone.",
  );
  assert.equal(
    sanitize(
      'Traceback (most recent call last):\nFile "a.py", line 5\nValueError: private\n at fn (a.js:1)\nDone.',
      p,
    ),
    "Done.",
  );
});
test("matching secrets drop entire segment", () => {
  assert.equal(sanitize("Hello. api_key=secretvalue", p), "");
  assert.equal(sanitize("sk-123456789012345678901234", p), "");
});
test("cloud policy requires three distinct consents", () => {
  assert.throws(
    () => cloudPolicy("Hello.", "assistant_message", p),
    /Microsoft/,
  );
  const q = { ...p, cloudConsent: true };
  cloudPolicy("Hello.", "assistant_message", q);
  assert.throws(() => cloudPolicy("Thinking.", "reasoning", q), /reasoning/);
  assert.throws(
    () => cloudPolicy("const x = 1;", "assistant_message", q),
    /Sensitive/,
  );
  cloudPolicy("const x = 1;", "reasoning", {
    ...q,
    cloudReasoningConsent: true,
    cloudSensitiveConsent: true,
  });
});
test("sentence boundaries support Arabic and partial endings", () => {
  assert.equal(completedEnd("Hello. unfinished"), "Hello.".length);
  assert.equal(completedEnd("هل انتهى؟ ثم"), "هل انتهى؟".length);
  assert.equal(
    completedEnd("Dr. Smith is here. tail"),
    "Dr. Smith is here.".length,
  );
  assert.equal(completedEnd("unfinished", true), 10);
  assert.ok(sentences("word ".repeat(200)).every((s) => s.length <= 350));
});
test("partial inline code and nested/partial JSON fail closed during streaming", () => {
  assert.equal(sanitize("Hello. `private code.", p), "Hello.");
  assert.equal(
    sanitize('Hello. {"nested":{"private":"value"}} Done.', p),
    "Hello. Done.",
  );
  assert.equal(sanitize('Hello. {"nested":{"private":"value.', p), "Hello.");
  assert.equal(sanitize('Hello. ["private", 5] Done.', p), "Hello. Done.");
  assert.equal(
    sanitize("Open [documentation](https://example.com).", p),
    "Open documentation.",
  );
});
test('source inclusion does not treat every code brace as raw JSON', () => {
  assert.equal(sanitize("function greet() { return 'hello'; }", {...p,code:true}),"function greet() { return 'hello'; }");
  assert.equal(sanitize('{"hello":"world"}', {...p,code:true,json:true}),'{"hello":"world"}');
});

test('decorative message dividers are removed while real source and list content stay intact', async () => {
  const { removeMessageDividers } = await import('../shared/text');
  assert.equal(removeMessageDividers('First.\n---\nSecond.\n* * *\nThird.\n___\nLast.'), 'First.\nSecond.\nThird.\nLast.');
  assert.equal(removeMessageDividers('```text\n---\n```\n---\n- A list item\ntext---text'), '```text\n---\n```\n- A list item\ntext---text');
  assert.equal(sanitize('First.\n---\nSecond.', p), 'First.\nSecond.');
});
