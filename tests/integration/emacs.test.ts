import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_EVALUATOR_CONFIG } from "../../src/contracts.js";
import { evaluateEmacs } from "../../src/evaluate.js";
import { IsolatedEmacs } from "./harness.js";

describe.sequential("isolated Emacs integration", () => {
  const emacs = new IsolatedEmacs();

  beforeAll(async () => {
    await emacs.start();
  }, 20_000);

  afterAll(async () => {
    await emacs.stop();
  });

  it.each([
    ["primitive", "(+ 40 2)", "42"],
    ["list", '(list 1 "two" nil)', '(1 "two" nil)'],
    ["multiline", "(progn\n  (+ 1 2))", "3"],
    ["Unicode", '(concat "日本語" "👩‍💻")', '"日本語👩‍💻"'],
  ])("evaluates a %s value", async (_name, expression, value) => {
    await expect(emacs.evaluate(expression)).resolves.toMatchObject({
      ok: true,
      value,
      truncated: false,
      original_chars: Array.from(value).length,
    });
  });

  it("preserves runtime state across calls", async () => {
    await expect(emacs.evaluate("(setq emacs-runtime-mcp-test-state 41)")).resolves.toMatchObject({
      ok: true,
      value: "41",
    });
    await expect(emacs.evaluate("(1+ emacs-runtime-mcp-test-state)")).resolves.toMatchObject({
      ok: true,
      value: "42",
    });
  });

  it.each([
    ["unreadable input", "("],
    ["trailing form", "1 2"],
    ["trailing comment", "1 ; second item"],
  ])("rejects %s before evaluation", async (_name, expression) => {
    await expect(emacs.evaluate(expression)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_expression" },
    });
  });

  it("does not evaluate the first of multiple forms", async () => {
    await emacs.evaluate("(makunbound 'emacs-runtime-mcp-trailing-marker)");
    await expect(
      emacs.evaluate(
        "(setq emacs-runtime-mcp-trailing-marker 'bad) (setq emacs-runtime-mcp-trailing-marker 'worse)",
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_expression" },
    });
    await expect(
      emacs.evaluate("(boundp 'emacs-runtime-mcp-trailing-marker)"),
    ).resolves.toMatchObject({
      ok: true,
      value: "nil",
    });
  });

  it("classifies signaled Lisp conditions", async () => {
    await expect(emacs.evaluate('(error "bridge boom")')).resolves.toMatchObject({
      ok: false,
      error: {
        code: "elisp_error",
        data: { symbol: "error" },
      },
    });
  });

  it("counts and truncates Emacs characters rather than bytes or graphemes", async () => {
    const complete = await emacs.evaluate('(concat "é" "👩‍💻")');
    expect(complete).toMatchObject({
      ok: true,
      value: '"é👩‍💻"',
      truncated: false,
      original_chars: 7,
    });

    const truncated = await emacs.evaluate('(concat "é" "👩‍💻")', {
      max_output_chars: 6,
    });
    expect(truncated).toMatchObject({
      ok: true,
      value: '"é👩‍💻',
      truncated: true,
      original_chars: 7,
    });
  });

  it("does not start a fallback for an unavailable explicit server", async () => {
    const missingConfig = {
      ...DEFAULT_EVALUATOR_CONFIG,
      server: { kind: "socket", value: `${emacs.name}-missing` } as const,
    };

    await expect(evaluateEmacs({ expression: "t" }, missingConfig)).resolves.toMatchObject({
      ok: false,
      error: { code: "emacs_unavailable" },
    });
    await expect(evaluateEmacs({ expression: "t" }, missingConfig)).resolves.toMatchObject({
      ok: false,
      error: { code: "emacs_unavailable" },
    });
  });

  it("recovers after timeout only after health and relevant-state probes", async () => {
    await emacs.evaluate("(makunbound 'emacs-runtime-mcp-timeout-marker)");
    await expect(
      emacs.evaluate("(progn (sleep-for 0.3) (setq emacs-runtime-mcp-timeout-marker 'finished))", {
        timeout_ms: 100,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "evaluation_timeout" },
    });

    await new Promise((resolve) => setTimeout(resolve, 350));
    await expect(emacs.evaluate("(+ 1 1)")).resolves.toMatchObject({
      ok: true,
      value: "2",
    });
    await expect(
      emacs.evaluate(
        "(and (boundp 'emacs-runtime-mcp-timeout-marker) emacs-runtime-mcp-timeout-marker)",
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: "finished",
    });

    await expect(
      emacs.evaluate("(setq emacs-runtime-mcp-post-timeout 'verified)"),
    ).resolves.toMatchObject({
      ok: true,
      value: "verified",
    });
  });

  it("recovers after a transport-limit failure", async () => {
    const limitedConfig = { ...emacs.config, maxTransportBytes: 64 };
    await expect(emacs.evaluate("(make-string 100 ?x)", {}, limitedConfig)).resolves.toMatchObject({
      ok: false,
      error: { code: "output_too_large" },
    });
    await expect(emacs.evaluate("(emacs-pid)")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("supports the Skill discovery flow for built-in, user, and dynamically loaded code", async () => {
    await expect(
      emacs.evaluate(
        "(list (commandp 'forward-char) (help-function-arglist 'forward-char t) (symbol-file 'forward-char 'defun))",
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: "(t (&optional n) nil)",
    });

    await emacs.evaluate(
      '(defun emacs-runtime-mcp-user-function (value) "Test function." (+ value 1))',
    );
    await expect(
      emacs.evaluate(
        "(list (and (memq 'emacs-runtime-mcp-user-function (apropos-internal \"emacs-runtime-mcp-user\" #'fboundp)) t) (help-function-arglist 'emacs-runtime-mcp-user-function t) (emacs-runtime-mcp-user-function 41))",
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: "(t (value) 42)",
    });

    await expect(
      emacs.evaluate(
        "(progn (require 'calendar) (list (featurep 'calendar) (commandp 'calendar) (symbol-file 'calendar 'defun)))",
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: expect.stringMatching(/^\(t t ".+calendar.+"/),
    });
  });
});
