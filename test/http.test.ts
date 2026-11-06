import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createClient, openaiDecisions, System1Error } from "../src/index.js";

const request = {
  input: "text",
  questions: { p: { type: "predicate", instructions: "?" } },
} as const;

test("cache/safety options are present in the client POST body, not just the pure encoder", async () => {
  let sent: Record<string, unknown> | undefined;
  const c = createClient({
    adapter: openaiDecisions,
    baseURL: "http://localhost",
    model: "gpt-6-luna",
    fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        answers: [{ name: "p", type: "predicate", probability: 0.4 }],
      });
    },
  });
  await c.decide({
    ...request,
    providerOptions: {
      prompt_cache_key: "tenant",
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      inputTextCacheBreakpoint: true,
      safety_identifier: "opaque",
    },
  });
  assert.equal(sent?.prompt_cache_key, "tenant");
  assert.deepEqual(sent?.prompt_cache_options, {
    mode: "explicit",
    ttl: "30m",
  });
  assert.equal(sent?.safety_identifier, "opaque");
  assert.deepEqual(sent?.input, [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "text",
          prompt_cache_breakpoint: { mode: "explicit" },
        },
      ],
    },
  ]);
});

test("default fetch really disconnects a stalled local HTTP response at timeout", async () => {
  let responseClosed = false;
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"answers":');
    res.on("close", () => {
      responseClosed = true;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const c = createClient({
      adapter: openaiDecisions,
      baseURL: `http://127.0.0.1:${address.port}`,
      model: "x",
      timeoutMs: 250,
    });
    await assert.rejects(
      c.decide(request),
      (e: unknown) => e instanceof System1Error && e.code === "timeout",
    );
    // Let the server observe the transport disconnect, not merely the client exception.
    for (let i = 0; i < 20 && !responseClosed; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(responseClosed, true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
