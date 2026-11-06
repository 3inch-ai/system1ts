# systemone-ts

A small, typed decision SDK from [3inch.ai Labs](https://3inch.ai): one `decide()` API for **System One** (TypeSafe Jev and compatible local servers) and **OpenAI Decisions**. ESM, public TypeScript declarations, zero runtime dependencies. No telemetry, automatic retries, model fallback, or environment-variable discovery.

**Release candidate 0.1.0.** Prepared for npm publication; not published by this implementation task. The name is not reserved. Until a release is published, build and install the local tarball (`npm ci && npm pack`, then `npm install ./systemone-ts-0.1.0.tgz`). After publication: `npm install systemone-ts`.

## Quick start

```ts
import { jev } from "systemone-ts";

const client = jev({ apiKey: process.env.TYPESAFE_API_KEY });
const result = await client.decide({
  input: { message: "The screen arrived broken." },
  questions: {
    damaged: {
      type: "predicate",
      instructions: "Does the customer report damage?",
    },
  },
});
const answer = result.answers.damaged;
if (answer.status === "ok") console.log(answer.probability); // number, never an implicit boolean
```

API keys are explicit client settings. The SDK never reads process globals; in Workers, pass `env.TYPESAFE_API_KEY`. Do not ship hosted-service keys in a browser bundle. The package uses web-standard `fetch`, `AbortController`, `Headers`, and `TextEncoder` (Node >=22 design target; runtime versions actually tested are below).

## Switch connection without changing the questions

```ts
import { jev, openai, h2o, createClient, systemOne } from "systemone-ts";

const cloud = jev({
  apiKey: process.env.TYPESAFE_API_KEY,
  model: "jev-1.14.0",
});
const decisions = openai({ apiKey: process.env.OPENAI_API_KEY }); // gpt-6-luna
const local = h2o(); // http://127.0.0.1:8741/v1/systemone, h2oai/h2o-lightning-4b
const compatible = createClient({
  adapter: systemOne,
  provider: "my-deployment",
  baseURL: "http://localhost:8741/custom/prefix/v1",
  model: "my-model",
});
```

`provider` is a descriptive connection label, not a model prefix. Protocol, provider, URL, model and runtime are independent. No provider-name routing or inference from a model name occurs. `baseURL` is a service root or versioned root, **not a full method URL**. `/v1` is appended once if absent, and prefixes are preserved. Only HTTP(S) URLs without userinfo, query or fragment are accepted. The local service must be reachable from the SDK's runtime: `localhost` in a remote Worker is not your laptop. The SDK does not install or serve models.

### Three question types

```ts
const result = await decisions.decide({
  input: "The export fails in Safari but works in Chrome.",
  questions: {
    blocked: {
      type: "predicate",
      instructions: "Is the user unable to proceed?",
    },
    team: {
      type: "choice",
      instructions: "Which team owns this issue?",
      choices: [
        { value: "frontend", description: "Browser behavior" },
        { value: "backend" },
      ],
    },
    severity: {
      type: "score",
      instructions: "How severe is the issue?",
      levels: [
        { label: "Cosmetic" },
        { label: "Workaround available" },
        { label: "Fully blocked" },
      ],
    },
  },
});
```

Question names, kinds, choice literals, and score-level tuples are inferred from inline calls (`const` generics). Use `as const satisfies Questions` for reusable definitions. No public `any` is used. Untyped/raw values are `unknown`.

- **Predicate**: `probability` in `[0,1]`, not a thresholded boolean. System One sends `type: "noul"` and reads `noul`; OpenAI uses `predicate` / `probability`.
- **Choice**: selected typed `choice` and `probabilities: [{ value, probability }]`. Boolean `true` and string `"true"` remain different values on OpenAI. System One only has string choice keys: boolean values are rejected _for that adapter_, never renamed. Descriptions are never replaced by invented identifiers.
- **Score**: `score` is the provider-returned probability-weighted average of **zero-based level indices**, not a fraction or percentage. `levels` preserves order, labels and descriptions; `probabilities` preserves the returned distribution order; `computedScore` is a separate verification calculation. The SDK never overwrites the server's score.
- **Confidence**: `{ value, source, meaning }` is provider/protocol-specific distribution certainty, not universal probability of correctness. Predicate probability is separate. Missing confidence/distributions on choice/score are malformed under the two implemented contracts, not zero. Missing usage/cost is never filled with zero. Usage is retained as `unknown` because compatible servers can extend it.

Complete distributions must contain each requested value exactly once, each probability finite and in range, and sum to 1 within absolute tolerance **0.01**. Score/weighted-mean consistency tolerance is **0.02 index units**. No renormalization occurs. Selected choices must be maximal within 0.01 probability tolerance. Invalid values, mismatched score labels/legend, and noncanonical level keys are reported, not repaired. Tolerances are release semantics, not model-quality claims.

## JSON and structured content

- System One: text/object/array sent unchanged in `state`. Structured/nullable/omitted question instructions, predicate `criteria`, and descriptions are retained. Score levels become strings when label-only; with a description they become `{ label, description }`, keeping both meaningful fields in the model-visible criterion. The returned `legend` must match those exact criteria.
- OpenAI: text sent as `input`; JSON sent natively as `[{ role: "user", content: [{ type: "input_json", data }] }]`. `data` must be an object or array of objects, with at most 32 container levels, 10,000 values and 256 KiB compact UTF-8. Scalars/arrays of scalars aren't silently stringified. Structured instructions/descriptions or predicate criteria not representable in this common text-only API are rejected before HTTP. OpenAI's larger conversation/image/tool-input surface is not exposed by this first release.
- JSON must be losslessly serializable: nonfinite numbers, cycles, bigint, sparse arrays, undefined values, serialization hooks (including non-enumerable `toJSON`) and non-plain objects are rejected. SDK JSON-depth default is 64 outside native OpenAI JSON. Server body/token limits are still server-enforced; the SDK does not estimate token counts.

## States and failures

```ts
import { System1Error } from "systemone-ts";
try {
  const r = await client.decide(request, { signal, timeoutMs: 10_000 });
  for (const [name, a] of Object.entries(r.answers)) {
    if (a.status === "refused") {
      /* explicit documented model refusal */
    } else if (a.status === "invalid") {
      /* a.issues and a.raw for diagnosis */
    } else {
      /* valid typed answer */
    }
  }
  // Also examine r.issues: count discrepancies and unexpected answer IDs.
} catch (error) {
  if (error instanceof System1Error) {
    // error.code and opt-in error.details (status, requestId, safe headers, endpoint, rawBody, raw, originalCause)
  }
}
```

The preceding error-handling excerpt assumes your own `client`, `request` and `signal` bindings.

| Situation                                                   | Contract                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Valid answer                                                | Question result `status: "ok"`                                                                           |
| Explicit OpenAI `type: "refusal"`                           | Question result `status: "refused"`; siblings retained                                                   |
| Missing/wrongly typed/inconsistent answer                   | Question result `status: "invalid"`, issues and original answer retained                                 |
| Unsupported feature or unknown option, known before sending | Throws `System1Error` with `code: "unsupported"`, feature/question (where applicable), endpoint; no HTTP |
| Invalid local input/config                                  | Throws `invalid_request`                                                                                 |
| 401/403                                                     | Throws `authentication`                                                                                  |
| 429                                                         | Throws `rate_limit`                                                                                      |
| HTTP 400/413/415/422                                        | Throws `invalid_request`, original status                                                                |
| Other HTTP error, including 529 overload                    | Throws `http`, original status                                                                           |
| Deadline / caller abort / transport failure                 | Throws `timeout` / `aborted` / `network`                                                                 |
| Non-JSON body or invalid top-level answers container        | Throws `invalid_response`; raw body retained                                                             |

System One does **not** document a refusal answer; a surprising `type: "refusal"` there is invalid, not invented support. OpenAI answers are matched by **documented position**, with names checked; mismatched order is not repaired by searching for IDs. Count discrepancies/unexpected extra answers are top-level `issues`; duplicate OpenAI names invalidate the affected requested answers. Always inspect both per-question status and `issues`.

Default timeout: **30 seconds**, covering fetch _and body consumption_, aborting the transport. Per-call override and caller `AbortSignal` supported. Injected fetch must honor its signal. No retries, partial execution, chunking, or fallback. Redirects use `redirect: "error"` to avoid credential forwarding; injected fetch must respect standard request options.

## Provider options and raw results

```ts
await decisions.decide({
  input: "Identical long reference text ...",
  questions: {
    relevant: { type: "predicate", instructions: "Is it relevant?" },
  },
  providerOptions: {
    prompt_cache_key: "tenant-1",
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    inputTextCacheBreakpoint: true, // maps to prompt_cache_breakpoint on the text content part
    safety_identifier: "opaque-end-user-id",
  },
});
```

All documented OpenAI top-level cache controls above are forwarded. Cache-key max length 64, safety ID max 128. Unknown options, extra nested cache fields, invalid TTL/mode, and common-field collisions are rejected. A false text-boundary flag is processed locally (no marker). Explicit boundaries on JSON input are rejected because the documented `input_json` part has no breakpoint field.

For a verified compatible System One server, declare extension keys explicitly:

```ts
import { createSystemOneAdapter, createClient } from "systemone-ts";
const shim = createSystemOneAdapter({
  id: "h2o-shim",
  extraBodyKeys: ["attention_mode"],
  // maxLevels / maxChoices / maxQuestions can declare verified deployment limits.
});
const localClient = createClient({
  adapter: shim,
  baseURL: "http://127.0.0.1:8741",
  model: "h2oai/h2o-lightning-4b",
});
await localClient.decide({
  input: "Ticket text",
  questions: { p: { type: "predicate", instructions: "Is help needed?" } },
  providerOptions: { extraBody: { attention_mode: "causal" } },
});
```

This is a transparent extension escape hatch, not a promise that arbitrary options work: the caller must verify the declared server's key/value contract. Official Jev has no allowed extra body keys by default. Protected `model`, `state`, `questions`, `assets` cannot be overridden even if allowlisted. Use explicit headers for Jev long-context opt-in: `headers: { 'TypeSafe-Danger-Zone-Long-Context': 'true' }`.

`result.raw` is the parsed original response JSON, **not reconstructed**. `providerMetadata` retains additional top-level fields (e.g. H2O `effort_used`, `probability_source`, `attention_mode`); per-answer extras remain in `answer.raw`. `requestedModel` and `actualModel` are separate. `http` exposes status, request ID and a small safe header allowlist (content-type, request-id, retry-after), never authorization or cookies. Invalid response bodies and network causes are opt-in, non-enumerable `error.details`; messages do not copy upstream text or request credentials. Raw responses/diagnostics can contain sensitive input or upstream-echoed content: do not log them indiscriminately. No SDK logs or external diagnostic uploads occur.

## Capability / verification summary

| Feature                            | Official Jev / System One                 | OpenAI Decisions                    | H2O native preset                                           |
| ---------------------------------- | ----------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| Predicate, choice, score           | Yes                                       | Yes                                 | Same native wire contract                                   |
| Question count                     | No fixed documented cap (context-limited) | 1–400                               | Deployment-specific; no SDK cap                             |
| Choices                            | 1–255, string only                        | 2–255, typed string/boolean         | Native string map, SDK 1–255                                |
| Score levels                       | 1–10                                      | 2–10                                | SDK conservative 1–10, configurable for verified deployment |
| JSON input                         | Native state                              | Native input_json                   | Native state                                                |
| Structured question content        | Yes                                       | Not in common text-only initial API | Native contract                                             |
| Explicit refusal                   | Not documented                            | Yes                                 | Not assumed                                                 |
| Live inference tested in this task | **No**                                    | **No**                              | **Yes: pinned local MLX Q8 native endpoint**                |

Checked official specifications on **2026-11-06**. Jev references `jev-1.14.0` / `jev-latest`; OpenAI `gpt-6-luna`; H2O card `v1.4.2` and current main shim inspected; separately, a pre-existing pinned **v1.4.1 MLX Q8** local deployment passed a real three-question SDK smoke. See [live local record](docs/LIVE-LOCAL.md); current upstream was not installed. Preset aliases may change judgments without an SDK update; pin model/server revisions and inspect `actualModel`. H2O shim can ignore the requested model and report the configured backend model. Do not confuse compatible HTTP smoke success with a real model test.

Actually exercised: Node **26.12.1**, Bun **1.4.3**, npm **11.7.0**, TypeScript **5.9.3**; Cloudflare Workers local **workerd 1.20260730.1 / Miniflare 4.20260730.0**, compatibility date **2026-07-30**, browser-target ESM bundle. Node/Bun smoke uses real local HTTP against synthetic responses; Workers uses injected synthetic fetch in real local workerd, not cloud deployment. Package tarball installation is tested separately. See [verification and acceptance mapping](docs/VERIFICATION.md), [official research](docs/API-RESEARCH.md), and [fixture provenance](test/fixtures/README.md).

## Development / releases

```sh
npm ci
npm run check
npm run test:bun
bun scripts/smoke.mjs
npm run test:package
npm audit
```

See [CONTRIBUTING](CONTRIBUTING.md), [architecture decisions](docs/DESIGN.md), [release checklist](docs/RELEASING.md), [CHANGELOG](CHANGELOG.md), [ROADMAP](ROADMAP.md), and the [preserved specification](docs/SPEC.md). No npm publication, remote push, or deployment is part of these commands. MIT licensed.
