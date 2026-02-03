import { writeFile } from "node:fs/promises";
import { matrixFlow, printHeader, Spinner, style } from "../ui/matrix.js";
import { renderReport, serializeReport } from "../ui/report.js";
import { renderAuditReport, renderFixResults, serializeAuditReport } from "../ui/audit-report.js";
import { getPiiRules, getContentRules } from "../scanner/engine.js";
import { forensicScan } from "../forensic/scan.js";
import { installGuard, uninstallGuard } from "../guard/install.js";
import { runAudit, applyFixes, getFixableFindings } from "../audit/index.js";
import type { ScanRule } from "../scanner/types.js";
import type { AuditResult } from "../audit/types.js";

export type CatchOptions = {
  scanOnly: boolean;
  guardOnly: boolean;
  auditOnly: boolean;
  fix: boolean;
  uninstall: boolean;
  reportPath: string | null;
  configPath: string | null;
};

function loadRules(_configPath: string | null): ScanRule[] {
  // Future: load custom rules from config file
  return [...getPiiRules(), ...getContentRules()];
}

export async function runCatch(options: CatchOptions): Promise<void> {
  // Handle uninstall
  if (options.uninstall) {
    await uninstallGuard();
    return;
  }

  // Matrix intro animation
  await matrixFlow(1200);
  printHeader();

  const rules = loadRules(options.configPath);
  let auditResult: AuditResult | null = null;
  let forensicViolations = 0;

  // Phase 1: Config Security Audit (unless --scan-only)
  if (!options.scanOnly) {
    const auditSpinner = new Spinner("Running security audit...");
    auditSpinner.start();

    auditResult = await runAudit({
      fix: false, // We'll handle fixes separately
      deep: false,
      configPath: options.configPath ?? undefined,
    });

    auditSpinner.stop("Audit complete");
    console.log();

    renderAuditReport(auditResult);

    // Apply fixes if requested
    if (options.fix) {
      const fixable = getFixableFindings(auditResult);
      if (fixable.length > 0) {
        const fixSpinner = new Spinner("Applying fixes...");
        fixSpinner.start();

        const fixResults = await applyFixes(auditResult.findings);

        fixSpinner.stop("Fixes applied");
        console.log();

        renderFixResults(fixResults);
      }
    }
  }

  // Phase 2: Forensic scan (unless --guard-only or --audit-only)
  if (!options.guardOnly && !options.auditOnly) {
    const spinner = new Spinner("Scanning sessions...");
    spinner.start();

    const report = await forensicScan(rules);
    forensicViolations = report.violations.length;

    spinner.stop("Scan complete");
    console.log();

    renderReport(report);

    // Write combined report to file if requested
    if (options.reportPath) {
      let text = "";
      if (auditResult) {
        text += serializeAuditReport(auditResult);
        text += "\n\n" + "─".repeat(40) + "\n\n";
      }
      text += serializeReport(report);
      await writeFile(options.reportPath, text, "utf-8");
      console.log(style.dim(`  Report saved to ${options.reportPath}`));
      console.log();
    }
  }

  // Phase 3: Install live guard (unless --scan-only or --audit-only)
  if (!options.scanOnly && !options.auditOnly) {
    const guardSpinner = new Spinner("Installing live guard...");
    guardSpinner.start();

    await installGuard();

    guardSpinner.stop("Guard installed");
    console.log(style.dim("  Outgoing messages will be scanned in real-time"));
    console.log();
  }

  // Final summary
  if (auditResult) {
    const { summary } = auditResult;
    const totalIssues = summary.critical + summary.warning + forensicViolations;

    if (totalIssues > 0) {
      const parts: string[] = [];
      if (summary.critical > 0) parts.push(style.error(`${summary.critical} critical`));
      if (summary.warning > 0) parts.push(style.warn(`${summary.warning} warnings`));
      if (forensicViolations > 0) parts.push(style.warn(`${forensicViolations} forensic violations`));
      console.log(`Summary: ${parts.join(", ")}`);

      if (!options.fix) {
        const fixable = getFixableFindings(auditResult).length;
        if (fixable > 0) {
          console.log(style.dim(`Run with --fix to auto-remediate ${fixable} issues`));
        }
      }
      console.log();
    }
  }
}
