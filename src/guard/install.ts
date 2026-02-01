import { mkdir, writeFile, rm, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { PLUGIN_SOURCE, PLUGIN_MANIFEST } from "./plugin.js";
import { style } from "../ui/matrix.js";

function pluginDir(): string {
  return join(homedir(), ".openclaw", "plugins", "lobstercage");
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
  const already = await isInstalled();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.js"), PLUGIN_SOURCE.trim(), "utf-8");
  await writeFile(join(dir, "package.json"), JSON.stringify(PLUGIN_MANIFEST, null, 2), "utf-8");

  if (already) {
    console.log(style.tag("GUARD") + " " + style.bright("Plugin updated at ") + style.dark(dir));
  } else {
    console.log(style.tag("GUARD") + " " + style.bright("Plugin installed at ") + style.dark(dir));
  }
  console.log(style.tag("GUARD") + " " + style.bright("Outgoing messages will be scanned for PII and policy violations."));
}

/** Uninstall the lobstercage guard plugin */
export async function uninstallGuard(): Promise<void> {
  const dir = pluginDir();
  try {
    await rm(dir, { recursive: true, force: true });
    console.log(style.tag("GUARD") + " " + style.bright("Plugin removed from ") + style.dark(dir));
  } catch {
    console.log(style.tag("GUARD") + " " + style.dark("Plugin was not installed."));
  }
}
