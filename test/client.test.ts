import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  openaiDecisions,
  systemOne,
  System1Error,
} from "../src/index.js";
const questions = { ok: { type: "predicate", instructions: "Okay?" } } as const;
const result = {
  model: "actual",
  answers: [{ name: "ok", type: "predicate", probability: 0.9 }],
};

test("client posts documented JSON, preserves response and metadata without inventing usage", async () => {
  let url: unknown;
  let init: RequestInit | undefined;
  const client = createClient({
    adapter: openaiDecisions,
    model: "requested",
    baseURL: "http://localhost:8741/prefix/v1/",
    fetch: async (u, i) => {
      url = u;
      init = i;
      return Response.json(result, { headers: { "x-request-id": "req_1" } });
    },
  });
  const response = await client.decide({ input: "text", questions });
  assert.equal(url, "http://localhost:8741/prefix/v1/decisions");
  assert.equal(init?.method, "POST");
  assert.equal(init?.redirect, "error");
  assert.deepEqual(JSON.parse(String(init?.body)), {
    model: "requested",
    input: "text",
    questions: [{ name: "ok", ...questions.ok }],
  });
  assert.equal(response.requestedModel, "requested");
  assert.equal(response.actualModel, "actual");
  assert.deepEqual(response.raw, result);
  assert.equal(response.usage, undefined);
  assert.equal(response.http.requestId, "req_1");
  assert.equal(response.answers.ok.status, "ok");
});

test("System One normalized predicate probability is not thresholded", async () => {
  const c = createClient({
    adapter: systemOne,
    baseURL: "http://localhost",
    model: "jev-latest",
    fetch: async () =>
      Response.json({ answers: { ok: { type: "noul", noul: 0.4 } } }),
  });
  const r = await c.decide({ input: "x", questions });
  assert.equal(r.answers.ok.status === "ok" && r.answers.ok.probability, 0.4);
});

test("errors have common typed class", () => {
  assert.equal(
    new System1Error("network", "Network request failed").code,
    "network",
  );
});
