# Design decisions

## One entry point, explicit composition

`createClient(options).decide(request, callOptions)` is the core operation; presets only supply defaults. Protocol adapter, provider label, base URL, model and runtime are independent. `provider` does not dispatch, alias or rewrite a model. A future protocol can implement the exported small `Adapter` interface, without a global registry, gateway or plugin framework. Import performs no external I/O or heavy initialization.

## Pure protocol conversion, separate transport

Adapters own capabilities, preflight checks, body construction and interpretation. Their public `encode()` / `decode()` are callable without a network. `client.ts` owns HTTP, URL composition, timing and cancellation; it snapshots question contracts before awaiting transport to prevent caller mutation changing interpretation. Configuration and headers are captured per client. Built-in capabilities and their shared question-kind array are frozen.

System One `predicate` maps to Noul, not a fabricated boolean field. OpenAI native typed choices require entry arrays to avoid collisions; System One rejects boolean values rather than inventing labels. Native JSON encoding is protocol-specific and documented. Structured content is preserved on System One, rejected when it cannot fit the initial OpenAI text-only common surface. No unannounced stringify conversion changes the evidence.

The common score rubric has a label and optional description. On System One label-only is a string criterion; when both exist, `{label,description}` is structured criterion content. This retains all model-visible information. Responses must preserve that legend, zero-based order and probability-weighted score. On OpenAI these map directly to levels. Identical common rubric fields may still be interpreted differently by different models; SDK compatibility is not judgment equivalence.

## Result and error boundaries

A valid HTTP response can contain mixed ok/refused/invalid question results. Missing/wrong-type/misaligned values are never called refusal. Unsupported functionality is a structured exception before fetch; there is no implicit partial execution. A broken transport, HTTP failure, malformed JSON, or unusable top-level envelope fails the whole call. Top-level `issues` describe extra IDs/counts and envelope metadata problems without discarding unaffected valid answers.

OpenAI positional correspondence is authoritative and names are checked. System One IDs are authoritative. No silent ID searching, count padding, redistribution, default zero, renormalization, score overwrite or automatic threshold happens. Complete distributions are validated because both implemented contracts promise them; a future partial-distribution contract must implement its own decoder rather than reuse these assumptions.

`raw` is original parsed JSON; metadata is supplementary, not a reconstruction. `usage` stays unknown and absent if absent. Raw provider confidence is labeled as provider/protocol-specific and not universal correctness probability. Diagnostics preserve invalid original answer/body and original network causes but are non-enumerable to reduce accidental serialized disclosure. Explicit inspection is still sensitive, not a security boundary.

## Extensibility is explicit

Official adapters reject unknown `providerOptions`. OpenAI exposes all documented top-level cache/safety controls plus a deliberately mapped text input cache marker. Generic System One `extraBody` works only for explicitly declared extension keys; protected common/excluded fields cannot be overridden. The lightweight factory changes declared count limits/allowlist, not decoder semantics. Caller-declared keys need actual server verification; the SDK does not claim future arbitrary values are valid.

No retries or fallback in 0.1. Timeouts default to 30s and really abort fetch and response consumption. Injected fetch must implement web-standard abort and redirect semantics; a fetch that ignores AbortSignal cannot be forcibly interrupted by a wrapper. Redirects fail rather than forwarding hosted credentials. Standard fetch objects keep runtime dependencies zero; Node-only imports exist only in tests/development scripts, never library source.

## Deliberate initial limits

Text/JSON only; rich conversation/image/assets/Box/audio/video not modeled. No token estimator, request compression, request splitter, response byte budget, model download/server management, evaluation platform, telemetry, automatic pricing estimates or custom gateway. Server context/body/rate/availability restrictions remain server-enforced. H2O's preset uses conservative native System One limits; configure verified deployment limits explicitly rather than pretending all shims have identical capabilities.

## Compatibility policy

0.x breaking changes require a minor bump and migration documentation; compatible fixes are patches. Result meaning, tolerances, defaults and error classification are as important as TypeScript types. Do not automatically release API/dependency updates. A future 1.0 requires stable contracts and real-consumer feedback plus clearly scoped live endpoint verification.
