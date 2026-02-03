// OpenClaw plugin source — this file gets written to ~/.openclaw/extensions/lobstercage/
// It runs inside OpenClaw's plugin runtime, so it must be self-contained.

export const PLUGIN_SOURCE = `
const PII_PATTERNS = {
  phone: [/\\+?\\d{1,3}[-.\\s]?\\(?\\d{1,4}\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}/g],
  email: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g],
  ssn: [/\\b\\d{3}-\\d{2}-\\d{4}\\b/g],
  "credit-card": [/\\b(?:\\d[ -]*?){13,19}\\b/g],
  "api-key": [
    /\\bsk-[a-zA-Z0-9]{20,}\\b/g,
    /\\bsk_live_[a-zA-Z0-9]{20,}\\b/g,
    /\\bsk_test_[a-zA-Z0-9]{20,}\\b/g,
    /\\bghp_[a-zA-Z0-9]{36,}\\b/g,
    /\\bAKIA[A-Z0-9]{16}\\b/g,
    /\\bxox[bpas]-[a-zA-Z0-9-]{10,}\\b/g,
    /\\bglpat-[a-zA-Z0-9_-]{20,}\\b/g,
    /\\bsk-ant-[a-zA-Z0-9_-]{20,}\\b/g,
  ],
  password: [/\\b(?:password|passwd|secret|token|api_key|apikey|auth_token)[\\s]*[=:]\\s*["']?[^\\s"']{4,}/gi],
};

const CONTENT_PATTERNS = [
  /ignore\\s+(all\\s+)?previous\\s+instructions/gi,
  /disregard\\s+(all\\s+)?(prior|previous|above)\\s+(instructions|rules)/gi,
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

  return violations;
}

module.exports = {
  id: "lobstercage",
  name: "Lobstercage Security Guard",
  description: "Scans outgoing messages for PII and policy violations",

  register(api) {
    api.on("message_sending", async (event) => {
      const content = typeof event.content === "string" ? event.content : JSON.stringify(event.content);
      const violations = scanContent(content);
      if (violations.length === 0) return;

      const maxAction = violations.reduce((max, v) => {
        const severity = { warn: 0, block: 1, shutdown: 2 };
        return severity[v.action] > severity[max] ? v.action : max;
      }, "warn");

      console.error("[lobstercage] " + violations.length + " violation(s) detected: " + violations.map(v => v.ruleId).join(", "));

      if (maxAction === "warn") return;
      return { cancel: true };
    });
  },
};
`;

export const PLUGIN_MANIFEST = {
  id: "lobstercage",
  name: "Lobstercage Security Guard",
  version: "0.1.0",
  description: "Scans outgoing messages for PII and policy violations",
  main: "index.js",
};
