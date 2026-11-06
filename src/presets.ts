import type { Client, ClientOptions } from "./types.js";
import { createClient } from "./client.js";
import { systemOne, openaiDecisions } from "./adapters.js";

export type PresetOptions = Omit<
  ClientOptions,
  "adapter" | "baseURL" | "model" | "provider"
> & { readonly baseURL?: string; readonly model?: string };
/** Aliases can change upstream. Pin a versioned model for repeatability. */
export function jev(options: PresetOptions = {}): Client {
  return createClient({
    ...options,
    adapter: systemOne,
    provider: "typesafe",
    baseURL: options.baseURL ?? "https://api.typesafe.ai",
    model: options.model ?? "jev-latest",
  });
}
export function openai(options: PresetOptions = {}): Client {
  return createClient({
    ...options,
    adapter: openaiDecisions,
    provider: "openai",
    baseURL: options.baseURL ?? "https://api.openai.com",
    model: options.model ?? "gpt-6-luna",
  });
}
/** Native shim protocol, conservative 10-level score limit inherited from System One.
 * Servers with verified higher limits can use createSystemOneAdapter explicitly.
 */
export function h2o(options: PresetOptions = {}): Client {
  return createClient({
    ...options,
    adapter: systemOne,
    provider: "h2o",
    baseURL: options.baseURL ?? "http://127.0.0.1:8741",
    model: options.model ?? "h2oai/h2o-lightning-4b",
  });
}
