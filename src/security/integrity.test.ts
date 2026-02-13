import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectExtensionsIntegrityDrift, writeExtensionsBaseline } from "./integrity.js";

describe("integrity baseline and drift detection", () => {
  let stateDir = "";
  let previousStateDir: string | undefined;
  let previousLegacyStateDir: string | undefined;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "lobstercage-integrity-test-"));
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    previousLegacyStateDir = process.env.CLAWDBOT_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = stateDir;
    delete process.env.CLAWDBOT_STATE_DIR;

    await mkdir(join(stateDir, "extensions", "skill-a"), { recursive: true });
    await writeFile(join(stateDir, "extensions", "skill-a", "index.js"), "console.log('safe');\n", "utf-8");
    await writeFile(join(stateDir, "extensions", "skill-a", "README.md"), "# Skill A\n", "utf-8");
  });

  afterEach(async () => {
    if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousStateDir;

    if (previousLegacyStateDir === undefined) delete process.env.CLAWDBOT_STATE_DIR;
    else process.env.CLAWDBOT_STATE_DIR = previousLegacyStateDir;

    if (stateDir) {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("creates baseline then reports added/removed/modified files", async () => {
    const baseline = await writeExtensionsBaseline();
    expect(baseline.fileCount).toBe(2);

    const driftInitial = await detectExtensionsIntegrityDrift();
    expect(driftInitial.baselinePresent).toBe(true);
    expect(driftInitial.added).toEqual([]);
    expect(driftInitial.removed).toEqual([]);
    expect(driftInitial.modified).toEqual([]);

    await writeFile(join(stateDir, "extensions", "skill-a", "index.js"), "console.log('tampered');\n", "utf-8");
    await writeFile(join(stateDir, "extensions", "skill-a", "new.txt"), "new file\n", "utf-8");
    await unlink(join(stateDir, "extensions", "skill-a", "README.md"));

    const drift = await detectExtensionsIntegrityDrift();
    expect(drift.modified).toEqual(["skill-a/index.js"]);
    expect(drift.added).toEqual(["skill-a/new.txt"]);
    expect(drift.removed).toEqual(["skill-a/README.md"]);
  });
});
