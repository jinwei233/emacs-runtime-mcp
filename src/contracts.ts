export const TOOL_NAME = "emacs_eval";

export const DEFAULT_TIMEOUT_MS = 10_000;
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 120_000;

export const DEFAULT_MAX_OUTPUT_CHARS = 65_536;
export const MIN_MAX_OUTPUT_CHARS = 1;
export const MAX_MAX_OUTPUT_CHARS = 262_144;
export const MAX_EXPRESSION_CHARS = 262_144;
export const MAX_TRANSPORT_BYTES = 1_048_576;

export const ERROR_CODES = [
  "invalid_request",
  "invalid_expression",
  "emacs_unavailable",
  "elisp_error",
  "evaluation_timeout",
  "output_too_large",
  "bridge_protocol_error",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface EmacsEvalRequest {
  expression: string;
  timeout_ms?: number;
  max_output_chars?: number;
}

export interface NormalizedEmacsEvalRequest {
  expression: string;
  timeout_ms: number;
  max_output_chars: number;
}

export interface EmacsEvalSuccess {
  ok: true;
  value: string;
  truncated: boolean;
  original_chars: number;
  elapsed_ms: number;
}

export interface EmacsEvalFailure {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    data?: Record<string, unknown>;
  };
  elapsed_ms: number;
}

export type EmacsEvalResult = EmacsEvalSuccess | EmacsEvalFailure;

export type BridgeSuccess = Omit<EmacsEvalSuccess, "elapsed_ms">;
export type BridgeFailure = Omit<EmacsEvalFailure, "elapsed_ms">;
export type BridgeResult = BridgeSuccess | BridgeFailure;

export type ServerSelection =
  | { kind: "default" }
  | { kind: "socket"; value: string }
  | { kind: "server-file"; value: string };

export interface EvaluatorConfig {
  emacsclientPath: string;
  server: ServerSelection;
  defaultTimeoutMs: number;
  defaultMaxOutputChars: number;
  maxTransportBytes: number;
}

export const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  emacsclientPath: "emacsclient",
  server: { kind: "default" },
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  defaultMaxOutputChars: DEFAULT_MAX_OUTPUT_CHARS,
  maxTransportBytes: MAX_TRANSPORT_BYTES,
};
