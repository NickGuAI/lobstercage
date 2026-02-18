// API route handlers for the dashboard

import type { IncomingMessage, ServerResponse } from "node:http";
import { loadStats, getStatsForDays, getTopRules, recordScanEvent } from "../stats/storage.js";
import {
  loadRuleConfig,
  updateRule,
  addCustomRule,
  removeCustomRule,
} from "../stats/rules-config.js";
import { getPiiRules, getContentRules, getMalwareRules } from "../scanner/engine.js";
import { forensicScan } from "../forensic/scan.js";
import { runAudit, applyFixes, getFixableFindings } from "../audit/index.js";
import type { StoredRule, ViolationEvent } from "../stats/types.js";

// Track running operations
let scanInProgress = false;
let fixInProgress = false;
let lastScanResult: { violations: number; sessionsScanned: number; messagesScanned: number } | null = null;
let lastFixResult: { fixed: number; failed: number } | null = null;

type ApiResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

const MAX_BODY_SIZE = 1_048_576; // 1 MB

/** Parse JSON body from request */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Send JSON response */
function sendJson(res: ServerResponse, data: ApiResponse, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

/** Handle GET /api/stats */
async function handleGetStats(
  _req: IncomingMessage,
  res: ServerResponse,
  query: URLSearchParams
): Promise<void> {
  try {
    const days = parseInt(query.get("days") || "7", 10);
    const stats = await loadStats();
    const summaries = getStatsForDays(stats, days);
    const topRules = getTopRules(stats, days, 5);

    // Calculate totals
    const totalScans = summaries.reduce((sum, s) => sum + s.totalScans, 0);
    const totalViolations = summaries.reduce(
      (sum, s) => sum + s.totalViolations,
      0
    );

    sendJson(res, {
      success: true,
      data: {
        days,
        totalScans,
        totalViolations,
        summaries,
        topRules,
        recentEvents: stats.events.slice(-20),
      },
    });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  }
}

/** Handle GET /api/rules */
async function handleGetRules(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const config = await loadRuleConfig();
    sendJson(res, {
      success: true,
      data: {
        rules: config.rules,
        customRules: config.customRules,
      },
    });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  }
}

/** Handle POST /api/rules/update */
async function handleUpdateRule(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = (await parseBody(req)) as {
      ruleId: string;
      updates: Partial<StoredRule>;
    };

    if (!body.ruleId) {
      sendJson(res, { success: false, error: "Missing ruleId" }, 400);
      return;
    }

    await updateRule(body.ruleId, body.updates);
    sendJson(res, { success: true });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  }
}

/** Handle POST /api/rules/add */
async function handleAddRule(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = (await parseBody(req)) as { rule: StoredRule };

    if (!body.rule?.id || !body.rule?.category) {
      sendJson(res, { success: false, error: "Missing required fields" }, 400);
      return;
    }

    await addCustomRule(body.rule);
    sendJson(res, { success: true });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  }
}

/** Handle POST /api/rules/remove */
async function handleRemoveRule(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = (await parseBody(req)) as { ruleId: string };

    if (!body.ruleId) {
      sendJson(res, { success: false, error: "Missing ruleId" }, 400);
      return;
    }

    await removeCustomRule(body.ruleId);
    sendJson(res, { success: true });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  }
}

/** Handle POST /api/scan - trigger forensic scan */
async function handleScan(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (scanInProgress) {
    sendJson(res, { success: false, error: "Scan already in progress" }, 409);
    return;
  }

  try {
    scanInProgress = true;
    lastScanResult = null;

    // Run forensic scan
    const rules = [...getPiiRules(), ...getContentRules(), ...getMalwareRules()];
    const report = await forensicScan(rules);

    // Record stats
    const violationEvents: ViolationEvent[] = [];
    const violationCounts: Record<string, ViolationEvent> = {};
    for (const v of report.violations) {
      if (!violationCounts[v.ruleId]) {
        violationCounts[v.ruleId] = {
          ruleId: v.ruleId,
          category: v.category,
          action: v.action,
          count: 0,
        };
      }
      violationCounts[v.ruleId].count++;
    }
    for (const data of Object.values(violationCounts)) {
      violationEvents.push(data);
    }
    await recordScanEvent("forensic", violationEvents);

    lastScanResult = {
      violations: report.violations.length,
      sessionsScanned: report.sessionsScanned,
      messagesScanned: report.messagesScanned,
    };

    sendJson(res, {
      success: true,
      data: {
        violations: report.violations.length,
        sessionsScanned: report.sessionsScanned,
        messagesScanned: report.messagesScanned,
        summary: report.summary,
      },
    });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  } finally {
    scanInProgress = false;
  }
}

/** Handle POST /api/audit - trigger security audit */
async function handleAudit(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const auditResult = await runAudit({ fix: false, deep: false });

    // Record stats
    const auditViolations: ViolationEvent[] = [];
    for (const finding of auditResult.findings) {
      auditViolations.push({
        ruleId: `audit-${finding.id}`,
        category: "content",
        action: finding.severity === "critical" ? "block" : "warn",
        count: 1,
      });
    }
    if (auditViolations.length > 0) {
      await recordScanEvent("audit", auditViolations);
    }

    sendJson(res, {
      success: true,
      data: {
        findings: auditResult.findings,
        summary: auditResult.summary,
        fixableCount: getFixableFindings(auditResult).length,
      },
    });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  }
}

/** Handle POST /api/fix - apply auto-fixes */
async function handleFix(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (fixInProgress) {
    sendJson(res, { success: false, error: "Fix already in progress" }, 409);
    return;
  }

  try {
    fixInProgress = true;
    lastFixResult = null;

    // Run audit to get findings
    const auditResult = await runAudit({ fix: false, deep: false });
    const fixable = getFixableFindings(auditResult);

    if (fixable.length === 0) {
      sendJson(res, {
        success: true,
        data: { fixed: 0, failed: 0, message: "No fixable issues found" },
      });
      return;
    }

    // Apply fixes
    const fixResults = await applyFixes(auditResult.findings);
    const fixed = fixResults.filter((r) => r.success).length;
    const failed = fixResults.filter((r) => !r.success).length;

    lastFixResult = { fixed, failed };

    sendJson(res, {
      success: true,
      data: {
        fixed,
        failed,
        results: fixResults,
      },
    });
  } catch (err) {
    sendJson(res, { success: false, error: String(err) }, 500);
  } finally {
    fixInProgress = false;
  }
}

/** Handle GET /api/status - get operation status */
async function handleStatus(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  sendJson(res, {
    success: true,
    data: {
      scanInProgress,
      fixInProgress,
      lastScanResult,
      lastFixResult,
    },
  });
}

/** Route API requests */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const query = url.searchParams;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  if (pathname === "/api/stats" && req.method === "GET") {
    await handleGetStats(req, res, query);
    return true;
  }

  if (pathname === "/api/rules" && req.method === "GET") {
    await handleGetRules(req, res);
    return true;
  }

  if (pathname === "/api/rules/update" && req.method === "POST") {
    await handleUpdateRule(req, res);
    return true;
  }

  if (pathname === "/api/rules/add" && req.method === "POST") {
    await handleAddRule(req, res);
    return true;
  }

  if (pathname === "/api/rules/remove" && req.method === "POST") {
    await handleRemoveRule(req, res);
    return true;
  }

  if (pathname === "/api/scan" && req.method === "POST") {
    await handleScan(req, res);
    return true;
  }

  if (pathname === "/api/audit" && req.method === "POST") {
    await handleAudit(req, res);
    return true;
  }

  if (pathname === "/api/fix" && req.method === "POST") {
    await handleFix(req, res);
    return true;
  }

  if (pathname === "/api/status" && req.method === "GET") {
    await handleStatus(req, res);
    return true;
  }

  return false;
}
