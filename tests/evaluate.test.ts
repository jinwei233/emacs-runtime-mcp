import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBridgeExpression } from "../src/bridge.js";
import {
  DEFAULT_EVALUATOR_CONFIG,
  type BridgeResult,
  type EvaluatorConfig,
  type ServerSelection,
} from "../src/contracts.js";
import { evaluateEmacs } from "../src/evaluate.js";

const fakeEmacsclient = fileURLToPath(new URL("./fixtures/fake-emacsclient.mjs", import.meta.url));

function config(
  server: ServerSelection = { kind: "default" },
  overrides: Partial<EvaluatorConfig> = {},
): EvaluatorConfig {
  return {
    ...DEFAULT_EVALUATOR_CONFIG,
    emacsclientPath: fakeEmacsclient,
    server,
    ...overrides,
  };
}

function fakeResponse(payload: BridgeResult): string {
  return `FAKE_RESPONSE:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
}

async function recordedArgs(server: ServerSelection): Promise<string[]> {
  const recordPath = join(
    tmpdir(),
    `emacs-runtime-mcp-argv-${process.pid}-${Math.random().toString(16).slice(2)}.json`,
  );
  const expression = `FAKE_RECORD:${Buffer.from(recordPath, "utf8").toString("base64")}`;
  const result = await evaluateEmacs({ expression }, config(server));
  expect(result.ok).toBe(true);
  return JSON.parse(await readFile(recordPath, "utf8")) as string[];
}

describe("emacsclient invocation", () => {
  it.each([
    ["default", { kind: "default" } as const, []],
    ["socket name", { kind: "socket", value: "mcp-test" } as const, ["--socket-name", "mcp-test"]],
    [
      "server file",
      { kind: "server-file", value: "/tmp/mcp-test/server" } as const,
      ["--server-file", "/tmp/mcp-test/server"],
    ],
  ])("forwards exact argv for %s selection", async (_name, server, selectorArgs) => {
    const args = await recordedArgs(server);
    const expression = Buffer.from(
      args.at(-1)?.match(/base64-decode-string "([A-Za-z0-9+/]+={0,2})"/)?.[1] ?? "",
      "base64",
    ).toString("utf8");

    expect(args).toEqual([
      "--alternate-editor=false",
      ...selectorArgs,
      "--eval",
      buildBridgeExpression(expression, DEFAULT_EVALUATOR_CONFIG.defaultMaxOutputChars),
    ]);
  });
});

describe("evaluation result mapping", () => {
  it("preserves success metadata including value-only truncation", async () => {
    const result = await evaluateEmacs(
      {
        expression: fakeResponse({
          ok: true,
          value: '"é👩"',
          truncated: true,
          original_chars: 7,
        }),
        max_output_chars: 4,
      },
      config(),
    );

    expect(result).toMatchObject({
      ok: true,
      value: '"é👩"',
      truncated: true,
      original_chars: 7,
    });
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it("preserves classified bridge failures", async () => {
    const result = await evaluateEmacs(
      {
        expression: fakeResponse({
          ok: false,
          error: {
            code: "invalid_expression",
            message: "Invalid read syntax",
            data: { symbol: "invalid-read-syntax" },
          },
        }),
      },
      config(),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_expression",
        message: "Invalid read syntax",
        data: { symbol: "invalid-read-syntax" },
      },
    });
  });

  it.each([
    ["connection failure", "FAKE_CONNECTION_FAILURE", "emacs_unavailable", {}],
    ["timeout", "FAKE_TIMEOUT", "evaluation_timeout", { timeout_ms: 100 }],
    ["malformed response", "FAKE_MALFORMED", "bridge_protocol_error", {}],
    ["transport overflow", "FAKE_EXCESSIVE", "output_too_large", {}],
  ])("maps %s", async (_name, expression, code, requestOptions) => {
    const result = await evaluateEmacs(
      { expression, ...requestOptions },
      config(
        { kind: "default" },
        expression === "FAKE_EXCESSIVE" ? { maxTransportBytes: 512 } : {},
      ),
    );

    expect(result).toMatchObject({ ok: false, error: { code } });
  });

  it("maps a missing executable to emacs_unavailable", async () => {
    const result = await evaluateEmacs(
      { expression: "nil" },
      config({ kind: "default" }, { emacsclientPath: "/definitely/missing/emacsclient" }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "emacs_unavailable" },
    });
  });
});
