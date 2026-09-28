import {
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_TIMEOUT_MS,
  MAX_EXPRESSION_CHARS,
  MAX_MAX_OUTPUT_CHARS,
  MAX_TIMEOUT_MS,
  MIN_MAX_OUTPUT_CHARS,
  MIN_TIMEOUT_MS,
  type EmacsEvalFailure,
  type NormalizedEmacsEvalRequest,
} from "./contracts.js";

function invalidRequest(message: string): EmacsEvalFailure {
  return {
    ok: false,
    error: {
      code: "invalid_request",
      message,
    },
    elapsed_ms: 0,
  };
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

const REQUEST_FIELDS = new Set(["expression", "timeout_ms", "max_output_chars"]);

export function validateRequest(
  input: unknown,
  defaults: {
    timeoutMs?: number;
    maxOutputChars?: number;
  } = {},
): NormalizedEmacsEvalRequest | EmacsEvalFailure {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidRequest("Request must be an object.");
  }

  const request = input as Record<string, unknown>;
  const unknownField = Object.keys(request).find((field) => !REQUEST_FIELDS.has(field));
  if (unknownField) {
    return invalidRequest(`Unknown request field: ${unknownField}.`);
  }
  const expression = request.expression;

  if (typeof expression !== "string") {
    return invalidRequest("expression must be a string.");
  }
  if (expression.trim().length === 0) {
    return invalidRequest("expression must not be empty.");
  }
  if (characterCount(expression) > MAX_EXPRESSION_CHARS) {
    return invalidRequest(`expression must contain at most ${MAX_EXPRESSION_CHARS} characters.`);
  }

  const timeoutMs = request.timeout_ms ?? defaults.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    return invalidRequest(
      `timeout_ms must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}.`,
    );
  }

  const maxOutputChars =
    request.max_output_chars ?? defaults.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  if (
    typeof maxOutputChars !== "number" ||
    !Number.isInteger(maxOutputChars) ||
    maxOutputChars < MIN_MAX_OUTPUT_CHARS ||
    maxOutputChars > MAX_MAX_OUTPUT_CHARS
  ) {
    return invalidRequest(
      `max_output_chars must be an integer from ${MIN_MAX_OUTPUT_CHARS} to ${MAX_MAX_OUTPUT_CHARS}.`,
    );
  }

  return {
    expression,
    timeout_ms: timeoutMs,
    max_output_chars: maxOutputChars,
  };
}
