import type {
  Capabilities,
  DecideRequest,
  ErrorCode,
  Questions,
} from "./types.js";
import { System1Error } from "./errors.js";
import { isRecord } from "./decode.js";

function fail(
  message: string,
  code: ErrorCode = "invalid_request",
  question?: string,
  feature?: string,
): never {
  throw new System1Error(code, message, {
    ...(question !== undefined ? { question } : {}),
    ...(feature !== undefined ? { feature } : {}),
  });
}
function keys(
  v: Record<string, unknown>,
  allowed: readonly string[],
  question?: string,
): void {
  const unknown = Object.keys(v).filter((k) => !allowed.includes(k));
  if (unknown.length)
    fail(
      "Unrecognized fields are not supported",
      "unsupported",
      question,
      unknown.join(","),
    );
}
/** Validate JSON before stringify can silently drop or coerce a value. */
export function validateJson(
  value: unknown,
  maxDepth = 64,
  maxValues = Infinity,
): void {
  const ancestors = new Set<object>();
  let count = 0;
  function visit(v: unknown, depth: number): void {
    if (++count > maxValues)
      fail(
        "JSON value count exceeds endpoint limit",
        "unsupported",
        undefined,
        "json-values",
      );
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) fail("JSON numbers must be finite");
      return;
    }
    if (typeof v !== "object")
      fail("Value must be losslessly JSON serializable");
    if (depth > maxDepth)
      fail(
        "JSON nesting exceeds endpoint limit",
        "unsupported",
        undefined,
        "json-depth",
      );
    if (ancestors.has(v)) fail("Circular JSON values are not supported");
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      fail("JSON objects must be plain objects");
    // stringify resolves toJSON even when it is non-enumerable or inherited.
    // Inspect descriptors so validation never invokes a serialization getter.
    for (
      let owner: object | null = v;
      owner;
      owner = Object.getPrototypeOf(owner)
    ) {
      const hook = Object.getOwnPropertyDescriptor(owner, "toJSON");
      if (!hook) continue;
      if (!("value" in hook) || typeof hook.value === "function")
        fail("JSON serialization hooks are not supported");
      break;
    }
    if (Reflect.ownKeys(v).some((k) => typeof k === "symbol"))
      fail("Symbol keys are not supported in JSON");
    ancestors.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (!Object.hasOwn(v, i)) fail("Sparse arrays are not supported");
        visit(v[i], depth + 1);
      }
    } else
      for (const descriptor of Object.values(
        Object.getOwnPropertyDescriptors(v),
      )) {
        if (!descriptor.enumerable) continue;
        if (!("value" in descriptor)) fail("JSON getters are not supported");
        visit(descriptor.value, depth + 1);
      }
    ancestors.delete(v);
  }
  visit(value, 1);
}
function content(v: unknown): boolean {
  return typeof v === "string" || Array.isArray(v) || isRecord(v);
}
function limitedString(
  v: unknown,
  limit: number,
  feature: string,
  question?: string,
): void {
  if (typeof v !== "string" || Array.from(v).length > limit)
    fail(
      "Expected string within documented endpoint limit",
      "unsupported",
      question,
      feature,
    );
}
export function validate<Q extends Questions>(
  request: DecideRequest<Q>,
  capabilities: Capabilities,
  protocol: "system-one" | "openai-decisions",
  extraKeys: readonly string[] = [],
): void {
  if (!isRecord(request)) fail("Request must be an object");
  keys(request as unknown as Record<string, unknown>, [
    "input",
    "questions",
    "providerOptions",
  ]);
  if (!content(request.input))
    fail("Input must be text, a JSON object, or a JSON array");
  if (!isRecord(request.questions) || !Object.keys(request.questions).length)
    fail("At least one named question is required");
  if (
    capabilities.maxQuestions !== undefined &&
    Object.keys(request.questions).length > capabilities.maxQuestions
  )
    fail(
      "Question count exceeds endpoint capability",
      "unsupported",
      undefined,
      "maxQuestions",
    );
  validateJson(request.input);
  if (protocol === "openai-decisions" && typeof request.input !== "string") {
    if (Array.isArray(request.input) && request.input.some((v) => !isRecord(v)))
      fail(
        "OpenAI input_json requires an object or an array of objects",
        "unsupported",
        undefined,
        "input_json",
      );
    validateJson(request.input, 32, 10000);
    if (new TextEncoder().encode(JSON.stringify(request.input)).length > 262144)
      fail(
        "OpenAI input_json exceeds 256 KiB",
        "unsupported",
        undefined,
        "input_json",
      );
  }
  for (const [name, question] of Object.entries(request.questions)) {
    if (
      !isRecord(question) ||
      !["predicate", "choice", "score"].includes(question.type as string)
    )
      fail("Unknown question type", "unsupported", name, "questionType");
    if (
      !capabilities.questionTypes.includes(
        question.type as "predicate" | "choice" | "score",
      )
    )
      fail(
        "Question type unsupported by endpoint",
        "unsupported",
        name,
        "questionType",
      );
    keys(
      question,
      [
        "type",
        "instructions",
        ...(question.type === "predicate"
          ? ["criteria"]
          : question.type === "choice"
            ? ["choices"]
            : ["levels"]),
      ],
      name,
    );
    if (
      question.instructions !== undefined &&
      question.instructions !== null &&
      !content(question.instructions)
    )
      fail(
        "Instructions must be text or structured content",
        "invalid_request",
        name,
      );
    if (question.instructions !== undefined)
      validateJson(question.instructions);
    if (
      !capabilities.structuredInstructions &&
      typeof question.instructions !== "string"
    )
      fail(
        "Structured instructions cannot be represented without semantic conversion",
        "unsupported",
        name,
        "structuredInstructions",
      );
    if (protocol === "openai-decisions") {
      limitedString(name, 1048576, "name", name);
      limitedString(question.instructions, 1048576, "instructions", name);
    }
    if (question.type === "predicate") {
      if (question.criteria !== undefined) {
        if (protocol === "openai-decisions")
          fail(
            "Predicate criteria are not supported by OpenAI",
            "unsupported",
            name,
            "criteria",
          );
        if (!isRecord(question.criteria))
          fail("Predicate criteria must be an object", "invalid_request", name);
        keys(question.criteria, ["true", "false"], name);
        if (
          Object.values(question.criteria).some(
            (v) => v !== null && !content(v),
          )
        )
          fail(
            "Predicate criteria values must be text, structured content or null",
            "invalid_request",
            name,
          );
        validateJson(question.criteria);
      }
    } else if (question.type === "choice") {
      if (
        !Array.isArray(question.choices) ||
        question.choices.length < capabilities.minChoices ||
        question.choices.length > capabilities.maxChoices
      )
        fail(
          "Choice count exceeds endpoint capability",
          "unsupported",
          name,
          "choices",
        );
      const seen = new Set<unknown>();
      for (const c of question.choices) {
        if (!isRecord(c))
          fail("Each choice must be an object", "invalid_request", name);
        keys(c, ["value", "description"], name);
        if (typeof c.value !== "string" && typeof c.value !== "boolean")
          fail(
            "Choice values must be strings or booleans",
            "invalid_request",
            name,
          );
        if (typeof c.value === "boolean" && !capabilities.booleanChoices)
          fail(
            "This wire protocol cannot represent typed boolean choices without renaming",
            "unsupported",
            name,
            "booleanChoices",
          );
        if (seen.has(c.value))
          fail(
            "Choice values must be unique with type preserved",
            "invalid_request",
            name,
          );
        seen.add(c.value);
        if (
          c.description !== undefined &&
          c.description !== null &&
          !content(c.description)
        )
          fail("Invalid choice description", "invalid_request", name);
        if (c.description !== undefined) validateJson(c.description);
        if (protocol === "openai-decisions") {
          if (typeof c.value === "string")
            limitedString(c.value, 1048576, "choice.value", name);
          if (c.description !== undefined)
            limitedString(c.description, 1048576, "choice.description", name);
        }
      }
    } else {
      if (
        !Array.isArray(question.levels) ||
        question.levels.length < capabilities.minLevels ||
        question.levels.length > capabilities.maxLevels
      )
        fail(
          "Score level count exceeds endpoint capability",
          "unsupported",
          name,
          "levels",
        );
      for (const l of question.levels) {
        if (!isRecord(l) || typeof l.label !== "string")
          fail("Score levels require a string label", "invalid_request", name);
        keys(l, ["label", "description"], name);
        if (l.description !== undefined && !content(l.description))
          fail("Invalid score description", "invalid_request", name);
        if (l.description !== undefined) validateJson(l.description);
        if (protocol === "openai-decisions") {
          limitedString(l.label, 1048576, "level.label", name);
          if (l.description !== undefined)
            limitedString(l.description, 1048576, "level.description", name);
        }
      }
    }
  }
  const options = request.providerOptions;
  if (options === undefined) return;
  if (!isRecord(options)) fail("providerOptions must be an object");
  if (protocol === "system-one") {
    keys(options, ["extraBody"]);
    if (options.extraBody !== undefined) {
      if (!isRecord(options.extraBody)) fail("extraBody must be an object");
      for (const key of Object.keys(options.extraBody)) {
        if (["model", "state", "questions", "assets"].includes(key))
          fail(
            "Provider option conflicts with a common or excluded field",
            "unsupported",
            undefined,
            key,
          );
        if (!extraKeys.includes(key))
          fail(
            "Provider option is not declared by this adapter",
            "unsupported",
            undefined,
            key,
          );
      }
      validateJson(options.extraBody);
    }
  } else {
    keys(options, [
      "prompt_cache_key",
      "prompt_cache_options",
      "safety_identifier",
      "inputTextCacheBreakpoint",
    ]);
    if (
      options.prompt_cache_key !== undefined &&
      options.prompt_cache_key !== null
    )
      limitedString(options.prompt_cache_key, 64, "prompt_cache_key");
    if (
      options.safety_identifier !== undefined &&
      options.safety_identifier !== null
    )
      limitedString(options.safety_identifier, 128, "safety_identifier");
    if (
      options.inputTextCacheBreakpoint !== undefined &&
      typeof options.inputTextCacheBreakpoint !== "boolean"
    )
      fail(
        "inputTextCacheBreakpoint must be boolean",
        "unsupported",
        undefined,
        "inputTextCacheBreakpoint",
      );
    if (options.inputTextCacheBreakpoint && typeof request.input !== "string")
      fail(
        "Text cache breakpoint requires text input",
        "unsupported",
        undefined,
        "inputTextCacheBreakpoint",
      );
    if (
      options.prompt_cache_options !== undefined &&
      options.prompt_cache_options !== null
    ) {
      if (!isRecord(options.prompt_cache_options))
        fail("prompt_cache_options must be an object or null", "unsupported");
      const c = options.prompt_cache_options;
      keys(c, ["mode", "ttl"]);
      if (
        c.mode !== undefined &&
        c.mode !== null &&
        !["implicit", "explicit"].includes(c.mode as string)
      )
        fail(
          "Invalid prompt cache mode",
          "unsupported",
          undefined,
          "prompt_cache_options.mode",
        );
      if (c.ttl !== undefined && c.ttl !== "30m")
        fail(
          "Unsupported prompt cache TTL",
          "unsupported",
          undefined,
          "prompt_cache_options.ttl",
        );
    }
    validateJson(options);
  }
}
