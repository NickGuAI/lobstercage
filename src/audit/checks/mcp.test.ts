import { describe, expect, it } from "vitest";
import { checkMcp } from "./mcp.js";
import type { OpenClawConfig } from "../types.js";

describe("checkMcp", () => {
  it("returns no findings when mcp section is absent", () => {
    const config: OpenClawConfig = {};
    expect(checkMcp(config)).toEqual([]);
  });

  it("returns no findings when mcp.servers is empty", () => {
    const config: OpenClawConfig = { mcp: { servers: {} } };
    expect(checkMcp(config)).toEqual([]);
  });

  // --- CORS wildcard ---

  it("flags wildcard Access-Control-Allow-Origin as critical", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          risky: { accessControlAllowOrigin: "*" },
        },
      },
    };
    const findings = checkMcp(config);
    const f = findings.find((f) => f.id === "mcp-cors-wildcard-risky");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.currentValue).toBe("*");
  });

  it("does not flag specific CORS origins", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          safe: { accessControlAllowOrigin: "https://app.example.com" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id.startsWith("mcp-cors-wildcard"))).toBeUndefined();
  });

  // --- Unsigned process ---

  it("flags stdio servers running interpreted scripts", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          local: { transport: "stdio", command: "node", args: ["server.js"] },
        },
      },
    };
    const findings = checkMcp(config);
    const f = findings.find((f) => f.id === "mcp-unsigned-process-local");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.description).toContain("node");
  });

  it("flags stdio servers with script file extensions", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          pyscript: { transport: "stdio", command: "/opt/tools/serve.py" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id === "mcp-unsigned-process-pyscript")).toBeDefined();
  });

  it("does not flag binary commands", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          binary: { transport: "stdio", command: "/usr/local/bin/mcp-server" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id.startsWith("mcp-unsigned-process"))).toBeUndefined();
  });

  // --- HTTP transport ---

  it("flags remote HTTP URLs as critical", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          remote: { url: "http://mcp.example.com/sse" },
        },
      },
    };
    const findings = checkMcp(config);
    const f = findings.find((f) => f.id === "mcp-http-transport-remote");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.fixable).toBe(true);
  });

  it("does not flag HTTP localhost URLs", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          local: { url: "http://localhost:3000/sse" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id.startsWith("mcp-http-transport"))).toBeUndefined();
  });

  it("does not flag HTTP 127.0.0.1 URLs", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          local: { url: "http://127.0.0.1:8080/sse" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id.startsWith("mcp-http-transport"))).toBeUndefined();
  });

  it("does not flag HTTPS URLs", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          secure: { url: "https://mcp.example.com/sse" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id.startsWith("mcp-http-transport"))).toBeUndefined();
  });

  // --- Large payload ---

  it("flags servers with maxResponseBytes exceeding threshold", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          big: { maxResponseBytes: 2 * 1024 * 1024 },
        },
      },
    };
    const findings = checkMcp(config);
    const f = findings.find((f) => f.id === "mcp-large-payload-big");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("does not flag servers within payload threshold", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          small: { maxResponseBytes: 256 * 1024 },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.find((f) => f.id.startsWith("mcp-large-payload"))).toBeUndefined();
  });

  // --- Combined ---

  it("reports multiple findings for a server with multiple issues", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          risky: {
            accessControlAllowOrigin: "*",
            url: "http://evil.example.com/sse",
            maxResponseBytes: 10 * 1024 * 1024,
          },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.length).toBe(3);
    expect(findings.map((f) => f.id).sort()).toEqual([
      "mcp-cors-wildcard-risky",
      "mcp-http-transport-risky",
      "mcp-large-payload-risky",
    ]);
  });

  it("audits all servers independently", () => {
    const config: OpenClawConfig = {
      mcp: {
        servers: {
          good: { url: "https://safe.example.com/sse" },
          bad: { url: "http://unsafe.example.com/sse" },
        },
      },
    };
    const findings = checkMcp(config);
    expect(findings.length).toBe(1);
    expect(findings[0].id).toBe("mcp-http-transport-bad");
  });
});
