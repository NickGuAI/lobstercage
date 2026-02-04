// Stats type definitions for Lobstercage tracking

export type ViolationEvent = {
  ruleId: string;
  category: "pii" | "content";
  action: "warn" | "block" | "shutdown";
  count: number;
};

export type ScanEvent = {
  id: string;
  timestamp: string;
  type: "forensic" | "guard" | "audit";
  violations: ViolationEvent[];
};

export type DailySummary = {
  date: string; // YYYY-MM-DD
  totalScans: number;
  totalViolations: number;
  violationsByRule: Record<string, number>;
};

export type StoredRule = {
  id: string;
  category: "pii" | "content";
  enabled: boolean;
  action: "warn" | "block" | "shutdown";
  /** For custom rules */
  pattern?: string;
  keywords?: string[];
};

export type RuleConfig = {
  rules: StoredRule[];
  customRules: StoredRule[];
};

export type StatsDatabase = {
  version: 1;
  events: ScanEvent[];
  dailySummaries: DailySummary[];
  ruleConfig: RuleConfig;
};
