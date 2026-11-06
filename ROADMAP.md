# Roadmap

Order and version numbers are provisional; demand and upstream API changes take priority.

## 0.1: initial release candidate

Common typed decisions, three kinds, two protocols, Jev/OpenAI/H2O connection presets, explicit unsupported/refused/invalid distinction, untouched raw payloads, offline contract tests, runtime smoke and release preparation. Before public release, perform owner approval and (if keys/server and budget are explicitly available) minimal live inference checks.

## Next: additional verified destinations

Investigate OpenRouter and another local compatible server. For each addition, check official protocol, models, capabilities, per-deployment limits, JSON representation, options, refusal and distribution semantics. Add sourced fixtures and tests before listing support; a working baseURL substitution is not sufficient. Offer dedicated H2O version-specific limits and typed shim options when a live deployment can be validated.

## Demand-driven follow-ups

- Rich text/message inputs and full OpenAI conversation evidence, with explicit capability checks.
- Images, question images, assets; then Box if real needs justify it.
- Question-level partial execution and explicit batching to server limits.
- Small model-comparison helpers separating SDK correctness from judgment quality.
- Opt-in retries and fallback with observable request count, cost and chosen model.
- Response size budgets/streaming diagnostics for untrusted servers.

Do not silently add chunking, retries or model/service fallback: they change request counts, spending, latency and judgment semantics. Do not build a gateway, dashboard, model downloader, GPU operations layer or large evaluation platform without an established need.

## 1.0 readiness

Stabilize public API, errors, result meaning, type inference, capability/verification matrix and migration policy. Gather real consumers and permitted live endpoint validation. SemVer is semantic, not only syntactic: changing probability interpretations, tolerances, error codes or defaults can break consumers. During 0.x, breaking changes require a minor bump, CHANGELOG notice and migration instructions; patch releases preserve existing contracts. At 1.x, incompatible changes require a major bump. Do not automatically publish dependency/API updates.
