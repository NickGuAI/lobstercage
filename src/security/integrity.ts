import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, realpath, rename, lstat, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { getExtensionsDir, getLobstercageStateDir } from "./paths.js";

export type IntegrityBaseline = {
  version: 1;
  updatedAt: string;
  rootDir: string;
  files: Record<string, string>;
};

export type IntegrityDrift = {
  baselinePresent: boolean;
  rootDir: string;
  added: string[];
  removed: string[];
  modified: string[];
};

function normalizeRelativePath(filePath: string): string {
  return filePath.split("\\").join("/");
}

const MAX_HASHABLE_SIZE = 50 * 1024 * 1024; // 50MB limit for integrity hashing

async function listFilesRecursive(
  dir: string,
  rootDir?: string,
  visited?: Set<string>
): Promise<string[]> {
  const root = rootDir ?? dir;
  const seen = visited ?? new Set<string>();

  // Track resolved paths to prevent symlink loops
  let resolvedDir: string;
  try {
    resolvedDir = await realpath(dir);
  } catch {
    return [];
  }
  if (seen.has(resolvedDir)) return [];
  seen.add(resolvedDir);

  const entries = await readdir(dir);

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry);
    let info;
    try {
      info = await lstat(entryPath);
    } catch {
      continue;
    }
    if (info.isDirectory() && !info.isSymbolicLink()) {
      try {
        files.push(...(await listFilesRecursive(entryPath, root, seen)));
      } catch {
        // Continue scanning siblings if a subdirectory is unreadable
      }
    } else if (info.isFile()) {
      if (info.size <= MAX_HASHABLE_SIZE) {
        files.push(entryPath);
      }
    } else if (info.isSymbolicLink()) {
      try {
        const resolved = await realpath(entryPath);
        if (!resolved.startsWith(root + "/") && resolved !== root) {
          continue; // Target is outside extensions root — skip
        }
        const targetInfo = await stat(entryPath);
        if (targetInfo.isFile() && targetInfo.size <= MAX_HASHABLE_SIZE) {
          files.push(entryPath);
        } else if (targetInfo.isDirectory()) {
          // Follow symlinked dirs within root (loop-safe via visited set)
          try {
            files.push(...(await listFilesRecursive(resolved, root, seen)));
          } catch {
            // Continue if unreadable
          }
        }
      } catch {
        // Broken symlink or unresolvable target — skip
      }
    }
  }
  return files;
}

/** Stream file content into SHA-256 hash. */
export async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Snapshot file hashes relative to root directory. Returns empty if dir doesn't exist. */
export async function snapshotDirectoryHashes(rootDir: string): Promise<Record<string, string>> {
  let files: string[];
  try {
    files = await listFilesRecursive(rootDir);
  } catch {
    return {};
  }
  const snapshot: Record<string, string> = {};

  for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
    const rel = normalizeRelativePath(relative(rootDir, filePath));
    try {
      snapshot[rel] = await hashFileSha256(filePath);
    } catch {
      // Skip unreadable entries (broken symlinks, permission errors)
      // to avoid aborting the entire integrity check
    }
  }

  return snapshot;
}

/** Hash a directory deterministically from sorted relative file hashes. */
export async function hashDirectorySha256(dir: string): Promise<{
  hash: string;
  fileCount: number;
  files: Record<string, string>;
}> {
  const files = await snapshotDirectoryHashes(dir);
  const lines = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, hash]) => `${hash}  ${path}`)
    .join("\n");

  const rootHash = createHash("sha256").update(lines, "utf-8").digest("hex");
  return {
    hash: rootHash,
    fileCount: Object.keys(files).length,
    files,
  };
}

function baselinePath(): string {
  return join(getLobstercageStateDir(), "integrity-baseline.json");
}

export async function loadIntegrityBaseline(): Promise<IntegrityBaseline | null> {
  try {
    const raw = await readFile(baselinePath(), "utf-8");
    const parsed = JSON.parse(raw) as IntegrityBaseline;
    if (parsed.version !== 1 || typeof parsed.rootDir !== "string" || !parsed.files) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function saveIntegrityBaseline(data: IntegrityBaseline): Promise<void> {
  const path = baselinePath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), "utf-8");
  await rename(temp, path);
}

export async function writeExtensionsBaseline(): Promise<{ fileCount: number; path: string }> {
  const rootDir = getExtensionsDir();
  const files = await snapshotDirectoryHashes(rootDir);
  await saveIntegrityBaseline({
    version: 1,
    updatedAt: new Date().toISOString(),
    rootDir,
    files,
  });

  return {
    fileCount: Object.keys(files).length,
    path: baselinePath(),
  };
}

/** Compare current extension hashes against stored baseline. */
export async function detectExtensionsIntegrityDrift(): Promise<IntegrityDrift> {
  const rootDir = getExtensionsDir();
  const baseline = await loadIntegrityBaseline();
  if (!baseline) {
    return {
      baselinePresent: false,
      rootDir,
      added: [],
      removed: [],
      modified: [],
    };
  }

  const current = await snapshotDirectoryHashes(rootDir);
  const baselineFiles = baseline.files;

  const added = Object.keys(current).filter((file) => !(file in baselineFiles));
  const removed = Object.keys(baselineFiles).filter((file) => !(file in current));
  const modified = Object.keys(current).filter(
    (file) => file in baselineFiles && baselineFiles[file] !== current[file]
  );

  return {
    baselinePresent: true,
    rootDir: baseline.rootDir || rootDir,
    added: added.sort((a, b) => a.localeCompare(b)),
    removed: removed.sort((a, b) => a.localeCompare(b)),
    modified: modified.sort((a, b) => a.localeCompare(b)),
  };
}
