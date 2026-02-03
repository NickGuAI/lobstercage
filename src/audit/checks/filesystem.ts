// Filesystem permission security checks

import { stat, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SecurityFinding } from "../types.js";
import { getStateDir, isInSyncedFolder } from "../config-loader.js";

/** Get file permissions as octal number */
async function getMode(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.mode & 0o777;
  } catch {
    return null;
  }
}

/** Check if path is a symlink */
async function checkSymlink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Check if mode is too permissive (group or other readable) */
function isTooPermissive(mode: number, expectedMax: number): boolean {
  // Check if any bits beyond expectedMax are set
  return (mode & ~expectedMax) !== 0;
}

function modeToString(mode: number): string {
  return mode.toString(8).padStart(3, "0");
}

export async function checkFilesystem(): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const stateDir = getStateDir();

  // Check state directory permissions (should be 700)
  const stateDirMode = await getMode(stateDir);
  if (stateDirMode !== null && isTooPermissive(stateDirMode, 0o700)) {
    findings.push({
      id: "fs-state-dir-perms",
      category: "filesystem",
      severity: "warning",
      title: "State directory has permissive permissions",
      description: `The OpenClaw state directory is readable by others. Contains sensitive session data and credentials.`,
      location: stateDir,
      currentValue: modeToString(stateDirMode),
      expectedValue: "700",
      fix: `chmod 700 ${stateDir}`,
      fixable: true,
    });
  }

  // Check if state dir is in a synced folder
  const syncService = isInSyncedFolder(stateDir);
  if (syncService) {
    findings.push({
      id: "fs-synced-folder",
      category: "filesystem",
      severity: "warning",
      title: `State directory is in ${syncService}`,
      description: `The OpenClaw state directory is inside a ${syncService} folder. This may sync sensitive data to the cloud.`,
      location: stateDir,
      fix: `Move state directory outside of ${syncService} or use OPENCLAW_STATE_DIR to override`,
      fixable: false,
    });
  }

  // Check if state dir is a symlink
  if (await checkSymlink(stateDir)) {
    findings.push({
      id: "fs-state-symlink",
      category: "filesystem",
      severity: "info",
      title: "State directory is a symlink",
      description: `The state directory is a symlink. Ensure the target location has appropriate permissions.`,
      location: stateDir,
      fix: "Verify permissions on the symlink target",
      fixable: false,
    });
  }

  // Check credentials directory
  const credsDir = join(stateDir, "credentials");
  const credsDirMode = await getMode(credsDir);
  if (credsDirMode !== null && isTooPermissive(credsDirMode, 0o700)) {
    findings.push({
      id: "fs-creds-dir-perms",
      category: "filesystem",
      severity: "warning",
      title: "Credentials directory has permissive permissions",
      description: `The credentials directory is readable by others.`,
      location: credsDir,
      currentValue: modeToString(credsDirMode),
      expectedValue: "700",
      fix: `chmod 700 ${credsDir}`,
      fixable: true,
    });
  }

  // Check config files
  const configFiles = [
    join(stateDir, "config.json"),
    join(stateDir, "config.json5"),
    join(stateDir, "openclaw.json"),
  ];

  for (const configPath of configFiles) {
    const mode = await getMode(configPath);
    if (mode !== null && isTooPermissive(mode, 0o600)) {
      findings.push({
        id: "fs-config-perms",
        category: "filesystem",
        severity: "warning",
        title: "Config file has permissive permissions",
        description: `Config file is readable by others. May contain sensitive settings.`,
        location: configPath,
        currentValue: modeToString(mode),
        expectedValue: "600",
        fix: `chmod 600 ${configPath}`,
        fixable: true,
      });
      break; // Only report once
    }
  }

  // Check auth-profiles.json in agent directories
  const agentsDir = join(stateDir, "agents");
  try {
    const agents = await readdir(agentsDir);
    for (const agentId of agents) {
      const authPath = join(agentsDir, agentId, "agent", "auth-profiles.json");
      const mode = await getMode(authPath);
      if (mode !== null && isTooPermissive(mode, 0o600)) {
        findings.push({
          id: "fs-auth-profiles-perms",
          category: "filesystem",
          severity: "critical",
          title: "Auth profiles file has permissive permissions",
          description: `Auth profiles contain API keys and OAuth tokens. Should not be readable by others.`,
          location: authPath,
          currentValue: modeToString(mode),
          expectedValue: "600",
          fix: `chmod 600 ${authPath}`,
          fixable: true,
        });
      }
    }
  } catch {
    // No agents directory
  }

  // Check device pairing file
  const pairedDevicesPath = join(stateDir, "devices", "paired.json");
  const pairedMode = await getMode(pairedDevicesPath);
  if (pairedMode !== null && isTooPermissive(pairedMode, 0o600)) {
    findings.push({
      id: "fs-paired-devices-perms",
      category: "filesystem",
      severity: "warning",
      title: "Paired devices file has permissive permissions",
      description: `Device pairing data should not be readable by others.`,
      location: pairedDevicesPath,
      currentValue: modeToString(pairedMode),
      expectedValue: "600",
      fix: `chmod 600 ${pairedDevicesPath}`,
      fixable: true,
    });
  }

  return findings;
}
