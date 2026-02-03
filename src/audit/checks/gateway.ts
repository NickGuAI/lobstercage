// Gateway authentication security checks

import type { SecurityFinding, OpenClawConfig } from "../types.js";

const MIN_TOKEN_LENGTH = 24;

export function checkGateway(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const gateway = config.gateway;

  if (!gateway) {
    return findings;
  }

  // Check if gateway binds beyond loopback
  const bind = gateway.bind || "127.0.0.1";
  const isBoundBeyondLoopback =
    bind !== "127.0.0.1" && bind !== "localhost" && bind !== "::1";

  if (isBoundBeyondLoopback) {
    const hasToken = !!gateway.auth?.token || !!process.env.OPENCLAW_GATEWAY_TOKEN;
    const hasPassword = !!gateway.auth?.password || !!process.env.OPENCLAW_GATEWAY_PASSWORD;
    const hasTailscale = !!gateway.tailscale;

    if (!hasToken && !hasPassword && !hasTailscale) {
      findings.push({
        id: "gateway-no-auth",
        category: "gateway",
        severity: "critical",
        title: "Gateway binds beyond loopback without authentication",
        description: `Gateway is bound to "${bind}" but no authentication is configured. Anyone with network access can control your agent.`,
        location: "gateway.bind",
        currentValue: bind,
        expectedValue: "127.0.0.1 (or configure auth)",
        fix: "Set OPENCLAW_GATEWAY_TOKEN env var or configure gateway.auth.token in config",
        fixable: false,
      });
    }
  }

  // Check token length
  const token = gateway.auth?.token || process.env.OPENCLAW_GATEWAY_TOKEN;
  if (token && token.length < MIN_TOKEN_LENGTH) {
    findings.push({
      id: "gateway-short-token",
      category: "gateway",
      severity: "warning",
      title: "Gateway token is too short",
      description: `Token length is ${token.length} characters. Recommended minimum is ${MIN_TOKEN_LENGTH} characters.`,
      location: "gateway.auth.token",
      currentValue: `${token.length} chars`,
      expectedValue: `≥${MIN_TOKEN_LENGTH} chars`,
      fix: "Use a longer random token (e.g., openssl rand -base64 32)",
      fixable: false,
    });
  }

  // Check control UI insecure auth flags
  if (gateway.controlUI?.allowInsecureAuth) {
    findings.push({
      id: "gateway-insecure-auth",
      category: "gateway",
      severity: "warning",
      title: "Control UI allows insecure authentication",
      description:
        "allowInsecureAuth is enabled, which may expose the gateway to authentication bypass attacks.",
      location: "gateway.controlUI.allowInsecureAuth",
      currentValue: "true",
      expectedValue: "false or unset",
      fix: "Remove or set to false",
      fixable: true,
    });
  }

  if (gateway.controlUI?.dangerouslyDisableDeviceAuth) {
    findings.push({
      id: "gateway-no-device-auth",
      category: "gateway",
      severity: "critical",
      title: "Device authentication is disabled",
      description:
        "dangerouslyDisableDeviceAuth is enabled. Any device can connect without pairing.",
      location: "gateway.controlUI.dangerouslyDisableDeviceAuth",
      currentValue: "true",
      expectedValue: "false or unset",
      fix: "Remove or set to false",
      fixable: true,
    });
  }

  // Tailscale Funnel exposure warning
  if (gateway.tailscale) {
    findings.push({
      id: "gateway-tailscale-exposure",
      category: "gateway",
      severity: "info",
      title: "Gateway uses Tailscale",
      description:
        "Tailscale mode is enabled. Ensure Funnel is not exposing the gateway to the public internet unless intended.",
      location: "gateway.tailscale",
      currentValue: "true",
      fix: "Verify Tailscale Funnel settings if public exposure is not desired",
      fixable: false,
    });
  }

  return findings;
}
