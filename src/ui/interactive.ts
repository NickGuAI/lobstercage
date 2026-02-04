// Interactive terminal UI for reviewing and redacting violations

import * as readline from "node:readline";
import { style } from "./matrix.js";
import type { SessionViolation } from "../scanner/types.js";

/** Create readline interface for interactive input */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/** Ask a yes/no question */
export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const rl = createPrompt();
  const hint = defaultYes ? "[Y/n]" : "[y/N]";

  return new Promise((resolve) => {
    rl.question(`${question} ${style.dim(hint)} `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === "") {
        resolve(defaultYes);
      } else {
        resolve(normalized === "y" || normalized === "yes");
      }
    });
  });
}

/** Ask for text input */
export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createPrompt();
  const hint = defaultValue ? style.dim(`[${defaultValue}]`) + " " : "";

  return new Promise((resolve) => {
    rl.question(`${question} ${hint}`, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/** Select from a list of options (case-sensitive for uppercase shortcuts) */
export async function select(
  question: string,
  options: { key: string; label: string }[]
): Promise<string> {
  const rl = createPrompt();

  console.log();
  console.log(style.bright(question));
  for (const opt of options) {
    console.log(`  ${style.green(opt.key)}) ${opt.label}`);
  }
  console.log();

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(style.dim("Choice: "), (answer) => {
        const input = answer.trim();
        // Case-sensitive match (R ≠ r)
        const match = options.find((o) => o.key === input);
        if (match) {
          rl.close();
          resolve(match.key);
        } else {
          console.log(style.error("Invalid choice, try again"));
          ask();
        }
      });
    };
    ask();
  });
}

export type ReviewAction = "redact" | "skip" | "redact-all" | "skip-all" | "quit";

/** Interactive violation review session */
export async function reviewViolations(
  violations: SessionViolation[]
): Promise<Map<SessionViolation, ReviewAction>> {
  const decisions = new Map<SessionViolation, ReviewAction>();
  let redactAll = false;
  let skipAll = false;

  console.log();
  console.log(style.bold("  INTERACTIVE REVIEW"));
  console.log(style.dim("  Review each violation and choose an action"));
  console.log();

  // Group by file for better UX
  const byFile = new Map<string, SessionViolation[]>();
  for (const v of violations) {
    const list = byFile.get(v.sessionFile) || [];
    list.push(v);
    byFile.set(v.sessionFile, list);
  }

  let totalReviewed = 0;
  const totalCount = violations.length;

  for (const [filePath, fileViolations] of byFile) {
    // Show file header
    const shortPath = filePath.replace(process.env.HOME || "", "~");
    console.log(style.muted("─".repeat(50)));
    console.log(style.bright(`  📄 ${shortPath}`));
    console.log(style.dim(`     ${fileViolations.length} violation(s)`));
    console.log();

    for (const v of fileViolations) {
      totalReviewed++;

      // Check for bulk actions
      if (redactAll) {
        decisions.set(v, "redact");
        continue;
      }
      if (skipAll) {
        decisions.set(v, "skip");
        continue;
      }

      // Show violation details
      console.log(
        style.dim(`  [${totalReviewed}/${totalCount}] `) +
          style.warn(`${v.ruleId}`) +
          style.dim(` in msg #${v.messageIndex}`)
      );
      console.log(`     Match: ${style.error(v.matchPreview)}`);
      console.log();

      // Ask for action
      const action = await select("What would you like to do?", [
        { key: "r", label: "Redact this violation" },
        { key: "s", label: "Skip (keep as-is)" },
        { key: "R", label: "Redact ALL remaining violations" },
        { key: "S", label: "Skip ALL remaining violations" },
        { key: "q", label: "Quit review" },
      ]);

      switch (action) {
        case "r":
          decisions.set(v, "redact");
          console.log(style.green("  → Will redact"));
          break;
        case "s":
          decisions.set(v, "skip");
          console.log(style.dim("  → Skipped"));
          break;
        case "R":
          redactAll = true;
          decisions.set(v, "redact");
          console.log(style.green("  → Will redact all remaining"));
          break;
        case "S":
          skipAll = true;
          decisions.set(v, "skip");
          console.log(style.dim("  → Skipping all remaining"));
          break;
        case "q":
          decisions.set(v, "quit");
          console.log(style.warn("  → Quit"));
          return decisions;
      }
      console.log();
    }
  }

  console.log(style.muted("─".repeat(50)));
  const redactCount = [...decisions.values()].filter((a) => a === "redact").length;
  const skipCount = [...decisions.values()].filter((a) => a === "skip").length;
  console.log(
    style.bright("  Review complete: ") +
      style.green(`${redactCount} to redact`) +
      style.dim(", ") +
      style.dim(`${skipCount} skipped`)
  );
  console.log();

  return decisions;
}

/** Show a summary of pending redactions and confirm */
export async function confirmRedactions(
  decisions: Map<SessionViolation, ReviewAction>
): Promise<boolean> {
  const toRedact = [...decisions.entries()].filter(([, action]) => action === "redact");

  if (toRedact.length === 0) {
    console.log(style.dim("  No violations marked for redaction"));
    return false;
  }

  console.log(style.warn(`  ⚠ About to redact ${toRedact.length} violation(s)`));
  console.log(style.dim("  This will modify your session files."));
  console.log();

  return confirm("  Proceed with redaction?", false);
}
