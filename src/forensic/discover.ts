import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/** Discover all session JSONL files under ~/.openclaw/agents/{id}/sessions/ */
export async function discoverSessionFiles(): Promise<string[]> {
  const baseDir = join(homedir(), ".openclaw", "agents");
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
