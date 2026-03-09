// Policy configuration for threshold alerts and CI/cron integration

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getStateDir } from "./audit/config-loader.js";

export type ThresholdRule = {
  perDay: number;
};

export type PolicyConfig = {
  thresholds?: Record<string, ThresholdRule>;
};

export type ThresholdBreach = {
  ruleId: string;
  threshold: number;
  actual: number;
};

/** Load policy config from .openclaw/lobstercage-policy.json */
export async function loadPolicy(): Promise<PolicyConfig> {
  const policyPath = join(getStateDir(), "lobstercage-policy.json");
  try {
    const text = await readFile(policyPath, "utf-8");
    return JSON.parse(text) as PolicyConfig;
  } catch {
    return {};
  }
}

/** Check violation counts against per-day thresholds, returns list of breaches */
export function checkThresholds(
  policy: PolicyConfig,
  violationsByRule: Record<string, number>,
): ThresholdBreach[] {
  if (!policy.thresholds) return [];

  const breaches: ThresholdBreach[] = [];
  for (const [ruleId, config] of Object.entries(policy.thresholds)) {
    const actual = violationsByRule[ruleId] ?? 0;
    if (actual > config.perDay) {
      breaches.push({ ruleId, threshold: config.perDay, actual });
    }
  }
  return breaches;
}
