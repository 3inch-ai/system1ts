import assert from "node:assert/strict";
import { createServer } from "node:http";
const { createClient, systemOne, openaiDecisions, System1Error } = await import(
  process.env.SYSTEM1TS_MODULE ?? "../dist/index.js"
);
const received = [];
const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = JSON.parse(body);
    received.push({ path: req.url, json });
    res.setHeader("content-type", "application/json");
    res.setHeader("x-request-id", "local-smoke");
    if (req.url.endsWith("/systemone")) {
      assert.equal(json.questions.p.type, "noul");
      assert.deepEqual(json.state, { ticket: "help" });
      res.end(
        JSON.stringify({
          model: "local-fixture",
          answers: { p: { type: "noul", noul: 0.75 } },
          probability_source: "synthetic-smoke",
        }),
      );
    } else {
      assert.deepEqual(json.input, [
        {
          role: "user",
          content: [{ type: "input_json", data: { ticket: "help" } }],
        },
      ]);
      res.end(
        JSON.stringify({
          model: "local-fixture",
          answers: [{ type: "predicate", name: "p", probability: 0.75 }],
        }),
      );
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e) }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const port = server.address().port;
  for (const adapter of [systemOne, openaiDecisions]) {
    const c = createClient({
      adapter,
      baseURL: `http://127.0.0.1:${port}/prefix/v1/`,
      model: "requested",
    });
    const r = await c.decide({
      input: { ticket: "help" },
      questions: { p: { type: "predicate", instructions: "?" } },
    });
    assert.equal(r.answers.p.status, "ok");
    assert.equal(r.answers.p.probability, 0.75);
    assert.equal(r.http.requestId, "local-smoke");
    assert.equal(r.actualModel, "local-fixture");
    assert.equal(r.requestedModel, "requested");
    assert.equal(r.usage, undefined);
  }
  assert.deepEqual(
    received.map((r) => r.path),
    ["/prefix/v1/systemone", "/prefix/v1/decisions"],
  );
  assert.equal(typeof System1Error, "function");
  console.log(
    JSON.stringify({
      runtime: process.versions.bun
        ? `Bun ${process.versions.bun}`
        : `Node ${process.version}`,
      protocols: 2,
      httpRequests: received.length,
      result: "PASS (synthetic local HTTP server, not a model)",
    }),
  );
} finally {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}
