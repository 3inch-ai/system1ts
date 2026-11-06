import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, systemOne, System1Error } from "../src/index.js";
import type { ClientOptions } from "../src/index.js";

test("invalid credentials/header syntax fail as safe typed errors, never echoed by Headers", () => {
  const cases: Partial<ClientOptions>[] = [
    { apiKey: "secret-key\ninvalid" },
    { headers: { authorization: "secret-key\ninvalid" } },
    { headers: { "bad name": "secret-value" } },
  ];
  for (const settings of cases) {
    assert.throws(
      () =>
        createClient({
          adapter: systemOne,
          baseURL: "http://localhost",
          model: "x",
          ...settings,
        }),
      (e: unknown) =>
        e instanceof System1Error &&
        e.code === "invalid_request" &&
        !String(e).includes("secret") &&
        !JSON.stringify(e).includes("secret"),
    );
  }
});
test("ambiguous credentials fail before HTTP", () => {
  assert.throws(
    () =>
      createClient({
        adapter: systemOne,
        baseURL: "http://localhost",
        model: "x",
        apiKey: "fake",
        headers: { authorization: "Bearer other-fake" },
      }),
    System1Error,
  );
});
