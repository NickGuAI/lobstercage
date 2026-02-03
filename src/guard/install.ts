import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { PLUGIN_SOURCE, PLUGIN_MANIFEST } from "./plugin.js";
import { style } from "../ui/matrix.js";

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    return resolve(expanded);
  }
  return resolve(trimmed);
}

function resolveStateDir(): string {
  const override = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  return join(homedir(), ".openclaw");
}

function pluginDir(): string {
  return join(resolveStateDir(), "extensions", "lobstercage");
}

/** Check if lobstercage plugin is already installed */
export async function isInstalled(): Promise<boolean> {
  try {
    await access(join(pluginDir(), "index.js"));
    return true;
  } catch {
    return false;
  }
}

/** Install the lobstercage guard plugin into OpenClaw's plugin directory */
export async function installGuard(): Promise<void> {
  const dir = pluginDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.js"), PLUGIN_SOURCE.trim(), "utf-8");
  await writeFile(join(dir, "package.json"), JSON.stringify(PLUGIN_MANIFEST, null, 2), "utf-8");
}

/** Uninstall the lobstercage guard plugin */
export async function uninstallGuard(): Promise<void> {
  const dir = pluginDir();
  try {
    await rm(dir, { recursive: true, force: true });
    console.log(`${style.bright("✓")} ${style.green("Guard plugin removed")}`);
  } catch {
    console.log(style.dim("  Guard was not installed"));
  }
}
