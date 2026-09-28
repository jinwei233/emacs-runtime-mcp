import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_OUTPUT_CHARS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from "../src/contracts.js";
import { ConfigError, resolveConfig } from "../src/config.js";

describe("CLI configuration", () => {
  it("uses shared defaults", () => {
    expect(resolveConfig([], {})).toMatchObject({
      config: {
        emacsclientPath: "emacsclient",
        server: { kind: "default" },
        defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
        defaultMaxOutputChars: DEFAULT_MAX_OUTPUT_CHARS,
      },
      showHelp: false,
      showVersion: false,
    });
  });

  it("reads environment configuration", () => {
    expect(
      resolveConfig([], {
        EMACS_RUNTIME_MCP_EMACSCLIENT: "/opt/emacs/bin/emacsclient",
        EMACS_RUNTIME_MCP_SOCKET_NAME: "work",
        EMACS_RUNTIME_MCP_TIMEOUT_MS: "2500",
        EMACS_RUNTIME_MCP_MAX_OUTPUT_CHARS: "2048",
      }),
    ).toMatchObject({
      config: {
        emacsclientPath: "/opt/emacs/bin/emacsclient",
        server: { kind: "socket", value: "work" },
        defaultTimeoutMs: 2500,
        defaultMaxOutputChars: 2048,
      },
    });
  });

  it("lets CLI values override the same environment values", () => {
    expect(
      resolveConfig(
        ["--emacsclient=/cli/emacsclient", "--socket-name", "cli", "--timeout-ms", "3000"],
        {
          EMACS_RUNTIME_MCP_EMACSCLIENT: "/env/emacsclient",
          EMACS_RUNTIME_MCP_SOCKET_NAME: "env",
          EMACS_RUNTIME_MCP_TIMEOUT_MS: "2000",
        },
      ),
    ).toMatchObject({
      config: {
        emacsclientPath: "/cli/emacsclient",
        server: { kind: "socket", value: "cli" },
        defaultTimeoutMs: 3000,
      },
    });
  });

  it.each([
    ["two CLI selectors", ["--socket-name", "one", "--server-file", "/tmp/server"], {}],
    [
      "selectors split across CLI and environment",
      ["--socket-name", "one"],
      { EMACS_RUNTIME_MCP_SERVER_FILE: "/tmp/server" },
    ],
  ])("rejects %s", (_name, args, env) => {
    expect(() => resolveConfig(args, env)).toThrow(ConfigError);
    expect(() => resolveConfig(args, env)).toThrow("mutually exclusive");
  });

  it.each([
    [["--unknown"], "Unknown option"],
    [["--server-file"], "requires a non-empty value"],
    [["--timeout-ms", String(MAX_TIMEOUT_MS + 1)], "timeout must be an integer"],
    [["--max-output-chars", "1.5"], "max output must be an integer"],
  ])("rejects invalid arguments", (args, message) => {
    expect(() => resolveConfig(args, {})).toThrow(message);
  });
});
