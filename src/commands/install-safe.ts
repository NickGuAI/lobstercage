/**
 * Safe install command with 5-step pipeline:
 * 1. Acquire (download/clone)
 * 2. Pre-scan (before installation)
 * 3. Install disabled
 * 4. Post-scan
 * 5. Enable (if clean)
 */

import { readFile, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { Spinner, style } from "../ui/matrix.js";
import { scanContent, getMalwareRules, getPiiRules, getContentRules } from "../scanner/engine.js";
import {
  installSkillSafe,
  runMcpScan,
  checkMcpScan,
  setSkillEnabled,
  getSkillPath,
} from "../integration/external-tools.js";
import { createSkillBaseline, saveBaseline, loadBaseline } from "../integrity/hash.js";
import type { Violation, ScanRule } from "../scanner/types.js";

export type InstallSafeOptions = {
  source: string;
  enableAfterInstall: boolean;
  skipMcpScan: boolean;
  skipMalware: boolean;
  force: boolean;
};

/** Installation result */
export type InstallResult = {
  success: boolean;
  skillName?: string;
  preScanViolations: Violation[];
  postScanViolations: Violation[];
  mcpIssues: number;
  enabled: boolean;
  error?: string;
};

/**
 * Recursively scan all JS/TS files in a directory.
 */
async function scanDirectory(
  dir: string,
  rules: ScanRule[]
): Promise<Violation[]> {
  const violations: Violation[] = [];

  async function scanDir(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir);

      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          if (entry === "node_modules" || entry.startsWith(".")) {
            continue;
          }
          await scanDir(fullPath);
        } else if (
          stats.isFile() &&
          (entry.endsWith(".js") ||
            entry.endsWith(".ts") ||
            entry.endsWith(".mjs") ||
            entry.endsWith(".cjs") ||
            entry.endsWith(".json"))
        ) {
          try {
            const content = await readFile(fullPath, "utf-8");
            const fileViolations = scanContent(content, rules);

            for (const v of fileViolations) {
              violations.push({
                ...v,
                matchPreview: `[${entry}] ${v.matchPreview}`,
              });
            }
          } catch {
            // Skip files we can't read
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await scanDir(dir);
  return violations;
}

/**
 * Run the safe install command.
 */
export async function runInstallSafe(options: InstallSafeOptions): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    preScanViolations: [],
    postScanViolations: [],
    mcpIssues: 0,
    enabled: false,
  };

  console.log(style.bright("\n🦞 Safe Install Pipeline\n"));

  // Build rules
  const rules: ScanRule[] = [
    ...getPiiRules(),
    ...getContentRules(),
    ...(options.skipMalware ? [] : getMalwareRules()),
  ];

  // Check mcp-scan availability
  let useMcpScan = !options.skipMcpScan;
  if (useMcpScan) {
    const mcpStatus = await checkMcpScan();
    if (!mcpStatus.available) {
      console.log(style.warn("  ⚠ mcp-scan not available"));
      useMcpScan = false;
    }
  }

  // Step 1: Pre-scan source (if it's a local path)
  const isLocalPath = !options.source.startsWith("http") && !options.source.includes("@");

  if (isLocalPath) {
    const preScanSpinner = new Spinner("Step 1: Pre-scanning source...");
    preScanSpinner.start();

    try {
      const stats = await stat(options.source);
      if (stats.isDirectory()) {
        result.preScanViolations = await scanDirectory(options.source, rules);

        if (useMcpScan) {
          const mcpResult = await runMcpScan(options.source);
          if (mcpResult.success) {
            result.mcpIssues += mcpResult.issues.length;
          }
        }
      }
    } catch {
      // Not a valid local path, probably a registry package
    }

    const preScanIssues = result.preScanViolations.length + result.mcpIssues;
    if (preScanIssues > 0) {
      preScanSpinner.stop(style.error(`${preScanIssues} issue(s) found in pre-scan`));

      // Check for shutdown-level violations
      const hasShutdown = result.preScanViolations.some((v) => v.action === "shutdown");

      if (hasShutdown && !options.force) {
        console.log(
          style.error(
            "\n  ⛔ Critical malware patterns detected. Installation blocked."
          )
        );
        console.log(style.dim("  Use --force to override (not recommended)"));

        for (const v of result.preScanViolations.filter((v) => v.action === "shutdown")) {
          console.log(`    ${style.error("⛔")} [${v.ruleId}] ${v.matchPreview}`);
        }

        result.error = "Critical malware detected in pre-scan";
        return result;
      }
    } else {
      preScanSpinner.stop("Step 1: Pre-scan clean ✓");
    }
  } else {
    console.log(style.dim("  Step 1: Pre-scan skipped (remote source)"));
  }

  // Step 2: Install with --disabled
  const installSpinner = new Spinner("Step 2: Installing (disabled by default)...");
  installSpinner.start();

  const installResult = await installSkillSafe(options.source, {
    enableAfterInstall: false, // Never enable immediately
  });

  if (!installResult.success) {
    installSpinner.stop(style.error(`Installation failed: ${installResult.error}`));
    result.error = installResult.error ?? "Installation failed";
    return result;
  }

  result.skillName = installResult.skillName;
  installSpinner.stop(`Step 2: Installed ${result.skillName ?? "skill"} (disabled) ✓`);

  // Step 3: Get skill path and post-scan
  const postScanSpinner = new Spinner("Step 3: Post-installation scan...");
  postScanSpinner.start();

  let skillPath: string | null = null;

  if (result.skillName) {
    const pathResult = await getSkillPath(result.skillName);
    if (pathResult.success && pathResult.path) {
      skillPath = pathResult.path;
      result.postScanViolations = await scanDirectory(skillPath, rules);

      if (useMcpScan) {
        const mcpResult = await runMcpScan(skillPath);
        if (mcpResult.success) {
          result.mcpIssues += mcpResult.issues.length;
        }
      }
    }
  }

  const postScanIssues = result.postScanViolations.length;
  if (postScanIssues > 0) {
    postScanSpinner.stop(style.error(`${postScanIssues} violation(s) in post-scan`));

    // Show violations
    for (const v of result.postScanViolations) {
      const icon =
        v.action === "shutdown"
          ? style.error("⛔")
          : v.action === "block"
          ? style.warn("🚫")
          : "⚠️";
      console.log(`    ${icon} [${v.ruleId}] ${v.matchPreview}`);
    }

    // Check for shutdown-level violations
    const hasShutdown = result.postScanViolations.some((v) => v.action === "shutdown");

    if (hasShutdown && !options.force) {
      console.log(
        style.error("\n  ⛔ Critical malware detected. Skill will NOT be enabled.")
      );

      // Uninstall the skill
      if (skillPath) {
        try {
          await rm(skillPath, { recursive: true, force: true });
          console.log(style.dim("  Skill has been removed."));
        } catch {
          console.log(style.warn("  Warning: Could not remove skill."));
        }
      }

      result.error = "Critical malware detected in post-scan";
      return result;
    }
  } else {
    postScanSpinner.stop("Step 3: Post-scan clean ✓");
  }

  // Step 4: Create integrity baseline
  if (skillPath) {
    const baselineSpinner = new Spinner("Step 4: Creating integrity baseline...");
    baselineSpinner.start();

    try {
      const baseline = await createSkillBaseline(skillPath);
      await saveBaseline(baseline);
      baselineSpinner.stop("Step 4: Integrity baseline created ✓");
    } catch (err) {
      baselineSpinner.stop(style.warn("Step 4: Could not create baseline"));
    }
  } else {
    console.log(style.dim("  Step 4: Baseline skipped (no skill path)"));
  }

  // Step 5: Enable if requested and clean
  if (options.enableAfterInstall && result.skillName) {
    const allViolations = [...result.preScanViolations, ...result.postScanViolations];
    const hasBlockOrHigher = allViolations.some(
      (v) => v.action === "block" || v.action === "shutdown"
    );

    if (hasBlockOrHigher && !options.force) {
      console.log(
        style.warn("\n  ⚠ Skill not enabled due to security violations.")
      );
      console.log(style.dim(`  Use --force to enable anyway (not recommended)`));
    } else {
      const enableSpinner = new Spinner("Step 5: Enabling skill...");
      enableSpinner.start();

      const enableResult = await setSkillEnabled(result.skillName, true);

      if (enableResult.success) {
        result.enabled = true;
        enableSpinner.stop("Step 5: Skill enabled ✓");
      } else {
        enableSpinner.stop(style.warn("Step 5: Could not enable skill"));
      }
    }
  } else {
    console.log(style.dim("  Step 5: Skill left disabled (manual enable required)"));
    console.log(
      style.dim(
        `    Run: openclaw skill enable ${result.skillName ?? "<skill-name>"}`
      )
    );
  }

  result.success = true;

  // Summary
  console.log(style.bright("\n✓ Installation Complete\n"));
  console.log(`  Skill: ${result.skillName ?? "unknown"}`);
  console.log(`  Status: ${result.enabled ? style.bright("enabled") : style.dim("disabled")}`);

  const totalViolations =
    result.preScanViolations.length + result.postScanViolations.length;
  if (totalViolations > 0) {
    console.log(`  Warnings: ${style.warn(String(totalViolations))}`);
  }

  console.log();

  return result;
}
