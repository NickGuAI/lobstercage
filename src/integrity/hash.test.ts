import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { hashFile, createBaseline, detectDrift } from "./hash.js";

describe("hashFile", () => {
  let testDir: string;
  let testFile: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `lobstercage-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    testFile = join(testDir, "test.txt");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns consistent hash for same content", async () => {
    await writeFile(testFile, "hello world", "utf-8");
    const hash1 = await hashFile(testFile);
    const hash2 = await hashFile(testFile);
    expect(hash1).toBe(hash2);
  });

  it("returns different hash for different content", async () => {
    await writeFile(testFile, "hello world", "utf-8");
    const hash1 = await hashFile(testFile);

    await writeFile(testFile, "hello universe", "utf-8");
    const hash2 = await hashFile(testFile);

    expect(hash1).not.toBe(hash2);
  });

  it("returns SHA-256 hash (64 hex characters)", async () => {
    await writeFile(testFile, "test", "utf-8");
    const hash = await hashFile(testFile);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("createBaseline", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `lobstercage-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("creates baseline with file hashes", async () => {
    await writeFile(join(testDir, "file1.js"), "content1", "utf-8");
    await writeFile(join(testDir, "file2.ts"), "content2", "utf-8");

    const baseline = await createBaseline(testDir);

    expect(baseline.version).toBe(1);
    expect(baseline.files.length).toBe(2);
    expect(baseline.files.every((f) => f.hash.length === 64)).toBe(true);
  });

  it("includes file size in baseline", async () => {
    const content = "test content";
    await writeFile(join(testDir, "test.js"), content, "utf-8");

    const baseline = await createBaseline(testDir);

    expect(baseline.files[0].size).toBe(Buffer.byteLength(content));
  });

  it("skips node_modules directory", async () => {
    await mkdir(join(testDir, "node_modules"), { recursive: true });
    await writeFile(join(testDir, "node_modules", "dep.js"), "module", "utf-8");
    await writeFile(join(testDir, "main.js"), "main", "utf-8");

    const baseline = await createBaseline(testDir);

    expect(baseline.files.length).toBe(1);
    expect(baseline.files[0].path).toBe("main.js");
  });

  it("skips hidden files and directories", async () => {
    await mkdir(join(testDir, ".git"), { recursive: true });
    await writeFile(join(testDir, ".git", "config"), "git config", "utf-8");
    await writeFile(join(testDir, ".hidden.js"), "hidden", "utf-8");
    await writeFile(join(testDir, "visible.js"), "visible", "utf-8");

    const baseline = await createBaseline(testDir);

    expect(baseline.files.length).toBe(1);
    expect(baseline.files[0].path).toBe("visible.js");
  });
});

describe("detectDrift", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `lobstercage-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects no drift when files unchanged", async () => {
    await writeFile(join(testDir, "file.js"), "content", "utf-8");
    const baseline = await createBaseline(testDir);

    const drift = await detectDrift(testDir, baseline);

    expect(drift.added.length).toBe(0);
    expect(drift.removed.length).toBe(0);
    expect(drift.modified.length).toBe(0);
    expect(drift.unchanged).toBe(1);
  });

  it("detects added files", async () => {
    await writeFile(join(testDir, "original.js"), "content", "utf-8");
    const baseline = await createBaseline(testDir);

    await writeFile(join(testDir, "new.js"), "new content", "utf-8");
    const drift = await detectDrift(testDir, baseline);

    expect(drift.added).toContain("new.js");
    expect(drift.removed.length).toBe(0);
    expect(drift.modified.length).toBe(0);
  });

  it("detects removed files", async () => {
    await writeFile(join(testDir, "file.js"), "content", "utf-8");
    const baseline = await createBaseline(testDir);

    await rm(join(testDir, "file.js"));
    const drift = await detectDrift(testDir, baseline);

    expect(drift.removed).toContain("file.js");
    expect(drift.added.length).toBe(0);
    expect(drift.modified.length).toBe(0);
  });

  it("detects modified files", async () => {
    await writeFile(join(testDir, "file.js"), "original", "utf-8");
    const baseline = await createBaseline(testDir);

    await writeFile(join(testDir, "file.js"), "modified", "utf-8");
    const drift = await detectDrift(testDir, baseline);

    expect(drift.modified).toContain("file.js");
    expect(drift.added.length).toBe(0);
    expect(drift.removed.length).toBe(0);
  });

  it("handles complex drift scenarios", async () => {
    await writeFile(join(testDir, "keep.js"), "keep", "utf-8");
    await writeFile(join(testDir, "modify.js"), "before", "utf-8");
    await writeFile(join(testDir, "remove.js"), "remove", "utf-8");

    const baseline = await createBaseline(testDir);

    await writeFile(join(testDir, "modify.js"), "after", "utf-8");
    await rm(join(testDir, "remove.js"));
    await writeFile(join(testDir, "add.js"), "add", "utf-8");

    const drift = await detectDrift(testDir, baseline);

    expect(drift.added).toContain("add.js");
    expect(drift.removed).toContain("remove.js");
    expect(drift.modified).toContain("modify.js");
    expect(drift.unchanged).toBe(1);
  });
});
