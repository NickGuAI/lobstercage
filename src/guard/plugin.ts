// OpenClaw plugin source — this file gets written to ~/.openclaw/extensions/lobstercage/
// It runs inside OpenClaw's plugin runtime, so it must be self-contained.

import { createRequire } from "node:module";
import { SECURITY_DIRECTIVE } from "./prompts.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version?: string };

if (typeof packageJson.version !== "string") {
  throw new Error("Invalid package.json: expected a string version field");
}

export const PLUGIN_VERSION = packageJson.version;

// Helper to build the plugin source with the security directive injected
function buildPluginSource(securityDirective: string): string {
  // Use JSON.stringify to safely escape the directive as a string literal
  const jsonEscaped = JSON.stringify(securityDirective);

  return `
const PII_PATTERNS = {
  phone: [/\\+?\\d{1,3}[-.\\s]?\\(?\\d{1,4}\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}/g],
  email: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g],
  ssn: [/\\b\\d{3}-\\d{2}-\\d{4}\\b/g],
  "credit-card": [/\\b(?:\\d[ -]*?){13,19}\\b/g],
  "api-key": [
    /\\bsk-[a-zA-Z0-9_-]{5,}/g,
    /\\bsk_live_[a-zA-Z0-9_-]{5,}/g,
    /\\bsk_test_[a-zA-Z0-9_-]{5,}/g,
    /\\bghp_[a-zA-Z0-9_-]{5,}/g,
    /\\bAKIA[A-Z0-9_-]{5,}/g,
    /\\bxox[bpas]-[a-zA-Z0-9_-]{5,}/g,
    /\\bglpat-[a-zA-Z0-9_-]{5,}/g,
    /\\bsk-ant-[a-zA-Z0-9_-]{5,}/g,
  ],
  password: [/\\b(?:password|passwd|secret|token|api_key|apikey|auth_token)[\\s]*[=:]\\s*["']?[^\\s"']{4,}/gi],
};

const CONTENT_PATTERNS = [
  /ignore\\s+(all\\s+)?previous\\s+instructions/gi,
  /disregard\\s+(all\\s+)?(prior|previous|above)\\s+(instructions|rules)/gi,
];

const MALWARE_PATTERNS = [
  { id: "malware-staged-delivery", action: "shutdown", re: /\\b(?:curl|wget)\\b[\\s\\S]{0,220}?\\|\\s*(?:sh|bash|zsh)\\b/gi },
  { id: "malware-encoded-exec", action: "shutdown", re: /\\b(?:echo|printf)\\b[\\s\\S]{0,220}?\\bbase64\\b[\\s\\S]{0,80}?(?:-d|--decode)\\b[\\s\\S]{0,100}?\\|\\s*(?:sh|bash|zsh)\\b/gi },
  { id: "malware-quarantine-bypass", action: "block", re: /\\brm\\s+-rf\\s+.*(?:quarantine|isolat(?:e|ion)|containment)/gi },
];

function luhnCheck(digits) {
  const nums = digits.replace(/\\D/g, "");
  let sum = 0, alt = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function scanContent(content) {
  const violations = [];

  for (const [type, patterns] of Object.entries(PII_PATTERNS)) {
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(content)) !== null) {
        if (type === "credit-card") {
          const d = match[0].replace(/\\D/g, "");
          if (d.length < 13 || d.length > 19 || !luhnCheck(d)) continue;
        }
        if (type === "phone") {
          if (match[0].replace(/\\D/g, "").length < 7) continue;
        }
        violations.push({ ruleId: "pii-" + type, action: type === "ssn" || type === "credit-card" ? "shutdown" : "block", match: match[0] });
      }
    }
  }

  for (const pattern of CONTENT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      violations.push({ ruleId: "content-injection", action: "block", match: match[0] });
    }
  }

  for (const item of MALWARE_PATTERNS) {
    const re = new RegExp(item.re.source, item.re.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      violations.push({ ruleId: item.id, action: item.action, match: match[0] });
    }
  }

  return violations;
}

// Extract text content from message content (handles both string and array formats)
function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === "text")
      .map(block => block.text || "")
      .join("\\n");
  }
  return "";
}

// Security directive injected at build time
const SECURITY_DIRECTIVE = ${jsonEscaped};

module.exports = {
  id: "lobstercage",
  name: "Lobstercage Security Guard",
  description: "Scans outgoing messages for PII, policy, and malware execution patterns",

  register(api) {
    try {
      // Hook 1: before_agent_start - Inject security directive (prevention layer)
      // This prepends context to the system prompt to instruct the AI to avoid outputting PII
      api.on("before_agent_start", (event, ctx) => {
        return {
          prependContext: SECURITY_DIRECTIVE,
        };
      });

      // Hook 2: message_sending - Block explicit message tool calls (existing behavior)
      // Correct signature: (event, ctx) => result | void
      // event: { to, content, metadata }
      // ctx: { channelId, accountId, conversationId }
      // result: { content?, cancel? }
      api.on("message_sending", (event, ctx) => {
        const recipient = event.to || ctx.conversationId || "unknown";
        const content = typeof event.content === "string" ? event.content : JSON.stringify(event.content);
        const violations = scanContent(content);

        if (violations.length === 0) return;

        const maxAction = violations.reduce((max, v) => {
          const severity = { warn: 0, block: 1, shutdown: 2 };
          return severity[v.action] > severity[max] ? v.action : max;
        }, "warn");

        api.logger.warn("[lobstercage] " + violations.length + " violation(s) in message to " + recipient + ": " + violations.map(v => v.ruleId).join(", "));

        if (maxAction === "warn") return;
        return { cancel: true };
      });

      // Hook 3: agent_end - Scan completed responses (detection layer)
      // This cannot block delivery, but logs violations for auditing
      api.on("agent_end", (event, ctx) => {
        if (!event.success || !event.messages) return;

        for (const msg of event.messages) {
          if (msg.role !== "assistant") continue;

          const content = extractTextContent(msg.content);
          if (!content) continue;

          const violations = scanContent(content);

          if (violations.length > 0) {
            api.logger.warn("[lobstercage] PII violation detected in AI response: " + violations.map(v => v.ruleId).join(", "));
          }
        }
      });

    } catch (err) {
      api.logger.error("[lobstercage] Failed to register hook: " + String(err));
    }
  },
};
`;
}

export const PLUGIN_SOURCE = buildPluginSource(SECURITY_DIRECTIVE);

export const PLUGIN_MANIFEST = {
  name: "lobstercage",
  version: PLUGIN_VERSION,
  description: "Lobstercage Security Guard - Scans outgoing messages for PII, policy, and malware execution patterns",
  main: "index.js",
  openclaw: {
    extensions: ["index.js"],
  },
};

export const OPENCLAW_PLUGIN_JSON = {
  id: "lobstercage",
  name: "Lobstercage Security Guard",
  description: "Scans outgoing messages for PII, policy, and malware execution patterns",
  version: PLUGIN_VERSION,
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
};
