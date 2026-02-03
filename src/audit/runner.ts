// Audit runner - orchestrates all security checks

import type { AuditResult, SecurityFinding, OpenClawConfig, AuditOptions } from "./types.js";
import { loadConfig } from "./config-loader.js";
import { checkGateway } from "./checks/gateway.js";
import { checkChannels } from "./checks/channels.js";
import { checkFilesystem } from "./checks/filesystem.js";
import { checkTools } from "./checks/tools.js";
import { checkSecrets } from "./checks/secrets.js";
import { checkPlugins } from "./checks/plugins.js";
import { checkBrowser } from "./checks/browser.js";

/** Run all security audit checks */
export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const findings: SecurityFinding[] = [];
  let configPath: string | null = null;
  let config: OpenClawConfig = {};

  // Load config
  const loadResult = await loadConfig(options.configPath);
  if (loadResult) {
    config = loadResult.config;
    configPath = loadResult.path;
  }

  // Run config-based checks (even with empty config to catch missing settings)
  findings.push(...checkGateway(config));
  findings.push(...checkChannels(config));
  findings.push(...checkTools(config));
  findings.push(...checkSecrets(config));
  findings.push(...checkBrowser(config));

  // Run filesystem checks (always run - doesn't need config)
  findings.push(...(await checkFilesystem()));

  // Run plugin checks
  findings.push(...(await checkPlugins(config)));

  // Sort by severity (critical first, then warning, then info)
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Build summary
  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  return {
    findings,
    summary,
    configPath,
    timestamp: new Date().toISOString(),
  };
}

/** Get only fixable findings from audit result */
export function getFixableFindings(result: AuditResult): SecurityFinding[] {
  return result.findings.filter((f) => f.fixable);
}
