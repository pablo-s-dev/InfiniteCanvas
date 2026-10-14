import { describe, expect, it } from "vitest";
import devConfig from "./dev-config.js";

const {
  EXPO_PORT,
  LOCAL_WORKER_PORT,
  LOCAL_WORKER_URL,
  REQUIRED_CLOUD_VARIABLES,
  buildUpstreamUrl,
  parseInvocation,
  validateCloudEnvironment,
  validateProxyTarget,
} = devConfig;

describe("development command configuration", () => {
  it("keeps the local Worker on its dedicated port", () => {
    expect(LOCAL_WORKER_PORT).toBe(47329);
    expect(LOCAL_WORKER_URL).toBe("http://127.0.0.1:47329");
    expect(EXPO_PORT).toBe(8081);
  });

  it("parses platform and native build as positional arguments", () => {
    expect(parseInvocation("local", [])).toEqual({ mode: "local", platform: null, build: false });
    expect(parseInvocation("local", ["web"])).toEqual({ mode: "local", platform: "web", build: false });
    expect(parseInvocation("cloud", ["android", "build"])).toEqual({ mode: "cloud", platform: "android", build: true });
    expect(parseInvocation("worker", [])).toEqual({ mode: "worker", platform: null, build: false });
  });

  it("rejects ambiguous or unsupported mode arguments", () => {
    expect(() => parseInvocation("local", ["web", "android"])).toThrow("Choose one platform");
    expect(() => parseInvocation("local", ["web", "build"])).toThrow("build is available only");
    expect(() => parseInvocation("worker", ["android"])).toThrow("does not accept");
  });

  it("requires every cloud value in the supplied environment file", () => {
    const environment = Object.fromEntries(REQUIRED_CLOUD_VARIABLES.map((name) => [name, "configured"]));
    environment.EXPO_PUBLIC_CLOUD_SYNC_API_URL = "https://staging.example.workers.dev";
    expect(validateCloudEnvironment(environment)).toBe(environment);

    delete environment.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    expect(() => validateCloudEnvironment(environment)).toThrow("EXPO_PUBLIC_GOOGLE_CLIENT_ID");
  });

  it("does not accept extra or potentially secret values in .env.cloud", () => {
    const environment = Object.fromEntries(REQUIRED_CLOUD_VARIABLES.map((name) => [name, "configured"]));
    environment.EXPO_PUBLIC_CLOUD_SYNC_API_URL = "https://staging.example.workers.dev";
    environment.GOOGLE_OAUTH_CLIENT_SECRET = "must-not-be-loaded";
    expect(() => validateCloudEnvironment(environment)).toThrow("accepts only the public app variables");
  });

  it("rejects local, insecure, or credential-bearing cloud Worker URLs", () => {
    for (const url of [
      "http://staging.example.workers.dev",
      "https://localhost:47329",
      "https://user:secret@staging.example.workers.dev",
    ]) {
      expect(() => validateProxyTarget(url, { cloud: true })).toThrow();
    }
  });

  it("routes web API requests to the configured Worker host and base path", () => {
    const upstream = buildUpstreamUrl(
      "https://staging.example.workers.dev/api",
      "/api/v1/account?refresh=1",
    );
    expect(upstream.toString()).toBe("https://staging.example.workers.dev/api/v1/account?refresh=1");
  });

  it("does not route non-API paths through the proxy", () => {
    expect(() => buildUpstreamUrl(LOCAL_WORKER_URL, "/status"))
      .toThrow("Only /api requests");
  });
});
