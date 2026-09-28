import {
  DEFAULT_EVALUATOR_CONFIG,
  MAX_MAX_OUTPUT_CHARS,
  MAX_TIMEOUT_MS,
  MIN_MAX_OUTPUT_CHARS,
  MIN_TIMEOUT_MS,
  type EvaluatorConfig,
} from "./contracts.js";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export interface CliConfig {
  config: EvaluatorConfig;
  showHelp: boolean;
  showVersion: boolean;
}

interface RawOptions {
  emacsclient?: string;
  socketName?: string;
  serverFile?: string;
  timeoutMs?: string;
  maxOutputChars?: string;
  showHelp: boolean;
  showVersion: boolean;
}

const OPTION_NAMES = new Set([
  "--emacsclient",
  "--socket-name",
  "--server-file",
  "--timeout-ms",
  "--max-output-chars",
]);

function requiredValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new ConfigError(`${name} requires a non-empty value.`);
  }
  return value;
}

function parseInteger(name: string, value: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) {
    throw new ConfigError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ConfigError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function parseArgs(args: readonly string[]): RawOptions {
  const options: RawOptions = { showHelp: false, showVersion: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) {
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.showHelp = true;
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      options.showVersion = true;
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const name = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    if (!OPTION_NAMES.has(name)) {
      throw new ConfigError(`Unknown option: ${argument}`);
    }
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    const value = requiredValue(name, inlineValue ?? args[++index]);

    if (name === "--emacsclient") {
      options.emacsclient = value;
    } else if (name === "--socket-name") {
      options.socketName = value;
    } else if (name === "--server-file") {
      options.serverFile = value;
    } else if (name === "--timeout-ms") {
      options.timeoutMs = value;
    } else {
      options.maxOutputChars = value;
    }
  }

  return options;
}

export function resolveConfig(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): CliConfig {
  const options = parseArgs(args);
  const socketName = options.socketName ?? env.EMACS_RUNTIME_MCP_SOCKET_NAME;
  const serverFile = options.serverFile ?? env.EMACS_RUNTIME_MCP_SERVER_FILE;

  if (socketName && serverFile) {
    throw new ConfigError("--socket-name and --server-file are mutually exclusive.");
  }

  const timeoutValue = options.timeoutMs ?? env.EMACS_RUNTIME_MCP_TIMEOUT_MS;
  const outputValue = options.maxOutputChars ?? env.EMACS_RUNTIME_MCP_MAX_OUTPUT_CHARS;
  const defaultTimeoutMs = timeoutValue
    ? parseInteger("timeout", timeoutValue, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
    : DEFAULT_EVALUATOR_CONFIG.defaultTimeoutMs;
  const defaultMaxOutputChars = outputValue
    ? parseInteger("max output", outputValue, MIN_MAX_OUTPUT_CHARS, MAX_MAX_OUTPUT_CHARS)
    : DEFAULT_EVALUATOR_CONFIG.defaultMaxOutputChars;

  return {
    config: {
      ...DEFAULT_EVALUATOR_CONFIG,
      emacsclientPath:
        options.emacsclient ??
        env.EMACS_RUNTIME_MCP_EMACSCLIENT ??
        DEFAULT_EVALUATOR_CONFIG.emacsclientPath,
      server: socketName
        ? { kind: "socket", value: socketName }
        : serverFile
          ? { kind: "server-file", value: serverFile }
          : { kind: "default" },
      defaultTimeoutMs,
      defaultMaxOutputChars,
    },
    showHelp: options.showHelp,
    showVersion: options.showVersion,
  };
}

export const CLI_USAGE = `Usage: emacs-runtime-mcp [options]

Options:
  --emacsclient <path>       emacsclient executable (env: EMACS_RUNTIME_MCP_EMACSCLIENT)
  --socket-name <name>       Emacs server socket/name (env: EMACS_RUNTIME_MCP_SOCKET_NAME)
  --server-file <path>       Explicit server file (env: EMACS_RUNTIME_MCP_SERVER_FILE)
  --timeout-ms <integer>     Default request timeout, 100-120000
  --max-output-chars <int>   Default value limit, 1-262144
  -h, --help                 Show help
  -V, --version              Show version`;
