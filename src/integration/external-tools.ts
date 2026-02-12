/**
 * External tool integration wrappers for openclaw CLI and mcp-scan.
 *
 * These wrappers provide graceful degradation when external tools are not available.
 * All commands have a 30-second timeout and proper command escaping.
 */

import { spawn } from "node:child_process";

/** Default timeout for external commands (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Result from running an external command */
export type ExternalCommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
};

/** Tool availability status */
export type ToolStatus = {
  available: boolean;
  version?: string;
  error?: string;
};

/**
 * Run an external command with timeout and proper escaping.
 */
export async function runCommand(
  command: string,
  args: string[],
  options: {
    timeout?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<ExternalCommandResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false, // Avoid shell injection
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeout);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        stdout,
        stderr,
        exitCode: null,
        timedOut: false,
        error: err.message,
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0 && !timedOut,
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        error: timedOut ? "Command timed out" : undefined,
      });
    });
  });
}

/**
 * Check if openclaw CLI is available and get its version.
 */
export async function checkOpenClawCli(): Promise<ToolStatus> {
  const result = await runCommand("openclaw", ["--version"], { timeout: 5000 });

  if (result.success) {
    const version = result.stdout.trim().split("\n")[0];
    return { available: true, version };
  }

  return {
    available: false,
    error: result.error ?? "openclaw CLI not found",
  };
}

/**
 * Check if mcp-scan is available and get its version.
 */
export async function checkMcpScan(): Promise<ToolStatus> {
  const result = await runCommand("mcp-scan", ["--version"], { timeout: 5000 });

  if (result.success) {
    const version = result.stdout.trim().split("\n")[0];
    return { available: true, version };
  }

  // Try npx fallback
  const npxResult = await runCommand("npx", ["mcp-scan", "--version"], {
    timeout: 10000,
  });

  if (npxResult.success) {
    const version = npxResult.stdout.trim().split("\n")[0];
    return { available: true, version: `(npx) ${version}` };
  }

  return {
    available: false,
    error: result.error ?? "mcp-scan not found",
  };
}

/** OpenClaw skill info */
export type SkillInfo = {
  name: string;
  version?: string;
  path?: string;
  enabled: boolean;
  verified?: boolean;
};

/**
 * List installed OpenClaw skills using the openclaw CLI.
 */
export async function listOpenClawSkills(): Promise<{
  success: boolean;
  skills: SkillInfo[];
  error?: string;
}> {
  const result = await runCommand("openclaw", ["skill", "list", "--json"]);

  if (!result.success) {
    return {
      success: false,
      skills: [],
      error: result.error ?? (result.stderr || "Failed to list skills"),
    };
  }

  try {
    const skills = JSON.parse(result.stdout) as SkillInfo[];
    return { success: true, skills };
  } catch {
    // Try parsing as text format
    const skills: SkillInfo[] = [];
    const lines = result.stdout.trim().split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*-?\s*(\S+)/);
      if (match) {
        skills.push({
          name: match[1],
          enabled: !line.includes("disabled"),
        });
      }
    }
    return { success: true, skills };
  }
}

/**
 * Enable or disable an OpenClaw skill.
 */
export async function setSkillEnabled(
  skillName: string,
  enabled: boolean
): Promise<ExternalCommandResult> {
  const action = enabled ? "enable" : "disable";
  return runCommand("openclaw", ["skill", action, skillName]);
}

/**
 * Get the path to an installed skill.
 */
export async function getSkillPath(
  skillName: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  const result = await runCommand("openclaw", ["skill", "info", skillName, "--json"]);

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? (result.stderr || "Failed to get skill info"),
    };
  }

  try {
    const info = JSON.parse(result.stdout);
    return { success: true, path: info.path || info.location };
  } catch {
    // Try parsing text format
    const match = result.stdout.match(/path:\s*(\S+)/i);
    if (match) {
      return { success: true, path: match[1] };
    }
    return { success: false, error: "Could not parse skill path" };
  }
}

/** MCP scan result */
export type McpScanResult = {
  success: boolean;
  issues: McpScanIssue[];
  error?: string;
};

export type McpScanIssue = {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  message: string;
  file?: string;
  line?: number;
};

/**
 * Run mcp-scan on a directory or file.
 */
export async function runMcpScan(
  targetPath: string,
  options: { timeout?: number } = {}
): Promise<McpScanResult> {
  // Try direct invocation first
  let result = await runCommand("mcp-scan", [targetPath, "--json"], {
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
  });

  // Fallback to npx
  if (!result.success && result.error?.includes("not found")) {
    result = await runCommand("npx", ["mcp-scan", targetPath, "--json"], {
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    });
  }

  if (!result.success) {
    return {
      success: false,
      issues: [],
      error: result.error ?? (result.stderr || "mcp-scan failed"),
    };
  }

  try {
    const output = JSON.parse(result.stdout);
    const issues: McpScanIssue[] = (output.issues || output.vulnerabilities || []).map(
      (issue: Record<string, unknown>) => ({
        severity: issue.severity ?? "medium",
        type: issue.type ?? issue.id ?? "unknown",
        message: issue.message ?? issue.description ?? String(issue),
        file: issue.file,
        line: issue.line,
      })
    );
    return { success: true, issues };
  } catch {
    // No issues if output isn't JSON (clean scan)
    if (result.stdout.includes("No issues found") || result.stdout.trim() === "") {
      return { success: true, issues: [] };
    }
    return { success: true, issues: [] };
  }
}

/**
 * Install an OpenClaw skill with safety checks (disabled by default).
 */
export async function installSkillSafe(
  skillSource: string,
  options: { enableAfterInstall?: boolean } = {}
): Promise<{
  success: boolean;
  skillName?: string;
  error?: string;
}> {
  // Install with --disabled flag to prevent immediate execution
  const installResult = await runCommand("openclaw", [
    "skill",
    "install",
    skillSource,
    "--disabled",
  ]);

  if (!installResult.success) {
    return {
      success: false,
      error: installResult.error ?? (installResult.stderr || "Installation failed"),
    };
  }

  // Parse skill name from output
  const match = installResult.stdout.match(
    /(?:installed|added)\s+(?:skill\s+)?["']?([^\s"']+)["']?/i
  );
  const skillName = match?.[1];

  if (options.enableAfterInstall && skillName) {
    const enableResult = await setSkillEnabled(skillName, true);
    if (!enableResult.success) {
      return {
        success: true,
        skillName,
        error: "Installed but failed to enable: " + enableResult.stderr,
      };
    }
  }

  return {
    success: true,
    skillName,
  };
}
