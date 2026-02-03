// Audit module exports

export type {
  SecurityFinding,
  AuditResult,
  AuditOptions,
  FixResult,
  Severity,
  CheckCategory,
  OpenClawConfig,
} from "./types.js";

export { runAudit, getFixableFindings } from "./runner.js";
export { applyFixes, generateFixScript } from "./fix.js";
export { loadConfig, getStateDir } from "./config-loader.js";
