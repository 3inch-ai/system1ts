import type {
  Client,
  ClientOptions,
  CallOptions,
  Decision,
  DecideRequest,
  ErrorCode,
  Questions,
} from "./types.js";
import { System1Error } from "./errors.js";

/** baseURL is a service root or a versioned root, not a full method URL. */
export function resolveEndpoint(baseURL: string, path: string): string {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new System1Error(
      "invalid_request",
      "baseURL must be an absolute HTTP(S) URL",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new System1Error(
      "invalid_request",
      "baseURL must be HTTP(S), without credentials, query or fragment",
    );
  if (!/^[a-zA-Z0-9_-]+$/.test(path))
    throw new System1Error(
      "invalid_request",
      "Adapter path must be a single endpoint segment",
    );
  const prefix = url.pathname.replace(/\/+$/, "");
  url.pathname = `${prefix}${prefix.endsWith("/v1") ? "" : "/v1"}/${path}`;
  return url.href;
}
function timeout(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 2147483647)
    throw new System1Error(
      "invalid_request",
      "timeoutMs must be a positive finite millisecond count <= 2147483647",
    );
}
function statusCode(status: number): ErrorCode {
  return status === 401 || status === 403
    ? "authentication"
    : status === 429
      ? "rate_limit"
      : status === 400 || status === 413 || status === 415 || status === 422
        ? "invalid_request"
        : "http";
}
export function createClient(options: ClientOptions): Client {
  const { adapter, model } = options;
  if (typeof model !== "string" || !model.length)
    throw new System1Error(
      "invalid_request",
      "model must be a non-empty string",
    );
  const endpoint = resolveEndpoint(options.baseURL, adapter.path);
  const defaultTimeout = options.timeoutMs ?? 30000;
  timeout(defaultTimeout);
  let headers: Headers;
  try {
    headers = new Headers(options.headers);
    if (headers.has("authorization") && options.apiKey !== undefined)
      throw new System1Error(
        "invalid_request",
        "Configure either apiKey or Authorization, not both",
      );
    headers.set("content-type", "application/json");
    if (options.apiKey !== undefined) {
      if (typeof options.apiKey !== "string")
        throw new System1Error("invalid_request", "apiKey must be a string");
      headers.set("authorization", `Bearer ${options.apiKey}`);
    }
  } catch (error) {
    if (error instanceof System1Error) throw error;
    // Headers may echo the rejected value in its TypeError, including a credential.
    throw new System1Error(
      "invalid_request",
      "Invalid request header configuration",
    );
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function")
    throw new System1Error(
      "invalid_request",
      "A standards-compatible fetch implementation is required",
    );
  return Object.freeze({
    capabilities: adapter.capabilities,
    async decide<const Q extends Questions>(
      request: DecideRequest<Q>,
      call: CallOptions = {},
    ): Promise<Decision<Q>> {
      const timeoutMs = call.timeoutMs ?? defaultTimeout;
      timeout(timeoutMs);
      let body: string;
      let questions: Q;
      try {
        body = JSON.stringify(adapter.encode(request, model));
        questions = JSON.parse(JSON.stringify(request.questions)) as Q;
      } catch (error) {
        if (error instanceof System1Error)
          throw new System1Error(error.code, error.message, {
            ...error.details,
            endpoint,
          });
        throw new System1Error(
          "invalid_request",
          "Request cannot be encoded as JSON",
          { endpoint, originalCause: error },
        );
      }
      if (call.signal?.aborted)
        throw new System1Error("aborted", "Request was aborted", { endpoint });
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      call.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          body,
          headers: new Headers(headers),
          signal: controller.signal,
          redirect: "error",
        });
        const requestId =
          response.headers.get("x-request-id") ??
          response.headers.get("request-id") ??
          undefined;
        const responseHeaders: Record<string, string> = {};
        for (const key of [
          "content-type",
          "retry-after",
          "x-request-id",
          "request-id",
        ]) {
          const value = response.headers.get(key);
          if (value !== null) responseHeaders[key] = value;
        }
        const meta = {
          endpoint,
          status: response.status,
          headers: responseHeaders,
          ...(requestId ? { requestId } : {}),
        };
        const rawBody = await response.text();
        let raw: unknown;
        try {
          raw = JSON.parse(rawBody);
        } catch {
          throw new System1Error(
            response.ok ? "invalid_response" : statusCode(response.status),
            response.ok
              ? "Response body is not valid JSON"
              : `HTTP request failed (${response.status})`,
            { ...meta, rawBody },
          );
        }
        if (!response.ok)
          throw new System1Error(
            statusCode(response.status),
            `HTTP request failed (${response.status})`,
            { ...meta, rawBody, raw },
          );
        let normalized;
        try {
          normalized = adapter.decode(raw, questions);
        } catch (error) {
          if (error instanceof System1Error)
            throw new System1Error(error.code, error.message, {
              ...error.details,
              ...meta,
              raw,
              rawBody,
            });
          throw new System1Error(
            "invalid_response",
            "Adapter failed to decode response",
            { ...meta, raw, rawBody, originalCause: error },
          );
        }
        return {
          ...normalized,
          requestedModel: model,
          http: {
            status: response.status,
            ...(requestId ? { requestId } : {}),
            headers: responseHeaders,
          },
        };
      } catch (error) {
        if (error instanceof System1Error) throw error;
        if (timedOut)
          throw new System1Error(
            "timeout",
            "Request timed out and was aborted",
            { endpoint },
          );
        if (controller.signal.aborted)
          throw new System1Error("aborted", "Request was aborted", {
            endpoint,
          });
        throw new System1Error("network", "Network request failed", {
          endpoint,
          originalCause: error,
        });
      } finally {
        clearTimeout(timer);
        call.signal?.removeEventListener("abort", abort);
      }
    },
  });
}
