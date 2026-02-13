import type { ScanRule, Violation, RuleAction } from "./types.js";
import { PII_PATTERNS, luhnCheck } from "./rules/pii.js";

/** Redact a matched string, showing first 2 and last 2 chars */
function redact(match: string): string {
  if (match.length <= 6) return "*".repeat(match.length);
  return match.slice(0, 2) + "*".repeat(match.length - 4) + match.slice(-2);
}

function scanPiiRule(content: string, rule: ScanRule): Violation[] {
  if (!rule.type) return [];
  const patterns = PII_PATTERNS[rule.type];
  if (!patterns) return [];

  const violations: Violation[] = [];
  for (const pattern of patterns) {
    // Reset lastIndex for global regexes
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const matched = match[0];

      // Credit card: validate with Luhn check, require at least 13 digits
      if (rule.type === "credit-card") {
        const digits = matched.replace(/\D/g, "");
        if (digits.length < 13 || digits.length > 19 || !luhnCheck(digits)) continue;
      }

      // Phone: require at least 7 digits to reduce false positives
      if (rule.type === "phone") {
        const digits = matched.replace(/\D/g, "");
        if (digits.length < 7) continue;
      }

      violations.push({
        ruleId: rule.id,
        category: rule.category,
        action: rule.action,
        matchPreview: redact(matched),
        position: match.index,
      });
    }
  }
  return violations;
}

function scanContentRule(content: string, rule: ScanRule): Violation[] {
  const violations: Violation[] = [];

  if (rule.patterns) {
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        violations.push({
          ruleId: rule.id,
          category: rule.category,
          action: rule.action,
          matchPreview: redact(match[0]),
          position: match.index,
        });
      }
    }
  }

  if (rule.keywords) {
    const lowerContent = content.toLowerCase();
    for (const keyword of rule.keywords) {
      let pos = 0;
      const lowerKw = keyword.toLowerCase();
      while ((pos = lowerContent.indexOf(lowerKw, pos)) !== -1) {
        violations.push({
          ruleId: rule.id,
          category: rule.category,
          action: rule.action,
          matchPreview: redact(content.slice(pos, pos + keyword.length)),
          position: pos,
        });
        pos += keyword.length;
      }
    }
  }

  return violations;
}

/** Scan content against a set of rules, returning all violations */
export function scanContent(content: string, rules: ScanRule[]): Violation[] {
  const violations: Violation[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.category === "pii") {
      violations.push(...scanPiiRule(content, rule));
    } else {
      violations.push(...scanContentRule(content, rule));
    }
  }
  return violations;
}

const ACTION_SEVERITY: Record<RuleAction, number> = {
  warn: 0,
  block: 1,
  shutdown: 2,
};

/** Resolve the most severe action from a list of violations */
export function resolveAction(violations: Violation[]): RuleAction {
  let maxAction: RuleAction = "warn";
  for (const v of violations) {
    if (ACTION_SEVERITY[v.action] > ACTION_SEVERITY[maxAction]) {
      maxAction = v.action;
    }
  }
  return maxAction;
}

/** Load all default rules (PII + content + malware) */
export { getPiiRules } from "./rules/pii.js";
export { getContentRules } from "./rules/content.js";
export { getMalwareRules } from "./rules/malware.js";
