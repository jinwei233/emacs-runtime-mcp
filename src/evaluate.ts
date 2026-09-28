import { buildBridgeExpression, decodeBridgeOutput } from "./bridge.js";
import {
  DEFAULT_EVALUATOR_CONFIG,
  type EmacsEvalFailure,
  type EmacsEvalResult,
  type EvaluatorConfig,
  type NormalizedEmacsEvalRequest,
} from "./contracts.js";
import { type ProcessRunner, runProcess } from "./process.js";
import { validateRequest } from "./validation.js";

const CONNECTION_ERROR_PATTERN =
  /can't find socket|cannot connect|connection refused|no such file|server.*not.*running|connect.*failed/i;

export interface EvaluatorDependencies {
  runProcess: ProcessRunner;
}

function failure(
  code: EmacsEvalFailure["error"]["code"],
  message: string,
  elapsedMs: number,
  data?: Record<string, unknown>,
): EmacsEvalFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
    elapsed_ms: elapsedMs,
  };
}

function buildArguments(request: NormalizedEmacsEvalRequest, config: EvaluatorConfig): string[] {
  const args = ["--alternate-editor=false"];
  if (config.server.kind === "socket") {
    args.push("--socket-name", config.server.value);
  } else if (config.server.kind === "server-file") {
    args.push("--server-file", config.server.value);
  }
  args.push("--eval", buildBridgeExpression(request.expression, request.max_output_chars));
  return args;
}

function isUnavailable(stderr: string): boolean {
  return CONNECTION_ERROR_PATTERN.test(stderr);
}

export async function evaluateEmacs(
  input: unknown,
  config: EvaluatorConfig = DEFAULT_EVALUATOR_CONFIG,
  dependencies: EvaluatorDependencies = { runProcess },
): Promise<EmacsEvalResult> {
  const request = validateRequest(input, {
    timeoutMs: config.defaultTimeoutMs,
    maxOutputChars: config.defaultMaxOutputChars,
  });
  if ("ok" in request) {
    return request;
  }

  try {
    const processResult = await dependencies.runProcess(
      config.emacsclientPath,
      buildArguments(request, config),
      {
        timeoutMs: request.timeout_ms,
        maxOutputBytes: config.maxTransportBytes,
      },
    );

    if (processResult.status === "timed_out") {
      return failure(
        "evaluation_timeout",
        "The emacsclient request timed out. Server-side Lisp may still be running; re-probe runtime state before another mutation.",
        processResult.elapsedMs,
      );
    }
    if (processResult.status === "output_too_large") {
      return failure(
        "output_too_large",
        "emacsclient output exceeded the hard transport limit.",
        processResult.elapsedMs,
      );
    }
    if (processResult.status === "spawn_error") {
      return failure(
        "emacs_unavailable",
        `Unable to start emacsclient: ${processResult.error.message}`,
        processResult.elapsedMs,
      );
    }
    if (processResult.exitCode !== 0) {
      const message =
        processResult.stderr.trim() || `emacsclient exited with code ${processResult.exitCode}.`;
      const code = isUnavailable(message) ? "emacs_unavailable" : "bridge_protocol_error";
      return failure(code, message, processResult.elapsedMs, {
        exit_code: processResult.exitCode,
        signal: processResult.signal,
      });
    }

    try {
      return {
        ...decodeBridgeOutput(processResult.stdout),
        elapsed_ms: processResult.elapsedMs,
      };
    } catch (error) {
      return failure(
        "bridge_protocol_error",
        error instanceof Error ? error.message : "Unable to decode the bridge response.",
        processResult.elapsedMs,
      );
    }
  } catch (error) {
    return failure(
      "internal_error",
      error instanceof Error ? error.message : "Unexpected evaluation failure.",
      0,
    );
  }
}

export function createEvaluator(
  config: EvaluatorConfig,
  dependencies: EvaluatorDependencies = { runProcess },
): (input: unknown) => Promise<EmacsEvalResult> {
  return (input) => evaluateEmacs(input, config, dependencies);
}
