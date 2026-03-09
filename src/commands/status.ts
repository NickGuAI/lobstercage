// CLI status command

import { style } from "../ui/matrix.js";
import {
  loadStats,
  getStatsForDays,
  getTopRules,
  getStatsPath,
} from "../stats/storage.js";
import { startDashboardServer, openBrowser } from "../dashboard/server.js";
import { isInstalled as isGuardInstalled } from "../guard/install.js";
import { getPiiRules, getContentRules, getMalwareRules } from "../scanner/engine.js";
import { forensicScanByAgent, type AgentScanResult } from "../forensic/scan.js";

export type StatusOptions = {
  json: boolean;
  dashboard: boolean;
  port: number;
  days: number;
  byAgent: boolean;
};

/** Generate ASCII sparkline chart */
function sparkline(values: number[], width: number = 20): string {
  if (values.length === 0) return "▁".repeat(width);

  const max = Math.max(...values, 1);
  const chars = "▁▂▃▄▅▆▇█";

  // Pad or sample to fit width
  const sampled: number[] = [];
  if (values.length <= width) {
    // Pad with zeros at start
    for (let i = 0; i < width - values.length; i++) {
      sampled.push(0);
    }
    sampled.push(...values);
  } else {
    // Sample down
    const step = values.length / width;
    for (let i = 0; i < width; i++) {
      const idx = Math.floor(i * step);
      sampled.push(values[idx]);
    }
  }

  return sampled
    .map((v) => {
      const normalized = v / max;
      const idx = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
      return chars[idx];
    })
    .join("");
}

/** Format number with K/M suffix */
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Find the top rule by count from a violations-by-rule map */
function topRule(violationsByRule: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [ruleId, count] of Object.entries(violationsByRule)) {
    if (count > bestCount) {
      best = ruleId;
      bestCount = count;
    }
  }
  return best;
}

/** Render a per-agent breakdown table */
function renderAgentTable(agents: AgentScanResult[]): void {
  if (agents.length === 0) {
    console.log(style.dim("  No agents found"));
    console.log();
    return;
  }

  // Calculate column widths
  const agentCol = Math.max(6, ...agents.map((a) => a.agentId.length)) + 2;
  const scansCol = Math.max(6, ...agents.map((a) => String(a.sessionsScanned).length)) + 2;
  const violCol = Math.max(12, ...agents.map((a) => {
    const top = topRule(a.violationsByRule);
    const label = a.violationCount > 0 && top
      ? `${a.violationCount} (${top})`
      : String(a.violationCount);
    return label.length;
  })) + 2;

  const hAgent = " Agent".padEnd(agentCol);
  const hScans = " Scans".padEnd(scansCol);
  const hViol = " Violations".padEnd(violCol);

  // Box-drawing table
  console.log(`  ╔${"═".repeat(agentCol)}╦${"═".repeat(scansCol)}╦${"═".repeat(violCol)}╗`);
  console.log(`  ║${style.bold(hAgent)}║${style.bold(hScans)}║${style.bold(hViol)}║`);
  console.log(`  ╠${"═".repeat(agentCol)}╬${"═".repeat(scansCol)}╬${"═".repeat(violCol)}╣`);

  for (const agent of agents) {
    const top = topRule(agent.violationsByRule);
    const violLabel = agent.violationCount > 0 && top
      ? `${agent.violationCount} (${top})`
      : String(agent.violationCount);

    const cAgent = ` ${agent.agentId}`.padEnd(agentCol);
    const cScans = ` ${String(agent.sessionsScanned).padStart(scansCol - 2)} `;
    const cViol = agent.violationCount > 0
      ? ` ${style.warn(violLabel)}${" ".repeat(Math.max(0, violCol - violLabel.length - 1))}`
      : ` ${violLabel}${" ".repeat(Math.max(0, violCol - violLabel.length - 1))}`;

    console.log(`  ║${cAgent}║${cScans}║${cViol}║`);
  }

  console.log(`  ╚${"═".repeat(agentCol)}╩${"═".repeat(scansCol)}╩${"═".repeat(violCol)}╝`);
  console.log();
}

/** Run status command */
export async function runStatus(options: StatusOptions): Promise<void> {
  // Dashboard mode - start server
  if (options.dashboard) {
    console.log();
    console.log(style.bold("  LOBSTERCAGE Dashboard"));
    console.log(style.dim("  Starting server..."));
    console.log();

    try {
      const server = await startDashboardServer(options.port);
      const url = `http://localhost:${options.port}`;

      console.log(style.green(`  Dashboard running at ${style.bright(url)}`));
      console.log(style.dim("  Press Ctrl+C to stop"));
      console.log();

      // Open browser
      openBrowser(url);

      // Keep server running
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => {
          console.log();
          console.log(style.dim("  Shutting down..."));
          server.close();
          resolve();
        });
      });
    } catch (err) {
      console.error(style.error(`  Failed to start server: ${err}`));
      process.exit(1);
    }
    return;
  }

  // Load stats
  const stats = await loadStats();
  const summaries = getStatsForDays(stats, options.days);
  const topRules = getTopRules(stats, options.days, 5);
  const guardInstalled = await isGuardInstalled();

  // Calculate totals
  const totalScans = summaries.reduce((sum, s) => sum + s.totalScans, 0);
  const totalViolations = summaries.reduce((sum, s) => sum + s.totalViolations, 0);
  const dailyViolations = summaries.map((s) => s.totalViolations);

  // Per-agent scan (needed for both --json and terminal --by-agent output)
  let agentResults: AgentScanResult[] | null = null;
  if (options.byAgent) {
    const rules = [...getPiiRules(), ...getContentRules(), ...getMalwareRules()];
    agentResults = await forensicScanByAgent(rules, options.days);
  }

  // JSON output mode
  if (options.json) {
    const output: Record<string, unknown> = {
      guardInstalled,
      statsPath: getStatsPath(),
      period: {
        days: options.days,
        totalScans,
        totalViolations,
      },
      summaries,
      topRules,
      recentEvents: stats.events.slice(-10),
    };
    if (agentResults) {
      output.agents = agentResults;
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Terminal output
  console.log();
  console.log(style.bold("  LOBSTERCAGE Status"));
  console.log();

  // Guard status
  const guardStatus = guardInstalled
    ? style.green("● Installed")
    : style.dim("○ Not installed");
  console.log(`  Guard: ${guardStatus}`);
  console.log();

  // Stats header
  console.log(style.dim(`  Last ${options.days} days:`));
  console.log();

  // Scans and violations
  console.log(`  Scans:      ${style.bright(formatNumber(totalScans))}`);

  if (totalViolations > 0) {
    console.log(`  Violations: ${style.warn(formatNumber(totalViolations))}`);
  } else {
    console.log(`  Violations: ${style.green("0")}`);
  }
  console.log();

  // Sparkline chart
  if (dailyViolations.length > 0) {
    const chart = sparkline(dailyViolations, 30);
    console.log(`  ${style.dim("Trend:")} ${style.green(chart)}`);
    console.log();
  }

  // Top rules
  if (topRules.length > 0) {
    console.log(style.dim("  Top triggered rules:"));
    for (const rule of topRules) {
      const bar = "█".repeat(Math.min(Math.ceil(rule.count / 2), 20));
      console.log(
        `    ${style.dim(rule.ruleId.padEnd(20))} ${style.green(bar)} ${rule.count}`
      );
    }
    console.log();
  }

  // Per-agent breakdown
  if (agentResults) {
    console.log(style.dim(`  Per-agent breakdown (last ${options.days} days):`));
    console.log();
    renderAgentTable(agentResults);
  }

  // Hints
  if (!guardInstalled) {
    console.log(style.dim("  Run 'lobstercage catch' to install the guard"));
  }
  console.log(style.dim("  Run with --dashboard to open web UI"));
  console.log();
}
