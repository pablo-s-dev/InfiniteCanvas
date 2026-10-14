const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parseEnv } = require("node:util");

const PUBLIC_KEYS = [
  "EXPO_PUBLIC_CLOUD_SYNC_API_URL",
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
  "EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER",
];

function validateReleaseEnvironment(environment) {
  const unknownKeys = Object.keys(environment).filter(key => !PUBLIC_KEYS.includes(key));
  if (unknownKeys.length) throw new Error("Release configuration may contain only the three public app settings.");
  for (const key of PUBLIC_KEYS) {
    if (!environment[key]?.trim()) throw new Error(`Release configuration requires ${key}.`);
  }
  let url;
  try { url = new URL(environment.EXPO_PUBLIC_CLOUD_SYNC_API_URL); }
  catch { throw new Error("The release sync URL is invalid."); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" ||
      hostname === "0.0.0.0" || /^127\./.test(hostname) || /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    throw new Error("A release requires a remote HTTPS sync URL without credentials or query parameters.");
  }
  if (!/^\d{6,}$/.test(environment.EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER)) {
    throw new Error("The release Play Integrity project number is invalid.");
  }
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(environment.EXPO_PUBLIC_GOOGLE_CLIENT_ID)) {
    throw new Error("The release Google OAuth client ID is invalid.");
  }
  return Object.fromEntries(PUBLIC_KEYS.map(key => [key, environment[key].trim()]));
}

function readReleaseEnvironment(file = resolve(__dirname, "../config/staging.env")) {
  return validateReleaseEnvironment(parseEnv(readFileSync(file, "utf8")));
}

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(readReleaseEnvironment(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { readReleaseEnvironment, validateReleaseEnvironment };
