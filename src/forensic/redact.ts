// Redaction engine - modifies session JSONL files to redact PII

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import type { SessionViolation } from "../scanner/types.js";
import type { ReviewAction } from "../ui/interactive.js";

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

/** Redact a string by replacing with asterisks, keeping first/last 2 chars */
function redactString(original: string): string {
  if (original.length <= 4) {
    return "*".repeat(original.length);
  }
  return original.slice(0, 2) + "*".repeat(original.length - 4) + original.slice(-2);
}

/** Apply redaction to content string */
function redactInContent(content: string, matchPreview: string): string {
  // The matchPreview is already redacted (e.g., "+1********61")
  // We need to find the original pattern and redact it
  // Since we don't have the original, we'll use a heuristic:
  // Find strings that match the redaction pattern
  
  // For now, use a simple approach: find patterns that could match
  // This works because the violation's position is relative to the message content
  
  // Actually, we need to be smarter. Let's use regex patterns based on rule type
  return content;
}

/** Parse JSONL file */
function parseJsonl(text: string): JsonlEntry[] {
  const entries: JsonlEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Keep malformed lines as-is by storing raw
      entries.push({ __raw: trimmed } as unknown as JsonlEntry);
    }
  }
  return entries;
}

/** Serialize entries back to JSONL */
function serializeJsonl(entries: JsonlEntry[]): string {
  return entries
    .map((entry) => {
      if ("__raw" in entry) {
        return (entry as { __raw: string }).__raw;
      }
      return JSON.stringify(entry);
    })
    .join("\n") + "\n";
}

/** Get content from message entry */
function getMessageContent(entry: JsonlEntry): string {
  const content = entry.message?.content ?? entry.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => block.text ?? "").join("\n");
  }
  return "";
}

/** Set content in message entry */
function setMessageContent(entry: JsonlEntry, newContent: string): void {
  if (entry.message?.content !== undefined) {
    if (typeof entry.message.content === "string") {
      entry.message.content = newContent;
    } else if (Array.isArray(entry.message.content)) {
      // For array content, update the first text block
      const textBlock = entry.message.content.find((b) => b.type === "text" || b.text);
      if (textBlock) {
        textBlock.text = newContent;
      }
    }
  } else if (entry.content !== undefined) {
    if (typeof entry.content === "string") {
      entry.content = newContent;
    }
  }
}

/** Redaction patterns by rule type */
const REDACTION_PATTERNS: Record<string, RegExp[]> = {
  "pii-phone": [/\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g],
  "pii-email": [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
  "pii-ssn": [/\b\d{3}-\d{2}-\d{4}\b/g],
  "pii-credit-card": [/\b(?:\d[ -]*?){13,19}\b/g],
  "pii-api-key": [
    /\bsk-[a-zA-Z0-9]{20,}\b/g,
    /\bsk_live_[a-zA-Z0-9]{20,}\b/g,
    /\bsk_test_[a-zA-Z0-9]{20,}\b/g,
    /\bghp_[a-zA-Z0-9]{36,}\b/g,
    /\bAKIA[A-Z0-9]{16}\b/g,
    /\bxox[bpas]-[a-zA-Z0-9-]{10,}\b/g,
    /\bglpat-[a-zA-Z0-9_-]{20,}\b/g,
    /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g,
  ],
  "pii-password": [
    /\b(?:password|passwd|secret|token|api_key|apikey|auth_token)[\s]*[=:]\s*["']?[^\s"']{4,}/gi,
  ],
};

/** Apply redaction to a message's content for a specific rule */
function redactContent(content: string, ruleId: string): string {
  const patterns = REDACTION_PATTERNS[ruleId];
  if (!patterns) return content;

  let result = content;
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    result = result.replace(re, (match) => redactString(match));
  }
  return result;
}

export type RedactionResult = {
  file: string;
  messagesRedacted: number;
  backupPath: string;
  success: boolean;
  error?: string;
};

/** Apply redactions to session files */
export async function applyRedactions(
  decisions: Map<SessionViolation, ReviewAction>
): Promise<RedactionResult[]> {
  const results: RedactionResult[] = [];

  // Group violations by file
  const byFile = new Map<string, SessionViolation[]>();
  for (const [violation, action] of decisions) {
    if (action !== "redact") continue;
    const list = byFile.get(violation.sessionFile) || [];
    list.push(violation);
    byFile.set(violation.sessionFile, list);
  }

  for (const [filePath, violations] of byFile) {
    try {
      // Create backup
      const backupPath = join(
        dirname(filePath),
        `.${basename(filePath)}.backup-${Date.now()}`
      );
      await copyFile(filePath, backupPath);

      // Read and parse
      const text = await readFile(filePath, "utf-8");
      const entries = parseJsonl(text);

      // Find assistant messages and apply redactions
      const assistantMessages = entries.filter(
        (e) => e.type === "message" && e.message?.role === "assistant"
      );

      let redactedCount = 0;

      for (const violation of violations) {
        const msgEntry = assistantMessages[violation.messageIndex];
        if (!msgEntry) continue;

        const content = getMessageContent(msgEntry);
        const redacted = redactContent(content, violation.ruleId);

        if (redacted !== content) {
          setMessageContent(msgEntry, redacted);
          redactedCount++;
        }
      }

      // Write back
      const newText = serializeJsonl(entries);
      await writeFile(filePath, newText, "utf-8");

      results.push({
        file: filePath,
        messagesRedacted: redactedCount,
        backupPath,
        success: true,
      });
    } catch (err) {
      results.push({
        file: filePath,
        messagesRedacted: 0,
        backupPath: "",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
