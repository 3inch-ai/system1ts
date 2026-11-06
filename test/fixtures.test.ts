import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openaiDecisions, systemOne } from "../src/index.js";

test("official documented OpenAI predicate example parses without schema invention", async () => {
  const raw: unknown = JSON.parse(
    await readFile(
      new URL("./fixtures/openai-predicate.json", import.meta.url),
      "utf8",
    ),
  );
  const r = openaiDecisions.decode(raw, {
    damaged: {
      type: "predicate",
      instructions: "Does the customer report a damaged item?",
    },
  });
  assert.equal(r.answers.damaged.status, "ok");
  assert.equal(
    r.answers.damaged.status === "ok" && r.answers.damaged.probability,
    0.95,
  );
});
test("official documented System One score example preserves weighted score", async () => {
  const raw: unknown = JSON.parse(
    await readFile(
      new URL("./fixtures/system-one-score.json", import.meta.url),
      "utf8",
    ),
  );
  const r = systemOne.decode(raw, {
    urgency: {
      type: "score",
      instructions: "How urgent is this message?",
      levels: [
        { label: "Can wait" },
        { label: "Needs attention this week" },
        { label: "Needs attention today" },
      ],
    },
  });
  assert.equal(r.answers.urgency.status, "ok");
  assert.equal(
    r.answers.urgency.status === "ok" && r.answers.urgency.score,
    1.7,
  );
});
