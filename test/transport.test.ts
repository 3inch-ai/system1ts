import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSystemOneAdapter,
  jev,
  openai,
  h2o,
  createClient,
  systemOne,
  System1Error,
  resolveEndpoint,
} from "../src/index.js";
import type { ErrorCode } from "../src/index.js";
const request = {
  input: "x",
  questions: { p: { type: "predicate", instructions: "P" } },
} as const;
const success = () =>
  Response.json({ model: "m", answers: { p: { type: "noul", noul: 0.8 } } });
function client(fetcher: typeof fetch, rest = {}) {
  return createClient({
    adapter: systemOne,
    model: "m",
    baseURL: "http://localhost",
    fetch: fetcher,
    ...rest,
  });
}
function error(code: ErrorCode, status?: number) {
  return (e: unknown) =>
    e instanceof System1Error &&
    e.code === code &&
    (status === undefined || e.details.status === status);
}

test("compatible adapter declares extra fields without overriding protected common fields", () => {
  const a = createSystemOneAdapter({
    id: "local-shim",
    extraBodyKeys: ["attention_mode"],
    maxLevels: 30,
    maxQuestions: 2,
  });
  assert.equal(
    a.encode(
      {
        ...request,
        providerOptions: { extraBody: { attention_mode: "causal" } },
      },
      "x",
    ).attention_mode,
    "causal",
  );
  assert.throws(
    () =>
      a.encode(
        { ...request, providerOptions: { extraBody: { model: "override" } } },
        "x",
      ),
    System1Error,
  );
  assert.throws(
    () =>
      a.encode(
        { ...request, providerOptions: { extraBody: { unknown: 1 } } },
        "x",
      ),
    System1Error,
  );
  assert.throws(
    () =>
      a.encode(
        {
          ...request,
          questions: {
            p: request.questions.p,
            p2: request.questions.p,
            p3: request.questions.p,
          },
        },
        "x",
      ),
    error("unsupported"),
  );
});
test("presets have explicit actual models and isolated settings, no secret auto-discovery", async () => {
  const fetcher: typeof fetch = async () => success();
  assert.equal(
    (await jev({ apiKey: "fake", fetch: fetcher }).decide(request))
      .requestedModel,
    "jev-latest",
  );
  assert.equal(
    (
      await openai({
        apiKey: "fake",
        fetch: async () =>
          Response.json({
            answers: [{ name: "p", type: "predicate", probability: 0.8 }],
          }),
      }).decide(request)
    ).requestedModel,
    "gpt-6-luna",
  );
  assert.equal(
    (await h2o({ fetch: fetcher }).decide(request)).requestedModel,
    "h2oai/h2o-lightning-4b",
  );
});
for (const [base, expected] of [
  ["http://localhost/", "http://localhost/v1/systemone"],
  ["https://example.test/v1/", "https://example.test/v1/systemone"],
  [
    "https://example.test/custom/prefix",
    "https://example.test/custom/prefix/v1/systemone",
  ],
])
  test(`URL join ${base}`, () =>
    assert.equal(resolveEndpoint(base!, "systemone"), expected));
for (const base of [
  "ftp://host",
  "https://user:password@host",
  "http://localhost?key=x",
  "http://localhost/#x",
  "nonsense",
])
  test("unsafe or ambiguous URL rejected: " + base, () =>
    assert.throws(() => resolveEndpoint(base, "decisions"), System1Error),
  );
for (const [status, code] of [
  [401, "authentication"],
  [403, "authentication"],
  [429, "rate_limit"],
  [400, "invalid_request"],
  [422, "invalid_request"],
  [500, "http"],
  [529, "http"],
] as const)
  test(`HTTP ${status} => ${code}, status preserved and no retries`, async () => {
    let calls = 0;
    await assert.rejects(
      client(async () => {
        calls++;
        return Response.json({ error: "upstream" }, { status });
      }).decide(request),
      error(code, status),
    );
    assert.equal(calls, 1);
  });
test("invalid response body is retained without logging it", async () => {
  await assert.rejects(
    client(async () => new Response("not-json")).decide(request),
    (e: unknown) =>
      e instanceof System1Error &&
      e.code === "invalid_response" &&
      e.details.rawBody === "not-json",
  );
});
test("network cause is available only in non-enumerable diagnostics, never copied into message", async () => {
  const cause = new Error("request contained Bearer secret");
  await assert.rejects(
    client(async () => {
      throw cause;
    }).decide(request),
    (e: unknown) =>
      e instanceof System1Error &&
      e.code === "network" &&
      e.details.originalCause === cause &&
      !e.message.includes("secret") &&
      !JSON.stringify(e).includes("secret"),
  );
});
test("timeout aborts the actual injected transport", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    client(
      async (_u, init) => {
        signal = init?.signal ?? undefined;
        return new Promise((_r, reject) =>
          signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      },
      { timeoutMs: 5 },
    ).decide(request),
    error("timeout"),
  );
  assert.equal(signal?.aborted, true);
});
test("AbortSignal interruption and already-aborted signals prevent continued work", async () => {
  const controller = new AbortController();
  let calls = 0;
  const c = client(async (_u, init) => {
    calls++;
    return new Promise((_r, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("abort")));
      controller.abort();
    });
  });
  await assert.rejects(
    c.decide(request, { signal: controller.signal }),
    error("aborted"),
  );
  await assert.rejects(
    c.decide(request, { signal: controller.signal }),
    error("aborted"),
  );
  assert.equal(calls, 1);
});
test("timeout covers response body consumption, not just headers", async () => {
  await assert.rejects(
    client(
      async (_u, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new Error("abort")),
              );
            },
          }),
        ),
      { timeoutMs: 5 },
    ).decide(request),
    error("timeout"),
  );
});
test("multiple clients capture their own auth headers and configuration", async () => {
  const seen: string[] = [];
  const headers = { "x-tenant": "first" };
  const fetcher: typeof fetch = async (_u, i) => {
    seen.push(new Headers(i?.headers).get("authorization") ?? "");
    seen.push(new Headers(i?.headers).get("x-tenant") ?? "");
    return success();
  };
  const a = client(fetcher, { apiKey: "one", headers });
  const b = client(fetcher, { apiKey: "two" });
  headers["x-tenant"] = "changed";
  await a.decide(request);
  await b.decide(request);
  assert.deepEqual(seen, ["Bearer one", "first", "Bearer two", ""]);
});
test("response auth and cookie headers are never exposed through HTTP metadata", async () => {
  const r = await client(async () =>
    Response.json(
      { answers: { p: { type: "noul", noul: 1 } } },
      { headers: { authorization: "secret", "set-cookie": "secret" } },
    ),
  ).decide(request);
  assert.equal(JSON.stringify(r.http).includes("secret"), false);
});
