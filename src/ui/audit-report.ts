// Audit report rendering for terminal output

import { style } from "./matrix.js";
import type { AuditResult, SecurityFinding, FixResult } from "../audit/types.js";

/** Format file path for display (shortened for readability) */
function formatPath(filePath: string): string {
  const home = process.env.HOME || "";
  if (home && filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}

/** Get severity icon */
function getSeverityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return style.error("●");
    case "warning":
      return style.warn("●");
    case "info":
      return style.dim("○");
    default:
      return style.dim("·");
  }
}

/** Get severity label with color */
function getSeverityLabel(severity: string): string {
  switch (severity) {
    case "critical":
      return style.error("CRITICAL");
    case "warning":
      return style.warn("WARNING");
    case "info":
      return style.dim("INFO");
    default:
      return severity;
  }
}

/** Render audit findings grouped by severity */
export function renderAuditReport(result: AuditResult): void {
  const { findings, summary, configPath } = result;

  // Section header
  console.log(style.muted("─".repeat(45)));
  console.log(style.bold("  CONFIG AUDIT"));
  console.log(style.muted("─".repeat(45)));
  console.log();

  // Config path info
  if (configPath) {
    console.log(style.dim(`  Config: ${formatPath(configPath)}`));
    console.log();
  }

  // No findings - clean exit
  if (findings.length === 0) {
    console.log(style.bright("  ✓ No security issues detected"));
    console.log();
    return;
  }

  // Summary
  const parts: string[] = [];
  if (summary.critical > 0) {
    parts.push(style.error(`${summary.critical} critical`));
  }
  if (summary.warning > 0) {
    parts.push(style.warn(`${summary.warning} warnings`));
  }
  if (summary.info > 0) {
    parts.push(style.dim(`${summary.info} info`));
  }
  console.log(`  ${parts.join(style.muted(" · "))}`);
  console.log();

  // Group findings by severity
  const bySeverity = new Map<string, SecurityFinding[]>();
  for (const f of findings) {
    const list = bySeverity.get(f.severity) || [];
    list.push(f);
    bySeverity.set(f.severity, list);
  }

  // Render each severity group
  for (const severity of ["critical", "warning", "info"]) {
    const severityFindings = bySeverity.get(severity);
    if (!severityFindings || severityFindings.length === 0) continue;

    console.log(`  ${getSeverityIcon(severity)} ${getSeverityLabel(severity)}`);

    for (let i = 0; i < severityFindings.length; i++) {
      const f = severityFindings[i];
      const isLast = i === severityFindings.length - 1;
      const prefix = isLast ? "└─" : "├─";

      console.log(style.muted(`     ${prefix} `) + style.bright(f.title));

      // Description
      const descPrefix = isLast ? "   " : "│  ";
      console.log(style.muted(`     ${descPrefix}   `) + style.dim(f.description));

      // Location and current value
      if (f.location) {
        let locationInfo = f.location;
        if (f.currentValue) {
          locationInfo += style.muted("=") + style.warn(`"${f.currentValue}"`);
        }
        console.log(style.muted(`     ${descPrefix}   `) + style.muted(locationInfo));
      }

      // Fix suggestion
      if (f.fix) {
        const fixLabel = f.fixable ? style.bright("Fix: ") : style.dim("Fix: ");
        console.log(style.muted(`     ${descPrefix}   `) + fixLabel + style.green(f.fix));
      }
    }
    console.log();
  }
}

/** Render fix results */
export function renderFixResults(results: FixResult[]): void {
  if (results.length === 0) {
    console.log(style.dim("  No fixes applied"));
    return;
  }

  console.log(style.bold("  AUTO-FIX RESULTS"));
  console.log();

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log(style.bright(`  ✓ ${successful.length} fixes applied`));
    for (const r of successful) {
      console.log(style.dim(`     └─ ${r.action}`));
    }
    console.log();
  }

  if (failed.length > 0) {
    console.log(style.error(`  ✗ ${failed.length} fixes failed`));
    for (const r of failed) {
      console.log(style.dim(`     └─ ${r.finding.title}: `) + style.error(r.error || "Unknown error"));
    }
    console.log();
  }
}

/** Render combined summary line */
export function renderAuditSummary(result: AuditResult, forensicViolations: number): void {
  const { summary } = result;
  const total = summary.critical + summary.warning + summary.info + forensicViolations;

  if (total === 0) {
    console.log(style.bright("✓ All checks passed"));
    return;
  }

  const parts: string[] = [];
  if (summary.critical > 0) {
    parts.push(style.error(`${summary.critical} critical`));
  }
  if (summary.warning > 0) {
    parts.push(style.warn(`${summary.warning} warnings`));
  }
  if (forensicViolations > 0) {
    parts.push(style.warn(`${forensicViolations} forensic violations`));
  }

  console.log(`Summary: ${parts.join(", ")}`);

  // Suggest --fix if there are fixable findings
  const fixable = result.findings.filter((f) => f.fixable).length;
  if (fixable > 0) {
    console.log(style.dim(`Run with --fix to auto-remediate ${fixable} issues`));
  }
}

/** Serialize audit report to plain text for file output */
export function serializeAuditReport(result: AuditResult): string {
  const lines: string[] = [];
  const { findings, summary, configPath } = result;

  lines.push("LOBSTERCAGE CONFIG AUDIT REPORT");
  lines.push("─".repeat(40));
  lines.push(`Timestamp: ${result.timestamp}`);
  if (configPath) {
    lines.push(`Config: ${configPath}`);
  }
  lines.push(`Critical: ${summary.critical}`);
  lines.push(`Warnings: ${summary.warning}`);
  lines.push(`Info: ${summary.info}`);
  lines.push("");

  if (findings.length === 0) {
    lines.push("✓ No security issues detected.");
    return lines.join("\n");
  }

  for (const f of findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`  Category: ${f.category}`);
    lines.push(`  ${f.description}`);
    if (f.location) {
      lines.push(`  Location: ${f.location}`);
    }
    if (f.currentValue) {
      lines.push(`  Current: ${f.currentValue}`);
    }
    if (f.expectedValue) {
      lines.push(`  Expected: ${f.expectedValue}`);
    }
    if (f.fix) {
      lines.push(`  Fix: ${f.fix}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
