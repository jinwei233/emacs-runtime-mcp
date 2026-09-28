#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { CLI_USAGE, ConfigError, resolveConfig } from "./config.js";
import { createEvaluator } from "./evaluate.js";
import { createMcpServer, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  const cli = resolveConfig(process.argv.slice(2));
  if (cli.showHelp) {
    process.stdout.write(`${CLI_USAGE}\n`);
    return;
  }
  if (cli.showVersion) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  const server = createMcpServer(createEvaluator(cli.config));
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const prefix = error instanceof ConfigError ? "Configuration error" : "Fatal error";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${prefix}: ${message}\n`);
  process.exitCode = 1;
});
