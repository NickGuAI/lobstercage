import type { ScanReport, SessionViolation } from "../scanner/types.js";

/** Build a structured report from scan results */
export function buildReport(
  sessionsScanned: number,
  messagesScanned: number,
  violations: SessionViolation[],
): ScanReport {
  const summary: Record<string, number> = {};
  for (const v of violations) {
    summary[v.ruleId] = (summary[v.ruleId] ?? 0) + 1;
  }

  return {
    sessionsScanned,
    messagesScanned,
    violations,
    summary,
  };
}
