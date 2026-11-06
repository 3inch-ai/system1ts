import { test } from "node:test";
import assert from "node:assert/strict";
import { openaiDecisions, systemOne } from "../src/index.js";
const questions = {
  p: { type: "predicate", instructions: "P" },
  c: {
    type: "choice",
    instructions: "C",
    choices: [{ value: true }, { value: "true" }],
  },
  s: {
    type: "score",
    instructions: "S",
    levels: [{ label: "low" }, { label: "high" }],
  },
} as const;
const answers = [
  { name: "p", type: "predicate", probability: 0.7 },
  {
    name: "c",
    type: "choice",
    choice: true,
    confidence: 0.5,
    probabilities: [
      { value: true, probability: 0.6 },
      { value: "true", probability: 0.4 },
    ],
  },
  {
    name: "s",
    type: "score",
    score: 0.75,
    confidence: 0.6,
    probabilities: [
      { value: 0, label: "low", probability: 0.25 },
      { value: 1, label: "high", probability: 0.75 },
    ],
  },
];
test("typed boolean choices, ordered scores, provider confidence and untouched raw JSON", () => {
  const raw = {
    answers,
    model: "actual",
    usage: { input_tokens: 1 },
    future: { field: 42 },
  };
  const r = openaiDecisions.decode(raw, questions);
  assert.equal(r.raw, raw);
  assert.deepEqual(r.providerMetadata.future, { field: 42 });
  assert.equal(r.answers.c.status === "ok" && r.answers.c.choice, true);
  assert.deepEqual(
    r.answers.c.status === "ok" && r.answers.c.probabilities,
    answers[1]?.probabilities,
  );
  assert.equal(r.answers.s.status === "ok" && r.answers.s.score, 0.75);
  assert.equal(r.answers.s.status === "ok" && r.answers.s.computedScore, 0.75);
  assert.equal(
    r.answers.s.status === "ok" && r.answers.s.confidence?.source,
    "openai-decisions",
  );
});
test("explicit refusal, missing and mismatched answers are distinct and other answers survive", () => {
  const r = openaiDecisions.decode(
    { answers: [answers[0], { name: "c", type: "refusal" }] },
    questions,
  );
  assert.equal(r.answers.p.status, "ok");
  assert.equal(r.answers.c.status, "refused");
  assert.equal(r.answers.s.status, "invalid");
  assert.equal(
    openaiDecisions.decode(
      { answers: [{ ...answers[0], type: "score" }] },
      { p: questions.p },
    ).answers.p.status,
    "invalid",
  );
});
for (const [name, change] of Object.entries({
  "negative probability": { probability: -0.1 },
  "over-one": { probability: 1.01 },
  "non-finite": { probability: Infinity },
  "string probability": { probability: "0.5" },
  "missing probability": { probability: undefined },
  "wrong name": { name: "wrong" },
  "null name": { name: null },
}))
  test(`detects ${name}`, () =>
    assert.equal(
      openaiDecisions.decode(
        { answers: [{ ...answers[0], ...change }] },
        { p: questions.p },
      ).answers.p.status,
      "invalid",
    ));
for (const [name, change] of Object.entries({
  "outside choice": { choice: "other" },
  "duplicate probabilities": {
    probabilities: [
      { value: true, probability: 0.5 },
      { value: true, probability: 0.5 },
    ],
  },
  "bad sum": {
    probabilities: [
      { value: true, probability: 0.1 },
      { value: "true", probability: 0.1 },
    ],
  },
  "bad confidence": { confidence: NaN },
  "unknown probability value": {
    probabilities: [{ value: "other", probability: 1 }],
  },
}))
  test(`detects ${name}`, () =>
    assert.equal(
      openaiDecisions.decode(
        { answers: [answers[0], { ...answers[1], ...change }, answers[2]] },
        questions,
      ).answers.c.status,
      "invalid",
    ));
for (const [name, change] of Object.entries({
  "out of range score": { score: 2 },
  "inconsistent score": { score: 0.1 },
  "wrong labels": {
    probabilities: [
      { value: 0, label: "different", probability: 0.25 },
      { value: 1, label: "high", probability: 0.75 },
    ],
  },
  "noninteger index": {
    probabilities: [{ value: 0.5, label: "low", probability: 1 }],
  },
}))
  test(`detects ${name}`, () =>
    assert.equal(
      openaiDecisions.decode(
        { answers: [answers[0], answers[1], { ...answers[2], ...change }] },
        questions,
      ).answers.s.status,
      "invalid",
    ));
test("missing distributions remain absent, marked invalid rather than fabricated zeros", () => {
  const r = openaiDecisions.decode(
    {
      answers: [
        answers[0],
        { name: "c", type: "choice", choice: true, confidence: 0.5 },
        answers[2],
      ],
    },
    questions,
  );
  assert.equal(r.answers.c.status, "invalid");
  assert.equal("probabilities" in r.answers.c, false);
});
test("order mismatch is not silently repaired; extra answers and duplicate IDs are reported", () => {
  const swapped = openaiDecisions.decode(
    { answers: [answers[1], answers[0], answers[2], answers[0]] },
    questions,
  );
  assert.equal(swapped.answers.p.status, "invalid");
  assert.equal(swapped.answers.c.status, "invalid");
  assert.equal(swapped.answers.s.status, "ok");
  assert.ok(swapped.issues.length > 0);
});
test("System One choice and score maps and legend validate correctly", () => {
  const q = {
    c: { ...questions.c, choices: [{ value: "a" }, { value: "b" }] },
    s: questions.s,
  } as const;
  const raw = {
    answers: {
      c: {
        type: "choice",
        choice: "a",
        confidence: 0.3,
        probabilities: { a: 0.6, b: 0.4 },
      },
      s: {
        type: "score",
        score: 0.75,
        confidence: 0.5,
        legend: { "0": "low", "1": "high" },
        probabilities: { "0": 0.25, "1": 0.75 },
      },
    },
  };
  assert.equal(systemOne.decode(raw, q).answers.s.status, "ok");
  assert.equal(systemOne.decode(raw, q).answers.c.status, "ok");
  assert.equal(
    systemOne.decode(
      {
        answers: {
          ...raw.answers,
          s: { ...raw.answers.s, legend: { "0": "wrong", "1": "high" } },
        },
      },
      q,
    ).answers.s.status,
    "invalid",
  );
  assert.equal(
    systemOne.decode({ answers: { c: { type: "refusal" } } }, q).answers.c
      .status,
    "invalid",
  );
});
test("envelope shape errors are explicit, not model refusal", () => {
  for (const raw of [null, [], {}, { answers: null }, { answers: {} }])
    assert.throws(
      () => openaiDecisions.decode(raw, questions),
      /answers|response/i,
    );
});
