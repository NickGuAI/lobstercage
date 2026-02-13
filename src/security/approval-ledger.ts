import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { getLobstercageStateDir } from "./paths.js";

export type ApprovalScanSnapshot = {
  available: boolean;
  clean: boolean;
  summary: string;
};

export type ApprovalLedgerEntry = {
  id: string;
  timestamp: string;
  skillName: string;
  source: string;
  installedPath: string;
  integrityHash: string;
  preScan: ApprovalScanSnapshot;
  postScan: ApprovalScanSnapshot;
  approved: boolean;
};

type LedgerDb = {
  version: 1;
  entries: ApprovalLedgerEntry[];
};

function ledgerPath(): string {
  return join(getLobstercageStateDir(), "approval-ledger.json");
}

async function loadLedger(): Promise<LedgerDb> {
  try {
    const raw = await readFile(ledgerPath(), "utf-8");
    const parsed = JSON.parse(raw) as LedgerDb;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function saveLedger(db: LedgerDb): Promise<void> {
  const path = ledgerPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(db, null, 2), "utf-8");
  await rename(temp, path);
}

export async function appendApprovalLedgerEntry(
  entry: Omit<ApprovalLedgerEntry, "id" | "timestamp">
): Promise<ApprovalLedgerEntry> {
  const db = await loadLedger();
  const fullEntry: ApprovalLedgerEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  db.entries.push(fullEntry);
  await saveLedger(db);
  return fullEntry;
}

export async function getApprovalLedgerEntries(limit?: number): Promise<ApprovalLedgerEntry[]> {
  const db = await loadLedger();
  const entries = [...db.entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}
