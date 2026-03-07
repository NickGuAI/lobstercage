import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPENCLAW_PLUGIN_JSON, PLUGIN_MANIFEST, PLUGIN_VERSION } from "./plugin.js";

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
const packageVersion = (
  JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: string }
).version;

describe("guard plugin metadata version", () => {
  it("uses package.json as single source of truth", () => {
    expect(PLUGIN_VERSION).toBe(packageVersion);
    expect(PLUGIN_MANIFEST.version).toBe(packageVersion);
    expect(OPENCLAW_PLUGIN_JSON.version).toBe(packageVersion);
  });
});
