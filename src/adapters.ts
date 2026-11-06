import type {
  Adapter,
  Capabilities,
  DecideRequest,
  Questions,
  OpenAIOptions,
  SystemOneOptions,
} from "./types.js";
import { decode } from "./decode.js";
import { validate } from "./validate.js";
import { System1Error } from "./errors.js";

const common = {
  questionTypes: Object.freeze(["predicate", "choice", "score"] as const),
  maxChoices: 255,
  maxLevels: 10,
  completeDistributions: true,
} as const;
export const systemOneCapabilities: Capabilities = Object.freeze({
  ...common,
  minChoices: 1,
  minLevels: 1,
  booleanChoices: false,
  structuredInstructions: true,
  refusal: false,
});
export const openaiCapabilities: Capabilities = Object.freeze({
  ...common,
  maxQuestions: 400,
  minChoices: 2,
  minLevels: 2,
  booleanChoices: true,
  structuredInstructions: false,
  refusal: true,
});

function systemEncode<Q extends Questions>(
  request: DecideRequest<Q>,
  model: string,
  capabilities = systemOneCapabilities,
  extraBodyKeys: readonly string[] = [],
): Record<string, unknown> {
  validate(request, capabilities, "system-one", extraBodyKeys);
  const questions = Object.fromEntries(
    Object.entries(request.questions).map(([name, q]) => {
      const base = {
        type: q.type === "predicate" ? "noul" : q.type,
        ...(q.instructions !== undefined
          ? { instructions: q.instructions }
          : {}),
      };
      return [
        name,
        q.type === "predicate"
          ? { ...base, ...(q.criteria ? { criteria: q.criteria } : {}) }
          : q.type === "choice"
            ? {
                ...base,
                criteria: Object.fromEntries(
                  q.choices.map((c) => [c.value, c.description ?? null]),
                ),
              }
            : {
                ...base,
                criteria: q.levels.map((l) =>
                  l.description === undefined
                    ? l.label
                    : { label: l.label, description: l.description },
                ),
              },
      ];
    }),
  );
  return {
    model,
    state: request.input,
    questions,
    ...(request.providerOptions as SystemOneOptions | undefined)?.extraBody,
  };
}
function openaiEncode<Q extends Questions>(
  request: DecideRequest<Q>,
  model: string,
): Record<string, unknown> {
  validate(request, openaiCapabilities, "openai-decisions");
  const { inputTextCacheBreakpoint, ...options } = (request.providerOptions ??
    {}) as OpenAIOptions;
  const input =
    typeof request.input === "string"
      ? inputTextCacheBreakpoint
        ? [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: request.input,
                  prompt_cache_breakpoint: { mode: "explicit" },
                },
              ],
            },
          ]
        : request.input
      : [
          {
            role: "user",
            content: [{ type: "input_json", data: request.input }],
          },
        ];
  return {
    model,
    input,
    questions: Object.entries(request.questions).map(([name, q]) => ({
      name,
      ...q,
    })),
    ...options,
  };
}
export interface SystemOneAdapterOptions {
  readonly id?: string;
  readonly maxQuestions?: number;
  readonly maxChoices?: number;
  readonly maxLevels?: number;
  readonly extraBodyKeys?: readonly string[];
}
/** Declare verified server limits and extension keys; never changes option names or value semantics. */
export function createSystemOneAdapter(
  options: SystemOneAdapterOptions = {},
): Adapter {
  const validKeys = [
    "id",
    "extraBodyKeys",
    "maxQuestions",
    "maxChoices",
    "maxLevels",
  ];
  if (Object.keys(options).some((k) => !validKeys.includes(k)))
    throw new System1Error(
      "invalid_request",
      "Unknown adapter configuration field",
    );
  for (const v of [options.maxQuestions, options.maxChoices, options.maxLevels])
    if (v !== undefined && (!Number.isSafeInteger(v) || v <= 0))
      throw new System1Error(
        "invalid_request",
        "Adapter limits must be positive safe integers",
      );
  const { id = "system-one", extraBodyKeys = [], ...limits } = options;
  const capabilities: Capabilities = Object.freeze({
    ...systemOneCapabilities,
    ...limits,
  });
  const allowed = [...extraBodyKeys];
  return Object.freeze({
    id,
    path: "systemone",
    capabilities,
    encode: <Q extends Questions>(request: DecideRequest<Q>, model: string) =>
      systemEncode(request, model, capabilities, allowed),
    decode: <Q extends Questions>(raw: unknown, questions: Q) =>
      decode(raw, questions, "system-one"),
  });
}
export const systemOne = createSystemOneAdapter();
export const openaiDecisions: Adapter = Object.freeze({
  id: "openai-decisions",
  path: "decisions",
  capabilities: openaiCapabilities,
  encode: openaiEncode,
  decode: <Q extends Questions>(raw: unknown, questions: Q) =>
    decode(raw, questions, "openai-decisions"),
});
