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
const previousMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = previousMiddleware ? previousMiddleware(middleware, server) : middleware;
  return (request, response, nextMiddleware) => {
    if (!request.url.startsWith("/api/")) return next(request, response, nextMiddleware);
    const proxy = http.request({ hostname: "127.0.0.1", port: 8788,
      method: request.method, path: request.url.slice(4),
      headers: { ...request.headers, host: "127.0.0.1:8788" } }, upstream => {
      response.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(response);
    });
    proxy.setTimeout(45000, () => proxy.destroy());
    proxy.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(proxy);
  };
};
module.exports = config;
