import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./crypto", () => ({sha256Base64Url: vi.fn(async () => "hash"), createAccountBinding: vi.fn(async () => "binding"),
  createOpaqueToken: vi.fn(() => "x".repeat(48)), decryptSecret: vi.fn(async () => "refresh-test-token"), encryptSecret: vi.fn(async () => ({ciphertext: "cipher", iv: "iv"}))}));
vi.mock("./googleDrive", () => ({ensureVisibleFolder: vi.fn(async () => "folder-id")}));
import worker from "./index";
let expired = false;
let sessionSubject = "real-google-subject";
let entitlementStatus = "inactive";
let developmentGrant = false;
const database = {
  prepare(sql: string) {return {bind() {return this;}, run: async () => ({}),
    async first() {
      if (sql.includes("FROM sessions")) return expired ? null : {google_subject: sessionSubject, email: "person@example.com", client_type: "web"};
      if (sql.includes("FROM accounts")) return {google_subject: "real-google-subject", email: "person@example.com", drive_folder_id: "folder-id"};
      if (sql.includes("FROM drive_credentials")) return {refresh_token_ciphertext: "cipher", refresh_token_iv: "iv"};
      if (sql.includes("FROM entitlements")) return {cloud_sync_status: entitlementStatus, updated_at: "2026-10-04"};
      if (sql.includes("FROM development_grants")) return developmentGrant ? {google_subject: sessionSubject} : null;
      return null;
    }};},
  batch: async () => [],
};
const env = {DB: database, LOCAL_DEV_MODE: "false", ALLOWED_WEB_ORIGINS: "https://canvas.example", APP_PACKAGE_NAME: "com.PabloS.InfiniteCanvas", GOOGLE_OAUTH_CLIENT_ID: "test-client", GOOGLE_OAUTH_CLIENT_SECRET: "test-secret"} as unknown as Env;
function request(path: string, method = "GET", body?: object, extra: Record<string, string> = {}) {
  return new Request(`https://canvas.example${path}`, {method, headers: {Cookie: `infinitecanvas_session=${"t".repeat(48)}`, Referer: "https://canvas.example/", ...extra}, ...(body ? {body: JSON.stringify(body)} : {})});
}
beforeEach(() => {expired = false; sessionSubject = "real-google-subject"; entitlementStatus = "inactive"; developmentGrant = false;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({access_token: "test-access-token"})));});
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});
describe("account and session state", () => {
  it("keeps identity and Drive connected when the purchase is inactive", async () => {
    const response = await worker.fetch(request("/api/v1/account"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({email: "person@example.com", drive: "ready", entitlement: {active: false}});
  });
  it("requires an active entitlement for every sync route", async () => {
    const response = await worker.fetch(request("/v1/sync/drawings"), env);
    expect(response.status).toBe(402);
  });
  it("does not unlock purchases through legacy development grants or local allowlists", async () => {
    developmentGrant = true;
    const localEnv = Object.assign({}, env, {LOCAL_DEV_MODE: "true", LOCAL_TEST_ENTITLEMENT_EMAILS: "person@example.com"});
    const localRequest = (path: string) => new Request(`http://localhost:47329${path}`, {
      headers: {Cookie: `infinitecanvas_session=${"t".repeat(48)}`, Referer: "http://localhost:8081/"},
    });
    const account = await worker.fetch(localRequest("/v1/account"), localEnv);
    expect(account.status).toBe(200);
    expect(await account.json()).toMatchObject({entitlement: {active: false}});
    const sync = await worker.fetch(localRequest("/v1/sync/drawings"), localEnv);
    expect(sync.status).toBe(402);
  });
  it("keeps access from an active purchase entitlement", async () => {
    entitlementStatus = "active";
    const response = await worker.fetch(request("/v1/account"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({entitlement: {active: true}});
  });
  it("no longer creates fabricated local test sessions", async () => {
    const createSession = vi.spyOn(database, "batch");
    const localEnv = Object.assign({}, env, {LOCAL_DEV_MODE: "true", LOCAL_TEST_ENTITLEMENT_EMAILS: "person@example.com"});
    const response = await worker.fetch(new Request("http://localhost:47329/v1/dev/test-session", {
      method: "POST", headers: {Cookie: `infinitecanvas_session=${"t".repeat(48)}`,
        Referer: "http://localhost:8081/", Origin: "http://localhost:8081", "X-Requested-With": "XmlHttpRequest"},
      body: JSON.stringify({email: "person@example.com"}),
    }), localEnv);
    expect(response.status).toBe(404);
    expect(createSession).not.toHaveBeenCalled();
  });
  it("rejects existing fabricated sessions even with an active entitlement", async () => {
    sessionSubject = "local-test:person@example.com";
    entitlementStatus = "active";
    const response = await worker.fetch(request("/v1/account"), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({error: {code: "session_expired"}});
  });
  it("rejects cookie-authenticated writes without the CSRF header", async () => {
    const response = await worker.fetch(request("/v1/auth/session/renew", "POST", {}, {Origin: "https://canvas.example"}), env);
    expect(response.status).toBe(403);
  });
  it("renews web sessions only through an HttpOnly Secure cookie", async () => {
    const response = await worker.fetch(request("/v1/auth/session/renew", "POST", {}, {Origin: "https://canvas.example", "X-Requested-With": "XmlHttpRequest"}), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(await response.json()).not.toHaveProperty("sessionToken");
  });
  it("distinguishes an expired session from an absent purchase", async () => {
    expired = true;
    const response = await worker.fetch(request("/v1/account"), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({error: {code: "session_expired"}});
  });
});
