import { test } from "node:test";
import assert from "node:assert/strict";
import {
  systemOne,
  openaiDecisions,
  createClient,
  System1Error,
} from "../src/index.js";
import type { DecideRequest } from "../src/index.js";

test("native System One nullable/omitted instructions are not narrowed to strings", () => {
  for (const q of [
    { type: "predicate", instructions: null },
    {
      type: "predicate",
      criteria: { true: "Supported", false: "Not supported" },
    },
  ] as const) {
    const request = { input: "Evidence", questions: { p: q } };
    assert.ok(
      systemOne.encode(request as unknown as DecideRequest, "jev-latest"),
    );
    assert.throws(
      () =>
        openaiDecisions.encode(
          request as unknown as DecideRequest,
          "gpt-6-luna",
        ),
      (e: unknown) => e instanceof System1Error && e.code === "unsupported",
    );
  }
});
test("invalid native predicate criteria value is detected before HTTP", () => {
  assert.throws(
    () =>
      systemOne.encode(
        {
          input: "Evidence",
          questions: {
            p: {
              type: "predicate",
              instructions: "?",
              criteria: { true: 123 },
            },
          },
        } as unknown as DecideRequest,
        "x",
      ),
    System1Error,
  );
});
test("unsupported feature error identifies question, endpoint and feature without sending", async () => {
  let calls = 0;
  const c = createClient({
    adapter: systemOne,
    baseURL: "http://localhost:8741/prefix",
    model: "x",
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    c.decide({
      input: "x",
      questions: {
        typed: {
          type: "choice",
          instructions: "?",
          choices: [{ value: true }, { value: "true" }],
        },
      },
    }),
    (e: unknown) =>
      e instanceof System1Error &&
      e.code === "unsupported" &&
      e.details.question === "typed" &&
      e.details.feature === "booleanChoices" &&
      e.details.endpoint === "http://localhost:8741/prefix/v1/systemone",
  );
  assert.equal(calls, 0);
});
