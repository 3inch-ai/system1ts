import type {
  Answers,
  ChoiceValue,
  Normalized,
  Question,
  Questions,
  AnswerFor,
} from "./types.js";
import { System1Error } from "./errors.js";

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const probability = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;
const own = (v: object, key: string): boolean => Object.hasOwn(v, key);
// Absolute tolerances allow rounded upstream probabilities, never renormalize them.
const SUM_TOLERANCE = 0.01;
const SCORE_TOLERANCE = 0.02;
const levelContent = (l: {
  readonly label: string;
  readonly description?: unknown;
}): unknown =>
  l.description === undefined
    ? l.label
    : { label: l.label, description: l.description };
function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  if (isRecord(a) && isRecord(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((k) => own(b, k) && jsonEqual(a[k], b[k]))
    );
  return false;
}
function answer(
  raw: unknown,
  q: Question,
  protocol: "system-one" | "openai-decisions",
  name: string,
  duplicate: boolean,
): AnswerFor<Question> {
  const issues: string[] = [];
  const invalid = (): AnswerFor<Question> => ({
    status: "invalid",
    issues,
    raw,
  });
  if (!isRecord(raw)) {
    issues.push("Answer missing or not an object");
    return invalid();
  }
  if (protocol === "openai-decisions" && raw.name !== name)
    issues.push("Answer name does not match question at this position");
  if (duplicate) issues.push("Duplicate answer name");
  if (issues.length) return invalid();
  if (raw.type === "refusal" && protocol === "openai-decisions")
    return { status: "refused", raw };
  const expectedType =
    q.type === "predicate" && protocol === "system-one" ? "noul" : q.type;
  if (raw.type !== expectedType) {
    issues.push("Answer type does not match question");
    return invalid();
  }
  if (q.type === "predicate") {
    const value = protocol === "system-one" ? raw.noul : raw.probability;
    if (!probability(value)) {
      issues.push("Predicate probability must be finite and within [0, 1]");
      return invalid();
    }
    return { status: "ok", type: "predicate", probability: value, raw };
  }
  if (!probability(raw.confidence))
    issues.push("Provider confidence must be finite and within [0, 1]");
  const confidence = probability(raw.confidence)
    ? {
        value: raw.confidence,
        source: protocol,
        meaning:
          "Provider-specific certainty of the returned distribution; not universal correctness probability.",
      }
    : undefined;
  const entries: { value: unknown; label?: unknown; probability: unknown }[] =
    [];
  if (protocol === "openai-decisions") {
    if (!Array.isArray(raw.probabilities))
      issues.push("Missing or invalid probabilities array");
    else
      for (const e of raw.probabilities) {
        if (!isRecord(e)) issues.push("Distribution entry must be an object");
        else
          entries.push({
            value: e.value,
            ...(own(e, "label") ? { label: e.label } : {}),
            probability: e.probability,
          });
      }
  } else {
    if (!isRecord(raw.probabilities))
      issues.push("Missing or invalid probabilities map");
    else
      for (const [key, p] of Object.entries(raw.probabilities))
        entries.push({
          value: q.type === "score" ? Number(key) : key,
          probability: p,
        });
  }
  const seen = new Set<unknown>();
  let total = 0;
  for (const e of entries) {
    if (seen.has(e.value)) issues.push("Duplicate distribution value");
    seen.add(e.value);
    if (!probability(e.probability))
      issues.push("Distribution probability must be finite and within [0, 1]");
    else total += e.probability;
  }
  if (Math.abs(total - 1) > SUM_TOLERANCE + Number.EPSILON)
    issues.push(
      "Complete distribution probabilities do not sum to 1 (tolerance 0.01)",
    );
  if (q.type === "choice") {
    const allowed = q.choices.map((c) => c.value);
    if (!allowed.some((v) => v === raw.choice))
      issues.push("Selected choice is not among requested typed values");
    if (
      entries.length !== allowed.length ||
      entries.some((e) => !allowed.some((v) => v === e.value))
    )
      issues.push(
        "Distribution does not contain exactly the requested choices",
      );
    const selected = entries.find((e) => e.value === raw.choice);
    if (
      selected &&
      probability(selected.probability) &&
      entries.some(
        (e) =>
          probability(e.probability) &&
          e.probability > (selected.probability as number) + SUM_TOLERANCE,
      )
    )
      issues.push("Selected choice is not a maximum-probability option");
    if (issues.length || !confidence) return invalid();
    return {
      status: "ok",
      type: "choice",
      choice: raw.choice as ChoiceValue,
      probabilities: entries.map((e) => ({
        value: e.value as ChoiceValue,
        probability: e.probability as number,
      })),
      confidence,
      raw,
    };
  }
  if (!finite(raw.score) || raw.score < 0 || raw.score > q.levels.length - 1)
    issues.push("Score must be finite and within level index range");
  if (entries.length !== q.levels.length)
    issues.push(
      "Distribution does not contain exactly the requested score levels",
    );
  for (const e of entries) {
    if (
      !Number.isInteger(e.value) ||
      typeof e.value !== "number" ||
      e.value < 0 ||
      e.value >= q.levels.length
    ) {
      issues.push("Invalid score level index");
      continue;
    }
    if (protocol === "openai-decisions" && e.label !== q.levels[e.value]?.label)
      issues.push("Score label differs from requested level");
  }
  if (protocol === "system-one") {
    if (
      !isRecord(raw.legend) ||
      Object.keys(raw.legend).length !== q.levels.length ||
      q.levels.some(
        (l, i) =>
          !isRecord(raw.legend) ||
          !own(raw.legend, String(i)) ||
          !jsonEqual(raw.legend[String(i)], levelContent(l)),
      )
    )
      issues.push("Missing or mismatched score legend");
    if (
      isRecord(raw.probabilities) &&
      Object.keys(raw.probabilities).some((k) => String(Number(k)) !== k)
    )
      issues.push("Noncanonical score index key");
  }
  const computedScore = entries.reduce(
    (sum, e) =>
      sum +
      (typeof e.value === "number" && probability(e.probability)
        ? e.value * e.probability
        : 0),
    0,
  );
  if (
    finite(raw.score) &&
    Math.abs(raw.score - computedScore) > SCORE_TOLERANCE + Number.EPSILON
  )
    issues.push(
      "Returned score is inconsistent with probability-weighted level indices (tolerance 0.02)",
    );
  if (issues.length || !confidence) return invalid();
  return {
    status: "ok",
    type: "score",
    score: raw.score as number,
    levels: q.levels,
    computedScore,
    probabilities: entries.map((e) => ({
      value: e.value as number,
      label: q.levels[e.value as number]!.label,
      probability: e.probability as number,
    })),
    confidence,
    raw,
  };
}

export function decode<Q extends Questions>(
  raw: unknown,
  questions: Q,
  protocol: "system-one" | "openai-decisions",
): Normalized<Q> {
  if (
    !isRecord(raw) ||
    (protocol === "system-one"
      ? !isRecord(raw.answers)
      : !Array.isArray(raw.answers))
  )
    throw new System1Error(
      "invalid_response",
      "Response must contain a protocol-compatible answers container",
      { raw },
    );
  const names = Object.keys(questions);
  const container = raw.answers as unknown[] | Record<string, unknown>;
  const issues: string[] = [];
  const duplicates = new Set<string>();
  if (Array.isArray(container)) {
    if (container.length !== names.length)
      issues.push("Answer count differs from question count");
    const seen = new Set<string>();
    for (const item of container)
      if (isRecord(item) && typeof item.name === "string") {
        if (seen.has(item.name)) duplicates.add(item.name);
        seen.add(item.name);
      }
    if (duplicates.size) issues.push("Duplicate answer names");
  } else {
    for (const k of Object.keys(container))
      if (!own(questions, k)) issues.push(`Unexpected answer ID: ${k}`);
    if (Object.keys(container).length !== names.length)
      issues.push("Answer count differs from question count");
  }
  const answers = Object.fromEntries(
    names.map((name, i) => [
      name,
      answer(
        Array.isArray(container)
          ? container[i]
          : own(container, name)
            ? container[name]
            : undefined,
        questions[name]!,
        protocol,
        name,
        duplicates.has(name),
      ),
    ]),
  ) as Answers<Q>;
  if (own(raw, "model") && typeof raw.model !== "string")
    issues.push("Response model is not a string");
  const {
    answers: _answers,
    model: _model,
    usage: _usage,
    ...providerMetadata
  } = raw;
  return {
    answers,
    raw,
    providerMetadata,
    issues,
    ...(typeof raw.model === "string" ? { actualModel: raw.model } : {}),
    ...(own(raw, "usage") ? { usage: raw.usage } : {}),
  };
}
