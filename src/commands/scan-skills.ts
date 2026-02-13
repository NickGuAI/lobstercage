import { style } from "../ui/matrix.js";
import { scanInstalledSkills } from "../security/skill-scan.js";
import { listQuarantineRecords, restoreQuarantinedSkill } from "../security/quarantine.js";
import { recordScanEvent } from "../stats/storage.js";
import type { ViolationEvent } from "../stats/types.js";

export type ScanSkillsOptions = {
  quarantine: boolean;
  restore: string | null;
  json: boolean;
};

export async function runScanSkills(options: ScanSkillsOptions): Promise<void> {
  if (options.restore) {
    const result = await restoreQuarantinedSkill(options.restore);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.restored) {
      console.log(style.green(`  ✓ ${result.message}`));
    } else {
      console.log(style.warn(`  ! ${result.message}`));
    }
    return;
  }

  const report = await scanInstalledSkills({ quarantine: options.quarantine });

  const violationCounts: Record<string, ViolationEvent> = {};
  for (const finding of report.findings) {
    for (const violation of finding.violations) {
      const key = `${violation.ruleId}:${violation.action}`;
      if (!violationCounts[key]) {
        violationCounts[key] = {
          ruleId: violation.ruleId,
          category: violation.category,
          action: violation.action,
          count: 0,
        };
      }
      violationCounts[key].count += 1;
    }
  }
  await recordScanEvent("skill-scan", Object.values(violationCounts));

  if (options.json) {
    const quarantined = await listQuarantineRecords();
    console.log(
      JSON.stringify(
        {
          ...report,
          quarantinedRecords: quarantined,
        },
        null,
        2
      )
    );
    return;
  }

  console.log();
  console.log(style.bold("  SKILL SCAN"));
  console.log();
  console.log(style.dim(`  Skills scanned: ${report.skillsScanned}`));
  console.log(style.dim(`  Skills flagged: ${report.findings.length}`));
  console.log(style.dim(`  Quarantined: ${report.quarantinedCount}`));
  console.log();

  for (const finding of report.findings) {
    console.log(style.warn(`  ⚠ ${finding.skillName}`));
    const byRule = new Map<string, number>();
    for (const violation of finding.violations) {
      byRule.set(violation.ruleId, (byRule.get(violation.ruleId) ?? 0) + 1);
    }
    for (const [ruleId, count] of byRule.entries()) {
      console.log(style.dim(`     ${ruleId}: ${count}`));
    }
    if (finding.quarantined) {
      console.log(style.warn(`     quarantined as ${finding.quarantined.id}`));
    }
  }

  if (report.findings.length === 0) {
    console.log(style.green("  ✓ No suspicious skills detected"));
  }

  if (report.errors.length > 0) {
    console.log();
    console.log(style.warn("  Errors:"));
    for (const error of report.errors) {
      console.log(style.dim(`    ${error}`));
    }
  }

  if (!options.quarantine && report.findings.length > 0) {
    console.log();
    console.log(style.dim("  Re-run with --quarantine to isolate flagged skills"));
  }
  console.log();
}
