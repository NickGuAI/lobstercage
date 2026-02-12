/**
 * Skill scanning command with quarantine/restore functionality.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Spinner, style } from "../ui/matrix.js";
import { scanContent, getMalwareRules, getPiiRules, getContentRules } from "../scanner/engine.js";
import { getStateDir } from "../audit/config-loader.js";
import { recordScanEvent } from "../stats/storage.js";
import {
  quarantineSkill,
  restoreSkill,
  listQuarantined,
  deleteQuarantined,
} from "../quarantine/manager.js";
import {
  listOpenClawSkills,
  getSkillPath,
  runMcpScan,
  checkMcpScan,
  setSkillEnabled,
} from "../integration/external-tools.js";
import type { Violation, ScanRule } from "../scanner/types.js";
import type { ViolationEvent } from "../stats/types.js";

export type ScanSkillsOptions = {
  quarantine: boolean;
  listQuarantined: boolean;
  restore: string | null;
  delete: string | null;
  useMcpScan: boolean;
  skipMalware: boolean;
};

/** Skill scan result */
type SkillScanResult = {
  skillName: string;
  path: string;
  violations: Violation[];
  mcpIssues: number;
  filesScanned: number;
};

/**
 * Recursively scan all JS/TS files in a directory.
 */
async function scanSkillDirectory(
  dir: string,
  rules: ScanRule[]
): Promise<{ violations: Violation[]; filesScanned: number }> {
  const violations: Violation[] = [];
  let filesScanned = 0;

  async function scanDir(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir);

      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry === "node_modules" || entry.startsWith(".")) {
            continue;
          }
          await scanDir(fullPath);
        } else if (
          stats.isFile() &&
          (entry.endsWith(".js") ||
            entry.endsWith(".ts") ||
            entry.endsWith(".mjs") ||
            entry.endsWith(".cjs"))
        ) {
          try {
            const content = await readFile(fullPath, "utf-8");
            const fileViolations = scanContent(content, rules);

            // Add file context to violations
            for (const v of fileViolations) {
              violations.push({
                ...v,
                matchPreview: `[${entry}] ${v.matchPreview}`,
              });
            }
            filesScanned++;
          } catch {
            // Skip files we can't read
          }
        }
      }
    } catch {
      // Ignore errors for inaccessible directories
    }
  }

  await scanDir(dir);
  return { violations, filesScanned };
}

/**
 * Get the skills directory path.
 */
function getSkillsDir(): string {
  const stateDir = getStateDir();
  return join(stateDir, "extensions");
}

/**
 * Run the scan-skills command.
 */
export async function runScanSkills(options: ScanSkillsOptions): Promise<void> {
  // Handle list quarantined
  if (options.listQuarantined) {
    const entries = await listQuarantined();

    if (entries.length === 0) {
      console.log(style.dim("No quarantined skills"));
      return;
    }

    console.log(style.bright("\nQuarantined Skills:"));
    console.log();

    for (const entry of entries) {
      console.log(`  ${style.warn("⚠")} ${style.bright(entry.skillName)}`);
      console.log(style.dim(`    ID: ${entry.id}`));
      console.log(style.dim(`    Quarantined: ${entry.quarantinedAt}`));
      console.log(style.dim(`    Reason: ${entry.reason}`));
      console.log(
        style.dim(`    Violations: ${entry.violations.length}`)
      );
      console.log(
        entry.restoreAvailable
          ? style.dim("    Restore: available")
          : style.error("    Restore: unavailable")
      );
      console.log();
    }

    console.log(
      style.dim(
        `Run ${style.bright("lobstercage scan-skills --restore <id>")} to restore a skill`
      )
    );
    return;
  }

  // Handle restore
  if (options.restore) {
    const spinner = new Spinner(`Restoring skill...`);
    spinner.start();

    const result = await restoreSkill(options.restore);

    if (result.success) {
      spinner.stop("Skill restored successfully");
    } else {
      spinner.stop(style.error(`Failed to restore: ${result.error}`));
    }
    return;
  }

  // Handle delete
  if (options.delete) {
    const spinner = new Spinner(`Deleting quarantined skill...`);
    spinner.start();

    const result = await deleteQuarantined(options.delete);

    if (result.success) {
      spinner.stop("Quarantined skill permanently deleted");
    } else {
      spinner.stop(style.error(`Failed to delete: ${result.error}`));
    }
    return;
  }

  // Main skill scanning flow
  console.log(style.bright("\n🦞 Scanning Skills for Malware...\n"));

  // Build rules
  const rules: ScanRule[] = [
    ...getPiiRules(),
    ...getContentRules(),
    ...(options.skipMalware ? [] : getMalwareRules()),
  ];

  // Check for mcp-scan availability
  let useMcpScan = options.useMcpScan;
  if (useMcpScan) {
    const mcpStatus = await checkMcpScan();
    if (!mcpStatus.available) {
      console.log(
        style.warn("  ⚠ mcp-scan not available, using built-in scanner only")
      );
      useMcpScan = false;
    } else {
      console.log(style.dim(`  Using mcp-scan ${mcpStatus.version}`));
    }
  }

  // Try to get skills via openclaw CLI first
  const spinner = new Spinner("Discovering skills...");
  spinner.start();

  let skillPaths: Array<{ name: string; path: string }> = [];

  const openclawResult = await listOpenClawSkills();
  if (openclawResult.success && openclawResult.skills.length > 0) {
    for (const skill of openclawResult.skills) {
      const pathResult = await getSkillPath(skill.name);
      if (pathResult.success && pathResult.path) {
        skillPaths.push({ name: skill.name, path: pathResult.path });
      }
    }
  }

  // Fallback: scan extensions directory directly
  if (skillPaths.length === 0) {
    const extensionsDir = getSkillsDir();
    try {
      const entries = await readdir(extensionsDir);
      for (const entry of entries) {
        if (entry === "lobstercage") continue; // Skip ourselves
        const entryPath = join(extensionsDir, entry);
        const stats = await stat(entryPath);
        if (stats.isDirectory()) {
          skillPaths.push({ name: entry, path: entryPath });
        }
      }
    } catch {
      // No extensions directory
    }
  }

  spinner.stop(`Found ${skillPaths.length} skill(s)`);

  if (skillPaths.length === 0) {
    console.log(style.dim("  No skills found to scan"));
    return;
  }

  // Scan each skill
  const results: SkillScanResult[] = [];
  let totalViolations = 0;

  for (const { name, path } of skillPaths) {
    const skillSpinner = new Spinner(`Scanning ${name}...`);
    skillSpinner.start();

    const { violations, filesScanned } = await scanSkillDirectory(path, rules);
    let mcpIssues = 0;

    // Run mcp-scan if available
    if (useMcpScan) {
      const mcpResult = await runMcpScan(path);
      if (mcpResult.success) {
        mcpIssues = mcpResult.issues.length;
      }
    }

    const result: SkillScanResult = {
      skillName: name,
      path,
      violations,
      mcpIssues,
      filesScanned,
    };
    results.push(result);

    totalViolations += violations.length;

    if (violations.length === 0 && mcpIssues === 0) {
      skillSpinner.stop(`${name}: ${style.bright("✓")} clean (${filesScanned} files)`);
    } else {
      skillSpinner.stop(
        `${name}: ${style.error(
          `${violations.length} violation(s)`
        )}${mcpIssues > 0 ? `, ${mcpIssues} mcp-scan issue(s)` : ""}`
      );
    }
  }

  console.log();

  // Show detailed violations
  const issueSkills = results.filter(
    (r) => r.violations.length > 0 || r.mcpIssues > 0
  );

  if (issueSkills.length > 0) {
    console.log(style.error("Issues Found:\n"));

    for (const result of issueSkills) {
      console.log(`  ${style.bright(result.skillName)}`);
      console.log(style.dim(`    Path: ${result.path}`));

      for (const v of result.violations) {
        const icon =
          v.action === "shutdown"
            ? style.error("⛔")
            : v.action === "block"
            ? style.warn("🚫")
            : "⚠️";
        console.log(`    ${icon} [${v.ruleId}] ${v.matchPreview}`);
      }
      console.log();
    }

    // Quarantine if requested
    if (options.quarantine) {
      console.log(style.warn("Quarantining flagged skills...\n"));

      for (const result of issueSkills) {
        // Only quarantine skills with shutdown-level violations
        const hasShutdown = result.violations.some((v) => v.action === "shutdown");

        if (hasShutdown) {
          const qSpinner = new Spinner(`Quarantining ${result.skillName}...`);
          qSpinner.start();

          try {
            // First disable the skill
            await setSkillEnabled(result.skillName, false);

            // Then quarantine
            await quarantineSkill(
              result.skillName,
              result.path,
              `Malware detection: ${result.violations.length} violation(s)`,
              result.violations
            );

            qSpinner.stop(`${result.skillName} quarantined`);
          } catch (err) {
            qSpinner.stop(
              style.error(
                `Failed to quarantine ${result.skillName}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            );
          }
        } else {
          // Just disable non-critical flagged skills
          try {
            await setSkillEnabled(result.skillName, false);
            console.log(
              style.dim(`  Disabled ${result.skillName} (non-critical violations)`)
            );
          } catch {
            // Ignore disable errors
          }
        }
      }
    } else {
      console.log(
        style.dim(
          `Run with ${style.bright("--quarantine")} to quarantine flagged skills`
        )
      );
    }
  }

  // Record scan event
  const violationEvents: ViolationEvent[] = [];
  const violationCounts: Record<
    string,
    { category: "pii" | "content" | "malware"; action: "warn" | "block" | "shutdown"; count: number }
  > = {};

  for (const result of results) {
    for (const v of result.violations) {
      if (!violationCounts[v.ruleId]) {
        violationCounts[v.ruleId] = { category: v.category, action: v.action, count: 0 };
      }
      violationCounts[v.ruleId].count++;
    }
  }

  for (const [ruleId, data] of Object.entries(violationCounts)) {
    violationEvents.push({
      ruleId,
      category: data.category,
      action: data.action,
      count: data.count,
    });
  }

  await recordScanEvent("skill-scan", violationEvents);

  // Summary
  console.log(style.bright("\nSummary:"));
  console.log(`  Skills scanned: ${results.length}`);
  console.log(
    `  Total files: ${results.reduce((sum, r) => sum + r.filesScanned, 0)}`
  );

  if (totalViolations === 0) {
    console.log(`  Status: ${style.bright("✓")} All clean`);
  } else {
    console.log(`  Violations: ${style.error(String(totalViolations))}`);
  }

  console.log();
}
