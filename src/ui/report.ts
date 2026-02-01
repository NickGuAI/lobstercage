import { style } from "./matrix.js";
import type { ScanReport, SessionViolation } from "../scanner/types.js";

/** Render a Matrix-themed violation report to stdout */
export function renderReport(report: ScanReport): void {
  console.log();
  console.log(style.bold("  ╔══════════════════════════════════════════════════════════╗"));
  console.log(style.bold("  ║            LOBSTERCAGE SECURITY REPORT                  ║"));
  console.log(style.bold("  ╚══════════════════════════════════════════════════════════╝"));
  console.log();

  console.log(style.tag("STATS") + " " + style.bright(`Sessions scanned: ${report.sessionsScanned}`));
  console.log(style.tag("STATS") + " " + style.bright(`Messages scanned: ${report.messagesScanned}`));
  console.log(style.tag("STATS") + " " + style.bright(`Violations found: ${report.violations.length}`));
  console.log();

  if (report.violations.length === 0) {
    console.log(style.bright("  No violations detected. System clean."));
    console.log();
    return;
  }

  // Summary by rule
  console.log(style.bold("  Violations by Rule:"));
  const sorted = Object.entries(report.summary).sort(([, a], [, b]) => b - a);
  for (const [rule, count] of sorted) {
    console.log(style.dark(`    ${rule}: `) + style.bright(`${count}`));
  }
  console.log();

  // Violation table
  console.log(style.bold("  Detailed Violations:"));
  console.log(style.dark("  ─".repeat(35)));

  const header = formatRow("Rule", "Action", "Session", "Match Preview");
  console.log(style.bright(`  ${header}`));
  console.log(style.dark("  ─".repeat(35)));

  for (const v of report.violations) {
    const sessionShort = truncate(v.sessionId, 16);
    const row = formatRow(v.ruleId, v.action.toUpperCase(), sessionShort, v.matchPreview);
    const colorFn = v.action === "shutdown" ? style.alert : v.action === "block" ? style.bright : style.dark;
    console.log(`  ${colorFn(row)}`);
  }

  console.log(style.dark("  ─".repeat(35)));
  console.log();
}

function formatRow(col1: string, col2: string, col3: string, col4: string): string {
  return `${pad(col1, 22)} ${pad(col2, 10)} ${pad(col3, 18)} ${col4}`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

/** Serialize report to a plain-text string for file output */
export function serializeReport(report: ScanReport): string {
  const lines: string[] = [];
  lines.push("LOBSTERCAGE SECURITY REPORT");
  lines.push("=".repeat(60));
  lines.push(`Sessions scanned: ${report.sessionsScanned}`);
  lines.push(`Messages scanned: ${report.messagesScanned}`);
  lines.push(`Violations found: ${report.violations.length}`);
  lines.push("");

  if (report.violations.length === 0) {
    lines.push("No violations detected.");
    return lines.join("\n");
  }

  lines.push("Violations by Rule:");
  for (const [rule, count] of Object.entries(report.summary).sort(([, a], [, b]) => b - a)) {
    lines.push(`  ${rule}: ${count}`);
  }
  lines.push("");

  lines.push("Detailed Violations:");
  lines.push("-".repeat(60));
  lines.push(formatRow("Rule", "Action", "Session", "Match Preview"));
  lines.push("-".repeat(60));
  for (const v of report.violations) {
    lines.push(formatRow(v.ruleId, v.action.toUpperCase(), truncate(v.sessionId, 16), v.matchPreview));
  }
  lines.push("-".repeat(60));
  return lines.join("\n");
}
