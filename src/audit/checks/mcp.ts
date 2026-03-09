// MCP server config security checks (--deep audit)

import type { SecurityFinding, OpenClawConfig, McpServerConfig } from "../types.js";

/** Default threshold for large payload detection (512 KB) */
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;

/** Check a single MCP server entry for security issues */
function checkServer(
  name: string,
  server: McpServerConfig,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // 1. Wildcard CORS origin — CSRF risk
  const origin = server.accessControlAllowOrigin;
  if (origin === "*") {
    findings.push({
      id: `mcp-cors-wildcard-${name}`,
      category: "mcp",
      severity: "critical",
      title: `MCP server "${name}" allows any origin`,
      description:
        "Access-Control-Allow-Origin is set to '*', exposing this MCP server to cross-site request forgery from any web page.",
      location: `mcp.servers.${name}.accessControlAllowOrigin`,
      currentValue: "*",
      expectedValue: "Specific trusted origin(s)",
      fix: "Set accessControlAllowOrigin to the specific origin that needs access",
      fixable: false,
    });
  }

  // 2. Locally-running MCP server whose command is a raw script (not a signed binary)
  if (server.transport === "stdio" && server.command) {
    const cmd = server.command;
    const scriptExtensions = [".js", ".ts", ".py", ".sh", ".rb", ".mjs", ".cjs"];
    const isScript = scriptExtensions.some((ext) => cmd.endsWith(ext));
    const isNodeOrPython =
      cmd === "node" || cmd === "python" || cmd === "python3" || cmd === "npx" || cmd === "tsx";

    if (isScript || isNodeOrPython) {
      findings.push({
        id: `mcp-unsigned-process-${name}`,
        category: "mcp",
        severity: "warning",
        title: `MCP server "${name}" runs an unsigned script`,
        description:
          `The stdio MCP server is launched via "${cmd}"${server.args?.length ? ` with args [${server.args.join(", ")}]` : ""}. ` +
          "Interpreted scripts are not code-signed and could be modified without detection — supply-chain risk.",
        location: `mcp.servers.${name}.command`,
        currentValue: cmd,
        expectedValue: "Signed binary or verified package",
        fix: "Pin the package version and verify its integrity, or use a signed binary",
        fixable: false,
      });
    }
  }

  // 3. Untrusted transport origin — HTTP instead of HTTPS (MITM risk)
  const url = server.url;
  if (url) {
    const isHttp = url.startsWith("http://");
    const isLocalhost =
      url.includes("localhost") || url.includes("127.0.0.1") || url.includes("[::1]");

    if (isHttp && !isLocalhost) {
      findings.push({
        id: `mcp-http-transport-${name}`,
        category: "mcp",
        severity: "critical",
        title: `MCP server "${name}" uses insecure HTTP`,
        description:
          "This MCP server connects over plain HTTP to a non-localhost endpoint. " +
          "Traffic can be intercepted and modified by a man-in-the-middle attacker.",
        location: `mcp.servers.${name}.url`,
        currentValue: url,
        expectedValue: "https:// URL or localhost",
        fix: `Upgrade transport URL to HTTPS`,
        fixable: true,
      });
    }
  }

  // 4. Large payload threshold — prompt-injection vector
  const maxBytes = server.maxResponseBytes;
  if (maxBytes !== undefined && maxBytes > DEFAULT_MAX_RESPONSE_BYTES) {
    findings.push({
      id: `mcp-large-payload-${name}`,
      category: "mcp",
      severity: "warning",
      title: `MCP server "${name}" allows large payloads`,
      description:
        `maxResponseBytes is ${maxBytes} (${(maxBytes / 1024).toFixed(0)} KB), ` +
        `which exceeds the recommended ${DEFAULT_MAX_RESPONSE_BYTES / 1024} KB threshold. ` +
        "Large payloads from MCP tools can serve as prompt-injection vectors.",
      location: `mcp.servers.${name}.maxResponseBytes`,
      currentValue: String(maxBytes),
      expectedValue: `<= ${DEFAULT_MAX_RESPONSE_BYTES}`,
      fix: `Reduce maxResponseBytes to ${DEFAULT_MAX_RESPONSE_BYTES} or lower`,
      fixable: false,
    });
  }

  return findings;
}

/** Audit all configured MCP servers (requires --deep) */
export function checkMcp(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const servers = config.mcp?.servers;

  if (!servers || Object.keys(servers).length === 0) {
    return findings;
  }

  for (const [name, server] of Object.entries(servers)) {
    findings.push(...checkServer(name, server));
  }

  return findings;
}
