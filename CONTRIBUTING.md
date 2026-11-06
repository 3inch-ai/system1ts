# Development guide

## Environment and commands

Use Node >=22 with standard fetch; tested versions are recorded in docs/VERIFICATION.md. Bun and a working local workerd binary are required for the full release matrix.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
npm run smoke:workers
npm run test:bun
bun scripts/smoke.mjs
npm run test:package
npm audit
```

Runtime dependencies are intentionally zero because these HTTP/JSON contracts fit web platform primitives. Development-only dependencies provide TypeScript, the TS test runner, browser-target bundling, and local Workers runtime verification. Miniflare's `sharp`/`undici` overrides select audited patched versions of its pinned transitive dependencies; keep these explicit and rerun Workers tests before updating/removing them.

## Layout

- `src/types.ts`: public generic contracts; no `any`, Node imports or environment reads.
- `src/adapters.ts`: protocol conversion and declared limits; configurable System One adapter factory.
- `src/validate.ts`: preflight unsupported/invalid request checking, lossless JSON validation.
- `src/decode.ts`: question-level malformed/refused/valid results and top-level alignment issues.
- `src/client.ts`: transport only, URL handling, cancellation, typed errors and safe HTTP metadata.
- `src/presets.ts`: provider defaults, not routing logic or protocol changes.
- `test/`: public-contract tests; `inference.ts` is compiled positive/negative type coverage, not executed.
- `test/fixtures/`: documentation examples, separately labeled from synthetic inline cases.
- `scripts/`: synthetic local HTTP, Workers and installed-package smoke; separately opt-in `live-local.mjs` for an authorized running loopback model, never hosted/paid model calls.
- `docs/`: source research, design decisions, acceptance/verification and release workflow; original `SPEC.md` is immutable evidence.

## Changing an API integration

1. Read existing implementation, docs/API-RESEARCH.md, capability matrix, roadmap and open issues.
2. Retrieve current official documentation and, for a shim, its actual implementation and revision. Never infer a new schema from a product name or competitor adapter.
3. Identify effects on public types, question meaning, distributions, error semantics and defaults.
4. Add the smallest failing public-contract test before implementation. Distinguish documented example, sanitized live payload and artificial anomaly fixtures.
5. Implement the narrow change; keep transport and conversion separate. Do not silently discard options or coerce JSON/labels to fit another provider.
6. Update types, matrix, docs, fixtures and CHANGELOG together. Add migration notes when needed.
7. Run the relevant tests and full runtime/package matrix. Record both verified and unverified endpoints and models.
8. Request review and release approval. Dependency updates and API drift are never automatic publication triggers.

Do not read secrets to discover API availability. Live calls need explicit endpoint/key availability and spending authorization. Never commit `.env`, credentials, or unsanitized live response data. Do not compare competitor support claims without checking a pinned current version.

## Tests and security

Keep tests behavioral: typed booleans must not collide, missing answers must not become refusals, score values must not be silently recomputed, and extra options must never disappear. Test preflight no-fetch failures, partial malformed results, response body aborts and per-client isolation. Check malformed probability sums only for contracts promising complete distributions.

The SDK does not log request/response bodies. Non-enumerable diagnostics are deliberately inspectable, not a secret vault: treat raw payloads and original causes as sensitive. Never copy upstream text into normal error messages. Avoid platform-specific runtime imports and test the actual packed export and declarations rather than only source imports.
