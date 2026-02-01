export type RuleCategory = "pii" | "content";
export type RuleAction = "warn" | "block" | "shutdown";
export type PiiType = "phone" | "email" | "ssn" | "credit-card" | "api-key" | "password";

export type ScanRule = {
  id: string;
  category: RuleCategory;
  enabled: boolean;
  action: RuleAction;
  /** PII rules use built-in patterns keyed by type */
  type?: PiiType;
  /** Content rules use custom regex patterns */
  patterns?: RegExp[];
  /** Content rules use keyword lists */
  keywords?: string[];
};

export type Violation = {
  ruleId: string;
  category: RuleCategory;
  action: RuleAction;
  matchPreview: string;
  position: number;
};

export type SessionViolation = Violation & {
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  messageIndex: number;
};

export type ScanReport = {
  sessionsScanned: number;
  messagesScanned: number;
  violations: SessionViolation[];
  summary: Record<string, number>;
};

export type ScanConfig = {
  rules?: Partial<ScanRule>[];
  /** Override default action for all rules */
  defaultAction?: RuleAction;
};
