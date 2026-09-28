import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EVALUATOR_CONFIG,
  MAX_EXPRESSION_CHARS,
  MAX_MAX_OUTPUT_CHARS,
  MAX_TIMEOUT_MS,
  MIN_MAX_OUTPUT_CHARS,
  MIN_TIMEOUT_MS,
} from "../src/contracts.js";
import { evaluateEmacs } from "../src/evaluate.js";
import type { ProcessRunner } from "../src/process.js";

describe("request validation", () => {
  const invalidInputs: Array<[string, unknown]> = [
    ["non-object request", null],
    ["non-string expression", { expression: 42 }],
    ["unknown field", { expression: "nil", unexpected: true }],
    ["empty expression", { expression: " \n\t" }],
    ["oversized expression", { expression: "x".repeat(MAX_EXPRESSION_CHARS + 1) }],
    ["fractional timeout", { expression: "nil", timeout_ms: 100.5 }],
    ["short timeout", { expression: "nil", timeout_ms: MIN_TIMEOUT_MS - 1 }],
    ["long timeout", { expression: "nil", timeout_ms: MAX_TIMEOUT_MS + 1 }],
    ["small output limit", { expression: "nil", max_output_chars: MIN_MAX_OUTPUT_CHARS - 1 }],
    ["large output limit", { expression: "nil", max_output_chars: MAX_MAX_OUTPUT_CHARS + 1 }],
  ];

  it.each(invalidInputs)("rejects %s without invoking emacsclient", async (_name, input) => {
    const runner = vi.fn<ProcessRunner>();

    const result = await evaluateEmacs(input, DEFAULT_EVALUATOR_CONFIG, {
      runProcess: runner,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
      elapsed_ms: 0,
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("applies configured defaults before invoking emacsclient", async () => {
    const runner = vi.fn<ProcessRunner>().mockResolvedValue({
      status: "completed",
      stdout:
        '"eyJvayI6dHJ1ZSwidmFsdWUiOiJuaWwiLCJ0cnVuY2F0ZWQiOmZhbHNlLCJvcmlnaW5hbF9jaGFycyI6M30="\n',
      stderr: "",
      exitCode: 0,
      signal: null,
      elapsedMs: 2,
    });

    const result = await evaluateEmacs(
      { expression: "nil" },
      {
        ...DEFAULT_EVALUATOR_CONFIG,
        defaultTimeoutMs: 1_234,
        defaultMaxOutputChars: 432,
      },
      { runProcess: runner },
    );

    expect(result).toEqual({
      ok: true,
      value: "nil",
      truncated: false,
      original_chars: 3,
      elapsed_ms: 2,
    });
    expect(runner).toHaveBeenCalledWith("emacsclient", expect.arrayContaining(["--eval"]), {
      timeoutMs: 1_234,
      maxOutputBytes: 1_048_576,
    });
    const args = runner.mock.calls[0]?.[1] ?? [];
    expect(args.at(-1)).toContain("(max-output 432)");
  });
});
