import { writeFile } from "node:fs/promises";
import { matrixFlow, printHeader, Spinner, style } from "../ui/matrix.js";
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

  // Matrix intro animation
  await matrixFlow(1200);
  printHeader();

  const rules = loadRules(options.configPath);

  // Phase 1: Forensic scan
  if (!options.guardOnly) {
    const spinner = new Spinner("Scanning sessions...");
    spinner.start();

    const report = await forensicScan(rules);

    spinner.stop("Scan complete");
    console.log();

    renderReport(report);

    // Write report to file if requested
    if (options.reportPath) {
      const text = serializeReport(report);
      await writeFile(options.reportPath, text, "utf-8");
      console.log(style.dim(`  Report saved to ${options.reportPath}`));
      console.log();
    }
  }

  // Phase 2: Install live guard
  if (!options.scanOnly) {
    const guardSpinner = new Spinner("Installing live guard...");
    guardSpinner.start();

    await installGuard();

    guardSpinner.stop("Guard installed");
    console.log(style.dim("  Outgoing messages will be scanned in real-time"));
    console.log();
  }
}
