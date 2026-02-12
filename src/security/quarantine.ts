import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { getExtensionsDir, getLobstercageStateDir } from "./paths.js";

export type QuarantineRecord = {
  id: string;
  skillName: string;
  originalPath: string;
  quarantinedPath: string;
  detectedRuleIds: string[];
  reason: string;
  timestamp: string;
  restoredAt?: string;
};

type QuarantineDb = {
  version: 1;
  records: QuarantineRecord[];
};

function quarantineDir(): string {
  return join(getLobstercageStateDir(), "quarantine");
}

function recordsPath(): string {
  return join(getLobstercageStateDir(), "quarantine-records.json");
}

async function loadDb(): Promise<QuarantineDb> {
  try {
    const raw = await readFile(recordsPath(), "utf-8");
    const parsed = JSON.parse(raw) as QuarantineDb;
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
      return { version: 1, records: [] };
    }
    return parsed;
  } catch {
    return { version: 1, records: [] };
  }
}

async function saveDb(db: QuarantineDb): Promise<void> {
  const path = recordsPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(db, null, 2), "utf-8");
  await rename(temp, path);
}

export async function listQuarantineRecords(includeRestored: boolean = false): Promise<QuarantineRecord[]> {
  const db = await loadDb();
  return db.records.filter((r) => includeRestored || !r.restoredAt);
}

export async function quarantineSkill(
  skillPath: string,
  detectedRuleIds: string[],
  reason: string
): Promise<QuarantineRecord> {
  const db = await loadDb();
  const skillName = basename(skillPath);
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const destination = join(quarantineDir(), `${timestamp.slice(0, 10)}-${skillName}-${id.slice(0, 8)}`);

  await mkdir(quarantineDir(), { recursive: true });
  await rename(skillPath, destination);

  const record: QuarantineRecord = {
    id,
    skillName,
    originalPath: skillPath,
    quarantinedPath: destination,
    detectedRuleIds: [...new Set(detectedRuleIds)].sort((a, b) => a.localeCompare(b)),
    reason,
    timestamp,
  };

  db.records.push(record);
  await saveDb(db);
  return record;
}

export async function restoreQuarantinedSkill(identifier: string): Promise<{
  restored: boolean;
  message: string;
  record?: QuarantineRecord;
}> {
  const db = await loadDb();
  const record = db.records
    .filter((r) => !r.restoredAt)
    .find((r) => r.id === identifier || r.skillName === identifier);

  if (!record) {
    return {
      restored: false,
      message: `No active quarantine record found for '${identifier}'`,
    };
  }

  await mkdir(dirname(record.originalPath), { recursive: true });
  await rename(record.quarantinedPath, record.originalPath);
  record.restoredAt = new Date().toISOString();
  await saveDb(db);

  return {
    restored: true,
    message: `Restored ${record.skillName} to ${record.originalPath}`,
    record,
  };
}

/** Resolve where a skill would be installed under the OpenClaw extensions directory. */
export function resolveSkillInstallPath(skillName: string): string {
  return join(getExtensionsDir(), skillName);
}
