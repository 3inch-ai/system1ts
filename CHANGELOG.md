# Changelog

Changes to result meaning, error classification, defaults, and types all count as API changes.

## 0.1.0 — release candidate (2026-11-06; not published)

- Add typed `decide()` API, text/JSON input, named predicate/choice/score questions.
- Add pure System One and OpenAI Decisions encode/decode adapters, client-local configuration, Jev/OpenAI/H2O presets, explicit compatible-server extension declarations.
- Preserve typed boolean vs string choices, rubric order/labels, original score and computed verification score, raw responses, usage and provider metadata, requested/actual model, safe HTTP metadata.
- Distinguish explicit refusal, malformed/missing answer, unsupported preflight request and typed transport/HTTP failures.
- Validate complete distributions and score consistency without filling missing values or renormalizing.
- Add fetch injection, caller abort, real transport timeout, no retries/fallback, redirect refusal.
- Reject non-enumerable `toJSON` serialization hooks so accepted evidence/question content cannot silently replace itself on the wire; regression tested for both protocols.
- Add strict type tests, documented-example fixtures, synthetic anomaly tests, Node/Bun real-local-HTTP and workerd offline smoke, installed-tarball runtime/type checks.
- Preserve the original Japanese specification and document official sources, acceptance coverage, API-change and release maintenance workflows.

A real three-question SDK smoke passed against the existing pinned H2O v1.4.1 MLX Q8 native loopback endpoint (see docs/LIVE-LOCAL.md). Hosted Jev/OpenAI and the latest H2O main deployment remain untested. Synthetic contract/runtime tests are separate from this live check and do not establish model quality.
