import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/** Get the OpenClaw state directory (respects OPENCLAW_STATE_DIR / CLAWDBOT_STATE_DIR env vars) */
function getStateDir(): string {
  const override =
    process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    if (override.startsWith("~")) {
      return override.replace(/^~(?=$|[\\/])/, homedir());
    }
    return override;
  }
  return join(homedir(), ".openclaw");
}

/** Discover all session JSONL files under {stateDir}/agents/{id}/sessions/ */
export async function discoverSessionFiles(): Promise<string[]> {
  const baseDir = join(getStateDir(), "agents");
  const files: string[] = [];

  try {
    const agents = await readdir(baseDir);
    for (const agent of agents) {
      const sessionsDir = join(baseDir, agent, "sessions");
      try {
        const sessionFiles = await readdir(sessionsDir);
        for (const file of sessionFiles) {
          if (file.endsWith(".jsonl")) {
            files.push(join(sessionsDir, file));
          }
        }
      } catch {
        // Agent directory may not have sessions — skip
      }
    }
  } catch {
    // No agents directory — nothing to scan
  }

  return files;
}
