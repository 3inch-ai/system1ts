import type { Client, Decision, AnswerFor } from "../src/index.js";
const questions = {
  p: { type: "predicate", instructions: "?" },
  c: {
    type: "choice",
    instructions: "?",
    choices: [{ value: true }, { value: "true" }, { value: "billing" }],
  },
  s: {
    type: "score",
    instructions: "?",
    levels: [{ label: "low" }, { label: "high" }],
  },
} as const;
function check(r: Decision<typeof questions>) {
  if (r.answers.c.status === "ok") {
    const selected: true | "true" | "billing" = r.answers.c.choice;
    // @ts-expect-error boolean true and string true are not interchangeable
    const wrong: false = selected;
    // @ts-expect-error choice answers have no predicate probability
    r.answers.c.probability;
    void wrong;
  }
  if (r.answers.p.status === "ok") {
    const n: number = r.answers.p.probability;
    void n;
  }
  if (r.answers.s.status === "ok") {
    const label: "low" = r.answers.s.levels[0].label;
    void label;
  }
  // @ts-expect-error only the supplied question names exist
  r.answers.nonexistent;
}
async function infer(c: Client) {
  check(await c.decide({ input: "text", questions }));
}
type Predicate = AnswerFor<typeof questions.p>;
void (undefined as unknown as Predicate);
void infer;
