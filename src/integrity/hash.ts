/**
 * Integrity hash baseline and drift detection.
 *
 * Uses SHA-256 streaming for large files with atomic file operations.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, readdir, stat, rename, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { getStateDir } from "../audit/config-loader.js";

/** Hash entry for a single file */
export type FileHash = {
  path: string;
  hash: string;
  size: number;
  mtime: string;
};

/** Integrity baseline database */
export type IntegrityBaseline = {
  version: 1;
  createdAt: string;
  updatedAt: string;
  files: FileHash[];
};

/** Drift detection result */
export type DriftResult = {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: number;
};

/** Get integrity database path */
export function getIntegrityPath(): string {
  return join(getStateDir(), "lobstercage", "integrity.json");
}

/**
 * Compute SHA-256 hash of a file using streaming for large files.
 */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Recursively collect all files in a directory.
 */
async function collectFiles(
  dir: string,
  basePath: string,
  files: string[] = []
): Promise<string[]> {
  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry === "node_modules" || entry.startsWith(".")) {
          continue;
        }
        await collectFiles(fullPath, basePath, files);
      } else if (stats.isFile()) {
        // Skip hidden files
        if (!entry.startsWith(".")) {
          files.push(relative(basePath, fullPath));
        }
      }
    }
  } catch {
    // Ignore errors for inaccessible directories
  }

  return files;
}

/**
 * Create an integrity baseline for a directory.
 */
export async function createBaseline(
  targetDir: string
): Promise<IntegrityBaseline> {
  const files = await collectFiles(targetDir, targetDir);
  const fileHashes: FileHash[] = [];

  for (const relPath of files) {
    const fullPath = join(targetDir, relPath);
    try {
      const stats = await stat(fullPath);
      const hash = await hashFile(fullPath);

      fileHashes.push({
        path: relPath,
        hash,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    } catch {
      // Skip files we can't read
    }
  }

  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    files: fileHashes,
  };
}

/**
 * Load the stored integrity baseline.
 */
export async function loadBaseline(): Promise<IntegrityBaseline | null> {
  try {
    const text = await readFile(getIntegrityPath(), "utf-8");
    const data = JSON.parse(text) as IntegrityBaseline;

    if (data.version !== 1) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Save an integrity baseline atomically.
 */
export async function saveBaseline(baseline: IntegrityBaseline): Promise<void> {
  const path = getIntegrityPath();
  const dir = join(path, "..");
  await mkdir(dir, { recursive: true });

  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(baseline, null, 2), "utf-8");
  await rename(tempPath, path);
}

/**
 * Detect drift between stored baseline and current state.
 */
export async function detectDrift(
  targetDir: string,
  baseline: IntegrityBaseline
): Promise<DriftResult> {
  const current = await createBaseline(targetDir);

  const baselineMap = new Map(baseline.files.map((f) => [f.path, f]));
  const currentMap = new Map(current.files.map((f) => [f.path, f]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  let unchanged = 0;

  // Check for removed and modified files
  for (const [path, baseFile] of baselineMap) {
    const currentFile = currentMap.get(path);

    if (!currentFile) {
      removed.push(path);
    } else if (currentFile.hash !== baseFile.hash) {
      modified.push(path);
    } else {
      unchanged++;
    }
  }

  // Check for added files
  for (const path of currentMap.keys()) {
    if (!baselineMap.has(path)) {
      added.push(path);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Update baseline with current file hashes for specific files.
 */
export async function updateBaseline(
  targetDir: string,
  filesToUpdate: string[],
  baseline: IntegrityBaseline
): Promise<IntegrityBaseline> {
  const updatedFiles = new Map(baseline.files.map((f) => [f.path, f]));

  for (const relPath of filesToUpdate) {
    const fullPath = join(targetDir, relPath);
    try {
      const stats = await stat(fullPath);
      const hash = await hashFile(fullPath);

      updatedFiles.set(relPath, {
        path: relPath,
        hash,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    } catch {
      // File was removed
      updatedFiles.delete(relPath);
    }
  }

  return {
    ...baseline,
    updatedAt: new Date().toISOString(),
    files: Array.from(updatedFiles.values()),
  };
}

/**
 * Create a baseline for a specific skill directory.
 */
export async function createSkillBaseline(
  skillPath: string
): Promise<IntegrityBaseline> {
  return createBaseline(skillPath);
}

/**
 * Check if a skill's files have been modified since baseline was created.
 */
export async function checkSkillIntegrity(
  skillPath: string,
  baseline: IntegrityBaseline
): Promise<DriftResult> {
  return detectDrift(skillPath, baseline);
}
