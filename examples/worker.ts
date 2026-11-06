import { openai } from "../src/index.js";

interface Env {
  OPENAI_API_KEY: string;
}
// Library integration sketch; add application auth/rate limits before exposing a paid API route.
export async function classifyInWorker(
  text: string,
  env: Env,
  signal: AbortSignal,
) {
  return openai({ apiKey: env.OPENAI_API_KEY }).decide(
    {
      input: text,
      questions: {
        relevant: {
          type: "predicate",
          instructions: "Does this ask for technical help?",
        },
      },
    },
    { signal, timeoutMs: 10000 },
  );
}
