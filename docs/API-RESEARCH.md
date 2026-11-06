# Official API research — 2026-11-06

Retrieved official documentation **before implementation**. Successful extraction was available, so a browser fallback was unnecessary. These are documentation/source checks, not live inference. Never infer support from product names or a third-party wrapper.

## Sources and concrete wire evidence

| Destination | Official sources inspected                                                                                                                                                                                                                                           | Model / server checked                                                                                                             | Live inference                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| TypeSafe    | https://docs.typesafe.ai/ ; https://docs.typesafe.ai/llms.txt ; https://docs.typesafe.ai/api/system-one.md ; https://api.typesafe.ai/openapi.json ; https://docs.typesafe.ai/api/errors.md ; https://docs.typesafe.ai/models.md ; primitives choice/score/noul pages | Documentation lists `jev-1.14.0` (released Oct 14) and `jev-1.13.0`; aliases `jev-latest`, `jev-preview` currently point to 1.14.0 | Not run                                          |
| OpenAI      | https://developers.openai.com/api/docs/guides/decisions ; https://developers.openai.com/api/reference/resources/decisions/methods/create                                                                                                                             | `gpt-6-luna`, documented only hosted model for Decisions                                                                           | Not run                                          |
| H2O         | https://huggingface.co/h2oai/h2o-lightning-4b ; https://huggingface.co/h2oai/h2o-lightning-4b/raw/main/h2o_lightning_shim.py                                                                                                                                         | Card's `v1.4.2` and current main shim; separately tested existing pinned v1.4.1 MLX Q8                                             | Yes, pinned native endpoint (docs/LIVE-LOCAL.md) |

The retrieved TypeSafe `system-one.md` embeds the official OpenAPI schema; its HTTP example and component definitions establish the shapes below. Do not treat stale primitive-page example model IDs as the current alias mapping. H2O `main` is mutable, so this research is a dated source check, not a pinned deployment compatibility guarantee.

### System One

POST `https://api.typesafe.ai/v1/systemone`, Authorization Bearer for hosted API. Required body `{ model, state, questions }`. State accepts string/object/array. Questions are a named map, not an array:

- Noul: `{ type: 'noul', instructions, criteria? }`; criteria may describe true/false; answer `{ type:'noul', noul }`.
- Choice: `{ type:'choice', instructions, criteria: { [stringName]: descriptionOrNull } }`; 1–255 criteria. Answer `{ type:'choice', choice:string, confidence, probabilities: { [stringName]:number } }`.
- Score: `{ type:'score', instructions, criteria:[description,...] }`; OpenAPI permits **1–10**, even though prose recommends at least two. Answer `{ type:'score', score, confidence, legend:{ '0': description, ... }, probabilities:{ '0':number, ... } }`. Score is weighted zero-based index mean.
- Instructions and criterion descriptions support structured objects/arrays, not only strings. Choice names/descriptions are model-visible; question IDs are opaque.
- Response `{ model, answers: { [requestedId]: typedAnswer }, usage }`.
- No documented refusal variant. Do not map missing/malformed data to a refusal.
- Complete probability maps sum to approximately one. Confidence is distribution-derived provider certainty, not a cross-provider accuracy metric.
- No separate max question count is documented: context limits apply. Request rules include UTF-8 finite JSON, at most 64 nesting levels, 32 MiB request body. Body/token limits are ultimately enforced by the service (SDK does not tokenize or compress requests).
- Header `TypeSafe-Danger-Zone-Long-Context: true` is supported; user can opt in with explicit client headers. Images/assets/Box are excluded from initial SDK despite being upstream features.
- Errors: 400 invalid rules/context, 401 auth, 413 size, 415 encoding, 422 validation, 429 rate limit, 529 overload. SDK does not retry them automatically.

### OpenAI Decisions

POST `https://api.openai.com/v1/decisions`, required body `{ model, input, questions }`.

- `questions` is ordered, **1–400**. Each named question has `instructions`, `type` and `name`; choice has `choices:[{value:string|boolean,description?:string}]`, **2–255 unique typed values**; score has `levels:[{label:string,description?:string}]`, **2–10**.
- Predicate answer `{type:'predicate', name, probability}`. Choice answer `{type:'choice', name, choice, confidence, probabilities:[{value, probability}]}`. Score answer `{type:'score', name, score, confidence, probabilities:[{value:integerIndex,label,probability}]}`. Explicit refusal `{type:'refusal', name}` can replace any question while siblings remain valid.
- Answers come in question order, names are echoed. SDK checks both rather than silently reordering.
- Strings and booleans are genuinely different choice values. `true` and `'true'` are both representable in the same request.
- Native JSON is a user-message `input_json` content part with `data` object or array of objects. Limits: 32 container levels, 10,000 values, 256 KiB compact UTF-8. Not arbitrary JSON scalar evidence.
- Top-level optional controls: `prompt_cache_key` (nullable, <=64), `prompt_cache_options` (nullable; mode implicit/explicit/null, TTL 30m), `safety_identifier` (nullable, <=128). Supported controls are forwarded explicitly. Unknown controls are rejected.
- Explicit `prompt_cache_breakpoint:{mode:'explicit'}` belongs to text/image shared-input content parts, not JSON parts or question instructions. SDK exposes the end-of-text input marker without adding images/conversation scope.
- Response includes `model`, ordered `answers`, `usage` with cache token detail extensions. The SDK retains raw usage; it does not recompute totals or costs.

### H2O compatible local shim

The actual packaged shim, not a bare vLLM chat-completions server, exposes `http://127.0.0.1:8741/v1/systemone`; current source also has a distinct `/v1/decisions` compatibility handler. The native handler is the default preset used here. A generic chat-completions server is **not** automatically compatible.

The shim documents native System One shapes and returns additional `probability_source`, `effort_used`, `attention_mode`, extended usage. The SDK retains these without reshaping. `attention_mode` can request causal/bidirectional (and documented aliases); a mode not available is a server error, not an SDK fallback. A declared compatible adapter may forward it through `extraBody`.

The shim's actual score/choice bounds depend on its tokenizer labels and deployment configuration; they are not necessarily TypeSafe's 10 score levels. The initial H2O convenience preset conservatively inherits native System One's SDK 1–10 level declaration, and **does not claim this is H2O's intrinsic maximum**. Use a verified configured adapter to declare different limits. The shim can use its configured backend model rather than honoring the requested model; inspect `actualModel` separately. No weights, quantization, engine/GPU management, server launch, accuracy, latency or memory claims are part of this SDK validation.

## Research and live limitations

No credentials were read and no hosted inference calls made. After implementation, the parent session explicitly identified and started an existing pinned v1.4.1 MLX Q8 deployment; one real native System One SDK request passed (docs/LIVE-LOCAL.md). This does not validate current upstream main or the shim's separate Decisions handler. Synthetic HTTP and local Workers tests prove client conversion/transport behavior, not provider acceptance, model accuracy, calibration, performance or a future mutable alias. Before advertising a new destination/version, record its official source revision and run a permitted minimal live check separately. No competitor feature/benchmark comparisons are made.
