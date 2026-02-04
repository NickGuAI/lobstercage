// Human approval security checks for irreversible actions

import type { SecurityFinding, OpenClawConfig } from "../types.js";

export function checkApproval(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const elevatedAllowFrom = config.tools?.elevated?.allowFrom;

  if (!elevatedAllowFrom || elevatedAllowFrom.length === 0) {
    return findings;
  }

  if (elevatedAllowFrom.length > 3 && !elevatedAllowFrom.includes("*")) {
    findings.push({
      id: "approval-elevated-many-users",
      category: "approval",
      severity: "info",
      title: "Multiple users have elevated tool access",
      description:
        `${elevatedAllowFrom.length} senders have elevated tool access. Elevated tools can perform irreversible actions. Consider limiting to essential users only.`,
      location: "tools.elevated.allowFrom",
      currentValue: `${elevatedAllowFrom.length} users`,
      expectedValue: "Minimal set of trusted users (1-3)",
      fix: "Review and remove unnecessary elevated access grants",
      fixable: false,
    });
  }

  return findings;
}
