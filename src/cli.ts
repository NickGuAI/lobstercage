#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runCatch, type CatchOptions } from "./commands/catch.js";
import { runAuditCommand, type AuditCommandOptions } from "./commands/audit.js";
import { runStatus, type StatusOptions } from "./commands/status.js";

const USAGE = `
lobstercage — OpenClaw Security Scanner

Usage:
  lobstercage catch [options]    Full security scan (audit + forensic + guard)
  lobstercage audit [options]    Config-only security audit
  lobstercage status [options]   Show stats and open dashboard

Commands:
  catch           Run full security scan and install live guard
  audit           Run config security audit only
  status          Show scan statistics and guard status

Catch Options:
  --scan-only     Only run forensic scan (no audit, no guard install)
  --guard-only    Only install live guard (no audit, no forensic scan)
  --audit-only    Only run config audit (no forensic scan, no guard)
  --fix           Auto-fix remediable security issues
  --interactive   Interactive mode: review and redact PII violations
  -i              Shorthand for --interactive
  --report <path> Write report to file
  --config <path> Custom config file path
  --uninstall     Remove the lobstercage guard plugin

Audit Options:
  --fix           Auto-fix remediable security issues
  --deep          Include deep connectivity checks
  --report <path> Write report to file
  --config <path> Custom config file path

Status Options:
  --json          Output stats as JSON
  --dashboard     Open web dashboard
  --port <n>      Dashboard port (default: 8888)
  --days <n>      Stats for last N days (default: 7)

Examples:
  lobstercage catch              # Full scan + guard install
  lobstercage catch --fix        # Full scan + auto-fix + guard
  lobstercage catch -i           # Interactive mode: review & redact PII
  lobstercage audit              # Config audit only
  lobstercage audit --fix        # Config audit + auto-fix
  lobstercage catch --uninstall  # Remove guard plugin
  lobstercage status             # Show scan stats
  lobstercage status --dashboard # Open web dashboard

  --help          Show this help message
`;

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "scan-only": { type: "boolean", default: false },
      "guard-only": { type: "boolean", default: false },
      "audit-only": { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
      interactive: { type: "boolean", short: "i", default: false },
      deep: { type: "boolean", default: false },
      report: { type: "string" },
      config: { type: "string" },
      uninstall: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      // Status options
      json: { type: "boolean", default: false },
      dashboard: { type: "boolean", default: false },
      port: { type: "string", default: "8888" },
      days: { type: "string", default: "7" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  const command = positionals[0];

  if (command === "audit") {
    const options: AuditCommandOptions = {
      fix: values.fix ?? false,
      deep: values.deep ?? false,
      reportPath: values.report ?? null,
      configPath: values.config ?? null,
    };

    runAuditCommand(options).catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
  } else if (command === "catch") {
    const options: CatchOptions = {
      scanOnly: values["scan-only"] ?? false,
      guardOnly: values["guard-only"] ?? false,
      auditOnly: values["audit-only"] ?? false,
      fix: values.fix ?? false,
      interactive: values.interactive ?? false,
      uninstall: values.uninstall ?? false,
      reportPath: values.report ?? null,
      configPath: values.config ?? null,
    };

    runCatch(options).catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
  } else if (command === "status") {
    const options: StatusOptions = {
      json: values.json ?? false,
      dashboard: values.dashboard ?? false,
      port: parseInt(values.port as string, 10) || 8888,
      days: parseInt(values.days as string, 10) || 7,
    };

    runStatus(options).catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE.trim());
    process.exit(1);
  }
}

main();
