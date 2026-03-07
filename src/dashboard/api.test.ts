import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest } from "./api.js";

type ApiJsonResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

async function postJson(
  port: number,
  path: string,
  payload: string
): Promise<{ status: number; body: ApiJsonResponse }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: (raw ? JSON.parse(raw) : { success: false }) as ApiJsonResponse,
            });
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

describe("dashboard API body parsing limits", () => {
  let server: Server;
  let port = 0;
  let stateDir = "";
  let previousStateDir: string | undefined;
  let previousLegacyStateDir: string | undefined;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "lobstercage-dashboard-api-test-"));
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    previousLegacyStateDir = process.env.CLAWDBOT_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = stateDir;
    delete process.env.CLAWDBOT_STATE_DIR;

    server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const handled = await handleApiRequest(req, res, url.pathname);
      if (!handled) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Not found" }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start dashboard API test server");
    }
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousStateDir;

    if (previousLegacyStateDir === undefined) delete process.env.CLAWDBOT_STATE_DIR;
    else process.env.CLAWDBOT_STATE_DIR = previousLegacyStateDir;

    if (stateDir) {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("accepts small JSON request bodies", async () => {
    const response = await postJson(
      port,
      "/api/rules/update",
      JSON.stringify({
        ruleId: "pii-email",
        updates: { enabled: false },
      })
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  it("rejects oversized request bodies with 413", async () => {
    const oversized = "x".repeat(1 * 1024 * 1024);
    const response = await postJson(
      port,
      "/api/rules/update",
      JSON.stringify({
        ruleId: "pii-email",
        updates: { pattern: oversized },
      })
    );

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Body too large");
  });
});
