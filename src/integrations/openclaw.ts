import { runExternalCommand } from "./command.js";

export type OpenClawResult = {
  ok: boolean;
  available: boolean;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

/** Wrapper for OpenClaw CLI with graceful availability handling. */
export async function runOpenClaw(args: string[]): Promise<OpenClawResult> {
  const result = await runExternalCommand("openclaw", args, { timeoutMs: 30_000 });
  return {
    ok: result.ok,
    available: !result.notFound,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Best-effort OpenClaw extension install in disabled mode. */
export async function installExtensionDisabled(source: string): Promise<OpenClawResult> {
  // Prefer explicit disabled install path.
  const primary = await runOpenClaw(["extensions", "install", source, "--disabled"]);
  if (primary.ok || !primary.available) {
    return primary;
  }

  // Fallback for installations that expose `plugin` commands.
  const fallback = await runOpenClaw(["plugin", "install", source, "--disabled"]);
  if (fallback.ok) {
    return fallback;
  }

  // Return the primary result if both failed so callers get first error context.
  return primary;
}

/** Best-effort OpenClaw extension enable. */
export async function enableExtension(name: string): Promise<OpenClawResult> {
  const primary = await runOpenClaw(["extensions", "enable", name]);
  if (primary.ok || !primary.available) {
    return primary;
  }

  const fallback = await runOpenClaw(["plugin", "enable", name]);
  if (fallback.ok) {
    return fallback;
  }
  return primary;
}
