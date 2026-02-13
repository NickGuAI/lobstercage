// JSON persistence layer for stats storage

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getStateDir } from "../audit/config-loader.js";
import type {
  StatsDatabase,
  ScanEvent,
  ViolationEvent,
  DailySummary,
} from "./types.js";

/** Get stats directory path */
export function getStatsDir(): string {
  return join(getStateDir(), "lobstercage");
}

/** Get stats file path */
export function getStatsPath(): string {
  return join(getStatsDir(), "stats.json");
}

/** Create empty stats database */
function createEmptyStats(): StatsDatabase {
  return {
    version: 1,
    events: [],
    dailySummaries: [],
    ruleConfig: { rules: [], customRules: [] },
  };
}

/** Load stats from disk */
export async function loadStats(): Promise<StatsDatabase> {
  try {
    const text = await readFile(getStatsPath(), "utf-8");
    const data = JSON.parse(text) as StatsDatabase;
    // Validate version
    if (data.version !== 1) {
      console.warn("Stats file has unknown version, creating new");
      return createEmptyStats();
    }
    return data;
  } catch {
    return createEmptyStats();
  }
}

/** Save stats to disk atomically */
export async function saveStats(stats: StatsDatabase): Promise<void> {
  const dir = getStatsDir();
  await mkdir(dir, { recursive: true });

  const path = getStatsPath();
  const tempPath = `${path}.tmp`;

  // Write to temp file first for atomic save
  await writeFile(tempPath, JSON.stringify(stats, null, 2), "utf-8");

  // Rename to final path (atomic on most filesystems)
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, path);
}

/** Get today's date as YYYY-MM-DD */
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Update or create daily summary for today */
function updateDailySummary(
  summaries: DailySummary[],
  violations: ViolationEvent[]
): DailySummary[] {
  const today = getToday();
  const existingIndex = summaries.findIndex((s) => s.date === today);

  const totalViolations = violations.reduce((sum, v) => sum + v.count, 0);
  const violationsByRule: Record<string, number> = {};
  for (const v of violations) {
    violationsByRule[v.ruleId] = (violationsByRule[v.ruleId] || 0) + v.count;
  }

  if (existingIndex >= 0) {
    // Update existing summary
    const existing = summaries[existingIndex];
    const updated: DailySummary = {
      date: today,
      totalScans: existing.totalScans + 1,
      totalViolations: existing.totalViolations + totalViolations,
      violationsByRule: { ...existing.violationsByRule },
    };
    // Merge violations by rule
    for (const [ruleId, count] of Object.entries(violationsByRule)) {
      updated.violationsByRule[ruleId] =
        (updated.violationsByRule[ruleId] || 0) + count;
    }
    return [
      ...summaries.slice(0, existingIndex),
      updated,
      ...summaries.slice(existingIndex + 1),
    ];
  } else {
    // Create new summary
    return [
      ...summaries,
      {
        date: today,
        totalScans: 1,
        totalViolations,
        violationsByRule,
      },
    ];
  }
}

/** Record a new scan event */
export async function recordScanEvent(
  type: "forensic" | "guard" | "audit" | "skill-scan" | "integrity" | "install-safe",
  violations: ViolationEvent[]
): Promise<void> {
  const stats = await loadStats();

  const event: ScanEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    violations,
  };

  stats.events.push(event);
  stats.dailySummaries = updateDailySummary(stats.dailySummaries, violations);

  // Prune old events (keep last 90 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString();
  stats.events = stats.events.filter((e) => e.timestamp >= cutoffStr);
  stats.dailySummaries = stats.dailySummaries.filter(
    (s) => s.date >= cutoffStr.slice(0, 10)
  );

  await saveStats(stats);
}

/** Get stats for last N days */
export function getStatsForDays(
  stats: StatsDatabase,
  days: number
): DailySummary[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return stats.dailySummaries
    .filter((s) => s.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Get top triggered rules */
export function getTopRules(
  stats: StatsDatabase,
  days: number,
  limit: number = 5
): Array<{ ruleId: string; count: number }> {
  const summaries = getStatsForDays(stats, days);
  const totals: Record<string, number> = {};

  for (const summary of summaries) {
    for (const [ruleId, count] of Object.entries(summary.violationsByRule)) {
      totals[ruleId] = (totals[ruleId] || 0) + count;
    }
  }

  return Object.entries(totals)
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
