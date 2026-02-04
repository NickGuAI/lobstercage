// API route handlers for the dashboard

import type { IncomingMessage, ServerResponse } from "node:http";
import { loadStats, getStatsForDays, getTopRules } from "../stats/storage.js";
import {
  loadRuleConfig,
  updateRule,
  addCustomRule,
  removeCustomRule,
} from "../stats/rules-config.js";
import type { StoredRule } from "../stats/types.js";

type ApiResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

/** Parse JSON body from request */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
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

  return false;
}
