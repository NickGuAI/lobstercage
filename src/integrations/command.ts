import { spawn } from "node:child_process";

export type ExternalCommandResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  notFound: boolean;
};

export type ExternalCommandOptions = {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

/** Execute an external command with bounded runtime and captured output. */
export async function runExternalCommand(
  command: string,
  args: string[],
  options: ExternalCommandOptions = {}
): Promise<ExternalCommandResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise<ExternalCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let notFound = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finalize = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        stdout,
        stderr,
        timedOut,
        notFound,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Best-effort hard kill if the process ignores SIGTERM.
      setTimeout(() => child.kill("SIGKILL"), 1_500).unref();
    }, timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        notFound = true;
      } else {
        stderr += `${String(error)}\n`;
      }
      finalize(null);
    });

    child.on("close", (code) => {
      finalize(code);
    });
  });
}
