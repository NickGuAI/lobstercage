import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { style } from "../ui/matrix.js";
import { installExtensionDisabled, enableExtension, runOpenClaw } from "../integrations/openclaw.js";
import { runMcpScan } from "../integrations/mcp-scan.js";
import { appendApprovalLedgerEntry } from "../security/approval-ledger.js";
import { hashDirectorySha256 } from "../security/integrity.js";
import { resolveSkillInstallPath } from "../security/quarantine.js";
import { recordScanEvent } from "../stats/storage.js";
import type { ViolationEvent } from "../stats/types.js";

export type InstallSafeOptions = {
  source: string;
  enable: boolean;
};

type AcquiredSource = {
  sourcePath: string;
  skillName: string;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeSkillName(inputPath: string): string {
  const base = basename(inputPath).replace(/\.(tar\.gz|tgz|zip)$/i, "");
  return base || "unknown-skill";
}

async function acquireSource(source: string, stagingRoot: string): Promise<AcquiredSource> {
  const resolved = resolve(source);
  if (await pathExists(resolved)) {
    const info = await stat(resolved);
    const skillName = normalizeSkillName(resolved);
    const destination = join(stagingRoot, skillName);

    if (info.isDirectory()) {
      await cp(resolved, destination, { recursive: true });
      return { sourcePath: destination, skillName };
    }

    if (info.isFile()) {
      // Stage the file directly so downstream install uses the actual artifact
      const fileDest = join(stagingRoot, basename(resolved));
      await cp(resolved, fileDest);
      return { sourcePath: fileDest, skillName };
    }
  }

  // Remote acquisition path via OpenClaw CLI if available.
  const download = await runOpenClaw(["extensions", "download", source, "--output", stagingRoot]);
  if (!download.ok) {
    throw new Error(
      `Failed to acquire '${source}'. Provide a local path or ensure openclaw can download extensions. ${download.stderr || download.stdout}`
    );
  }

  // Discover whatever OpenClaw created in staging instead of hard-coding a name
  const entries = await readdir(stagingRoot);
  if (entries.length > 0) {
    const firstEntry = entries[0];
    const destination = join(stagingRoot, firstEntry);
    return { sourcePath: destination, skillName: firstEntry };
  }

  throw new Error(`OpenClaw download succeeded but could not locate downloaded content for '${source}'.`);
}

async function markDisabled(installPath: string): Promise<void> {
  await mkdir(installPath, { recursive: true });
  await writeFile(join(installPath, ".lobstercage-disabled"), "disabled=true\n", "utf-8");
}

async function clearDisabledMarker(installPath: string): Promise<void> {
  try {
    await unlink(join(installPath, ".lobstercage-disabled"));
  } catch {
    // Marker may not exist.
  }
}

export async function runInstallSafe(options: InstallSafeOptions): Promise<void> {
  if (!options.source) {
    throw new Error("install-safe requires a source path or specifier");
  }

  console.log();
  console.log(style.bold("  INSTALL-SAFE"));
  console.log(style.dim("  acquire -> pre-scan -> install disabled -> post-scan -> optional enable"));
  console.log();

  const stagingRoot = await mkdtemp(join(tmpdir(), "lobstercage-install-safe-"));
  let acquired: AcquiredSource | null = null;

  try {
    console.log(style.dim(`  Acquiring source: ${options.source}`));
    acquired = await acquireSource(options.source, stagingRoot);
    console.log(style.green(`  ✓ Acquired ${acquired.skillName}`));

    const preScan = await runMcpScan(acquired.sourcePath);
    if (!preScan.available) {
      console.log(style.warn(`  ! Pre-scan degraded: ${preScan.summary}`));
    } else if (!preScan.clean) {
      console.log(style.warn(`  ! Pre-scan reported findings: ${preScan.summary}`));
    } else {
      console.log(style.green("  ✓ Pre-scan clean"));
    }

    let installPath = resolveSkillInstallPath(acquired.skillName);
    const extDir = dirname(installPath);
    await mkdir(extDir, { recursive: true });

    // Snapshot extensions dir before install to detect what OpenClaw creates
    let entriesBefore: Set<string>;
    try {
      entriesBefore = new Set(await readdir(extDir));
    } catch {
      entriesBefore = new Set();
    }

    // Prefer native OpenClaw install command with staged artifact; fallback to local copy.
    const installResult = await installExtensionDisabled(acquired.sourcePath);
    if (installResult.ok) {
      // Use before/after delta to find the actual installed path
      if (!(await pathExists(installPath))) {
        let resolved = false;
        try {
          const entriesAfter = await readdir(extDir);
          const newEntries = entriesAfter.filter((e) => !entriesBefore.has(e));
          if (newEntries.length > 0) {
            installPath = join(extDir, newEntries[0]);
            resolved = true;
          }
        } catch {
          // Discovery failed
        }
        if (!resolved) {
          throw new Error(
            `OpenClaw install succeeded but installed path could not be resolved. ` +
              `Expected '${installPath}' does not exist and no new entries found in extensions dir.`
          );
        }
      }
      console.log(style.green("  ✓ Installed through OpenClaw in disabled mode"));
    } else {
      await rm(installPath, { recursive: true, force: true });
      const sourceInfo = await stat(acquired.sourcePath);
      if (sourceInfo.isDirectory()) {
        await cp(acquired.sourcePath, installPath, { recursive: true });
      } else {
        await mkdir(installPath, { recursive: true });
        await cp(acquired.sourcePath, join(installPath, basename(acquired.sourcePath)));
      }
      console.log(style.warn("  ! OpenClaw install unavailable/failed, used local disabled copy"));
    }

    await markDisabled(installPath);
    const postScan = await runMcpScan(installPath);
    if (!postScan.available) {
      console.log(style.warn(`  ! Post-scan degraded: ${postScan.summary}`));
    } else if (!postScan.clean) {
      console.log(style.warn(`  ! Post-scan reported findings: ${postScan.summary}`));
    } else {
      console.log(style.green("  ✓ Post-scan clean"));
    }

    const integrity = await hashDirectorySha256(installPath);
    const canEnable =
      options.enable &&
      preScan.available &&
      postScan.available &&
      preScan.clean &&
      postScan.clean;

    const installEvents: ViolationEvent[] = [];
    if (!preScan.available) {
      installEvents.push({
        ruleId: "install-safe-pre-scan-unavailable",
        category: "malware" as const,
        action: "warn" as const,
        count: 1,
      });
    } else if (!preScan.clean) {
      installEvents.push({
        ruleId: "install-safe-pre-scan-findings",
        category: "malware" as const,
        action: "block" as const,
        count: 1,
      });
    }
    if (!postScan.available) {
      installEvents.push({
        ruleId: "install-safe-post-scan-unavailable",
        category: "malware" as const,
        action: "warn" as const,
        count: 1,
      });
    } else if (!postScan.clean) {
      installEvents.push({
        ruleId: "install-safe-post-scan-findings",
        category: "malware" as const,
        action: "block" as const,
        count: 1,
      });
    }
    if (installEvents.length > 0) {
      await recordScanEvent("install-safe", installEvents);
    }

    await appendApprovalLedgerEntry({
      skillName: acquired.skillName,
      source: options.source,
      installedPath: installPath,
      integrityHash: integrity.hash,
      preScan: {
        available: preScan.available,
        clean: preScan.clean,
        summary: preScan.summary,
      },
      postScan: {
        available: postScan.available,
        clean: postScan.clean,
        summary: postScan.summary,
      },
      approved: canEnable,
    });

    if (canEnable) {
      const enableResult = await enableExtension(acquired.skillName);
      if (!enableResult.ok) {
        // If OpenClaw enable fails, still clear local marker to avoid indefinite lockout
        // when operating in file-copy mode.
        await clearDisabledMarker(installPath);
        console.log(style.warn("  ! Enable command failed; cleared local disabled marker only"));
      } else {
        await clearDisabledMarker(installPath);
        console.log(style.green("  ✓ Enabled skill after clean scans"));
      }
    } else {
      console.log(style.dim("  Skill remains disabled (pre-enable gate not satisfied)"));
      if (!options.enable) {
        console.log(style.dim("  Re-run with --enable to auto-enable only if scans are clean"));
      }
    }

    console.log(style.dim(`  Integrity hash: ${integrity.hash}`));
    console.log();
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
