import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  createSystemOneAdapter,
  systemOne,
  openaiDecisions,
  System1Error,
} from "../src/index.js";
import type { DecideRequest, Question } from "../src/index.js";
const p = { type: "predicate", instructions: "?" } as const;
test("in-flight request question contract is a snapshot, unaffected by caller mutation", async () => {
  const questions: Record<string, Question> = { p };
  const c = createClient({
    adapter: systemOne,
    baseURL: "http://localhost",
    model: "x",
    fetch: async () => {
      questions.p = {
        type: "score",
        instructions: "changed",
        levels: [{ label: "x" }],
      };
      return Response.json({ answers: { p: { type: "noul", noul: 0.6 } } });
    },
  });
  assert.equal(
    (await c.decide({ input: "x", questions })).answers.p?.status,
    "ok",
  );
});
test("capability declarations cannot mutate another client globally", () => {
  assert.throws(() =>
    (systemOne.capabilities.questionTypes as string[]).push("unsupported"),
  );
  assert.deepEqual(openaiDecisions.capabilities.questionTypes, [
    "predicate",
    "choice",
    "score",
  ]);
});
test("custom adapter limits must be positive integer declarations, not arbitrary capability overrides", () => {
  for (const maxLevels of [NaN, 0, -1, 1.5])
    assert.throws(() => createSystemOneAdapter({ maxLevels }), System1Error);
  assert.throws(
    () =>
      createSystemOneAdapter({ booleanChoices: true } as unknown as Parameters<
        typeof createSystemOneAdapter
      >[0]),
    System1Error,
  );
});
test("runtime JSON rejects values stringify would silently coerce or lose", () => {
  const circular: Record<string, unknown> = {};
  circular.x = circular;
  const sparse = Array(2);
  for (const input of [
    new Date(),
    circular,
    { x: undefined },
    { x: Infinity },
    { x: 1n },
    sparse,
  ])
    assert.throws(
      () =>
        systemOne.encode(
          { input, questions: { p } } as unknown as DecideRequest,
          "x",
        ),
      System1Error,
    );
});
test("hostile property names remain data, not prototype setters", () => {
  const questions = JSON.parse(
    '{"__proto__":{"type":"choice","instructions":"?","choices":[{"value":"__proto__"}]}}',
  ) as Record<string, Question>;
  const encoded = systemOne.encode({ input: {}, questions }, "x");
  assert.equal(Object.hasOwn(encoded.questions as object, "__proto__"), true);
  const r = systemOne.decode(
    JSON.parse(
      '{"answers":{"__proto__":{"type":"choice","choice":"__proto__","confidence":1,"probabilities":{"__proto__":1}}}}',
    ),
    questions,
  );
  assert.equal(r.answers.__proto__?.status, "ok");
});
test("diagnostics of missing distributions do not invent usage or confidence", () => {
  const r = openaiDecisions.decode(
    {
      answers: [{ name: "p", type: "predicate", probability: 0.5 }],
      additional: "kept",
    },
    { p },
  );
  assert.equal(Object.hasOwn(r, "usage"), false);
  assert.equal("confidence" in r.answers.p, false);
  assert.equal(r.providerMetadata.additional, "kept");
});
