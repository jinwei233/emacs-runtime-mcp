import { describe, expect, it } from "vitest";
import { buildBridgeExpression, decodeBridgeOutput, encodeExpression } from "../src/bridge.js";

function encodedOutput(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `${JSON.stringify(encoded)}\n`;
}

describe("bridge protocol", () => {
  it("transports the caller expression only as UTF-8 base64 data", () => {
    const expression = '(progn (message "$HOME; $(touch /tmp/nope)")\n(list "日本語" 1))';
    const wrapper = buildBridgeExpression(expression, 128);

    expect(wrapper).not.toContain(expression);
    expect(wrapper).toContain(`base64-decode-string "${encodeExpression(expression)}"`);
    expect(wrapper).toContain("(max-output 128)");
    expect(wrapper).toContain("read-from-string");
    expect(wrapper).toContain("prin1-to-string (eval form)");
  });

  it("decodes an exact success envelope", () => {
    expect(
      decodeBridgeOutput(
        encodedOutput({
          ok: true,
          value: '"é👩‍💻"',
          truncated: false,
          original_chars: 7,
        }),
      ),
    ).toEqual({
      ok: true,
      value: '"é👩‍💻"',
      truncated: false,
      original_chars: 7,
    });
  });

  it("decodes an exact failure envelope", () => {
    expect(
      decodeBridgeOutput(
        encodedOutput({
          ok: false,
          error: {
            code: "elisp_error",
            message: "Symbol's value as variable is void: missing",
            data: { symbol: "void-variable" },
          },
        }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "elisp_error",
        message: "Symbol's value as variable is void: missing",
        data: { symbol: "void-variable" },
      },
    });
  });

  it.each([
    ["unquoted output", "abc\n"],
    ["surrounding whitespace", ' "YWJj"\n'],
    ["invalid base64", '"%%%%"\n'],
    ["invalid JSON", `"${Buffer.from("nope").toString("base64")}"\n`],
    ["invalid envelope", encodedOutput({ ok: true, value: "nil", truncated: false })],
    [
      "unexpected field",
      encodedOutput({
        ok: true,
        value: "nil",
        truncated: false,
        original_chars: 3,
        extra: true,
      }),
    ],
  ])("rejects %s", (_name, output) => {
    expect(() => decodeBridgeOutput(output)).toThrow();
  });
});
