import { spawn } from "node:child_process";

const KILL_GRACE_MS = 250;

interface RunProcessOptions {
  timeoutMs: number;
  maxOutputBytes: number;
}

interface ProcessOutput {
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

export type ProcessResult =
  | (ProcessOutput & {
      status: "completed";
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    })
  | (ProcessOutput & { status: "timed_out" })
  | (ProcessOutput & { status: "output_too_large" })
  | (ProcessOutput & { status: "spawn_error"; error: Error });

export type ProcessRunner = (
  executable: string,
  args: readonly string[],
  options: RunProcessOptions,
) => Promise<ProcessResult>;

export const runProcess: ProcessRunner = (executable, args, options) =>
  new Promise((resolve) => {
    const startedAt = performance.now();
    const child = spawn(executable, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let terminalStatus: "timed_out" | "output_too_large" | undefined;
    let spawnError: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const elapsedMs = () => Math.max(0, Math.round(performance.now() - startedAt));
    const output = (): ProcessOutput => ({
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
      elapsedMs: elapsedMs(),
    });

    const terminate = (status: "timed_out" | "output_too_large") => {
      if (terminalStatus) {
        return;
      }
      terminalStatus = status;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, KILL_GRACE_MS);
      killTimer.unref();
    };

    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      const remaining = Math.max(0, options.maxOutputBytes - outputBytes + chunk.length);
      if (remaining > 0) {
        target.push(chunk.subarray(0, remaining));
      }
      if (outputBytes > options.maxOutputBytes) {
        terminate("output_too_large");
      }
    };

    child.stdout.on("data", (chunk: Buffer) => collect(stdoutChunks, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderrChunks, chunk));
    child.on("error", (error) => {
      spawnError = error;
    });

    const timeout = setTimeout(() => terminate("timed_out"), options.timeoutMs);
    timeout.unref();

    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }

      if (terminalStatus) {
        resolve({ status: terminalStatus, ...output() });
        return;
      }
      if (spawnError) {
        resolve({ status: "spawn_error", error: spawnError, ...output() });
        return;
      }
      resolve({ status: "completed", exitCode, signal, ...output() });
    });
  });
