// Browser control security checks

import type { SecurityFinding, OpenClawConfig } from "../types.js";

export function checkBrowser(config: OpenClawConfig): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const cdpUrl = config.browser?.cdp?.url;

  if (cdpUrl) {
    // Check if CDP is over HTTP (not HTTPS or tailnet)
    if (cdpUrl.startsWith("http://") && !cdpUrl.includes("localhost") && !cdpUrl.includes("127.0.0.1")) {
      findings.push({
        id: "browser-cdp-http",
        category: "browser",
        severity: "critical",
        title: "Remote CDP over insecure HTTP",
        description: `Browser CDP is configured to connect over HTTP to a remote host. CDP traffic is unencrypted and can be intercepted.`,
        location: "browser.cdp.url",
        currentValue: cdpUrl,
        expectedValue: "https:// URL or localhost",
        fix: "Use HTTPS or restrict CDP to localhost",
        fixable: false,
      });
    }

    // Check if it's a remote CDP connection at all
    if (!cdpUrl.includes("localhost") && !cdpUrl.includes("127.0.0.1")) {
      findings.push({
        id: "browser-cdp-remote",
        category: "browser",
        severity: "info",
        title: "Remote CDP connection configured",
        description: `Browser is configured to use a remote CDP endpoint. Ensure the connection is secured and isolated.`,
        location: "browser.cdp.url",
        currentValue: cdpUrl,
        fix: "Verify the remote CDP endpoint is properly secured",
        fixable: false,
      });
    }
  }

  return findings;
}
