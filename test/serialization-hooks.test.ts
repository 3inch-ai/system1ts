import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  openaiDecisions,
  systemOne,
  System1Error,
} from "../src/index.js";

for (const [name, adapter] of Object.entries({ systemOne, openaiDecisions })) {
  test(`${name}: rejects non-enumerable input toJSON before fetch`, async () => {
    let calls = 0;
    let hookCalls = 0;
    const input = { evidence: "original" };
    Object.defineProperty(input, "toJSON", {
      value: () => {
        hookCalls++;
        return { evidence: "replaced" };
      },
      enumerable: false,
    });
    const client = createClient({
      adapter,
      baseURL: "http://localhost",
      model: "x",
      fetch: async () => {
        calls++;
        return Response.json({ answers: {} });
      },
    });
    await assert.rejects(
      client.decide({
        input,
        questions: { p: { type: "predicate", instructions: "?" } },
      }),
      (error: unknown) =>
        error instanceof System1Error && error.code === "invalid_request",
    );
    assert.equal(calls, 0);
    assert.equal(hookCalls, 0);
  });
}

test("rejects non-enumerable toJSON in nested question content before fetch", async () => {
  let calls = 0;
  let hookCalls = 0;
  const evidence = { evidence: "original" };
  Object.defineProperty(evidence, "toJSON", {
    value: () => {
      hookCalls++;
      return { evidence: "replaced" };
    },
    enumerable: false,
  });
  const client = createClient({
    adapter: systemOne,
    baseURL: "http://localhost",
    model: "x",
    fetch: async () => {
      calls++;
      return Response.json({ answers: {} });
    },
  });
  await assert.rejects(
    client.decide({
      input: "x",
      questions: {
        p: { type: "predicate", instructions: { nested: [evidence] } },
      },
    }),
    (error: unknown) =>
      error instanceof System1Error && error.code === "invalid_request",
  );
  assert.equal(calls, 0);
  assert.equal(hookCalls, 0);
});
