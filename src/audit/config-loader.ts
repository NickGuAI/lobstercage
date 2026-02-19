// Config loader for OpenClaw configuration files

import { readFile, readdir, stat, lstat, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { OpenClawConfig } from "./types.js";

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    return resolve(expanded);
  }
  return resolve(trimmed);
}

/** Get the OpenClaw state directory */
export function getStateDir(): string {
  const override =
    process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  return join(homedir(), ".openclaw");
}

/** Strip comments and trailing commas from JSON5-like config (simple parser) */
function sanitizeJson5(text: string): string {
  // Remove single-line comments (// ...)
  let result = text.replace(/\/\/[^\n]*/g, "");
  // Remove multi-line comments (/* ... */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1");
  return result;
}

/** Parse JSON5-like config file content */
function parseConfig(text: string): OpenClawConfig {
  try {
    return JSON.parse(text);
  } catch {
    // Try sanitizing JSON5 syntax
    const sanitized = sanitizeJson5(text);
    return JSON.parse(sanitized);
  }
}

/** Try to find and load OpenClaw config from standard locations */
export async function loadConfig(customPath?: string): Promise<{
  config: OpenClawConfig;
  path: string;
} | null> {
  const configPaths: string[] = [];

  if (customPath) {
    configPaths.push(resolveUserPath(customPath));
  }

  // Standard OpenClaw config locations
  const stateDir = getStateDir();
  configPaths.push(
    join(stateDir, "config.json"),
    join(stateDir, "config.json5"),
    join(stateDir, "config.jsonc"),
    join(stateDir, "openclaw.json")
  );

  // Also check current directory
  configPaths.push(
    join(process.cwd(), "openclaw.json"),
    join(process.cwd(), ".openclaw.json")
  );

  for (const configPath of configPaths) {
    try {
      const text = await readFile(configPath, "utf-8");
      const config = parseConfig(text);
      return { config, path: configPath };
    } catch {
      // Try next path
    }
  }

  return null;
}

/** Load credentials directory contents */
export async function loadCredentialsDir(): Promise<{
  path: string;
  files: string[];
} | null> {
  const stateDir = getStateDir();
  const credsDir = join(stateDir, "credentials");

  try {
    const files = await readdir(credsDir);
    return { path: credsDir, files };
  } catch {
    return null;
  }
}

/** Load extensions directory contents */
export async function loadExtensionsDir(): Promise<{
  path: string;
  extensions: string[];
} | null> {
  const stateDir = getStateDir();
  const extDir = join(stateDir, "extensions");

  try {
    const entries = await readdir(extDir);
    const extensions: string[] = [];
    for (const entry of entries) {
      const entryPath = join(extDir, entry);
      const entryStat = await stat(entryPath);
      if (entryStat.isDirectory()) {
        extensions.push(entry);
      }
    }
    return { path: extDir, extensions };
  } catch {
    return null;
  }
}

/** Check if a path exists */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Get file permissions as octal string */
export async function getFileMode(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    // Convert to octal and get last 3 digits
    return (info.mode & 0o777).toString(8).padStart(3, "0");
  } catch {
    return null;
  }
}

/** Check if path is a symlink */
export async function isSymlink(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Check if path is inside a synced folder (iCloud, Dropbox, OneDrive, Google Drive) */
export function isInSyncedFolder(path: string): string | null {
  const syncedPatterns = [
    { pattern: /\/Library\/Mobile Documents\//i, name: "iCloud" },
    { pattern: /\/Dropbox\//i, name: "Dropbox" },
    { pattern: /\/OneDrive\//i, name: "OneDrive" },
    { pattern: /\/Google Drive\//i, name: "Google Drive" },
    { pattern: /\/My Drive\//i, name: "Google Drive" },
  ];

  for (const { pattern, name } of syncedPatterns) {
    if (pattern.test(path)) {
      return name;
    }
  }
  return null;
}

/** Load agent config files (auth-profiles.json etc) */
export async function loadAgentConfigs(): Promise<
  Array<{ agentId: string; authProfilesPath: string; authProfiles: unknown }>
> {
  const stateDir = getStateDir();
  const agentsDir = join(stateDir, "agents");
  const results: Array<{
    agentId: string;
    authProfilesPath: string;
    authProfiles: unknown;
  }> = [];

  try {
    const agents = await readdir(agentsDir);
    for (const agentId of agents) {
      const authPath = join(agentsDir, agentId, "agent", "auth-profiles.json");
      try {
        const text = await readFile(authPath, "utf-8");
        const authProfiles = JSON.parse(text);
        results.push({ agentId, authProfilesPath: authPath, authProfiles });
      } catch {
        // No auth profiles for this agent
      }
    }
  } catch {
    // No agents directory
  }

  return results;
}
