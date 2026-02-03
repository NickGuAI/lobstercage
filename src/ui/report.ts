import { style } from "./matrix.js";
import type { ScanReport, SessionViolation } from "../scanner/types.js";

/** Format file path for display (shortened for readability) */
function formatPath(filePath: string): string {
  // Shorten home directory paths
  const home = process.env.HOME || "";
  if (home && filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}

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

  // Group by rule, then by session file
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

    // Group violations by session file
    const byFile = new Map<string, SessionViolation[]>();
    for (const v of ruleViolations) {
      const list = byFile.get(v.sessionFile) || [];
      list.push(v);
      byFile.set(v.sessionFile, list);
    }

    // Show violations grouped by file
    const fileEntries = Array.from(byFile.entries());
    for (let fi = 0; fi < fileEntries.length; fi++) {
      const [filePath, fileViolations] = fileEntries[fi];
      const isLastFile = fi === fileEntries.length - 1;
      const filePrefix = isLastFile ? "└─" : "├─";

      // Show file path
      const shortPath = formatPath(filePath);
      console.log(style.muted(`     ${filePrefix} `) + style.dim(shortPath));

      // Show up to 2 match previews per file
      const examples = fileViolations.slice(0, 2);
      for (let ei = 0; ei < examples.length; ei++) {
        const v = examples[ei];
        const isLastExample = ei === examples.length - 1 && fileViolations.length <= 2;
        const examplePrefix = isLastFile ? "   " : "│  ";
        const exampleConnector = isLastExample ? "└─" : "├─";
        console.log(
          style.muted(`     ${examplePrefix} ${exampleConnector} `) +
            style.dim(`msg #${v.messageIndex}: `) +
            style.muted(v.matchPreview)
        );
      }
      if (fileViolations.length > 2) {
        const examplePrefix = isLastFile ? "   " : "│  ";
        console.log(
          style.muted(`     ${examplePrefix} └─ `) +
            style.dim(`...and ${fileViolations.length - 2} more`)
        );
      }
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

    // Group by file
    const byFile = new Map<string, SessionViolation[]>();
    for (const v of ruleViolations) {
      const list = byFile.get(v.sessionFile) || [];
      list.push(v);
      byFile.set(v.sessionFile, list);
    }

    for (const [filePath, fileViolations] of byFile) {
      lines.push(`  File: ${filePath}`);
      for (const v of fileViolations) {
        lines.push(`    - msg #${v.messageIndex}: ${v.matchPreview}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
