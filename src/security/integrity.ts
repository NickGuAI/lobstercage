import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, lstat, writeFile } from "node:fs/promises";
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

async function listFilesRecursive(dir: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

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
      files.push(...(await listFilesRecursive(entryPath)));
    } else if (info.isFile() && !info.isSymbolicLink()) {
      files.push(entryPath);
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

/** Snapshot file hashes relative to root directory. */
export async function snapshotDirectoryHashes(rootDir: string): Promise<Record<string, string>> {
  const files = await listFilesRecursive(rootDir);
  const snapshot: Record<string, string> = {};

  for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
    const rel = normalizeRelativePath(relative(rootDir, filePath));
    snapshot[rel] = await hashFileSha256(filePath);
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
