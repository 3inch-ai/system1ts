export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };
export type Content =
  string | readonly Json[] | { readonly [key: string]: Json };
export type ChoiceValue = string | boolean;
export interface ChoiceOption {
  readonly value: ChoiceValue;
  readonly description?: Content | null;
}
export interface Level {
  readonly label: string;
  readonly description?: Content;
}
export interface PredicateQuestion {
  readonly type: "predicate";
  readonly instructions?: Content | null;
  readonly criteria?: {
    readonly true?: Content | null;
    readonly false?: Content | null;
  };
}
export interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions?: Content | null;
  readonly choices: readonly ChoiceOption[];
}
export interface ScoreQuestion {
  readonly type: "score";
  readonly instructions?: Content | null;
  readonly levels: readonly Level[];
}
export type Question = PredicateQuestion | ChoiceQuestion | ScoreQuestion;
export type Questions = Readonly<Record<string, Question>>;
export interface OpenAIOptions {
  readonly prompt_cache_key?: string | null;
  readonly prompt_cache_options?: {
    readonly mode?: "implicit" | "explicit" | null;
    readonly ttl?: "30m";
  } | null;
  readonly safety_identifier?: string | null;
  /** Marks the end of a text input as an explicit reusable prefix. */
  readonly inputTextCacheBreakpoint?: boolean;
}
export interface SystemOneOptions {
  /** Only options supported by the specific compatible server; never applied to official Jev by default. */
  readonly extraBody?: Readonly<Record<string, Json>>;
}
export interface DecideRequest<Q extends Questions = Questions> {
  readonly input: Content;
  readonly questions: Q;
  readonly providerOptions?: OpenAIOptions | SystemOneOptions;
}
export interface CallOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}
export interface Confidence {
  readonly value: number;
  readonly source: string;
  readonly meaning: string;
}
export interface InvalidAnswer {
  readonly status: "invalid";
  readonly issues: readonly string[];
  readonly raw: unknown;
}
export interface RefusedAnswer {
  readonly status: "refused";
  readonly raw: unknown;
}
export interface AnswerBase {
  readonly status: "ok";
  readonly raw: unknown;
  readonly confidence?: Confidence;
}
export interface PredicateAnswer extends AnswerBase {
  readonly type: "predicate";
  readonly probability: number;
}
export interface ChoiceAnswer<
  V extends ChoiceValue = ChoiceValue,
> extends AnswerBase {
  readonly type: "choice";
  readonly choice: V;
  readonly probabilities?: readonly {
    readonly value: V;
    readonly probability: number;
  }[];
}
export interface ScoreAnswer<
  L extends readonly Level[] = readonly Level[],
> extends AnswerBase {
  readonly type: "score";
  readonly score: number;
  readonly levels: L;
  readonly probabilities?: readonly {
    readonly value: number;
    readonly label: string;
    readonly probability: number;
  }[];
  readonly computedScore?: number;
}
export type AnswerFor<Q extends Question> =
  | InvalidAnswer
  | RefusedAnswer
  | (Q extends PredicateQuestion
      ? PredicateAnswer
      : Q extends ChoiceQuestion
        ? ChoiceAnswer<Q["choices"][number]["value"]>
        : Q extends ScoreQuestion
          ? ScoreAnswer<Q["levels"]>
          : never);
export type Answers<Q extends Questions> = {
  readonly [K in keyof Q]: AnswerFor<Q[K]>;
};
export interface Normalized<Q extends Questions> {
  readonly answers: Answers<Q>;
  readonly raw: unknown;
  readonly providerMetadata: Readonly<Record<string, unknown>>;
  readonly actualModel?: string;
  readonly usage?: unknown;
  readonly issues: readonly string[];
}
export interface Decision<Q extends Questions> extends Normalized<Q> {
  readonly requestedModel: string;
  readonly http: {
    readonly status: number;
    readonly requestId?: string;
    readonly headers: Readonly<Record<string, string>>;
  };
}
export interface Capabilities {
  readonly questionTypes: readonly Question["type"][];
  readonly maxQuestions?: number;
  readonly maxChoices: number;
  readonly minChoices: number;
  readonly maxLevels: number;
  readonly minLevels: number;
  readonly booleanChoices: boolean;
  readonly structuredInstructions: boolean;
  readonly refusal: boolean;
  readonly completeDistributions: boolean;
}
export interface Adapter {
  readonly id: string;
  readonly path: string;
  readonly capabilities: Capabilities;
  encode<Q extends Questions>(
    request: DecideRequest<Q>,
    model: string,
  ): Record<string, unknown>;
  decode<Q extends Questions>(raw: unknown, questions: Q): Normalized<Q>;
}
export interface ClientOptions {
  readonly adapter: Adapter;
  readonly baseURL: string;
  readonly model: string;
  readonly provider?: string;
  readonly apiKey?: string | undefined;
  readonly headers?: HeadersInit;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}
export interface Client {
  readonly capabilities: Capabilities;
  decide<const Q extends Questions>(
    request: DecideRequest<Q>,
    options?: CallOptions,
  ): Promise<Decision<Q>>;
}
export type ErrorCode =
  | "unsupported"
  | "invalid_request"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "aborted"
  | "network"
  | "http"
  | "invalid_response";
export interface ErrorDetails {
  readonly question?: string;
  readonly feature?: string;
  readonly endpoint?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly rawBody?: string;
  readonly raw?: unknown;
  readonly originalCause?: unknown;
}
