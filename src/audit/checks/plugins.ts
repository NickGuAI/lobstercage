// Plugin trust security checks

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SecurityFinding, OpenClawConfig } from "../types.js";
import { getStateDir } from "../config-loader.js";

export async function checkPlugins(config: OpenClawConfig): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const stateDir = getStateDir();
  const extDir = join(stateDir, "extensions");

  // Get list of installed extensions
  let installedExtensions: string[] = [];
  try {
    const entries = await readdir(extDir);
    for (const entry of entries) {
      const entryPath = join(extDir, entry);
      const entryStat = await stat(entryPath);
      if (entryStat.isDirectory()) {
        installedExtensions.push(entry);
      }
    }
  } catch {
    // No extensions directory
    return findings;
  }

  if (installedExtensions.length === 0) {
    return findings;
  }

  // Filter out lobstercage itself
  installedExtensions = installedExtensions.filter((e) => e !== "lobstercage");

  if (installedExtensions.length === 0) {
    return findings;
  }

  // Check if plugins.allow is configured
  const allowedPlugins = config.plugins?.allow;

  if (!allowedPlugins) {
    findings.push({
      id: "plugins-no-allowlist",
      category: "plugins",
      severity: "warning",
      title: "Extensions installed without plugins.allow",
      description: `${installedExtensions.length} extension(s) installed but plugins.allow is not configured. Extensions: ${installedExtensions.join(", ")}`,
      location: "plugins.allow",
      expectedValue: "Array of allowed plugin names",
      fix: `Add plugins.allow to config: ["${installedExtensions.join('", "')}"]`,
      fixable: false,
    });
  } else {
    // Check for extensions not in allowlist
    const unallowedExtensions = installedExtensions.filter(
      (ext) => !allowedPlugins.includes(ext) && !allowedPlugins.includes("*")
    );

    if (unallowedExtensions.length > 0) {
      findings.push({
        id: "plugins-not-in-allowlist",
        category: "plugins",
        severity: "warning",
        title: "Extensions not in allowlist",
        description: `Extensions installed that are not in plugins.allow: ${unallowedExtensions.join(", ")}`,
        location: "plugins.allow",
        currentValue: JSON.stringify(allowedPlugins),
        fix: `Add extensions to plugins.allow or remove them`,
        fixable: false,
      });
    }

    // Check for wildcard in plugins.allow
    if (allowedPlugins.includes("*")) {
      findings.push({
        id: "plugins-wildcard-allow",
        category: "plugins",
        severity: "warning",
        title: "Plugins allowlist uses wildcard",
        description: `plugins.allow includes "*" which allows any plugin. Consider explicit allowlist.`,
        location: "plugins.allow",
        currentValue: '["*"]',
        expectedValue: "Explicit list of trusted plugins",
        fix: "Replace wildcard with explicit list of trusted plugins",
        fixable: false,
      });
    }
  }

  return findings;
}
