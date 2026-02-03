import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ScanRule, SessionViolation, ScanReport } from "../scanner/types.js";
import { scanContent } from "../scanner/engine.js";
import { discoverSessionFiles } from "./discover.js";
import { buildReport } from "./report.js";

type MessageContent = {
  type?: string;
  text?: string;
  thinking?: string;
};

type NestedMessage = {
  role?: string;
  content?: string | MessageContent[];
};

type JsonlEntry = {
  role?: string;
  content?: string;
  type?: string;
  id?: string;
  sessionId?: string;
  timestamp?: string;
  message?: NestedMessage;
  [key: string]: unknown;
};

/** Parse a JSONL file into an array of entries, skipping malformed lines */
function parseJsonl(text: string): JsonlEntry[] {
  const entries: JsonlEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/** Extract text content from a message entry (handles OpenClaw's nested format) */
function extractContent(entry: JsonlEntry): string {
  // OpenClaw format: { type: "message", message: { role, content } }
  const content = entry.message?.content ?? entry.content;
  
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => block.text ?? "")
      .join("\n");
  }
  return "";
}

/** Run forensic scan across all discovered session files */
export async function forensicScan(rules: ScanRule[]): Promise<ScanReport> {
  const sessionFiles = await discoverSessionFiles();
  const allViolations: SessionViolation[] = [];
  let totalMessages = 0;
  let sessionsScanned = 0;

  for (let i = 0; i < sessionFiles.length; i++) {
    const filePath = sessionFiles[i];

    try {
      const text = await readFile(filePath, "utf-8");
      const entries = parseJsonl(text);

      // Try to find session ID from header or filename
      const header = entries.find((e) => e.type === "session" || e.sessionId);
      const sessionId = header?.sessionId ?? basename(filePath, ".jsonl");
      const timestamp = header?.timestamp ?? "";

      // Scan assistant messages (OpenClaw format: type=message with nested message.role)
      const messages = entries.filter(
        (e) => e.type === "message" && e.message?.role === "assistant"
      );
      totalMessages += messages.length;

      for (let mi = 0; mi < messages.length; mi++) {
        const content = extractContent(messages[mi]);
        if (!content) continue;
        const violations = scanContent(content, rules);
        for (const v of violations) {
          allViolations.push({
            ...v,
            sessionId,
            sessionFile: filePath,
            timestamp,
            messageIndex: mi,
          });
        }
      }
      sessionsScanned++;
    } catch {
      // Skip unreadable files
    }
  }

  return buildReport(sessionsScanned, totalMessages, allViolations);
}
