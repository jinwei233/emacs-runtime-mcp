import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmacsEvalResult } from "../src/contracts.js";
import { createMcpServer, type EvaluateFunction } from "../src/server.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function connectedPair(evaluate: EvaluateFunction) {
  const server = createMcpServer(evaluate);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return { client, server };
}

describe("MCP server", () => {
  it("lists exactly one emacs_eval tool", async () => {
    const evaluate = vi.fn<EvaluateFunction>();
    const { client } = await connectedPair(evaluate);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual(["emacs_eval"]);
    expect(result.tools[0]?.inputSchema).toMatchObject({
      type: "object",
      required: ["expression"],
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "success",
      {
        ok: true,
        value: "(1 2 3)",
        truncated: false,
        original_chars: 7,
        elapsed_ms: 3,
      } satisfies EmacsEvalResult,
      false,
    ],
    [
      "failure",
      {
        ok: false,
        error: { code: "elisp_error", message: "boom" },
        elapsed_ms: 4,
      } satisfies EmacsEvalResult,
      true,
    ],
  ])("returns matching structured and text envelopes for %s", async (_name, envelope, isError) => {
    const evaluate = vi.fn<EvaluateFunction>().mockResolvedValue(envelope);
    const { client } = await connectedPair(evaluate);

    const result = await client.callTool({
      name: "emacs_eval",
      arguments: { expression: "(list 1 2 3)" },
    });

    expect(result.structuredContent).toEqual(envelope);
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(envelope) }]);
    expect(result.isError).toBe(isError);
    expect(evaluate).toHaveBeenCalledWith({ expression: "(list 1 2 3)" });
  });
});
