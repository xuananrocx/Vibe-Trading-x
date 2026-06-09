import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import http from "http";

const PROXY_PATHS = [
  "/settings/llm",
  "/settings/data-sources",
  "/mandate",
  "/live",
  "/upload",
  "/shadow-reports",
  "/llm-logs",
];

// Vite's built-in proxy buffers SSE responses, breaking real-time streaming.
// This middleware forces SSE requests to bypass the proxy and connect directly
// to the backend with no buffering or compression.
function sseProxyPlugin(): Plugin {
  return {
    name: "sse-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        const isSSE = url.match(/^\/sessions\/[^/]+\/events/) || url.match(/^\/swarm\/runs\/[^/]+\/events/);
        if (!isSSE) return next();

        const target = new URL("http://localhost:8899");
        const backendUrl = new URL(url, target);

        const proxyReq = http.request(
          backendUrl,
          {
            method: req.method,
            headers: {
              ...req.headers,
              host: target.host,
              accept: "text/event-stream",
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            });
            res.flushHeaders();

            // Disable Nagle's algorithm so each SSE event is sent immediately
            const socket = res.socket;
            if (socket) {
              socket.setNoDelay(true);
              socket.setTimeout(0);
            }

            // Write each chunk immediately instead of pipe() which buffers
            proxyRes.on("data", (chunk: Buffer) => {
              res.write(chunk);
            });
            proxyRes.on("end", () => {
              res.end();
            });
            proxyRes.on("error", () => {
              res.end();
            });
          },
        );
        proxyReq.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end("SSE proxy error");
        });
        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:8899";
  const apiProxy = { target: apiTarget, changeOrigin: true };
  const apiProxyWithHtmlFallback = {
    ...apiProxy,
    bypass(req: { headers: { accept?: string } }) {
      if (req.headers.accept?.includes("text/html")) {
        return "/index.html";
      }
    },
  };

  return {
    plugins: [react(), sseProxyPlugin()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 5899,
      proxy: {
        ...Object.fromEntries(PROXY_PATHS.map((p) => [p, apiProxy])),
        "/sessions": apiProxy,
        "/swarm/presets": apiProxy,
        "/swarm/runs": apiProxy,
        "^/runs/[^/]+/?$": apiProxyWithHtmlFallback,
        "/runs": apiProxy,
        "/correlation": apiProxyWithHtmlFallback,
        "^/alpha(?:/|$)": apiProxy,
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-charts": ["echarts"],
          },
        },
      },
    },
  };
});
