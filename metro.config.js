const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const normalizedRoot = path.resolve(__dirname).replace(/\\/g, "/");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rootPattern = escapeRegex(normalizedRoot).replace(/\//g, "[\\\\/]");

const generatedOrLocalDirectories = [
  ".git",
  ".agents",
  ".vscode",
  ".wrangler",
  "credentials",
  "android",
  "dist",
  "old",
  "outputs",
  "InfiniteCanvas/.codex-remote-attachments",
];

const additionalBlockList = generatedOrLocalDirectories.map((directory) => {
  const normalizedDirectory = directory.replace(/\\/g, "/");
  return new RegExp(
    `^${rootPattern}[\\\\/]${escapeRegex(normalizedDirectory).replace(/\//g, "[\\\\/]")}(?:[\\\\/]|$)`,
  );
});

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  ...additionalBlockList,
];

const http = require("http");
const https = require("https");
const { buildUpstreamUrl, validateProxyTarget } = require("./scripts/dev-config");
const proxyTargetValue = process.env.INFINITE_CANVAS_API_PROXY_TARGET;
const previousMiddleware = config.server.enhanceMiddleware;

let proxyTarget = null;
if (proxyTargetValue) {
  try {
    proxyTarget = validateProxyTarget(proxyTargetValue);
  } catch {
    throw new Error("INFINITE_CANVAS_API_PROXY_TARGET must be a local HTTP or remote HTTPS Worker URL.");
  }
}

config.server.enhanceMiddleware = (middleware, server) => {
  const next = previousMiddleware
    ? previousMiddleware(middleware, server)
    : middleware;
  return (request, response, nextMiddleware) => {
    if (!request.url.startsWith("/api/"))
      return next(request, response, nextMiddleware);

    if (!proxyTarget) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Cloud Sync proxy is not configured for this development server.");
      return;
    }

    const upstreamUrl = buildUpstreamUrl(proxyTarget.toString(), request.url);
    const transport = proxyTarget.protocol === "https:" ? https : http;
    const proxy = transport.request(
      {
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || undefined,
        method: request.method,
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        headers: { ...request.headers, host: upstreamUrl.host },
      },
      (upstream) => {
        response.writeHead(upstream.statusCode || 502, upstream.headers);
        upstream.pipe(response);
      },
    );
    proxy.setTimeout(10000, () => proxy.destroy());
    proxy.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(proxy);
  };
};
module.exports = config;
