import { writeFile } from "node:fs/promises";
import { matrixRain, printBanner, style } from "../ui/matrix.js";
import { renderReport, serializeReport } from "../ui/report.js";
import { getPiiRules, getContentRules } from "../scanner/engine.js";
import { forensicScan } from "../forensic/scan.js";
import { installGuard, uninstallGuard } from "../guard/install.js";
import type { ScanRule } from "../scanner/types.js";

export type CatchOptions = {
  scanOnly: boolean;
  guardOnly: boolean;
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

  // Matrix intro
  if (process.stdout.isTTY) {
    await matrixRain(2000);
  }
  printBanner();

  const rules = loadRules(options.configPath);

  // Phase 1: Forensic scan
  if (!options.guardOnly) {
    console.log(style.tag("SCAN") + " " + style.bold("Phase 1: Forensic Session Scan"));
    console.log();

    const report = await forensicScan(rules);
    console.log();

    renderReport(report);

    // Write report to file if requested
    if (options.reportPath) {
      const text = serializeReport(report);
      await writeFile(options.reportPath, text, "utf-8");
      console.log(style.tag("SCAN") + " " + style.dark(`Report written to ${options.reportPath}`));
      console.log();
    }
  }

  // Phase 2: Install live guard
  if (!options.scanOnly) {
    console.log(style.tag("GUARD") + " " + style.bold("Phase 2: Installing Live Guard"));
    console.log();
    await installGuard();
    console.log();
  }

  // Summary
  console.log(style.bold("  ── Done ──"));
  console.log();
}
