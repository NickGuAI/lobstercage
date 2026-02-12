/**
 * Quarantine manager for isolating suspicious skills.
 *
 * Provides complete records and restore capability.
 */

import { mkdir, readFile, writeFile, rename, rm, readdir, stat, cp } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getStateDir } from "../audit/config-loader.js";
import type { Violation } from "../scanner/types.js";

/** Quarantine entry for a single skill */
export type QuarantineEntry = {
  id: string;
  skillName: string;
  originalPath: string;
  quarantinedAt: string;
  reason: string;
  violations: Violation[];
  restoreAvailable: boolean;
};

/** Quarantine database */
export type QuarantineDatabase = {
  version: 1;
  entries: QuarantineEntry[];
};

/** Get quarantine directory path */
export function getQuarantineDir(): string {
  return join(getStateDir(), "lobstercage", "quarantine");
}

/** Get quarantine database path */
export function getQuarantinePath(): string {
  return join(getQuarantineDir(), "index.json");
}

/**
 * Load the quarantine database.
 */
export async function loadQuarantine(): Promise<QuarantineDatabase> {
  try {
    const text = await readFile(getQuarantinePath(), "utf-8");
    const data = JSON.parse(text) as QuarantineDatabase;

    if (data.version !== 1) {
      return { version: 1, entries: [] };
    }

    return data;
  } catch {
    return { version: 1, entries: [] };
  }
}

/**
 * Save the quarantine database atomically.
 */
export async function saveQuarantine(db: QuarantineDatabase): Promise<void> {
  const dir = getQuarantineDir();
  await mkdir(dir, { recursive: true });

  const path = getQuarantinePath();
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(db, null, 2), "utf-8");
  await rename(tempPath, path);
}

/**
 * Move a skill to quarantine.
 */
export async function quarantineSkill(
  skillName: string,
  skillPath: string,
  reason: string,
  violations: Violation[] = []
): Promise<QuarantineEntry> {
  const db = await loadQuarantine();
  const quarantineDir = getQuarantineDir();
  const id = randomUUID();

  // Create quarantine storage directory for this skill
  const skillQuarantineDir = join(quarantineDir, id);
  await mkdir(skillQuarantineDir, { recursive: true });

  // Copy skill files to quarantine
  try {
    await cp(skillPath, join(skillQuarantineDir, "skill"), { recursive: true });
  } catch (err) {
    // If copy fails, we still want to track the quarantine
    console.error(`Warning: Could not backup skill to quarantine: ${err}`);
  }

  // Create entry
  const entry: QuarantineEntry = {
    id,
    skillName,
    originalPath: skillPath,
    quarantinedAt: new Date().toISOString(),
    reason,
    violations,
    restoreAvailable: true,
  };

  // Try to remove/disable the original skill
  try {
    // First try to just rename to .quarantined
    await rename(skillPath, `${skillPath}.quarantined`);
  } catch {
    // If that fails, try to delete (not preferred as we lose restore)
    try {
      await rm(skillPath, { recursive: true, force: true });
      entry.restoreAvailable = true; // We still have backup in quarantine dir
    } catch {
      // Could not remove original - mark as still present
      entry.restoreAvailable = true;
    }
  }

  // Add to database
  db.entries.push(entry);
  await saveQuarantine(db);

  return entry;
}

/**
 * Restore a skill from quarantine.
 */
export async function restoreSkill(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await loadQuarantine();
  const entry = db.entries.find((e) => e.id === entryId);

  if (!entry) {
    return { success: false, error: "Quarantine entry not found" };
  }

  if (!entry.restoreAvailable) {
    return { success: false, error: "Restore not available for this entry" };
  }

  const quarantineDir = getQuarantineDir();
  const skillQuarantineDir = join(quarantineDir, entryId, "skill");

  try {
    // Check if backup exists
    await stat(skillQuarantineDir);

    // Remove .quarantined version if it exists
    try {
      await rm(`${entry.originalPath}.quarantined`, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    // Copy back to original location
    await cp(skillQuarantineDir, entry.originalPath, { recursive: true });

    // Remove from quarantine database
    db.entries = db.entries.filter((e) => e.id !== entryId);
    await saveQuarantine(db);

    // Clean up quarantine storage
    try {
      await rm(join(quarantineDir, entryId), { recursive: true, force: true });
    } catch {
      // Non-critical
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to restore: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Permanently delete a quarantined skill.
 */
export async function deleteQuarantined(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await loadQuarantine();
  const entry = db.entries.find((e) => e.id === entryId);

  if (!entry) {
    return { success: false, error: "Quarantine entry not found" };
  }

  const quarantineDir = getQuarantineDir();

  try {
    // Remove quarantine storage
    await rm(join(quarantineDir, entryId), { recursive: true, force: true });

    // Remove .quarantined file if it exists
    try {
      await rm(`${entry.originalPath}.quarantined`, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    // Remove from database
    db.entries = db.entries.filter((e) => e.id !== entryId);
    await saveQuarantine(db);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * List all quarantined skills.
 */
export async function listQuarantined(): Promise<QuarantineEntry[]> {
  const db = await loadQuarantine();
  return db.entries;
}

/**
 * Get a specific quarantine entry.
 */
export async function getQuarantineEntry(
  entryId: string
): Promise<QuarantineEntry | null> {
  const db = await loadQuarantine();
  return db.entries.find((e) => e.id === entryId) ?? null;
}

/**
 * Check if a skill is currently quarantined.
 */
export async function isQuarantined(skillName: string): Promise<boolean> {
  const db = await loadQuarantine();
  return db.entries.some((e) => e.skillName === skillName);
}
