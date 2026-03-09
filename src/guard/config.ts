// Builds the lobstercage-config.json that lives alongside the guard plugin.
// The guard reads this file at runtime so rule changes propagate without reinstall.

import { loadRuleConfig } from "../stats/rules-config.js";

/**
 * Shape of a single rule entry in lobstercage-config.json.
 * Kept intentionally flat so the guard plugin can consume it
 * without importing any lobstercage modules.
 */
export type GuardRuleConfig = {
  enabled: boolean;
  action: "warn" | "block" | "shutdown";
  allowPatterns?: string[];
};

/** Top-level shape of lobstercage-config.json */
export type GuardConfigFile = {
  version: 1;
  rules: Record<string, GuardRuleConfig>;
};

/** Build the config object from the current stats ruleConfig */
export async function buildGuardConfig(): Promise<GuardConfigFile> {
  const ruleConfig = await loadRuleConfig();

  const rules: Record<string, GuardRuleConfig> = {};

  for (const rule of [...ruleConfig.rules, ...ruleConfig.customRules]) {
    const entry: GuardRuleConfig = {
      enabled: rule.enabled,
      action: rule.action,
    };
    if (rule.allowPatterns && rule.allowPatterns.length > 0) {
      entry.allowPatterns = rule.allowPatterns;
    }
    rules[rule.id] = entry;
  }

  return { version: 1, rules };
}

/** Serialize the config to a JSON string ready to write to disk */
export async function buildGuardConfigJson(): Promise<string> {
  const config = await buildGuardConfig();
  return JSON.stringify(config, null, 2);
}
