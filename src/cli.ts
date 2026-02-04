#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runCatch, type CatchOptions } from "./commands/catch.js";
import { runAuditCommand, type AuditCommandOptions } from "./commands/audit.js";

const USAGE = `
lobstercage — OpenClaw Security Scanner

Usage:
  lobstercage catch [options]    Full security scan (audit + forensic + guard)
  lobstercage audit [options]    Config-only security audit

Commands:
  catch           Run full security scan and install live guard
  audit           Run config security audit only

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

Examples:
  lobstercage catch              # Full scan + guard install
  lobstercage catch --fix        # Full scan + auto-fix + guard
  lobstercage catch -i           # Interactive mode: review & redact PII
  lobstercage audit              # Config audit only
  lobstercage audit --fix        # Config audit + auto-fix
  lobstercage catch --uninstall  # Remove guard plugin

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
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE.trim());
    process.exit(1);
  }
}

main();
