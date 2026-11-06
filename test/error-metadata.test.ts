import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, systemOne, System1Error } from "../src/index.js";

test("HTTP failures retain safe retry metadata without auth or cookie headers", async () => {
  const client = createClient({
    adapter: systemOne,
    baseURL: "http://localhost",
    model: "x",
    fetch: async () =>
      Response.json(
        { error: "limited" },
        {
          status: 429,
          headers: {
            "retry-after": "10",
            "x-request-id": "request-1",
            authorization: "fake-secret",
            "set-cookie": "fake-secret",
          },
        },
      ),
  });
  await assert.rejects(
    client.decide({
      input: "x",
      questions: { p: { type: "predicate", instructions: "?" } },
    }),
    (e: unknown) => {
      if (!(e instanceof System1Error)) return false;
      return (
        e.code === "rate_limit" &&
        e.details.headers?.["retry-after"] === "10" &&
        e.details.requestId === "request-1" &&
        !JSON.stringify(e.details.headers).includes("fake-secret")
      );
    },
  );
});
