// Secrets hygiene security checks

import type { SecurityFinding, OpenClawConfig } from "../types.js";

const MIN_HOOKS_TOKEN_LENGTH = 16;

export function checkSecrets(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check for passwords in config (prefer env vars)
  if (config.gateway?.auth?.password) {
    findings.push({
      id: "secrets-password-in-config",
      category: "secrets",
      severity: "warning",
      title: "Password stored in config file",
      description: `Gateway password is stored in the config file. Prefer using OPENCLAW_GATEWAY_PASSWORD environment variable.`,
      location: "gateway.auth.password",
      currentValue: "[REDACTED]",
      expectedValue: "Use OPENCLAW_GATEWAY_PASSWORD env var",
      fix: "Move password to environment variable and remove from config",
      fixable: false,
    });
  }

  if (config.gateway?.auth?.token) {
    findings.push({
      id: "secrets-token-in-config",
      category: "secrets",
      severity: "info",
      title: "Token stored in config file",
      description: `Gateway token is stored in the config file. Consider using OPENCLAW_GATEWAY_TOKEN environment variable for better security.`,
      location: "gateway.auth.token",
      currentValue: "[REDACTED]",
      expectedValue: "Use OPENCLAW_GATEWAY_TOKEN env var",
      fix: "Move token to environment variable and remove from config",
      fixable: false,
    });
  }

  // Check for token reuse between gateway and hooks
  const gatewayToken = config.gateway?.auth?.token;
  const hooksToken = config.hooks?.token;
  if (gatewayToken && hooksToken && gatewayToken === hooksToken) {
    findings.push({
      id: "secrets-token-reuse",
      category: "secrets",
      severity: "warning",
      title: "Token reused between gateway and hooks",
      description: `The same token is used for both gateway auth and hooks. If one is compromised, both are compromised.`,
      location: "gateway.auth.token = hooks.token",
      fix: "Use different tokens for gateway and hooks",
      fixable: false,
    });
  }

  // Check hooks token length
  if (hooksToken && hooksToken.length < MIN_HOOKS_TOKEN_LENGTH) {
    findings.push({
      id: "secrets-hooks-short-token",
      category: "secrets",
      severity: "warning",
      title: "Hooks token is too short",
      description: `Hooks token is only ${hooksToken.length} characters. Should be at least ${MIN_HOOKS_TOKEN_LENGTH} characters.`,
      location: "hooks.token",
      currentValue: `${hooksToken.length} chars`,
      expectedValue: `≥${MIN_HOOKS_TOKEN_LENGTH} chars`,
      fix: "Use a longer random token",
      fixable: false,
    });
  }

  // Check logging redaction
  if (config.logging?.redactSensitive === "off") {
    findings.push({
      id: "secrets-redaction-off",
      category: "secrets",
      severity: "warning",
      title: "Sensitive data redaction is disabled",
      description: `Logging redaction is disabled. Sensitive data like API keys and PII may appear in logs.`,
      location: "logging.redactSensitive",
      currentValue: "off",
      expectedValue: "on or auto",
      fix: "Set logging.redactSensitive to 'on' or remove to use default",
      fixable: true,
    });
  }

  return findings;
}
