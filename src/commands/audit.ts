// Standalone audit command

import { writeFile } from "node:fs/promises";
import { matrixFlow, printHeader, Spinner, style } from "../ui/matrix.js";
import { renderAuditReport, renderFixResults, serializeAuditReport } from "../ui/audit-report.js";
import { runAudit, applyFixes, getFixableFindings } from "../audit/index.js";
import type { AuditOptions } from "../audit/types.js";

export type AuditCommandOptions = {
  fix: boolean;
  deep: boolean;
  reportPath: string | null;
  configPath: string | null;
};

export async function runAuditCommand(options: AuditCommandOptions): Promise<void> {
  // Matrix intro animation
  await matrixFlow(1200);
  printHeader();

  const spinner = new Spinner("Running security audit...");
  spinner.start();

  const auditOptions: AuditOptions = {
    fix: options.fix,
    deep: options.deep,
    configPath: options.configPath ?? undefined,
  };

  const result = await runAudit(auditOptions);

  spinner.stop("Audit complete");
  console.log();

  // Render the audit report
  renderAuditReport(result);

  // Apply fixes if requested
  if (options.fix) {
    const fixable = getFixableFindings(result);
    if (fixable.length > 0) {
      const fixSpinner = new Spinner("Applying fixes...");
      fixSpinner.start();

      const fixResults = await applyFixes(result.findings);

      fixSpinner.stop("Fixes applied");
      console.log();

      renderFixResults(fixResults);
    } else {
      console.log(style.dim("  No auto-fixable issues found"));
      console.log();
    }
  }

  // Write report to file if requested
  if (options.reportPath) {
    const text = serializeAuditReport(result);
    await writeFile(options.reportPath, text, "utf-8");
    console.log(style.dim(`  Report saved to ${options.reportPath}`));
    console.log();
  }

  // Final summary
  const { summary } = result;
  if (summary.critical > 0 || summary.warning > 0) {
    const parts: string[] = [];
    if (summary.critical > 0) parts.push(style.error(`${summary.critical} critical`));
    if (summary.warning > 0) parts.push(style.warn(`${summary.warning} warnings`));
    if (summary.info > 0) parts.push(style.dim(`${summary.info} info`));
    console.log(`Summary: ${parts.join(", ")}`);

    if (!options.fix) {
      const fixable = getFixableFindings(result).length;
      if (fixable > 0) {
        console.log(style.dim(`Run \`lobstercage audit --fix\` to auto-remediate ${fixable} issues`));
      }
    }
    console.log();
  }
}
