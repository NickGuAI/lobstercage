#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runCatch, type CatchOptions } from "./commands/catch.js";
import { runAuditCommand, type AuditCommandOptions } from "./commands/audit.js";
import { runStatus, type StatusOptions } from "./commands/status.js";
import { runInstallSafe, type InstallSafeOptions } from "./commands/install-safe.js";
import { runScanSkills, type ScanSkillsOptions } from "./commands/scan-skills.js";

const USAGE = `
lobstercage — OpenClaw Security Scanner

Usage:
  lobstercage catch [options]                 Full security scan pipeline
  lobstercage audit [options]                 Config-only security audit
  lobstercage status [options]                Show stats and open dashboard
  lobstercage install-safe <source> [options] Safe skill install pipeline
  lobstercage scan-skills [options]           Scan installed skills and quarantine if needed

Commands:
  catch           Run full security scan and install live guard
  audit           Run config security audit only
  status          Show scan statistics and guard status
  install-safe    Acquire, scan, install disabled, scan again, optional enable
  scan-skills     Scan extensions for malware/content risk and optionally quarantine

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

Install-safe Options:
  --enable        Enable skill only after clean pre/post scans

Scan-skills Options:
  --quarantine    Move flagged skills to quarantine
  --restore <id>  Restore a quarantined skill by id or name
  --json          Output scan result as JSON

Examples:
  lobstercage catch              # Full scan + guard install
  lobstercage catch --fix        # Full scan + auto-fix + guard
  lobstercage catch -i           # Interactive mode: review & redact PII
  lobstercage audit              # Config audit only
  lobstercage audit --fix        # Config audit + auto-fix
  lobstercage catch --uninstall  # Remove guard plugin
  lobstercage install-safe ~/Downloads/example-skill --enable
  lobstercage scan-skills --quarantine
  lobstercage scan-skills --restore <quarantine-id>
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
      enable: { type: "boolean", default: false },
      quarantine: { type: "boolean", default: false },
      restore: { type: "string" },
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
  } else if (command === "install-safe") {
    const source = positionals[1];
    if (!source) {
      console.error("install-safe requires a source path or extension specifier");
      process.exit(1);
    }

    const options: InstallSafeOptions = {
      source,
      enable: values.enable ?? false,
    };

    runInstallSafe(options).catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
  } else if (command === "scan-skills") {
    const options: ScanSkillsOptions = {
      quarantine: values.quarantine ?? false,
      restore: values.restore ?? null,
      json: values.json ?? false,
    };

    runScanSkills(options).catch((err) => {
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
