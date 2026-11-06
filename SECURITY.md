# Security

Do not put hosted API keys in client-side applications or untrusted bundles. Supply credentials per client via deployment secrets. `@3inch.ai/system1ts` does not discover keys, log bodies, send telemetry, or follow HTTP redirects. Response HTTP metadata is allowlisted; request headers are not returned. Error messages do not copy upstream text. `error.details` is non-enumerable and opt-in to inspect; it can include upstream raw response bodies or network causes, which may contain sensitive content. Raw diagnostics are not safe to publish automatically.

Choose trustworthy endpoints. Local/remote servers can receive all supplied input and can return malicious or huge bodies. This release buffers response JSON and has no response-byte budget; set timeouts and use a constrained/custom fetch for untrusted servers. The injected fetch must honor standard abort/redirect semantics. Plain HTTP is intended for trusted local/private connections, not sending hosted secrets over public networks.

Report suspected vulnerabilities privately to the repository maintainers (GitHub private vulnerability reporting when enabled); do not place credentials or exploit payloads containing personal data in a public issue. No private reporting channel is claimed to be enabled by this package creation task.
