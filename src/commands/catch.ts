import { writeFile } from "node:fs/promises";
import { matrixFlow, printHeader, Spinner, style } from "../ui/matrix.js";
import { renderReport, serializeReport } from "../ui/report.js";
import { renderAuditReport, renderFixResults, serializeAuditReport } from "../ui/audit-report.js";
import { confirm, reviewViolations, confirmRedactions } from "../ui/interactive.js";
import { getPiiRules, getContentRules, getMalwareRules } from "../scanner/engine.js";
import { forensicScan } from "../forensic/scan.js";
import { applyRedactions } from "../forensic/redact.js";
import { installGuard, uninstallGuard } from "../guard/install.js";
import { runAudit, applyFixes, getFixableFindings } from "../audit/index.js";
import { recordScanEvent } from "../stats/storage.js";
import { scanInstalledSkills } from "../security/skill-scan.js";
import { detectExtensionsIntegrityDrift, writeExtensionsBaseline } from "../security/integrity.js";
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
  return [...getPiiRules(), ...getContentRules(), ...getMalwareRules()];
}

function countViolationsByRule(violations: ViolationEvent[]): ViolationEvent[] {
  const map: Record<string, ViolationEvent> = {};
  for (const violation of violations) {
    const key = `${violation.ruleId}:${violation.action}`;
    if (!map[key]) {
      map[key] = {
        ruleId: violation.ruleId,
        category: violation.category,
        action: violation.action,
        count: 0,
      };
    }
    map[key].count += violation.count;
  }
  return Object.values(map);
}

function serializeSkillScanSection(
  skillsScanned: number,
  findingsCount: number,
  quarantinedCount: number
): string {
  return [
    "SKILL SCAN",
    "─".repeat(40),
    `Skills scanned: ${skillsScanned}`,
    `Findings: ${findingsCount}`,
    `Quarantined: ${quarantinedCount}`,
  ].join("\n");
}

function serializeIntegritySection(
  baselineCreated: boolean,
  drift: { added: string[]; removed: string[]; modified: string[] }
): string {
  return [
    "INTEGRITY",
    "─".repeat(40),
    `Baseline created: ${baselineCreated ? "yes" : "no"}`,
    `Added: ${drift.added.length}`,
    `Removed: ${drift.removed.length}`,
    `Modified: ${drift.modified.length}`,
  ].join("\n");
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

  const decisions = await reviewViolations(report.violations);
  if ([...decisions.values()].includes("quit")) {
    console.log(style.dim("  Review cancelled"));
    return;
  }

  const shouldRedact = await confirmRedactions(decisions);
  if (!shouldRedact) {
    console.log(style.dim("  Redaction cancelled"));
    return;
  }

  const spinner = new Spinner("Applying redactions...");
  spinner.start();
  const results = await applyRedactions(decisions);
  spinner.stop("Redactions applied");
  console.log();

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log(
      style.bright(
        `  ✓ Redacted ${successful.reduce((sum, r) => sum + r.messagesRedacted, 0)} message(s)`
      )
    );
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
  if (options.uninstall) {
    await uninstallGuard();
    return;
  }

  await matrixFlow(1200);
  printHeader();

  const rules = loadRules(options.configPath);
  const reportSections: string[] = [];

  let auditResult: AuditResult | null = null;
  let forensicViolations = 0;
  let skillFindings = 0;
  let quarantinedSkills = 0;
  let integrityDriftCount = 0;
  let needsBaselineCreation = false;

  // Phase 1: Config Security Audit
  if (!options.scanOnly) {
    const auditSpinner = new Spinner("Running security audit...");
    auditSpinner.start();
    auditResult = await runAudit({
      fix: false,
      deep: false,
      configPath: options.configPath ?? undefined,
    });
    auditSpinner.stop("Audit complete");
    console.log();

    renderAuditReport(auditResult);
    reportSections.push(serializeAuditReport(auditResult));

    const auditViolations: ViolationEvent[] = auditResult.findings.map((finding) => ({
      ruleId: `audit-${finding.id}`,
      category: "content",
      action: finding.severity === "critical" ? "block" : "warn",
      count: 1,
    }));
    if (auditViolations.length > 0) {
      await recordScanEvent("audit", auditViolations);
    }

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

  // Phase 2: Skill scan + quarantine and Phase 3: integrity drift (full flow only)
  if (!options.scanOnly && !options.guardOnly && !options.auditOnly) {
    const skillSpinner = new Spinner("Scanning installed skills...");
    skillSpinner.start();
    const skillReport = await scanInstalledSkills({ quarantine: true });
    skillSpinner.stop("Skill scan complete");
    console.log();

    skillFindings = skillReport.findings.reduce((sum, finding) => sum + finding.violations.length, 0);
    quarantinedSkills = skillReport.quarantinedCount;

    console.log(style.dim(`  Skills scanned: ${skillReport.skillsScanned}`));
    if (skillFindings > 0) {
      console.log(style.warn(`  Skill findings: ${skillFindings}`));
      if (quarantinedSkills > 0) {
        console.log(style.warn(`  Quarantined skills: ${quarantinedSkills}`));
      }
    } else {
      console.log(style.green("  ✓ No suspicious skills detected"));
    }
    console.log();

    const skillViolationEvents: ViolationEvent[] = [];
    for (const finding of skillReport.findings) {
      for (const violation of finding.violations) {
        skillViolationEvents.push({
          ruleId: violation.ruleId,
          category: violation.category,
          action: violation.action,
          count: 1,
        });
      }
    }
    if (skillViolationEvents.length > 0) {
      await recordScanEvent("skill-scan", countViolationsByRule(skillViolationEvents));
    }

    reportSections.push(
      serializeSkillScanSection(skillReport.skillsScanned, skillFindings, quarantinedSkills)
    );

    const drift = await detectExtensionsIntegrityDrift();

    integrityDriftCount = drift.added.length + drift.removed.length + drift.modified.length;
    if (!drift.baselinePresent) {
      console.log(style.dim("  No integrity baseline yet (will create after guard install)"));
    } else if (integrityDriftCount > 0) {
      console.log(style.warn(`  Integrity drift detected (${integrityDriftCount} change(s))`));
      if (drift.modified.length > 0) {
        console.log(style.dim(`    Modified: ${drift.modified.length}`));
      }
      if (drift.added.length > 0) {
        console.log(style.dim(`    Added: ${drift.added.length}`));
      }
      if (drift.removed.length > 0) {
        console.log(style.dim(`    Removed: ${drift.removed.length}`));
      }
    } else {
      console.log(style.green("  ✓ No integrity drift detected"));
    }
    console.log();

    if (!drift.baselinePresent) {
      needsBaselineCreation = true;
    } else if (integrityDriftCount > 0) {
      await recordScanEvent("integrity", [
        {
          ruleId: "integrity-drift",
          category: "malware",
          action: "block",
          count: integrityDriftCount,
        },
      ]);
    }

    reportSections.push(
      serializeIntegritySection(!drift.baselinePresent, {
        added: drift.added,
        removed: drift.removed,
        modified: drift.modified,
      })
    );
  }

  // Phase 4: Forensic scan
  let forensicReport: ScanReport | null = null;
  if (!options.guardOnly && !options.auditOnly) {
    const spinner = new Spinner("Scanning sessions...");
    spinner.start();
    forensicReport = await forensicScan(rules);
    forensicViolations = forensicReport.violations.length;
    spinner.stop("Scan complete");
    console.log();

    const forensicViolationEvents: ViolationEvent[] = forensicReport.violations.map((v) => ({
      ruleId: v.ruleId,
      category: v.category,
      action: v.action,
      count: 1,
    }));
    await recordScanEvent("forensic", countViolationsByRule(forensicViolationEvents));

    renderReport(forensicReport);

    if (options.interactive && forensicReport.violations.length > 0) {
      await handleInteractiveRedaction(forensicReport);
    } else if (forensicReport.violations.length > 0 && !options.interactive) {
      console.log(
        style.dim("  Run with ") +
          style.bright("--interactive") +
          style.dim(" to review and redact violations")
      );
      console.log();
    }

    reportSections.push(serializeReport(forensicReport));
  }

  // Phase 5: Guard install
  if (!options.scanOnly && !options.auditOnly) {
    const guardSpinner = new Spinner("Installing live guard...");
    guardSpinner.start();
    await installGuard();
    guardSpinner.stop("Guard installed");
    console.log(style.dim("  Outgoing messages will be scanned in real-time"));
    console.log();
  }

  // Create integrity baseline after guard install to avoid self-induced drift
  if (needsBaselineCreation) {
    const baselineSpinner = new Spinner("Creating integrity baseline...");
    baselineSpinner.start();
    await writeExtensionsBaseline();
    baselineSpinner.stop("Integrity baseline created");
    console.log(style.dim("  Created initial integrity baseline for extensions"));
    console.log();
  }

  if (options.reportPath && reportSections.length > 0) {
    await writeFile(options.reportPath, reportSections.join("\n\n" + "─".repeat(40) + "\n\n"), "utf-8");
    console.log(style.dim(`  Report saved to ${options.reportPath}`));
    console.log();
  }

  if (auditResult) {
    const { summary } = auditResult;
    const totalIssues =
      summary.critical + summary.warning + forensicViolations + skillFindings + integrityDriftCount;
    if (totalIssues > 0) {
      const parts: string[] = [];
      if (summary.critical > 0) parts.push(style.error(`${summary.critical} critical`));
      if (summary.warning > 0) parts.push(style.warn(`${summary.warning} warnings`));
      if (skillFindings > 0) parts.push(style.warn(`${skillFindings} skill findings`));
      if (integrityDriftCount > 0) parts.push(style.warn(`${integrityDriftCount} integrity drift`));
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
