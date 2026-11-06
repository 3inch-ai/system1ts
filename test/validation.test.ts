import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openaiDecisions,
  systemOne,
  createClient,
  System1Error,
} from "../src/index.js";
import type { DecideRequest } from "../src/index.js";
const q = { p: { type: "predicate", instructions: "P" } } as const;
const request = { input: "hi", questions: q };
const rejects = (fn: () => unknown, code = "unsupported") =>
  assert.throws(
    fn,
    (e: unknown) => e instanceof System1Error && e.code === code,
  );
test("typed boolean choices accepted only where wire can represent them, never renamed", () => {
  const r = {
    input: "x",
    questions: {
      b: {
        type: "choice",
        instructions: "?",
        choices: [{ value: true }, { value: "true" }],
      },
    },
  } as const;
  assert.deepEqual((openaiDecisions.encode(r, "x").questions as unknown[])[0], {
    name: "b",
    ...r.questions.b,
  });
  rejects(() => systemOne.encode(r, "x"));
});
test("limits are adapter-specific: Jev single choice/level and no invented question count cap", () => {
  const r = {
    input: "x",
    questions: {
      c: { type: "choice", instructions: "?", choices: [{ value: "a" }] },
      s: { type: "score", instructions: "?", levels: [{ label: "one" }] },
    },
  } as const;
  assert.ok(systemOne.encode(r, "x"));
  rejects(() => openaiDecisions.encode(r, "x"));
  const many = {
    input: "x",
    questions: Object.fromEntries(
      Array.from({ length: 401 }, (_, i) => [String(i), q.p]),
    ),
  };
  assert.ok(systemOne.encode(many, "x"));
  rejects(() => openaiDecisions.encode(many, "x"));
});
test("structured instructions and descriptions are preserved on System One, rejected on OpenAI", () => {
  const r = {
    input: {},
    questions: {
      p: {
        type: "predicate",
        instructions: { task: "test" },
        criteria: { true: "yes" },
      },
    },
  } as const;
  assert.deepEqual(
    (systemOne.encode(r, "x").questions as Record<string, unknown>).p,
    { type: "noul", instructions: { task: "test" }, criteria: { true: "yes" } },
  );
  rejects(() => openaiDecisions.encode(r, "x"));
});
test("cache options and explicit text boundary appear on the actual wire body", () => {
  const options = {
    prompt_cache_key: "tenant",
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    safety_identifier: "user",
    inputTextCacheBreakpoint: true,
  } as const;
  const r = openaiDecisions.encode(
    { ...request, providerOptions: options },
    "gpt-6-luna",
  );
  assert.equal(r.prompt_cache_key, "tenant");
  assert.deepEqual(r.prompt_cache_options, options.prompt_cache_options);
  assert.deepEqual(r.input, [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "hi",
          prompt_cache_breakpoint: { mode: "explicit" },
        },
      ],
    },
  ]);
  assert.equal("inputTextCacheBreakpoint" in r, false);
});
for (const options of [
  { unknown: 1 },
  { model: "override" },
  { prompt_cache_key: "x".repeat(65) },
  { safety_identifier: "x".repeat(129) },
  { prompt_cache_options: { ttl: "1h" } },
  { prompt_cache_options: { mode: "wrong" } },
  { prompt_cache_options: { extra: true } },
  { inputTextCacheBreakpoint: "true" },
])
  test(`invalid provider options rejected: ${JSON.stringify(options).slice(0, 50)}`, () =>
    rejects(() =>
      openaiDecisions.encode(
        { ...request, providerOptions: options } as unknown as DecideRequest,
        "x",
      ),
    ));
test("official System One rejects extra body but explicit compatible adapter allowlist preserves extensions", () => {
  rejects(() =>
    systemOne.encode(
      { ...request, providerOptions: { extraBody: { effort: "high" } } },
      "x",
    ),
  );
});
test("invalid runtime values and unknown fields fail before fetch", async () => {
  let count = 0;
  const c = createClient({
    adapter: openaiDecisions,
    baseURL: "http://localhost",
    model: "x",
    fetch: async () => {
      count++;
      return Response.json({});
    },
  });
  for (const r of [
    { input: NaN, questions: q },
    { input: "x", questions: {} },
    {
      input: "x",
      questions: {
        c: {
          type: "choice",
          instructions: "?",
          choices: [{ value: "a" }, { value: "a" }],
        },
      },
    },
    { ...request, unexpected: 1 },
    { input: "x", questions: { p: { ...q.p, unexpected: 1 } } },
  ]) {
    await assert.rejects(c.decide(r as unknown as DecideRequest), System1Error);
  }
  assert.equal(count, 0);
});
test("JSON native data restrictions are not applied globally to System One", () => {
  assert.ok(systemOne.encode({ ...request, input: ["a", true, 1] }, "x"));
  rejects(() =>
    openaiDecisions.encode({ ...request, input: ["a", true, 1] }, "x"),
  );
  assert.ok(openaiDecisions.encode({ ...request, input: [{ id: 1 }] }, "x"));
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let i = 0; i < 33; i++) {
    cursor.next = {};
    cursor = cursor.next as Record<string, unknown>;
  }
  rejects(() =>
    openaiDecisions.encode(
      { ...request, input: deep } as unknown as DecideRequest,
      "x",
    ),
  );
  rejects(() =>
    openaiDecisions.encode(
      { ...request, input: { text: "x".repeat(262144) } },
      "x",
    ),
  );
});
