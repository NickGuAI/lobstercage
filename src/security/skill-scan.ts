import { readFile, readdir, lstat, realpath, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { scanContent, getContentRules, getMalwareRules } from "../scanner/engine.js";
import type { ScanRule, RuleAction, RuleCategory } from "../scanner/types.js";
import { quarantineSkill, type QuarantineRecord } from "./quarantine.js";
import { getExtensionsDir } from "./paths.js";

export type SkillViolation = {
  skillName: string;
  skillPath: string;
  filePath: string;
  ruleId: string;
  category: RuleCategory;
  action: RuleAction;
  matchPreview: string;
};

export type SkillScanFinding = {
  skillName: string;
  skillPath: string;
  violations: SkillViolation[];
  quarantined?: QuarantineRecord;
};

export type SkillScanReport = {
  skillsScanned: number;
  findings: SkillScanFinding[];
  quarantinedCount: number;
  errors: string[];
};

type SkillScanOptions = {
  quarantine: boolean;
  rules?: ScanRule[];
};

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".json5",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".md",
  ".txt",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".py",
  ".rb",
  ".lua",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".php",
]);

async function listSkillDirectories(): Promise<Array<{ name: string; path: string }>> {
  const extensionsDir = getExtensionsDir();
  const skills: Array<{ name: string; path: string }> = [];
  let entries: string[] = [];

  try {
    entries = await readdir(extensionsDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry === "lobstercage") continue;
    const fullPath = join(extensionsDir, entry);
    try {
      const info = await lstat(fullPath);
      if (info.isDirectory() && !info.isSymbolicLink()) {
        skills.push({ name: entry, path: fullPath });
      }
    } catch {
      // Ignore unreadable entry.
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function listFilesRecursive(dir: string, rootDir?: string): Promise<string[]> {
  const root = rootDir ?? dir;
  // Throws on readdir failure so callers can report unreadable skill paths
  const entries = await readdir(dir);

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let info;
    try {
      info = await lstat(fullPath);
    } catch {
      continue;
    }
    if (info.isDirectory() && !info.isSymbolicLink()) {
      try {
        files.push(...(await listFilesRecursive(fullPath, root)));
      } catch {
        // Continue scanning siblings if a subdirectory is unreadable
      }
    } else if (info.isFile()) {
      files.push(fullPath);
    } else if (info.isSymbolicLink()) {
      // Validate symlink target before scanning: a malicious skill could
      // symlink to /etc/shadow or other sensitive files outside the skill
      // directory. We resolve the real path and reject targets outside root,
      // matching the same boundary check used in integrity.ts.
      try {
        const resolved = await realpath(fullPath);
        if (!resolved.startsWith(root + "/") && resolved !== root) {
          continue;
        }
        const targetInfo = await stat(fullPath);
        if (targetInfo.isFile()) {
          files.push(fullPath);
        }
      } catch {
        // Broken or unresolvable symlink — skip
      }
    }
  }
  return files;
}

function shouldScanFile(filePath: string, size: number): boolean {
  if (size > 2 * 1024 * 1024) return false;
  const ext = extname(filePath).toLowerCase();
  return ext === "" || TEXT_EXTENSIONS.has(ext);
}

function isLikelyText(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 1024);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return false;
  }
  return true;
}

export async function scanInstalledSkills(options: SkillScanOptions): Promise<SkillScanReport> {
  const rules = options.rules ?? [...getMalwareRules(), ...getContentRules()];
  const report: SkillScanReport = {
    skillsScanned: 0,
    findings: [],
    quarantinedCount: 0,
    errors: [],
  };

  const skills = await listSkillDirectories();

  for (const skill of skills) {
    report.skillsScanned += 1;
    const violations: SkillViolation[] = [];

    try {
      const files = await listFilesRecursive(skill.path);
      for (const filePath of files) {
        let info;
        try {
          // Use stat (not lstat) to get the real target size for symlinks
          info = await stat(filePath);
        } catch {
          continue;
        }
        if (!info.isFile() || !shouldScanFile(filePath, info.size)) {
          continue;
        }

        let buffer: Buffer;
        try {
          buffer = await readFile(filePath);
        } catch {
          continue;
        }

        if (!isLikelyText(buffer)) {
          continue;
        }

        const content = buffer.toString("utf-8");
        const fileViolations = scanContent(content, rules);
        for (const violation of fileViolations) {
          violations.push({
            skillName: skill.name,
            skillPath: skill.path,
            filePath,
            ruleId: violation.ruleId,
            category: violation.category,
            action: violation.action,
            matchPreview: violation.matchPreview,
          });
        }
      }
    } catch (error) {
      report.errors.push(`Failed to scan ${skill.name}: ${String(error)}`);
      continue;
    }

    if (violations.length === 0) {
      continue;
    }

    const finding: SkillScanFinding = {
      skillName: skill.name,
      skillPath: skill.path,
      violations,
    };

    if (options.quarantine) {
      try {
        const quarantined = await quarantineSkill(
          skill.path,
          violations.map((v) => v.ruleId),
          "Detected malware/content security violations during skill scan"
        );
        finding.quarantined = quarantined;
        report.quarantinedCount += 1;
      } catch (error) {
        report.errors.push(`Failed to quarantine ${skill.name}: ${String(error)}`);
      }
    }

    report.findings.push(finding);
  }

  return report;
}
