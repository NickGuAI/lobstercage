#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runCatch, type CatchOptions } from "./commands/catch.js";

const USAGE = `
lobstercage — OpenClaw Security Scanner

Usage:
  lobstercage catch [options]

Commands:
  catch           Run forensic scan and/or install live guard

Options:
  --scan-only     Only run forensic scan (no live guard install)
  --guard-only    Only install live guard (no forensic scan)
  --report <path> Write report to file (default: stdout)
  --config <path> Custom rules config file
  --uninstall     Remove the lobstercage guard plugin
  --help          Show this help message
`;

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "scan-only": { type: "boolean", default: false },
      "guard-only": { type: "boolean", default: false },
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

  if (command !== "catch") {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE.trim());
    process.exit(1);
  }

  const options: CatchOptions = {
    scanOnly: values["scan-only"] ?? false,
    guardOnly: values["guard-only"] ?? false,
    uninstall: values["uninstall"] ?? false,
    reportPath: values.report ?? null,
    configPath: values.config ?? null,
  };

  runCatch(options).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

main();
