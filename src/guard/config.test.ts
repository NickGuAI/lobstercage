import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGuardConfig } from "./config.js";
import type { GuardConfigFile } from "./config.js";

// Mock the stats/rules-config module so we don't hit disk
vi.mock("../stats/rules-config.js", () => ({
  loadRuleConfig: vi.fn(),
}));

import { loadRuleConfig } from "../stats/rules-config.js";
const mockLoadRuleConfig = vi.mocked(loadRuleConfig);

describe("buildGuardConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("produces version 1 config with rule entries", async () => {
    mockLoadRuleConfig.mockResolvedValue({
      rules: [
        { id: "pii-phone", category: "pii", enabled: true, action: "warn" },
        { id: "pii-ssn", category: "pii", enabled: false, action: "block" },
      ],
      customRules: [],
    });

    const config: GuardConfigFile = await buildGuardConfig();

    expect(config.version).toBe(1);
    expect(config.rules["pii-phone"]).toEqual({ enabled: true, action: "warn" });
    expect(config.rules["pii-ssn"]).toEqual({ enabled: false, action: "block" });
  });

  it("includes allowPatterns when present", async () => {
    mockLoadRuleConfig.mockResolvedValue({
      rules: [
        {
          id: "pii-phone",
          category: "pii",
          enabled: true,
          action: "warn",
          allowPatterns: ["555-0100", "555-0199"],
        },
      ],
      customRules: [],
    });

    const config = await buildGuardConfig();

    expect(config.rules["pii-phone"].allowPatterns).toEqual([
      "555-0100",
      "555-0199",
    ]);
  });

  it("omits allowPatterns when empty", async () => {
    mockLoadRuleConfig.mockResolvedValue({
      rules: [
        {
          id: "pii-email",
          category: "pii",
          enabled: true,
          action: "warn",
          allowPatterns: [],
        },
      ],
      customRules: [],
    });

    const config = await buildGuardConfig();

    expect(config.rules["pii-email"].allowPatterns).toBeUndefined();
  });

  it("merges custom rules into the config", async () => {
    mockLoadRuleConfig.mockResolvedValue({
      rules: [
        { id: "pii-phone", category: "pii", enabled: true, action: "warn" },
      ],
      customRules: [
        { id: "custom-rule", category: "content", enabled: true, action: "block" },
      ],
    });

    const config = await buildGuardConfig();

    expect(config.rules["pii-phone"]).toBeDefined();
    expect(config.rules["custom-rule"]).toEqual({
      enabled: true,
      action: "block",
    });
  });
});
