import { McpServer } from "@modelcontextprotocol/server";
import { TOOL_NAME, type EmacsEvalRequest, type EmacsEvalResult } from "./contracts.js";
import { emacsEvalInputSchema, emacsEvalOutputSchema } from "./schemas.js";

export const SERVER_NAME = "emacs-runtime-mcp";
export const SERVER_VERSION = "0.1.0";

export type EvaluateFunction = (request: EmacsEvalRequest) => Promise<EmacsEvalResult>;

export function createMcpServer(evaluate: EvaluateFunction): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    TOOL_NAME,
    {
      title: "Evaluate Emacs Lisp",
      description:
        "Evaluate exactly one Emacs Lisp form in an already-running trusted local Emacs server.",
      inputSchema: emacsEvalInputSchema,
      outputSchema: emacsEvalOutputSchema,
    },
    async (request) => {
      const result = await evaluate(request as EmacsEvalRequest);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
        isError: !result.ok,
      };
    },
  );

  return server;
}
