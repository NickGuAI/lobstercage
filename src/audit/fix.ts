// Auto-fix logic for remediable security findings

import { chmod, readFile, writeFile } from "node:fs/promises";
import type { SecurityFinding, FixResult, OpenClawConfig } from "./types.js";
import { loadConfig, getStateDir } from "./config-loader.js";
import { join } from "node:path";

/** Apply auto-fix for a single finding */
async function applyFix(finding: SecurityFinding): Promise<FixResult> {
  try {
    switch (finding.id) {
      // Filesystem permission fixes
      case "fs-state-dir-perms":
      case "fs-creds-dir-perms":
        if (finding.location) {
          await chmod(finding.location, 0o700);
          return {
            finding,
            success: true,
            action: `chmod 700 ${finding.location}`,
          };
        }
        break;

      case "fs-config-perms":
      case "fs-auth-profiles-perms":
      case "fs-paired-devices-perms":
        if (finding.location) {
          await chmod(finding.location, 0o600);
          return {
            finding,
            success: true,
            action: `chmod 600 ${finding.location}`,
          };
        }
        break;

      // Config-based fixes require modifying the config file
      case "gateway-insecure-auth":
        return await patchConfig((config) => {
          if (config.gateway?.controlUI) {
            delete config.gateway.controlUI.allowInsecureAuth;
          }
          return config;
        }, "Removed gateway.controlUI.allowInsecureAuth");

      case "gateway-no-device-auth":
        return await patchConfig((config) => {
          if (config.gateway?.controlUI) {
            delete config.gateway.controlUI.dangerouslyDisableDeviceAuth;
          }
          return config;
        }, "Removed gateway.controlUI.dangerouslyDisableDeviceAuth");

      case "secrets-redaction-off":
        return await patchConfig((config) => {
          if (!config.logging) config.logging = {};
          config.logging.redactSensitive = "on";
          return config;
        }, "Set logging.redactSensitive to 'on'");

      // Channel policy fixes
      default:
        // Handle channel DM/group policy fixes dynamically
        if (finding.id.match(/^channel-(\w+)-dm-open$/)) {
          const channel = finding.id.match(/^channel-(\w+)-dm-open$/)?.[1];
          if (channel) {
            return await patchConfig((config) => {
              if (!config.channels) config.channels = {};
              if (!config.channels[channel]) config.channels[channel] = {};
              if (!config.channels[channel].dm) config.channels[channel].dm = {};
              config.channels[channel].dm!.policy = "allowlist";
              return config;
            }, `Set channels.${channel}.dm.policy to 'allowlist'`);
          }
        }

        if (finding.id.match(/^channel-(\w+)-group-open$/)) {
          const channel = finding.id.match(/^channel-(\w+)-group-open$/)?.[1];
          if (channel) {
            return await patchConfig((config) => {
              if (!config.channels) config.channels = {};
              if (!config.channels[channel]) config.channels[channel] = {};
              if (!config.channels[channel].group) config.channels[channel].group = {};
              config.channels[channel].group!.policy = "allowlist";
              return config;
            }, `Set channels.${channel}.group.policy to 'allowlist'`);
          }
        }
    }

    return {
      finding,
      success: false,
      error: "No auto-fix available for this finding",
    };
  } catch (err) {
    return {
      finding,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Patch the OpenClaw config file */
async function patchConfig(
  patcher: (config: OpenClawConfig) => OpenClawConfig,
  actionDescription: string
): Promise<FixResult> {
  const loaded = await loadConfig();
  if (!loaded) {
    return {
      finding: {} as SecurityFinding,
      success: false,
      error: "No config file found to patch",
    };
  }

  const { config, path } = loaded;
  const patched = patcher(config);

  // Write back with pretty formatting
  await writeFile(path, JSON.stringify(patched, null, 2) + "\n", "utf-8");

  return {
    finding: {} as SecurityFinding,
    success: true,
    action: `${actionDescription} in ${path}`,
  };
}

/** Apply fixes for all fixable findings */
export async function applyFixes(findings: SecurityFinding[]): Promise<FixResult[]> {
  const fixable = findings.filter((f) => f.fixable);
  const results: FixResult[] = [];

  for (const finding of fixable) {
    const result = await applyFix(finding);
    result.finding = finding;
    results.push(result);
  }

  return results;
}

/** Generate a shell script with manual fix commands */
export function generateFixScript(findings: SecurityFinding[]): string {
  const lines: string[] = [
    "#!/bin/bash",
    "# Lobstercage Security Remediation Script",
    `# Generated: ${new Date().toISOString()}`,
    "",
    "set -e",
    "",
  ];

  for (const finding of findings) {
    if (!finding.fix) continue;

    lines.push(`# ${finding.title}`);
    lines.push(`# Severity: ${finding.severity.toUpperCase()}`);
    
    // Extract shell commands from fix description
    if (finding.fix.startsWith("chmod ")) {
      lines.push(finding.fix);
    } else {
      lines.push(`# ${finding.fix}`);
    }
    lines.push("");
  }

  lines.push('echo "Remediation complete"');
  return lines.join("\n");
}
