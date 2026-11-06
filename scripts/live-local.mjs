// Explicit opt-in, local-only live model smoke. Never part of npm test/check/prepack.
import assert from "node:assert/strict";
import { h2o } from "../dist/index.js";

if (process.env.SYSTEM1TS_ALLOW_LOCAL_LIVE !== "1") {
  throw new Error(
    "Live inference is opt-in: set SYSTEM1TS_ALLOW_LOCAL_LIVE=1 only after authorizing a running local model.",
  );
}
const baseURL = process.env.SYSTEM1TS_LOCAL_URL ?? "http://127.0.0.1:8741";
const url = new URL(baseURL);
assert.ok(
  url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
  "This smoke script only permits loopback HTTP endpoints",
);
assert.ok(
  !url.username && !url.password && !url.search && !url.hash,
  "No credentials/query/fragment allowed",
);
const model = process.env.SYSTEM1TS_LOCAL_MODEL ?? "h2oai/h2o-lightning-4b";
const client = h2o({ baseURL, model, timeoutMs: 60_000 });
// One request, three question kinds, synthetic non-personal evidence.
const result = await client.decide({
  input: {
    message:
      "I was charged twice for my subscription. Please refund the duplicate charge. This can wait until next week.",
  },
  questions: {
    duplicate: {
      type: "predicate",
      instructions: "Does the message report a duplicate charge?",
    },
    department: {
      type: "choice",
      instructions: "Which team should handle the message?",
      choices: [
        { value: "billing", description: "Charges and refunds" },
        { value: "shipping", description: "Parcel delivery and tracking" },
      ],
    },
    urgency: {
      type: "score",
      instructions: "How urgent is the message?",
      levels: [
        { label: "Can wait until next week" },
        { label: "Needs immediate attention today" },
      ],
    },
  },
});
assert.deepEqual(result.issues, []);
for (const answer of Object.values(result.answers))
  assert.equal(
    answer.status,
    "ok",
    `Malformed live model answer: ${JSON.stringify(answer)}`,
  );
console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      endpoint: baseURL,
      requestedModel: result.requestedModel,
      actualModel: result.actualModel,
      http: result.http,
      answers: result.answers,
      providerMetadata: result.providerMetadata,
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
      verification:
        "Actual loopback model inference; SDK schema/transport smoke only, not a quality benchmark",
    },
    null,
    2,
  ),
);
