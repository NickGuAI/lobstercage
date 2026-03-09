// Rule configuration management

import { loadStats, saveStats } from "./storage.js";
import { getPiiRules, getContentRules, getMalwareRules } from "../scanner/engine.js";
import type { ScanRule } from "../scanner/types.js";
import type { StoredRule, RuleConfig } from "./types.js";

/** Default rule definitions */
const DEFAULT_RULES: StoredRule[] = [
  { id: "pii-phone", category: "pii", enabled: true, action: "warn" },
  { id: "pii-email", category: "pii", enabled: true, action: "warn" },
  { id: "pii-ssn", category: "pii", enabled: true, action: "block" },
  { id: "pii-credit-card", category: "pii", enabled: true, action: "block" },
  { id: "pii-api-key", category: "pii", enabled: true, action: "block" },
  { id: "pii-password", category: "pii", enabled: true, action: "warn" },
  { id: "content-injection", category: "content", enabled: true, action: "block" },
  { id: "content-exfiltration", category: "content", enabled: true, action: "block" },
  { id: "malware-staged-delivery", category: "malware", enabled: true, action: "shutdown" },
  { id: "malware-encoded-exec", category: "malware", enabled: true, action: "shutdown" },
  { id: "malware-quarantine-bypass", category: "malware", enabled: true, action: "block" },
];

/** Load rule config, merging defaults with stored overrides */
export async function loadRuleConfig(): Promise<RuleConfig> {
  const stats = await loadStats();
  const stored = stats.ruleConfig;

  // Start with defaults
  const rules: StoredRule[] = DEFAULT_RULES.map((defaultRule) => {
    // Find stored override
    const override = stored.rules.find((r) => r.id === defaultRule.id);
    if (override) {
      return { ...defaultRule, ...override };
    }
    return { ...defaultRule };
  });

  return {
    rules,
    customRules: stored.customRules || [],
  };
}

/** Update a rule's configuration */
export async function updateRule(
  ruleId: string,
  updates: Partial<StoredRule>
): Promise<void> {
  const stats = await loadStats();

  // Check if it's a built-in rule
  const isBuiltIn = DEFAULT_RULES.some((r) => r.id === ruleId);

  if (isBuiltIn) {
    // Update or add to rules array
    const existingIndex = stats.ruleConfig.rules.findIndex(
      (r) => r.id === ruleId
    );
    if (existingIndex >= 0) {
      stats.ruleConfig.rules[existingIndex] = {
        ...stats.ruleConfig.rules[existingIndex],
        ...updates,
      };
    } else {
      const defaultRule = DEFAULT_RULES.find((r) => r.id === ruleId)!;
      stats.ruleConfig.rules.push({ ...defaultRule, ...updates });
    }
  } else {
    // Update custom rule
    const existingIndex = stats.ruleConfig.customRules.findIndex(
      (r) => r.id === ruleId
    );
    if (existingIndex >= 0) {
      stats.ruleConfig.customRules[existingIndex] = {
        ...stats.ruleConfig.customRules[existingIndex],
        ...updates,
      };
    }
  }

  await saveStats(stats);
}

/** Add a custom rule */
export async function addCustomRule(rule: StoredRule): Promise<void> {
  const stats = await loadStats();
  stats.ruleConfig.customRules.push(rule);
  await saveStats(stats);
}

/** Remove a custom rule */
export async function removeCustomRule(ruleId: string): Promise<void> {
  const stats = await loadStats();
  stats.ruleConfig.customRules = stats.ruleConfig.customRules.filter(
    (r) => r.id !== ruleId
  );
  await saveStats(stats);
}

/** Get all rules (built-in + custom) */
export async function getAllRules(): Promise<StoredRule[]> {
  const config = await loadRuleConfig();
  return [...config.rules, ...config.customRules];
}

/** Build ScanRule[] from built-in rules + stored overrides + custom rules */
export async function buildScanRules(): Promise<ScanRule[]> {
  const builtInRules = [...getPiiRules(), ...getContentRules(), ...getMalwareRules()];
  const config = await loadRuleConfig();

  // Apply stored overrides (enabled/action) to built-in rules
  const rules: ScanRule[] = builtInRules.map((rule) => {
    const override = config.rules.find((r) => r.id === rule.id);
    if (override) {
      return { ...rule, enabled: override.enabled, action: override.action };
    }
    return rule;
  });

  // Convert custom StoredRules to ScanRules
  for (const custom of config.customRules) {
    if (!custom.enabled) {
      rules.push({
        id: custom.id,
        category: custom.category,
        enabled: false,
        action: custom.action,
      });
      continue;
    }
    rules.push({
      id: custom.id,
      category: custom.category,
      enabled: custom.enabled,
      action: custom.action,
      patterns: custom.pattern ? [new RegExp(custom.pattern, "gi")] : [],
      keywords: custom.keywords || [],
    });
  }

  return rules;
}
