import {
  createClient,
  createSystemOneAdapter,
  h2o,
  jev,
  openai,
} from "../src/index.js";
import type { Questions } from "../src/index.js";

export const questions = {
  damaged: {
    type: "predicate",
    instructions: "Does the customer report damage?",
  },
  team: {
    type: "choice",
    instructions: "Which team?",
    choices: [{ value: "returns" }, { value: "billing" }],
  },
  severity: {
    type: "score",
    instructions: "How urgent?",
    levels: [{ label: "Can wait" }, { label: "Urgent" }],
  },
} as const satisfies Questions;

// Export functions rather than making paid calls when this example is imported.
export async function useJev(apiKey: string) {
  return jev({ apiKey, model: "jev-1.14.0" }).decide({
    input: { message: "The screen arrived broken." },
    questions,
  });
}
export async function useOpenAI(apiKey: string, signal?: AbortSignal) {
  return openai({ apiKey }).decide(
    {
      input: "The screen arrived broken.",
      questions,
      providerOptions: {
        prompt_cache_key: "example",
        prompt_cache_options: { mode: "implicit", ttl: "30m" },
      },
    },
    signal ? { signal, timeoutMs: 10000 } : { timeoutMs: 10000 },
  );
}
export async function useLocalH2O(baseURL = "http://127.0.0.1:8741") {
  return h2o({ baseURL }).decide({
    input: { message: "The screen arrived broken." },
    questions,
  });
}
export async function useVerifiedShim() {
  const adapter = createSystemOneAdapter({
    id: "h2o-shim",
    extraBodyKeys: ["attention_mode"],
  });
  return createClient({
    adapter,
    baseURL: "http://127.0.0.1:8741",
    model: "h2oai/h2o-lightning-4b",
  }).decide({
    input: "Help with a broken screen",
    questions,
    providerOptions: { extraBody: { attention_mode: "causal" } },
  });
}
