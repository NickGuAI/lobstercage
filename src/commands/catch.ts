import { writeFile } from "node:fs/promises";
import { matrixFlow, printHeader, Spinner, style } from "../ui/matrix.js";
import { renderReport, serializeReport } from "../ui/report.js";
import { renderAuditReport, renderFixResults, serializeAuditReport } from "../ui/audit-report.js";
import { confirm, reviewViolations, confirmRedactions } from "../ui/interactive.js";
import { getPiiRules, getContentRules } from "../scanner/engine.js";
import { forensicScan } from "../forensic/scan.js";
import { applyRedactions } from "../forensic/redact.js";
import { installGuard, uninstallGuard } from "../guard/install.js";
import { runAudit, applyFixes, getFixableFindings } from "../audit/index.js";
import { recordScanEvent } from "../stats/storage.js";
import type { ScanRule, ScanReport } from "../scanner/types.js";
import type { AuditResult } from "../audit/types.js";
import type { ViolationEvent } from "../stats/types.js";

export type CatchOptions = {
  scanOnly: boolean;
  guardOnly: boolean;
  auditOnly: boolean;
  fix: boolean;
  interactive: boolean;
  uninstall: boolean;
  reportPath: string | null;
  configPath: string | null;
};

function loadRules(_configPath: string | null): ScanRule[] {
  // Future: load custom rules from config file
  return [...getPiiRules(), ...getContentRules()];
}

/** Handle interactive redaction flow */
async function handleInteractiveRedaction(report: ScanReport): Promise<void> {
  if (report.violations.length === 0) {
    return;
  }

  console.log();
  const shouldReview = await confirm(
    style.warn(`  Found ${report.violations.length} PII violation(s).`) +
      " Would you like to review and redact them?",
    true
  );

  if (!shouldReview) {
    console.log(style.dim("  Skipping redaction"));
    return;
  }

  // Enter interactive review mode
  const decisions = await reviewViolations(report.violations);

  // Check if user wants to quit
  if ([...decisions.values()].includes("quit")) {
    console.log(style.dim("  Review cancelled"));
    return;
  }

  // Confirm redactions
  const shouldRedact = await confirmRedactions(decisions);

  if (!shouldRedact) {
    console.log(style.dim("  Redaction cancelled"));
    return;
  }

  // Apply redactions
  const spinner = new Spinner("Applying redactions...");
  spinner.start();

  const results = await applyRedactions(decisions);

  spinner.stop("Redactions applied");
  console.log();

  // Show results
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log(style.bright(`  ✓ Redacted ${successful.reduce((sum, r) => sum + r.messagesRedacted, 0)} message(s)`));
    for (const r of successful) {
      const shortPath = r.file.replace(process.env.HOME || "", "~");
      const shortBackup = r.backupPath.replace(process.env.HOME || "", "~");
      console.log(style.dim(`     ${shortPath}`));
      console.log(style.muted(`     Backup: ${shortBackup}`));
    }
    console.log();
  }

  if (failed.length > 0) {
    console.log(style.error(`  ✗ ${failed.length} file(s) failed`));
    for (const r of failed) {
      console.log(style.dim(`     ${r.file}: ${r.error}`));
    }
    console.log();
  }
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

    // Record audit stats
    const auditViolations: ViolationEvent[] = [];
    for (const finding of auditResult.findings) {
      auditViolations.push({
        ruleId: `audit-${finding.id}`,
        category: "content",
        action: finding.severity === "critical" ? "block" : "warn",
        count: 1,
      });
    }
    if (auditViolations.length > 0) {
      await recordScanEvent("audit", auditViolations);
    }

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

    // Record forensic scan stats
    const forensicViolationEvents: ViolationEvent[] = [];
    const violationCounts: Record<string, { category: "pii" | "content"; action: "warn" | "block" | "shutdown"; count: number }> = {};
    for (const v of report.violations) {
      if (!violationCounts[v.ruleId]) {
        violationCounts[v.ruleId] = { category: v.category, action: v.action, count: 0 };
      }
      violationCounts[v.ruleId].count++;
    }
    for (const [ruleId, data] of Object.entries(violationCounts)) {
      forensicViolationEvents.push({
        ruleId,
        category: data.category,
        action: data.action,
        count: data.count,
      });
    }
    await recordScanEvent("forensic", forensicViolationEvents);

    renderReport(report);

    // Interactive redaction mode
    if (options.interactive && report.violations.length > 0) {
      await handleInteractiveRedaction(report);
    } else if (report.violations.length > 0 && !options.interactive) {
      // Offer to enter interactive mode
      console.log(
        style.dim("  Run with ") +
          style.bright("--interactive") +
          style.dim(" to review and redact violations")
      );
      console.log();
    }

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
