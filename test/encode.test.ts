import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, systemOne, openaiDecisions } from "../src/index.js";

const questions = {
  relevant: { type: "predicate", instructions: "Is it relevant?" },
  route: {
    type: "choice",
    instructions: "Route",
    choices: [{ value: "a", description: "Team A" }, { value: "b" }],
  },
  severity: {
    type: "score",
    instructions: "Severity",
    levels: [{ label: "low" }, { label: "high", description: "Blocked" }],
  },
} as const;

test("same questions encode to the two documented wire contracts without network", () => {
  const s = systemOne.encode(
    { input: { ticket: "help" }, questions },
    "jev-latest",
  );
  assert.deepEqual(s, {
    model: "jev-latest",
    state: { ticket: "help" },
    questions: {
      relevant: { type: "noul", instructions: "Is it relevant?" },
      route: {
        type: "choice",
        instructions: "Route",
        criteria: { a: "Team A", b: null },
      },
      severity: {
        type: "score",
        instructions: "Severity",
        criteria: ["low", { label: "high", description: "Blocked" }],
      },
    },
  });
  const o = openaiDecisions.encode(
    { input: { ticket: "help" }, questions },
    "gpt-6-luna",
  );
  assert.deepEqual(o, {
    model: "gpt-6-luna",
    input: [
      {
        role: "user",
        content: [{ type: "input_json", data: { ticket: "help" } }],
      },
    ],
    questions: Object.entries(questions).map(([name, q]) => ({ name, ...q })),
  });
  assert.equal(typeof createClient, "function");
});
