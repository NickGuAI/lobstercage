import { style } from "./matrix.js";
import type { ScanReport, SessionViolation } from "../scanner/types.js";

/** Render a clean, minimal report to stdout */
export function renderReport(report: ScanReport): void {
  const { sessionsScanned, messagesScanned, violations } = report;

  // Stats line
  console.log(
    style.dim(`  ${sessionsScanned} sessions`) +
      style.muted(" · ") +
      style.dim(`${messagesScanned} messages scanned`)
  );
  console.log();

  // No violations - clean exit
  if (violations.length === 0) {
    console.log(style.bright("  ✓ No violations detected"));
    console.log();
    return;
  }

  // Violations header
  const violationWord = violations.length === 1 ? "violation" : "violations";
  console.log(style.warn(`  ⚠ ${violations.length} ${violationWord} found`));
  console.log();

  // Group by rule
  const byRule = new Map<string, SessionViolation[]>();
  for (const v of violations) {
    const list = byRule.get(v.ruleId) || [];
    list.push(v);
    byRule.set(v.ruleId, list);
  }

  // Render each rule group
  for (const [ruleId, ruleViolations] of byRule) {
    const icon = getIcon(ruleViolations[0].action);
    const actionLabel = ruleViolations[0].action.toUpperCase();
    
    console.log(
      `  ${icon} ` +
        style.bold(ruleId) +
        style.muted(` (${actionLabel})`) +
        style.dim(` × ${ruleViolations.length}`)
    );

    // Show up to 3 examples per rule
    const examples = ruleViolations.slice(0, 3);
    for (const v of examples) {
      console.log(style.muted(`     └─ `) + style.dim(v.matchPreview));
    }
    if (ruleViolations.length > 3) {
      console.log(style.muted(`     └─ `) + style.dim(`...and ${ruleViolations.length - 3} more`));
    }
    console.log();
  }
}

function getIcon(action: string): string {
  switch (action) {
    case "shutdown":
      return style.error("●");
    case "block":
      return style.warn("●");
    case "flag":
      return style.dim("○");
    default:
      return style.dim("·");
  }
}

/** Serialize report to plain text for file output */
export function serializeReport(report: ScanReport): string {
  const lines: string[] = [];
  const { sessionsScanned, messagesScanned, violations } = report;

  lines.push("LOBSTERCAGE SECURITY REPORT");
  lines.push("─".repeat(40));
  lines.push(`Sessions: ${sessionsScanned}`);
  lines.push(`Messages: ${messagesScanned}`);
  lines.push(`Violations: ${violations.length}`);
  lines.push("");

  if (violations.length === 0) {
    lines.push("✓ No violations detected.");
    return lines.join("\n");
  }

  // Group by rule
  const byRule = new Map<string, SessionViolation[]>();
  for (const v of violations) {
    const list = byRule.get(v.ruleId) || [];
    list.push(v);
    byRule.set(v.ruleId, list);
  }

  for (const [ruleId, ruleViolations] of byRule) {
    const action = ruleViolations[0].action.toUpperCase();
    lines.push(`[${action}] ${ruleId} (${ruleViolations.length})`);
    for (const v of ruleViolations) {
      lines.push(`  - ${v.matchPreview}`);
      lines.push(`    Session: ${v.sessionId}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
