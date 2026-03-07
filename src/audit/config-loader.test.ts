import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSymlink } from "./config-loader.js";

describe("isSymlink", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lobstercage-config-loader-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns true for symbolic links", async () => {
    const targetPath = join(tempDir, "target.txt");
    const symlinkPath = join(tempDir, "target-link.txt");

    await writeFile(targetPath, "target", "utf-8");
    await symlink(targetPath, symlinkPath);

    await expect(isSymlink(symlinkPath)).resolves.toBe(true);
  });

  it("returns false for regular files and missing paths", async () => {
    const regularFilePath = join(tempDir, "regular.txt");
    const missingPath = join(tempDir, "missing.txt");

    await writeFile(regularFilePath, "regular", "utf-8");

    await expect(isSymlink(regularFilePath)).resolves.toBe(false);
    await expect(isSymlink(missingPath)).resolves.toBe(false);
  });
});
