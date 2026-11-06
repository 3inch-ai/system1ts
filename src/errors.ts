import type { ErrorCode, ErrorDetails } from "./types.js";

/** Messages never include request bodies, headers, or upstream error text. */
export class System1Error extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;
  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "System1Error";
    this.code = code;
    // Diagnostic payloads are opt-in to inspect, not serialized by default.
    Object.defineProperty(this, "details", {
      value: details,
      enumerable: false,
    });
    this.details = details;
  }
}
