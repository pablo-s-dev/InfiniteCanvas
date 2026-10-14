const LOCAL_WORKER_PORT = 47329;
const EXPO_PORT = 8081;
const LOCAL_WORKER_URL = `http://127.0.0.1:${LOCAL_WORKER_PORT}`;
const REQUIRED_CLOUD_VARIABLES = [
  "EXPO_PUBLIC_CLOUD_SYNC_API_URL",
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
  "EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER",
];
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackHost(hostname) {
  return loopbackHosts.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith(".localhost");
}

function validateProxyTarget(value, { cloud = false } = {}) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error("The configured Cloud Sync Worker URL is invalid.");
  }

  const isLocalHttp = target.protocol === "http:" && isLoopbackHost(target.hostname);
  const isRemoteHttps = target.protocol === "https:" && !isLoopbackHost(target.hostname);
  if (
    (!isLocalHttp && !isRemoteHttps) ||
    target.username ||
    target.password ||
    !["", "/", "/api"].includes(target.pathname.replace(/\/$/, "")) ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      cloud
        ? "The cloud Worker URL must be a remote HTTPS URL without credentials, query, or fragment."
        : "The proxy target must be a local HTTP URL or a remote HTTPS URL without credentials, query, or fragment.",
    );
  }

  return target;
}

function validateCloudEnvironment(environment) {
  const unexpectedVariables = Object.keys(environment).filter(
    (name) => !REQUIRED_CLOUD_VARIABLES.includes(name),
  );
  if (unexpectedVariables.length) {
    throw new Error(
      `.env.cloud accepts only the public app variables: ${REQUIRED_CLOUD_VARIABLES.join(", ")}.`,
    );
  }

  for (const name of REQUIRED_CLOUD_VARIABLES) {
    if (typeof environment[name] !== "string" || !environment[name].trim()) {
      throw new Error(`Set ${name} in .env.cloud before running dev:cloud.`);
    }
  }

  validateProxyTarget(environment.EXPO_PUBLIC_CLOUD_SYNC_API_URL, { cloud: true });
  return environment;
}

function parseInvocation(mode, args) {
  if (!["local", "cloud", "worker"].includes(mode)) {
    throw new Error("Choose a development mode: local, cloud, or worker.");
  }

  if (mode === "worker") {
    if (args.length) throw new Error("worker:local does not accept platform or build arguments.");
    return { mode, platform: null, build: false };
  }

  const platforms = args.filter((value) => ["web", "android", "ios"].includes(value));
  const builds = args.filter((value) => value === "build");
  if (args.some((value) => value.startsWith("-") || (!platforms.includes(value) && value !== "build"))) {
    throw new Error("Use an optional platform (web, android, ios) and build for native builds.");
  }
  if (platforms.length > 1 || builds.length > 1 || args.length !== platforms.length + builds.length) {
    throw new Error("Choose one platform and at most one build argument.");
  }

  const platform = platforms[0] ?? null;
  const build = builds.length === 1;
  if (build && !["android", "ios"].includes(platform)) {
    throw new Error("build is available only with the android or ios platform.");
  }

  return { mode, platform, build };
}

function buildUpstreamUrl(targetValue, requestUrl) {
  const target = validateProxyTarget(targetValue);
  const incoming = new URL(requestUrl, "http://metro.local");
  if (!incoming.pathname.startsWith("/api/")) {
    throw new Error("Only /api requests can be sent through the Cloud Sync proxy.");
  }
  const apiPath = incoming.pathname.slice("/api".length);
  const basePath = target.pathname.replace(/\/$/, "");
  return new URL(`${basePath}${apiPath}${incoming.search}`, target);
}

module.exports = {
  EXPO_PORT,
  LOCAL_WORKER_PORT,
  LOCAL_WORKER_URL,
  REQUIRED_CLOUD_VARIABLES,
  buildUpstreamUrl,
  isLoopbackHost,
  parseInvocation,
  validateCloudEnvironment,
  validateProxyTarget,
};
