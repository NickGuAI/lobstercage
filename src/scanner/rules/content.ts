import type { ScanRule } from "../types.js";

export function getContentRules(): ScanRule[] {
  return [
    {
      id: "content-profanity",
      category: "content",
      enabled: true,
      action: "warn",
      keywords: [
        // Placeholder keywords — extend via config
      ],
      patterns: [],
    },
    {
      id: "content-injection",
      category: "content",
      enabled: true,
      action: "block",
      patterns: [
        // Prompt injection attempts
        /ignore\s+(all\s+)?previous\s+instructions/gi,
        /you\s+are\s+now\s+(in\s+)?(?:DAN|jailbreak|unrestricted)\s+mode/gi,
        /disregard\s+(all\s+)?(prior|previous|above)\s+(instructions|rules)/gi,
      ],
      keywords: [],
    },
    {
      id: "content-exfiltration",
      category: "content",
      enabled: true,
      action: "block",
      patterns: [
        // Data exfiltration via markdown image/link injection
        /!\[.*?\]\(https?:\/\/[^)]*\?.*?(secret|token|key|password|ssn|credit)/gi,
        // Curl/wget exfiltration commands
        /(?:curl|wget)\s+.*https?:\/\/.*(?:secret|token|key|password)/gi,
      ],
      keywords: [],
    },
  ];
}
