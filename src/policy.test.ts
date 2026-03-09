import { describe, it, expect } from "vitest";
import { checkThresholds, type PolicyConfig } from "./policy.js";

describe("checkThresholds", () => {
  it("returns empty array when no thresholds configured", () => {
    const policy: PolicyConfig = {};
    const violations = { "pii-email": 5 };
    expect(checkThresholds(policy, violations)).toEqual([]);
  });

  it("returns empty array when thresholds object is empty", () => {
    const policy: PolicyConfig = { thresholds: {} };
    const violations = { "pii-email": 5 };
    expect(checkThresholds(policy, violations)).toEqual([]);
  });

  it("detects breach when violations exceed threshold", () => {
    const policy: PolicyConfig = {
      thresholds: { "pii-email": { perDay: 0 } },
    };
    const violations = { "pii-email": 3 };
    const breaches = checkThresholds(policy, violations);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toEqual({
      ruleId: "pii-email",
      threshold: 0,
      actual: 3,
    });
  });

  it("does not breach when violations equal threshold", () => {
    const policy: PolicyConfig = {
      thresholds: { "pii-email": { perDay: 5 } },
    };
    const violations = { "pii-email": 5 };
    expect(checkThresholds(policy, violations)).toEqual([]);
  });

  it("does not breach when violations below threshold", () => {
    const policy: PolicyConfig = {
      thresholds: { "pii-email": { perDay: 10 } },
    };
    const violations = { "pii-email": 3 };
    expect(checkThresholds(policy, violations)).toEqual([]);
  });

  it("handles zero-tolerance threshold (perDay: 0)", () => {
    const policy: PolicyConfig = {
      thresholds: {
        "pii-email": { perDay: 0 },
        "pii-api-key": { perDay: 0 },
      },
    };
    const violations = { "pii-email": 1, "pii-api-key": 0 };
    const breaches = checkThresholds(policy, violations);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].ruleId).toBe("pii-email");
  });

  it("handles multiple breaches", () => {
    const policy: PolicyConfig = {
      thresholds: {
        "pii-email": { perDay: 0 },
        "pii-api-key": { perDay: 2 },
        "pii-ssn": { perDay: 0 },
      },
    };
    const violations = { "pii-email": 3, "pii-api-key": 5, "pii-ssn": 1 };
    const breaches = checkThresholds(policy, violations);
    expect(breaches).toHaveLength(3);
    expect(breaches.map((b) => b.ruleId).sort()).toEqual([
      "pii-api-key",
      "pii-email",
      "pii-ssn",
    ]);
  });

  it("treats missing rule violations as zero", () => {
    const policy: PolicyConfig = {
      thresholds: { "pii-email": { perDay: 0 } },
    };
    const violations: Record<string, number> = {};
    expect(checkThresholds(policy, violations)).toEqual([]);
  });

  it("ignores rules without thresholds configured", () => {
    const policy: PolicyConfig = {
      thresholds: { "pii-email": { perDay: 0 } },
    };
    const violations = { "pii-email": 1, "pii-phone": 10, "content-injection": 5 };
    const breaches = checkThresholds(policy, violations);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].ruleId).toBe("pii-email");
  });
});
