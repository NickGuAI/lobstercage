// HTTP server for the dashboard (Node.js built-in, zero deps)

import { createServer, type Server } from "node:http";
import { exec } from "node:child_process";
import { generateDashboardHtml } from "./html.js";
import { handleApiRequest } from "./api.js";

/** Start the dashboard server */
export function startDashboardServer(port: number = 8888): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      try {
        // API routes
        if (pathname.startsWith("/api/")) {
          const handled = await handleApiRequest(req, res, pathname);
          if (!handled) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
          }
          return;
        }

        // Serve dashboard HTML at root
        if (pathname === "/" || pathname === "/index.html") {
          const html = generateDashboardHtml();
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(html);
          return;
        }

        // 404 for other paths
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } catch (err) {
        console.error("Server error:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
}

/** Open URL in default browser */
export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "win32") {
    command = `start "" "${url}"`;
  } else {
    // Linux and others
    command = `xdg-open "${url}" || sensible-browser "${url}" || x-www-browser "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      // Silently fail if browser can't be opened
      console.error("Could not open browser automatically");
    }
  });
}
