import { runExternalCommand } from "./command.js";

type ScanFinding = {
  id?: string;
  severity?: string;
  message?: string;
  [key: string]: unknown;
};

export type McpScanResult = {
  available: boolean;
  timedOut: boolean;
  clean: boolean;
  findings: ScanFinding[];
  summary: string;
  stdout: string;
  stderr: string;
};

function parseFindings(stdout: string): ScanFinding[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is ScanFinding => typeof v === "object" && v !== null);
    }
    if (typeof parsed === "object" && parsed !== null) {
      const maybe = (parsed as { findings?: unknown }).findings;
      if (Array.isArray(maybe)) {
        return maybe.filter((v): v is ScanFinding => typeof v === "object" && v !== null);
      }
    }
  } catch {
    // Non-JSON output: caller can inspect stdout/stderr for details.
  }
  return [];
}

/** Run mcp-scan against a target path with graceful degradation if unavailable. */
export async function runMcpScan(targetPath: string): Promise<McpScanResult> {
  const primary = await runExternalCommand("mcp-scan", [targetPath, "--format", "json"], {
    timeoutMs: 30_000,
  });

  let result = primary;
  if (!primary.ok && !primary.notFound) {
    // Fallback if --format json isn't supported.
    const fallback = await runExternalCommand("mcp-scan", [targetPath], { timeoutMs: 30_000 });
    result = fallback;
  }

  if (result.notFound) {
    return {
      available: false,
      timedOut: false,
      clean: false,
      findings: [],
      summary: "mcp-scan not available in PATH",
      stdout: "",
      stderr: "",
    };
  }

  if (result.timedOut) {
    return {
      available: true,
      timedOut: true,
      clean: false,
      findings: [],
      summary: "mcp-scan timed out after 30s",
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  const findings = parseFindings(result.stdout);
  const cleanByFindings = findings.length === 0;
  const clean = result.ok && cleanByFindings;

  return {
    available: true,
    timedOut: false,
    clean,
    findings,
    summary: clean ? "No scanner findings" : result.stderr.trim() || "Scanner reported findings",
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
