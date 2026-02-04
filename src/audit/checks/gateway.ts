// Gateway authentication security checks

import type { SecurityFinding, OpenClawConfig } from "../types.js";

const MIN_TOKEN_LENGTH = 24;

export function checkGateway(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const gateway = config.gateway;

  if (!gateway) {
    return findings;
  }

  // Check bind mode - OpenClaw uses modes, not IP addresses
  const bindMode = (gateway.bind || "loopback") as string;
  const isExposedBind =
    bindMode === "lan" ||
    bindMode === "auto" ||
    (bindMode === "custom" &&
      gateway.customBindHost &&
      !["127.0.0.1", "localhost", "::1"].includes(gateway.customBindHost));

  if (isExposedBind) {
    const hasToken = !!gateway.auth?.token || !!process.env.OPENCLAW_GATEWAY_TOKEN;
    const hasPassword = !!gateway.auth?.password || !!process.env.OPENCLAW_GATEWAY_PASSWORD;
    const hasTailscale = !!gateway.tailscale;

    if (!hasToken && !hasPassword && !hasTailscale) {
      findings.push({
        id: "gateway-no-auth",
        category: "gateway",
        severity: "critical",
        title: "Gateway exposed without authentication",
        description: `Gateway bind mode is "${bindMode}" which exposes it beyond localhost, but no authentication is configured.`,
        location: "gateway.bind",
        currentValue: bindMode,
        expectedValue: "loopback (or configure auth)",
        fix: "Set gateway.bind to 'loopback' or configure gateway.auth.token",
        fixable: false,
      });
    }
  }

  // Even with auth, warn about public exposure
  if (bindMode === "lan") {
    findings.push({
      id: "gateway-public-bind",
      category: "gateway",
      severity: "critical",
      title: "Gateway binds to all network interfaces",
      description:
        'Gateway bind mode is "lan" which exposes it on all interfaces (0.0.0.0). Use "loopback" and Tailscale serve for remote access.',
      location: "gateway.bind",
      currentValue: "lan",
      expectedValue: "loopback",
      fix: "Set gateway.bind to 'loopback' and use Tailscale serve for remote access",
      fixable: true,
    });
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

  // Handle tailscale as object (OpenClaw format)
  const tailscaleConfig = gateway.tailscale;

  if (tailscaleConfig?.mode === "funnel") {
    findings.push({
      id: "gateway-funnel-exposed",
      category: "gateway",
      severity: "critical",
      title: "Gateway exposed via Tailscale Funnel",
      description:
        "Tailscale Funnel mode exposes the gateway to the public internet. Anyone can reach your agent.",
      location: "gateway.tailscale.mode",
      currentValue: "funnel",
      expectedValue: "serve or off",
      fix: "Set gateway.tailscale.mode to 'serve' (tailnet-only) or 'off'",
      fixable: true,
    });
  } else if (tailscaleConfig?.mode === "serve") {
    findings.push({
      id: "gateway-tailscale-serve",
      category: "gateway",
      severity: "info",
      title: "Gateway uses Tailscale serve",
      description: "Tailscale serve mode enabled. Gateway is accessible within your tailnet.",
      location: "gateway.tailscale.mode",
      currentValue: "serve",
      fix: "Verify only trusted devices are on your tailnet",
      fixable: false,
    });
  } else if (tailscaleConfig) {
    findings.push({
      id: "gateway-tailscale-enabled",
      category: "gateway",
      severity: "info",
      title: "Tailscale configuration present",
      description: "Tailscale is configured. Check tailscale.mode setting.",
      location: "gateway.tailscale",
      fixable: false,
    });
  }

  const controlUiEnabled = gateway.controlUI?.enabled !== false;
  const isPubliclyExposed = bindMode === "lan" || tailscaleConfig?.mode === "funnel";

  if (controlUiEnabled && isPubliclyExposed) {
    findings.push({
      id: "gateway-control-ui-exposed",
      category: "gateway",
      severity: "critical",
      title: "Control UI exposed to public network",
      description:
        "The control UI is enabled and the gateway is publicly accessible. Admin interface is exposed.",
      location: "gateway.controlUI.enabled",
      currentValue: "true (default)",
      expectedValue: "false, or use loopback/tailscale serve",
      fix: "Disable control UI or restrict gateway to loopback",
      fixable: true,
    });
  }

  return findings;
}
