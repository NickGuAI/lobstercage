import type { ScanRule } from "../types.js";

/** Luhn check for credit card number validation */
export function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/\D/g, "");
  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/** Built-in PII detection patterns */
export const PII_PATTERNS: Record<string, RegExp[]> = {
  phone: [
    // International format: +1-555-123-4567, +44 20 7946 0958, etc.
    /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  ],
  email: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ],
  ssn: [
    /\b\d{3}-\d{2}-\d{4}\b/g,
  ],
  "credit-card": [
    // Broad match for 13-23 char digit/separator sequences; post-filter validates digit count + Luhn
    /\b\d(?:[\d -]{11,21})\d\b/g,
  ],
  "api-key": [
    // OpenAI
    /\bsk-[a-zA-Z0-9]{20,}\b/g,
    // Stripe live/test keys
    /\bsk_live_[a-zA-Z0-9]{20,}\b/g,
    /\bsk_test_[a-zA-Z0-9]{20,}\b/g,
    // GitHub personal access tokens
    /\bghp_[a-zA-Z0-9]{36,}\b/g,
    // AWS access key IDs
    /\bAKIA[A-Z0-9]{16}\b/g,
    // Slack tokens
    /\bxox[bpas]-[a-zA-Z0-9-]{10,}\b/g,
    // GitLab personal access tokens
    /\bglpat-[a-zA-Z0-9_-]{20,}\b/g,
    // Anthropic keys
    /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g,
  ],
  password: [
    // password=..., passwd:..., secret:..., token=... followed by non-space value
    /\b(?:password|passwd|secret|token|api_key|apikey|auth_token)[\s]*[=:]\s*["']?[^\s"']{4,}/gi,
  ],
};

export function getPiiRules(): ScanRule[] {
  return [
    { id: "pii-phone", category: "pii", enabled: true, action: "block", type: "phone" },
    { id: "pii-email", category: "pii", enabled: true, action: "block", type: "email" },
    { id: "pii-ssn", category: "pii", enabled: true, action: "shutdown", type: "ssn" },
    { id: "pii-credit-card", category: "pii", enabled: true, action: "shutdown", type: "credit-card" },
    { id: "pii-api-key", category: "pii", enabled: true, action: "block", type: "api-key" },
    { id: "pii-password", category: "pii", enabled: true, action: "block", type: "password" },
  ];
}
