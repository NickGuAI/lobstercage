// Tool and model risk security checks

import type { SecurityFinding, OpenClawConfig } from "../types.js";

// Models considered weak/legacy
const LEGACY_MODELS = [
  "gpt-3.5-turbo",
  "gpt-3.5",
  "claude-2",
  "claude-instant",
  "claude-instant-1",
];

const WEAK_MODELS = [
  "claude-3-haiku",
  "gpt-4o-mini",
  "gemini-flash",
  "gemini-1.5-flash",
];

// Model families with known small variants (< 300B params with web tools = risky)
const SMALL_MODEL_PATTERNS = [
  /llama.*7b/i,
  /llama.*8b/i,
  /llama.*13b/i,
  /mistral.*7b/i,
  /phi-3/i,
  /phi-2/i,
  /gemma.*2b/i,
  /gemma.*7b/i,
  /qwen.*7b/i,
  /qwen.*14b/i,
];

export function checkTools(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check elevated tools with wildcard access
  if (config.tools?.elevated?.allowFrom?.includes("*")) {
    findings.push({
      id: "tools-elevated-wildcard",
      category: "tools",
      severity: "critical",
      title: "Elevated tools allow any sender",
      description: `Elevated tools (file write, shell, etc.) are accessible by anyone ("*" in allowFrom). This is extremely dangerous.`,
      location: "tools.elevated.allowFrom",
      currentValue: '["*"]',
      expectedValue: "Specific sender allowlist",
      fix: "Replace wildcard with specific trusted sender IDs",
      fixable: false,
    });
  }

  // Check for web tools enabled with small/weak models
  const model = config.model?.default?.toLowerCase() || "";
  const webEnabled = config.tools?.web?.enabled !== false;

  if (webEnabled && model) {
    // Check for legacy models
    if (LEGACY_MODELS.some((m) => model.includes(m))) {
      findings.push({
        id: "tools-legacy-model",
        category: "tools",
        severity: "warning",
        title: "Legacy model in use",
        description: `Using "${config.model?.default}" which is a legacy model. Consider upgrading to a more capable model.`,
        location: "model.default",
        currentValue: config.model?.default,
        fix: "Upgrade to GPT-4o, Claude 3.5 Sonnet, or newer",
        fixable: false,
      });
    }

    // Check for weak tier models
    if (WEAK_MODELS.some((m) => model.includes(m))) {
      findings.push({
        id: "tools-weak-model",
        category: "tools",
        severity: "info",
        title: "Weak tier model in use",
        description: `Using "${config.model?.default}" which has reduced capabilities. May be more susceptible to prompt injection.`,
        location: "model.default",
        currentValue: config.model?.default,
        fix: "Consider using a stronger model for sensitive operations",
        fixable: false,
      });
    }

    // Check for small local models with web tools
    const isSmallModel = SMALL_MODEL_PATTERNS.some((p) => p.test(model));
    if (isSmallModel) {
      findings.push({
        id: "tools-small-model-web",
        category: "tools",
        severity: "critical",
        title: "Small model with web tools enabled",
        description: `Using a small model (${config.model?.default}) with web browsing enabled. Small models are highly susceptible to prompt injection from web content.`,
        location: "model.default + tools.web.enabled",
        currentValue: config.model?.default,
        fix: "Disable web tools or use a larger model (>70B parameters)",
        fixable: false,
      });
    }
  }

  return findings;
}
