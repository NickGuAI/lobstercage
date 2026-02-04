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

export type StatusOptions = {
  json: boolean;
  dashboard: boolean;
  port: number;
  days: number;
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

  // JSON output mode
  if (options.json) {
    const output = {
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

  // Hints
  if (!guardInstalled) {
    console.log(style.dim("  Run 'lobstercage catch' to install the guard"));
  }
  console.log(style.dim("  Run with --dashboard to open web UI"));
  console.log();
}
