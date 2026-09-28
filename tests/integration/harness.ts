import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_EVALUATOR_CONFIG,
  type EmacsEvalResult,
  type EvaluatorConfig,
} from "../../src/contracts.js";
import { evaluateEmacs } from "../../src/evaluate.js";

const execFileAsync = promisify(execFile);

export class IsolatedEmacs {
  readonly name = `mcp-test-${process.pid}-${Date.now()}`;
  readonly config: EvaluatorConfig = {
    ...DEFAULT_EVALUATOR_CONFIG,
    server: { kind: "socket", value: this.name },
  };

  private home: string | undefined;
  private previousHome: string | undefined;

  async start(): Promise<void> {
    this.home = await mkdtemp(join(tmpdir(), "emacs-runtime-mcp-"));
    this.previousHome = process.env.HOME;
    process.env.HOME = this.home;

    await execFileAsync("emacs", ["-Q", `--daemon=${this.name}`], {
      env: { ...process.env, HOME: this.home },
      timeout: 15_000,
    });

    let lastResult: EmacsEvalResult | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      lastResult = await this.evaluate("t");
      if (lastResult.ok) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Isolated Emacs did not become ready: ${JSON.stringify(lastResult)}`);
  }

  evaluate(
    expression: string,
    request: { timeout_ms?: number; max_output_chars?: number } = {},
    config: EvaluatorConfig = this.config,
  ): Promise<EmacsEvalResult> {
    return evaluateEmacs({ expression, ...request }, config);
  }

  async stop(): Promise<void> {
    try {
      await execFileAsync(
        "emacsclient",
        ["--alternate-editor=false", "--socket-name", this.name, "--eval", "(kill-emacs)"],
        {
          env: { ...process.env, ...(this.home ? { HOME: this.home } : {}) },
          timeout: 5_000,
        },
      );
    } catch {
      // A successful kill can close the client connection before it returns.
    } finally {
      if (this.previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = this.previousHome;
      }
      if (this.home) {
        await rm(this.home, { recursive: true, force: true });
      }
    }
  }
}
