import {
  CanvasDocument,
  isCanvasDocument,
} from "../../src/features/canvas/document";
import {
  createAccountBinding,
  createOpaqueToken,
  decryptSecret,
  encryptSecret,
  fromBase64,
  sha256Base64Url,
  toArrayBuffer,
} from "./crypto";
import {
  acknowledgePlayPurchase,
  decodePlayIntegrityToken,
  exchangeGoogleCode,
  expectedRequestHash,
  getGoogleProfile,
  getGoogleServiceAccessToken,
  verifyPlayPurchase,
} from "./googleAuth";
import {
  createDriveDocument,
  deleteDriveFile,
  downloadDriveFile,
  DriveFile,
  ensureVisibleFolder,
  getDriveFile,
  listLegacyAppDataFiles,
  listVisibleFiles,
  updateDriveDocument,
  generateDriveFileId,
  retainDriveRevision,
} from "./googleDrive";
import {
  allowedOrigins,
  assertBrowserOrigin,
  errorResponse,
  expectString,
  HttpError,
  jsonResponse,
  readBoundedText,
  readJsonBody,
  withCors,
} from "./http";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PURCHASE_RECHECK_MS = 6 * 60 * 60 * 1000;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const LEGACY_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

type Session = {
  google_subject: string;
  email: string;
  client_type: "web" | "android";
};

type AccountRow = {
  google_subject: string;
  email: string;
  drive_folder_id: string | null;
  migration_completed_at: string | null;
};

type DrawingRow = {
  google_subject: string;
  drawing_id: string;
  drive_file_id: string;
  drive_revision_id: string | null;
  client_updated_at: string;
  migrated_from_file_id: string | null;
  updated_at: string;
};

type PurchaseRow = {
  purchase_token_hash: string;
  google_subject: string;
  product_id: string;
  purchase_state: "PURCHASED" | "PENDING" | "CANCELED" | "INVALID" | "REFUNDED";
  purchase_token_ciphertext: string;
  purchase_token_iv: string;
  acknowledged: number;
  play_purchase_time: string | null;
  last_verified_at: string;
};

type DriveContext = {
  accessToken: string;
  accountHash: string;
  folderId: string;
};

type LocalTestEnv = Env & {
  LOCAL_TEST_ENTITLEMENT_EMAILS?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLocalWorkerRequest = (request: Request) =>
  ["localhost", "127.0.0.1", "::1"].includes(new URL(request.url).hostname);

function hasLocalTestEntitlement(
  request: Request,
  email: string,
  env: Env,
): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const allowlist = (env as LocalTestEnv).LOCAL_TEST_ENTITLEMENT_EMAILS ?? "";
  return (
    (env.LOCAL_DEV_MODE as string) === "true" &&
    isLocalWorkerRequest(request) &&
    allowlist
      .split(",")
      .some((entry) => entry.trim().toLowerCase() === normalizedEmail)
  );
}

function isAllowedLocalTestEmail(email: string, env: Env): boolean {
  const allowlist = (env as LocalTestEnv).LOCAL_TEST_ENTITLEMENT_EMAILS ?? "";
  const normalizedEmail = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .some((entry) => entry.trim().toLowerCase() === normalizedEmail);
}

async function handleLocalTestSession(
  request: Request,
  env: Env,
): Promise<Response> {
  if ((env.LOCAL_DEV_MODE as string) !== "true" || !isLocalWorkerRequest(request)) {
    throw new HttpError(404, "route_not_found", "The requested route was not found.");
  }

  const body = await readJsonBody(request, 4 * 1024);
  const email = expectString(body.email, "email", 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isAllowedLocalTestEmail(email, env)) {
    throw new HttpError(403, "local_test_account_not_allowed", "This account is not enabled for local Cloud Sync testing.");
  }

  const session = await createSession(`local-test:${email}`, email, "web", env);
  return jsonResponse({ email, ...session });
}

async function verifyIntegrity(
  request: Request,
  clientType: "web" | "android",
  bodyText: string,
  env: Env,
): Promise<void> {
  if (clientType === "web") return;
  if ((env.LOCAL_DEV_MODE as string) === "true" && isLocalWorkerRequest(request)) return;

  const token = request.headers.get("x-play-integrity-token");
  if (!token || token.length > 100_000) {
    throw new HttpError(403, "integrity_required", "Google Play app integrity is required for Cloud Sync.");
  }
  const url = new URL(request.url);
  const expectedHash = await expectedRequestHash(
    request.method,
    `${url.pathname}${url.search}`,
    bodyText,
  );
  await decodePlayIntegrityToken(token, expectedHash, env);
}

const SESSION_COOKIE = "infinitecanvas_session";
function sessionTokenFromRequest(request: Request): string | null {
  const bearer = /^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(request.headers.get("authorization") ?? "");
  if (bearer) return bearer[1];
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{40,100}$/.test(token) ? token : null;
}
function sessionResponse(request: Request, email: string, session: {sessionToken: string; expiresAt: string; accountBinding: string}, clientType: "web" | "android"): Response {
  if (clientType === "android") return jsonResponse({email, ...session});
  const response = jsonResponse({email, expiresAt: session.expiresAt, accountBinding: session.accountBinding});
  response.headers.set("Set-Cookie", `${SESSION_COOKIE}=${session.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LIFETIME_MS / 1000}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return response;
}
async function handleAccount(request: Request, session: Session, env: Env): Promise<Response> {
  let entitlement: {active: boolean | null; status: string; accountBinding: string};
  try { entitlement = await currentEntitlement(request, session, env); }
  catch { entitlement = {active: null, status: "verification-error", accountBinding: await createAccountBinding(session.google_subject, env)}; }
  let drive: "ready" | "reauthorization-required" | "unavailable" = "ready";
  try { await getDriveContext(session.google_subject, env); }
  catch (error) { drive = error instanceof HttpError && error.code === "drive_reauthorization_required" ? "reauthorization-required" : "unavailable"; }
  return jsonResponse({email: session.email, accountBinding: entitlement.accountBinding, entitlement, drive});
}

async function authenticate(request: Request, env: Env): Promise<Session> {
  const token = sessionTokenFromRequest(request);
  const match = token ? [token, token] : null;
  if (!match) throw new HttpError(401, "session_required", "Sign in to use Cloud Sync.");
  const tokenHash = await sha256Base64Url(match[1]);
  const now = new Date().toISOString();
  const session = await env.DB.prepare(
    `SELECT sessions.google_subject, accounts.email, sessions.client_type
     FROM sessions
     JOIN accounts ON accounts.google_subject = sessions.google_subject
     WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2`,
  )
    .bind(tokenHash, now)
    .first<Session>();
  if (!session) throw new HttpError(401, "session_expired", "Your Cloud Sync session has expired. Sign in again.");

  const bodyText = await readBoundedText(request.clone().body, MAX_DOCUMENT_BYTES);
  if (session.client_type === "web") {
    assertBrowserOrigin(request, env);
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("x-requested-with") !== "XmlHttpRequest")
      throw new HttpError(403, "csrf_check_failed", "The request origin could not be verified.");
  } else {
    await verifyIntegrity(request, "android", bodyText, env);
  }
  return session;
}

async function createSession(
  googleSubject: string,
  email: string,
  clientType: "web" | "android",
  env: Env,
  credentialWrites: D1PreparedStatement[] = [],
): Promise<{ sessionToken: string; expiresAt: string; accountBinding: string }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  const sessionToken = createOpaqueToken();
  const tokenHash = await sha256Base64Url(sessionToken);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO accounts (google_subject, email, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(google_subject) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`,
    ).bind(googleSubject, email, now.toISOString()),
    ...credentialWrites,
    env.DB.prepare(
      `INSERT INTO sessions (token_hash, google_subject, client_type, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(tokenHash, googleSubject, clientType, now.toISOString(), expiresAt),
  ]);
  return {
    sessionToken,
    expiresAt,
    accountBinding: await createAccountBinding(googleSubject, env),
  };
}

async function refreshGoogleAccessToken(
  refreshToken: string,
  env: Env,
): Promise<string> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new HttpError(503, "google_oauth_not_configured", "Google Drive sign-in is not configured on the sync service.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const text = await readBoundedText(response.body, 128 * 1024);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new HttpError(502, "google_token_invalid_response", "Google returned an invalid token response.");
  }
  if (
    !isRecord(payload) ||
    !response.ok ||
    typeof payload.access_token !== "string"
  ) {
    if (isRecord(payload) && payload.error === "invalid_grant") {
      throw new HttpError(401, "drive_reauthorization_required", "Reconnect Google Drive to continue syncing.");
    }
    throw new HttpError(502, "google_token_refresh_failed", "Google could not refresh the Drive connection.");
  }
  return payload.access_token;
}

async function getDriveContext(
  googleSubject: string,
  env: Env,
): Promise<DriveContext> {
  const [account, credentials] = await Promise.all([
    env.DB.prepare(
      "SELECT google_subject, email, drive_folder_id, migration_completed_at FROM accounts WHERE google_subject = ?1",
    )
      .bind(googleSubject)
      .first<AccountRow>(),
    env.DB.prepare(
      "SELECT refresh_token_ciphertext, refresh_token_iv FROM drive_credentials WHERE google_subject = ?1",
    )
      .bind(googleSubject)
      .first<{ refresh_token_ciphertext: string; refresh_token_iv: string }>(),
  ]);
  if (!account || !credentials) {
    throw new HttpError(401, "drive_reauthorization_required", "Reconnect Google Drive to continue syncing.");
  }

  const refreshToken = await decryptSecret(
    credentials.refresh_token_ciphertext,
    credentials.refresh_token_iv,
    `drive-refresh-v1:${googleSubject}`,
    env,
  );
  const accessToken = await refreshGoogleAccessToken(refreshToken, env).catch(async (error: unknown) => {
    if (error instanceof HttpError && error.code === "drive_reauthorization_required") {
      await env.DB.prepare("DELETE FROM drive_credentials WHERE google_subject = ?1")
        .bind(googleSubject)
        .run();
    }
    throw error;
  });
  const accountHash = await sha256Base64Url(googleSubject);
  let folderId: string;
  try {
    folderId = await ensureVisibleFolder(accessToken, accountHash, account.drive_folder_id);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
    folderId = await ensureVisibleFolder(accessToken, accountHash);
  }
  if (folderId !== account.drive_folder_id) {
    await env.DB.prepare(
      "UPDATE accounts SET drive_folder_id = ?1, updated_at = ?2 WHERE google_subject = ?3",
    )
      .bind(folderId, new Date().toISOString(), googleSubject)
      .run();
  }
  return { accessToken, accountHash, folderId };
}

function mapEntitlementStatus(
  state: PurchaseRow["purchase_state"],
): "active" | "pending" | "invalid" | "canceled" | "refunded" {
  if (state === "PURCHASED") return "active";
  if (state === "PENDING") return "pending";
  if (state === "CANCELED") return "canceled";
  if (state === "REFUNDED") return "refunded";
  return "invalid";
}

async function updateEntitlementFromPurchase(
  googleSubject: string,
  tokenHash: string,
  state: PurchaseRow["purchase_state"],
  env: Env,
): Promise<void> {
  const otherActive = await env.DB.prepare(
    `SELECT purchase_token_hash FROM purchases
     WHERE google_subject = ?1 AND purchase_state = 'PURCHASED' AND purchase_token_hash != ?2 LIMIT 1`,
  )
    .bind(googleSubject, tokenHash)
    .first<{ purchase_token_hash: string }>();
  const status = state === "PURCHASED" || otherActive
    ? "active"
    : mapEntitlementStatus(state);
  await env.DB.prepare(
    `INSERT INTO entitlements (google_subject, cloud_sync_status, source_purchase_token_hash, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(google_subject) DO UPDATE SET
       cloud_sync_status = excluded.cloud_sync_status,
       source_purchase_token_hash = excluded.source_purchase_token_hash,
       updated_at = excluded.updated_at`,
  )
    .bind(googleSubject, status, tokenHash, new Date().toISOString())
    .run();
}

async function recordVerifiedPurchase(
  googleSubject: string,
  purchaseToken: string,
  env: Env,
): Promise<{ active: boolean; status: string }> {
  if (purchaseToken.length > 8_192) {
    throw new HttpError(400, "invalid_purchase_token", "The Google Play purchase token is invalid.");
  }
  const tokenHash = await sha256Base64Url(purchaseToken);
  const previous = await env.DB.prepare(
    "SELECT purchase_token_hash, google_subject, product_id, purchase_state, purchase_token_ciphertext, purchase_token_iv, acknowledged, play_purchase_time, last_verified_at FROM purchases WHERE purchase_token_hash = ?1",
  )
    .bind(tokenHash)
    .first<PurchaseRow>();
  if (previous && previous.google_subject !== googleSubject) {
    throw new HttpError(409, "purchase_already_linked", "This purchase is already linked to another Cloud Sync account.");
  }

  const accountBinding = await createAccountBinding(googleSubject, env);
  const verified = await verifyPlayPurchase(purchaseToken, accountBinding, env, {
    requireAccountBinding: !previous,
  });
  if (verified.state === "PURCHASED" && !verified.acknowledged) {
    await acknowledgePlayPurchase(purchaseToken, env);
  }
  const state = verified.state;
  const now = new Date().toISOString();
  const tokenCipher = await encryptSecret(
    purchaseToken,
    `play-purchase-v1:${tokenHash}`,
    env,
  );
  await env.DB.prepare(
    `INSERT INTO purchases (
       purchase_token_hash, google_subject, product_id, purchase_state,
       purchase_token_ciphertext, purchase_token_iv, acknowledged,
       play_purchase_time, last_verified_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
     ON CONFLICT(purchase_token_hash) DO UPDATE SET
       product_id = excluded.product_id,
       purchase_state = excluded.purchase_state,
       purchase_token_ciphertext = excluded.purchase_token_ciphertext,
       purchase_token_iv = excluded.purchase_token_iv,
       acknowledged = excluded.acknowledged,
       play_purchase_time = excluded.play_purchase_time,
       last_verified_at = excluded.last_verified_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      tokenHash,
      googleSubject,
      env.CLOUD_SYNC_PRODUCT_ID,
      state,
      tokenCipher.ciphertext,
      tokenCipher.iv,
      verified.acknowledged || state === "PURCHASED" ? 1 : 0,
      verified.purchaseTime ?? null,
      now,
    )
    .run();
  await updateEntitlementFromPurchase(googleSubject, tokenHash, state, env);
  return { active: state === "PURCHASED", status: mapEntitlementStatus(state) };
}

async function refreshPurchaseIfDue(
  googleSubject: string,
  purchase: PurchaseRow,
  env: Env,
): Promise<void> {
  const age = Date.now() - Date.parse(purchase.last_verified_at);
  if (age < PURCHASE_RECHECK_MS) return;
  const token = await decryptSecret(
    purchase.purchase_token_ciphertext,
    purchase.purchase_token_iv,
    `play-purchase-v1:${purchase.purchase_token_hash}`,
    env,
  );
  await recordVerifiedPurchase(googleSubject, token, env);
}

async function currentEntitlement(
  request: Request,
  session: Session,
  env: Env,
): Promise<{ active: boolean; status: string; updatedAt?: string; accountBinding: string }> {
  const accountBinding = await createAccountBinding(session.google_subject, env);
  if (hasLocalTestEntitlement(request, session.email, env)) {
    const grant = await env.DB.prepare("SELECT google_subject FROM development_grants WHERE google_subject = ?1").bind(session.google_subject).first();
    if (grant && !session.google_subject.startsWith("local-test:")) return { active: true, status: "active", accountBinding };
  }

  const purchase = await env.DB.prepare(
    `SELECT purchase_token_hash, google_subject, product_id, purchase_state,
            purchase_token_ciphertext, purchase_token_iv, acknowledged,
            play_purchase_time, last_verified_at
     FROM purchases WHERE google_subject = ?1 AND purchase_state = 'PURCHASED'
     ORDER BY last_verified_at DESC LIMIT 1`,
  )
    .bind(session.google_subject)
    .first<PurchaseRow>();
  if (purchase) await refreshPurchaseIfDue(session.google_subject, purchase, env);

  const entitlement = await env.DB.prepare(
    "SELECT cloud_sync_status, updated_at FROM entitlements WHERE google_subject = ?1",
  )
    .bind(session.google_subject)
    .first<{ cloud_sync_status: string; updated_at: string }>();
  const status = entitlement?.cloud_sync_status ?? "inactive";
  return {
    active: status === "active",
    status,
    ...(entitlement ? { updatedAt: entitlement.updated_at } : {}),
    accountBinding,
  };
}

async function requireActiveEntitlement(
  request: Request,
  session: Session,
  env: Env,
): Promise<void> {
  const entitlement = await currentEntitlement(request, session, env);
  if (!entitlement.active) {
    throw new HttpError(402, "cloud_sync_locked", "Cloud Sync requires an active Google Play purchase for this Google account.");
  }
}

function cloudDocument(document: CanvasDocument): CanvasDocument {
  return {
    ...document,
    metadata: {
      ...document.metadata,
      driveFileId: undefined,
      driveRevisionId: undefined,
      thumbnailUri: undefined,
      syncStatus: undefined,
      syncError: undefined,
      syncQueuedAt: undefined,
      syncLastAttemptAt: undefined,
      syncConflict: undefined,
      syncConflictRemoteRevisionId: undefined,
      syncConflictRemoteUpdatedAt: undefined,
    },
  };
}

function documentForClient(
  document: CanvasDocument,
  file: DriveFile,
): CanvasDocument {
  return {
    ...document,
    metadata: {
      ...document.metadata,
      driveFileId: file.id,
      driveRevisionId: file.headRevisionId,
    },
  };
}

async function findDrawing(
  googleSubject: string,
  drawingId: string,
  env: Env,
): Promise<DrawingRow | null> {
  return env.DB.prepare(
    `SELECT google_subject, drawing_id, drive_file_id, drive_revision_id,
            client_updated_at, migrated_from_file_id, updated_at
     FROM drawings WHERE google_subject = ?1 AND drawing_id = ?2`,
  )
    .bind(googleSubject, drawingId)
    .first<DrawingRow>();
}

async function fileMatchesOwner(
  file: DriveFile,
  drawingId: string,
  context: DriveContext,
): Promise<boolean> {
  return (
    file.appProperties.app === "infinitecanvas" &&
    file.appProperties.account === context.accountHash &&
    file.appProperties.drawingId === drawingId &&
    file.parents?.includes(context.folderId) === true
  );
}

async function persistDrawingMapping(
  googleSubject: string,
  drawingId: string,
  file: DriveFile,
  updatedAt: string,
  migratedFromFileId: string | null,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO drawings (
       google_subject, drawing_id, drive_file_id, drive_revision_id,
       client_updated_at, migrated_from_file_id, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(google_subject, drawing_id) DO UPDATE SET
       drive_file_id = excluded.drive_file_id,
       drive_revision_id = excluded.drive_revision_id,
       client_updated_at = excluded.client_updated_at,
       migrated_from_file_id = COALESCE(excluded.migrated_from_file_id, drawings.migrated_from_file_id),
       updated_at = excluded.updated_at`,
  )
    .bind(
      googleSubject,
      drawingId,
      file.id,
      file.headRevisionId ?? null,
      updatedAt,
      migratedFromFileId,
      new Date().toISOString(),
    )
    .run();
}

async function handleGoogleCodeExchange(
  request: Request,
  env: Env,
): Promise<Response> {
  const bodyText = await readBoundedText(request.clone().body, 64 * 1024);
  const body = await readJsonBody(request, 64 * 1024);
  const code = expectString(body.code, "code", 8_192);
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new HttpError(503, "google_oauth_not_configured", "Google Drive sign-in is not configured on the sync service.");
  }
  const clientType = body.clientType;
  if (clientType !== "web" && clientType !== "android") {
    throw new HttpError(400, "invalid_client_type", "The sign-in client type is invalid.");
  }

  let redirectUri: string | undefined;
  if (clientType === "web") {
    assertBrowserOrigin(request, env);
    if (request.headers.get("x-requested-with") !== "XmlHttpRequest") {
      throw new HttpError(403, "oauth_csrf_check_failed", "Google sign-in could not be verified.");
    }
    const origin = request.headers.get("origin")!;
    redirectUri = expectString(body.redirectUri, "redirectUri", 1_024);
    if (redirectUri !== origin) {
      throw new HttpError(403, "oauth_redirect_mismatch", "The Google sign-in origin did not match this app.");
    }
  } else {
    if (request.headers.get("x-client-platform") !== "android") {
      throw new HttpError(403, "android_client_required", "The Android app identity is required.");
    }
    await verifyIntegrity(request, "android", bodyText, env);
  }

  const grant = await exchangeGoogleCode(code, clientType, redirectUri, env);
  const profile = await getGoogleProfile(grant.accessToken);
  if (typeof body.expectedAccountBinding === "string" && body.expectedAccountBinding !== await createAccountBinding(profile.subject, env))
    throw new HttpError(409, "account_mismatch", "Reconnect the same Google account. Sign out first to change accounts.");
  const existingCredential = await env.DB.prepare(
    "SELECT google_subject FROM drive_credentials WHERE google_subject = ?1",
  )
    .bind(profile.subject)
    .first<{ google_subject: string }>();
  if (!grant.refreshToken && !existingCredential) {
    throw new HttpError(409, "google_offline_access_required", "Google did not grant background Drive access. Reconnect and approve Drive access.");
  }
  const credentialWrites: D1PreparedStatement[] = [];
  if (grant.refreshToken) {
    const encrypted = await encryptSecret(
      grant.refreshToken,
      `drive-refresh-v1:${profile.subject}`,
      env,
    );
    credentialWrites.push(env.DB.prepare(
      `INSERT INTO drive_credentials (google_subject, refresh_token_ciphertext, refresh_token_iv, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(google_subject) DO UPDATE SET
         refresh_token_ciphertext = excluded.refresh_token_ciphertext,
         refresh_token_iv = excluded.refresh_token_iv,
         updated_at = excluded.updated_at`,
    )
      .bind(profile.subject, encrypted.ciphertext, encrypted.iv, new Date().toISOString())
      );
  }
  const session = await createSession(profile.subject, profile.email, clientType, env, credentialWrites);
  if (hasLocalTestEntitlement(request, profile.email, env)) {
    await env.DB.prepare(`INSERT INTO development_grants (google_subject, email, reason, created_at)
      VALUES (?1, ?2, 'explicit-local-test-access', ?3) ON CONFLICT(google_subject) DO NOTHING`)
      .bind(profile.subject, profile.email, new Date().toISOString()).run();
  }
  return sessionResponse(request, profile.email, session, clientType);
}

async function handlePurchaseVerification(
  request: Request,
  session: Session,
  env: Env,
): Promise<Response> {
  const body = await readJsonBody(request, 64 * 1024);
  const purchaseToken = expectString(body.purchaseToken, "purchaseToken", 8_192);
  const purchase = await recordVerifiedPurchase(session.google_subject, purchaseToken, env);
  const entitlement = await currentEntitlement(request, session, env);
  return jsonResponse({ ...purchase, ...entitlement });
}

async function handleEntitlement(
  request: Request,
  session: Session,
  env: Env,
): Promise<Response> {
  return jsonResponse(await currentEntitlement(request, session, env));
}

async function storeMigrationResult(
  googleSubject: string,
  sourceFileId: string,
  drawingId: string | null,
  destinationFileId: string | null,
  status: "copied" | "already-present" | "rejected",
  reasonCode: string | null,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO migration_sources (
       google_subject, source_file_id, drawing_id, destination_file_id,
       status, reason_code, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(google_subject, source_file_id) DO UPDATE SET
       drawing_id = excluded.drawing_id,
       destination_file_id = excluded.destination_file_id,
       status = excluded.status,
       reason_code = excluded.reason_code,
       updated_at = excluded.updated_at`,
  )
    .bind(
      googleSubject,
      sourceFileId,
      drawingId,
      destinationFileId,
      status,
      reasonCode,
      new Date().toISOString(),
    )
    .run();
}

async function decodeDocumentText(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function handleLegacyMigration(
  session: Session,
  env: Env,
): Promise<Response> {
  const [account, context] = await Promise.all([
    env.DB.prepare(
      "SELECT google_subject, email, drive_folder_id, migration_completed_at FROM accounts WHERE google_subject = ?1",
    )
      .bind(session.google_subject)
      .first<AccountRow>(),
    getDriveContext(session.google_subject, env),
  ]);
  if (!account) throw new HttpError(404, "account_not_found", "The Cloud Sync account was not found.");
  if (account.migration_completed_at) {
    return jsonResponse({ completed: true, copied: 0, rejected: 0, files: [] });
  }

  const legacyFiles = await listLegacyAppDataFiles(context.accessToken);
  const visibleFiles = await listVisibleFiles(
    context.accessToken,
    context.folderId,
    context.accountHash,
  );
  const files: Array<{
    drawingId: string;
    id: string;
    headRevisionId?: string;
    modifiedTime?: string;
    migrated: true;
  }> = [];
  let copied = 0;
  let rejected = 0;

  for (const source of legacyFiles) {
    const migration = await env.DB.prepare(
      "SELECT status, drawing_id, destination_file_id FROM migration_sources WHERE google_subject = ?1 AND source_file_id = ?2",
    )
      .bind(session.google_subject, source.id)
      .first<{ status: string; drawing_id: string | null; destination_file_id: string | null }>();
    if (migration?.status === "copied" || migration?.status === "already-present") continue;

    let sourceDocument: unknown;
    try {
      sourceDocument = await decodeDocumentText(
        await downloadDriveFile(context.accessToken, source.id),
      );
    } catch {
      await storeMigrationResult(
        session.google_subject,
        source.id,
        null,
        null,
        "rejected",
        "unreadable_source",
        env,
      );
      rejected += 1;
      continue;
    }
    if (!isCanvasDocument(sourceDocument, { allowLocalImageUris: false })) {
      await storeMigrationResult(
        session.google_subject,
        source.id,
        null,
        null,
        "rejected",
        "invalid_document",
        env,
      );
      rejected += 1;
      continue;
    }

    const drawingId = sourceDocument.metadata.id;
    const existingCopies = visibleFiles.filter((file) => file.drawingId === drawingId);
    if (existingCopies.length > 1) {
      await storeMigrationResult(
        session.google_subject,
        source.id,
        drawingId,
        null,
        "rejected",
        "duplicate_visible_copy",
        env,
      );
      rejected += 1;
      continue;
    }

    let destination: DriveFile;
    let status: "copied" | "already-present";
    if (existingCopies[0]) {
      destination = existingCopies[0];
      const existingText = await downloadDriveFile(context.accessToken, destination.id);
      const existingDocument = await decodeDocumentText(existingText);
      if (
        !isCanvasDocument(existingDocument, { allowLocalImageUris: false }) ||
        existingDocument.metadata.id !== drawingId
      ) {
        await storeMigrationResult(
          session.google_subject,
          source.id,
          drawingId,
          destination.id,
          "rejected",
          "existing_copy_invalid",
          env,
        );
        rejected += 1;
        continue;
      }
      status = "already-present";
    } else {
      const safeDocument = cloudDocument(sourceDocument);
      const sourceJson = JSON.stringify(safeDocument);
      destination = await createReservedDrawing(context, session.google_subject, drawingId, sourceJson, sourceDocument.metadata.updatedAt, env);
      const copiedText = await downloadDriveFile(context.accessToken, destination.id);
      const copiedDocument = await decodeDocumentText(copiedText);
      if (
        !isCanvasDocument(copiedDocument, { allowLocalImageUris: false }) ||
        copiedDocument.metadata.id !== drawingId
      ) {
        await storeMigrationResult(
          session.google_subject,
          source.id,
          drawingId,
          destination.id,
          "rejected",
          "copy_verification_failed",
          env,
        );
        rejected += 1;
        continue;
      }
      status = "copied";
      copied += 1;
      visibleFiles.push(destination);
    }

    await persistDrawingMapping(
      session.google_subject,
      drawingId,
      destination,
      sourceDocument.metadata.updatedAt,
      source.id,
      env,
    );
    await storeMigrationResult(
      session.google_subject,
      source.id,
      drawingId,
      destination.id,
      status,
      null,
      env,
    );
    files.push({
      drawingId,
      id: destination.id,
      ...(destination.headRevisionId ? { headRevisionId: destination.headRevisionId } : {}),
      ...(destination.modifiedTime ? { modifiedTime: destination.modifiedTime } : {}),
      migrated: true,
    });
  }

  const completedAt = new Date().toISOString();
  if (rejected === 0) {
    await env.DB.prepare(
      "UPDATE accounts SET migration_completed_at = ?1, updated_at = ?1 WHERE google_subject = ?2",
    )
      .bind(completedAt, session.google_subject)
      .run();
  }
  return jsonResponse({ completed: rejected === 0, copied, rejected, files });
}

async function handleDrawingList(
  session: Session,
  env: Env,
): Promise<Response> {
  const context = await getDriveContext(session.google_subject, env);
  const driveFiles = await listVisibleFiles(
    context.accessToken,
    context.folderId,
    context.accountHash,
  );
  const byDrawingId = new Map<string, DriveFile[]>();
  for (const file of driveFiles) {
    if (!file.drawingId || !await fileMatchesOwner(file, file.drawingId, context)) continue;
    const group = byDrawingId.get(file.drawingId) ?? [];
    group.push(file);
    byDrawingId.set(file.drawingId, group);
  }

  const files: Array<{
    id: string;
    documentId: string;
    name: string;
    headRevisionId?: string;
    modifiedTime?: string;
    migrated: boolean;
  }> = [];
  for (const [drawingId, candidates] of byDrawingId) {
    const mapping = await findDrawing(session.google_subject, drawingId, env);
    let selected = mapping
      ? candidates.find((file) => file.id === mapping.drive_file_id)
      : undefined;
    if (mapping && !selected) continue;
    if (!mapping && candidates.length !== 1) continue;
    selected ??= candidates[0];
    if (!selected) continue;

    if (!mapping) {
      await persistDrawingMapping(
        session.google_subject,
        drawingId,
        selected,
        selected.modifiedTime ?? new Date().toISOString(),
        null,
        env,
      );
    } else if (mapping.drive_revision_id !== selected.headRevisionId) {
      await env.DB.prepare(
        `UPDATE drawings SET drive_revision_id = ?1, updated_at = ?2
         WHERE google_subject = ?3 AND drawing_id = ?4`,
      )
        .bind(selected.headRevisionId ?? null, new Date().toISOString(), session.google_subject, drawingId)
        .run();
    }

    files.push({
      id: selected.id,
      documentId: drawingId,
      name: selected.name,
      ...(selected.headRevisionId ? { headRevisionId: selected.headRevisionId } : {}),
      ...(selected.modifiedTime ? { modifiedTime: selected.modifiedTime } : {}),
      migrated: Boolean(mapping?.migrated_from_file_id),
    });
  }
  return jsonResponse({ files });
}

async function createReservedDrawing(context: DriveContext, subject: string, drawingId: string, content: string, updatedAt: string, env: Env): Promise<DriveFile> {
  const reserved = await generateDriveFileId(context.accessToken);
  await env.DB.prepare(`INSERT OR IGNORE INTO drawings
    (google_subject, drawing_id, drive_file_id, drive_revision_id, client_updated_at, updated_at)
    VALUES (?1, ?2, ?3, NULL, ?4, ?4)`).bind(subject, drawingId, reserved, updatedAt).run();
  const mapping = await findDrawing(subject, drawingId, env);
  if (!mapping) throw new HttpError(503, "drawing_reservation_failed", "The drawing could not be reserved.");
  if (mapping.drive_revision_id) throw new HttpError(409, "drawing_conflict", "A drawing was created concurrently. Refresh before saving.");
  return createDriveDocument(context.accessToken, context.folderId, context.accountHash, drawingId, content, mapping.drive_file_id);
}

async function handleDrawingUpload(
  request: Request,
  drawingId: string,
  session: Session,
  env: Env,
): Promise<Response> {
  const body = await readJsonBody(request, MAX_DOCUMENT_BYTES);
  const document = body.document;
  if (!isCanvasDocument(document, { allowLocalImageUris: false })) {
    throw new HttpError(422, "invalid_document", "The drawing structure or one of its fields is not valid for Cloud Sync.");
  }
  if (document.metadata.id !== drawingId) {
    throw new HttpError(400, "drawing_id_mismatch", "The drawing identifier does not match the request.");
  }
  const force = body.force === true;
  if (body.force !== undefined && typeof body.force !== "boolean") {
    throw new HttpError(400, "invalid_force_flag", "The conflict override value is invalid.");
  }
  const baseRevisionId = body.baseRevisionId;
  const observedRevision = body.observedRevision;
  if (force && (typeof observedRevision !== "string" || !observedRevision || observedRevision.length > 256))
    throw new HttpError(400, "observed_revision_required", "Review the current cloud version before replacing it.");
  if (baseRevisionId !== undefined &&
      (typeof baseRevisionId !== "string" || baseRevisionId.length > 256)) {
    throw new HttpError(400, "invalid_revision", "The drawing revision identifier is invalid.");
  }

  const context = await getDriveContext(session.google_subject, env);
  const row = await findDrawing(session.google_subject, drawingId, env);
  const storedDocument = cloudDocument(document);
  if (!isCanvasDocument(storedDocument, { allowLocalImageUris: false })) {
    throw new HttpError(422, "invalid_document", "The drawing contains fields that cannot be stored in Drive.");
  }
  const content = JSON.stringify(storedDocument);
  let destination: DriveFile;
  let migratedFromFileId: string | null = null;

  if (row) {
    let current: DriveFile | null = null;
    try {
      current = await getDriveFile(context.accessToken, row.drive_file_id);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
    }
    if (current && !await fileMatchesOwner(current, drawingId, context)) {
      throw new HttpError(404, "drawing_not_found", "This drawing is not available to this account.");
    }
    if (current && current.headRevisionId !== (force ? observedRevision : baseRevisionId)) {
      throw new HttpError(409, "drawing_conflict", "The Drive drawing changed since this device last synced. Choose which version to keep.");
    }
    if (current) {
      const previous = await decodeDocumentText(await downloadDriveFile(context.accessToken, current.id));
      if (!isCanvasDocument(previous, {allowLocalImageUris: false}) || previous.metadata.id !== drawingId)
        throw new HttpError(422, "remote_document_invalid", "The invalid Drive copy was not overwritten.");
      if (force) await retainDriveRevision(context.accessToken, current.id, observedRevision as string);
      destination = await updateDriveDocument(context.accessToken, row.drive_file_id, content, (force ? observedRevision : baseRevisionId) as string);
      destination = await getDriveFile(context.accessToken, destination.id);
      migratedFromFileId = row.migrated_from_file_id;
    } else {
      if (row.drive_revision_id) {
        const replacement = await generateDriveFileId(context.accessToken);
        await env.DB.prepare("UPDATE drawings SET drive_file_id = ?1, drive_revision_id = NULL WHERE google_subject = ?2 AND drawing_id = ?3 AND drive_file_id = ?4 AND drive_revision_id IS NOT NULL")
          .bind(replacement, session.google_subject, drawingId, row.drive_file_id).run();
      }
      destination = await createReservedDrawing(context, session.google_subject, drawingId, content, document.metadata.updatedAt, env);
    }
  } else {
    const matching = (await listVisibleFiles(context.accessToken, context.folderId, context.accountHash))
      .filter((file) => file.drawingId === drawingId);
    if (matching.length > 1) {
      throw new HttpError(409, "drawing_ambiguous", "More than one Drive file has this drawing identifier; no file was overwritten.");
    }
    if (matching[0]) {
      const remoteText = await downloadDriveFile(context.accessToken, matching[0].id);
      const remoteDocument = await decodeDocumentText(remoteText);
      if (
        !isCanvasDocument(remoteDocument, { allowLocalImageUris: false }) ||
        remoteDocument.metadata.id !== drawingId
      ) {
        throw new HttpError(422, "remote_document_invalid", "The existing Drive copy is invalid; the local drawing was preserved.");
      }
      if ((force ? observedRevision : baseRevisionId) !== matching[0].headRevisionId) {
        throw new HttpError(409, "drawing_conflict", "The Drive drawing changed since this device last synced. Choose which version to keep.");
      }
      if (force) await retainDriveRevision(context.accessToken, matching[0].id, observedRevision as string);
      destination = await updateDriveDocument(context.accessToken, matching[0].id, content, (force ? observedRevision : baseRevisionId) as string);
      destination = await getDriveFile(context.accessToken, destination.id);
    } else {
      destination = await createReservedDrawing(context, session.google_subject, drawingId, content, document.metadata.updatedAt, env);
      destination = await getDriveFile(context.accessToken, destination.id);
    }
  }

  if (!await fileMatchesOwner(destination, drawingId, context)) {
    throw new HttpError(502, "drive_file_verification_failed", "The saved Drive drawing could not be verified.");
  }
  await persistDrawingMapping(
    session.google_subject,
    drawingId,
    destination,
    document.metadata.updatedAt,
    migratedFromFileId,
    env,
  );
  return jsonResponse({
    document: documentForClient(storedDocument, destination),
    file: {
      id: destination.id,
      documentId: drawingId,
      name: destination.name,
      headRevisionId: destination.headRevisionId,
      modifiedTime: destination.modifiedTime,
    },
  });
}

async function handleDrawingDownload(
  drawingId: string,
  session: Session,
  env: Env,
): Promise<Response> {
  const row = await findDrawing(session.google_subject, drawingId, env);
  if (!row) throw new HttpError(404, "drawing_not_found", "This drawing is not available in Drive.");
  const context = await getDriveContext(session.google_subject, env);
  const file = await getDriveFile(context.accessToken, row.drive_file_id);
  if (!await fileMatchesOwner(file, drawingId, context)) {
    throw new HttpError(404, "drawing_not_found", "This drawing is not available in Drive.");
  }
  const text = await downloadDriveFile(context.accessToken, file.id);
  const document = await decodeDocumentText(text);
  if (
    !isCanvasDocument(document, { allowLocalImageUris: false }) ||
    document.metadata.id !== drawingId
  ) {
    throw new HttpError(422, "remote_document_invalid", "This Drive drawing is invalid. The valid copy on this device was not changed.");
  }
  return jsonResponse({ document: documentForClient(document, file) });
}

async function handleDrawingDelete(
  request: Request,
  drawingId: string,
  session: Session,
  env: Env,
): Promise<Response> {
  const row = await findDrawing(session.google_subject, drawingId, env);
  if (!row) return jsonResponse({ deleted: false });
  const context = await getDriveContext(session.google_subject, env);
  let file: DriveFile | null = null;
  try {
    file = await getDriveFile(context.accessToken, row.drive_file_id);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  if (file) {
    if (!await fileMatchesOwner(file, drawingId, context)) {
      throw new HttpError(404, "drawing_not_found", "This drawing is not available to this account.");
    }
    const body = await readJsonBody(request, 1024);
    const revision = expectString(body.baseRevisionId, "baseRevisionId", 256);
    await deleteDriveFile(context.accessToken, row.drive_file_id, revision);
  }
  await env.DB.prepare(
    "DELETE FROM drawings WHERE google_subject = ?1 AND drawing_id = ?2",
  )
    .bind(session.google_subject, drawingId)
    .run();
  return jsonResponse({ deleted: Boolean(file) });
}

function decodeJwtPart(value: string): Record<string, unknown> {
  const decoded = new TextDecoder().decode(fromBase64(value));
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  }
  if (!isRecord(parsed)) {
    throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  }
  return parsed;
}

function derLength(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let remainder = length;
  while (remainder > 0) {
    bytes.unshift(remainder & 0xff);
    remainder >>>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function der(tag: number, content: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + derLength(content.length).length + content.length);
  const length = derLength(content.length);
  result[0] = tag;
  result.set(length, 1);
  result.set(content, 1 + length.length);
  return result;
}

function derSequence(...values: Uint8Array[]): Uint8Array {
  const length = values.reduce((sum, value) => sum + value.length, 0);
  const content = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    content.set(value, offset);
    offset += value.length;
  }
  return der(0x30, content);
}

function derInteger(bytes: Uint8Array): Uint8Array {
  let firstNonZero = 0;
  while (firstNonZero < bytes.length - 1 && bytes[firstNonZero] === 0) firstNonZero += 1;
  const value = bytes.slice(firstNonZero);
  const positive = value[0] & 0x80 ? Uint8Array.of(0, ...value) : value;
  return der(0x02, positive);
}

function rsaJwkToSpki(jwk: Record<string, unknown>): ArrayBuffer {
  if (typeof jwk.n !== "string" || typeof jwk.e !== "string") {
    throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  }
  const rsaPublicKey = derSequence(
    derInteger(fromBase64(jwk.n)),
    derInteger(fromBase64(jwk.e)),
  );
  const algorithmIdentifier = derSequence(
    Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01),
    Uint8Array.of(0x05, 0x00),
  );
  const bitString = der(0x03, Uint8Array.of(0, ...rsaPublicKey));
  return toArrayBuffer(derSequence(algorithmIdentifier, bitString));
}

async function verifyRtdnIdentity(request: Request, env: Env): Promise<void> {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new HttpError(401, "pubsub_token_required", "The Google notification identity is required.");
  const parts = match[1].split(".");
  if (parts.length !== 3) throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  }
  const keyResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const keyText = await readBoundedText(keyResponse.body, 256 * 1024);
  let keySet: unknown;
  try {
    keySet = JSON.parse(keyText);
  } catch {
    throw new HttpError(502, "google_keys_unavailable", "Google notification keys could not be loaded.");
  }
  const keys = isRecord(keySet) && Array.isArray(keySet.keys) ? keySet.keys : [];
  const jwk = keys.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.kid === header.kid &&
      candidate.kty === "RSA" &&
      typeof candidate.n === "string" &&
      typeof candidate.e === "string",
  );
  if (!isRecord(jwk)) throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  const publicKey = await crypto.subtle.importKey(
    "spki",
    rsaJwkToSpki(jwk),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    toArrayBuffer(fromBase64(parts[2])),
    toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );
  const now = Math.floor(Date.now() / 1000);
  const aud = claims.aud;
  const audienceMatches = aud === env.PLAY_RTDN_OIDC_AUDIENCE ||
    (Array.isArray(aud) && aud.includes(env.PLAY_RTDN_OIDC_AUDIENCE));
  if (
    !signatureValid ||
    (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") ||
    !audienceMatches ||
    claims.email !== env.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ||
    claims.email_verified !== true ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.iat !== "number" ||
    claims.iat > now + 60
  ) {
    throw new HttpError(401, "pubsub_token_invalid", "The Google notification identity is invalid.");
  }
}

async function handleGooglePlayNotification(
  request: Request,
  env: Env,
): Promise<Response> {
  await verifyRtdnIdentity(request, env);
  const body = await readJsonBody(request, 128 * 1024);
  const message = isRecord(body.message) ? body.message : null;
  if (!message || typeof message.messageId !== "string" || typeof message.data !== "string") {
    throw new HttpError(400, "pubsub_message_invalid", "The Google Play notification is malformed.");
  }
  const seen = await env.DB.prepare(
    "SELECT message_id FROM play_rtdn_messages WHERE message_id = ?1",
  )
    .bind(message.messageId)
    .first<{ message_id: string }>();
  if (seen) return jsonResponse({ received: true, duplicate: true });

  let event: unknown;
  try {
    event = JSON.parse(new TextDecoder().decode(fromBase64(message.data)));
  } catch {
    throw new HttpError(400, "pubsub_message_invalid", "The Google Play notification is malformed.");
  }
  if (!isRecord(event)) {
    throw new HttpError(400, "pubsub_message_invalid", "The Google Play notification is malformed.");
  }

  const voided = isRecord(event.voidedPurchaseNotification)
    ? event.voidedPurchaseNotification
    : null;
  if (voided && typeof voided.purchaseToken === "string" && voided.productType === 1) {
    const tokenHash = await sha256Base64Url(voided.purchaseToken);
    const purchase = await env.DB.prepare(
      `SELECT purchase_token_hash, google_subject, product_id, purchase_state,
              purchase_token_ciphertext, purchase_token_iv, acknowledged,
              play_purchase_time, last_verified_at
       FROM purchases WHERE purchase_token_hash = ?1`,
    )
      .bind(tokenHash)
      .first<PurchaseRow>();
    if (purchase?.product_id === env.CLOUD_SYNC_PRODUCT_ID) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE purchases SET purchase_state = 'REFUNDED', last_verified_at = ?1, updated_at = ?1 WHERE purchase_token_hash = ?2",
      )
        .bind(now, tokenHash)
        .run();
      await updateEntitlementFromPurchase(
        purchase.google_subject,
        tokenHash,
        "REFUNDED",
        env,
      );
    }
    await rememberRtdnMessage(message.messageId, env);
    return jsonResponse({ received: true, updated: Boolean(purchase) });
  }

  if (!isRecord(event.oneTimeProductNotification)) {
    await rememberRtdnMessage(message.messageId, env);
    return jsonResponse({ received: true, ignored: true });
  }
  const notification = event.oneTimeProductNotification;
  if (
    notification.sku !== env.CLOUD_SYNC_PRODUCT_ID ||
    typeof notification.purchaseToken !== "string"
  ) {
    await rememberRtdnMessage(message.messageId, env);
    return jsonResponse({ received: true, ignored: true });
  }
  const tokenHash = await sha256Base64Url(notification.purchaseToken);
  const purchase = await env.DB.prepare(
    `SELECT purchase_token_hash, google_subject, product_id, purchase_state,
            purchase_token_ciphertext, purchase_token_iv, acknowledged,
            play_purchase_time, last_verified_at
     FROM purchases WHERE purchase_token_hash = ?1`,
  )
    .bind(tokenHash)
    .first<PurchaseRow>();
  if (!purchase) {
    await rememberRtdnMessage(message.messageId, env);
    return jsonResponse({ received: true, ignored: true });
  }
  const accountBinding = await createAccountBinding(purchase.google_subject, env);
  const verified = await verifyPlayPurchase(notification.purchaseToken, accountBinding, env);
  const now = new Date().toISOString();
  const state = verified.state;
  const encrypted = await encryptSecret(
    notification.purchaseToken,
    `play-purchase-v1:${tokenHash}`,
    env,
  );
  await env.DB.prepare(
    `UPDATE purchases SET purchase_state = ?1, purchase_token_ciphertext = ?2,
       purchase_token_iv = ?3, acknowledged = ?4, play_purchase_time = ?5,
       last_verified_at = ?6, updated_at = ?6 WHERE purchase_token_hash = ?7`,
  )
    .bind(
      state,
      encrypted.ciphertext,
      encrypted.iv,
      verified.acknowledged ? 1 : 0,
      verified.purchaseTime ?? null,
      now,
      tokenHash,
    )
    .run();
  await updateEntitlementFromPurchase(purchase.google_subject, tokenHash, state, env);
  await rememberRtdnMessage(message.messageId, env);
  return jsonResponse({ received: true, updated: true });
}

async function rememberRtdnMessage(messageId: string, env: Env): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO play_rtdn_messages (message_id, received_at) VALUES (?1, ?2)",
  )
    .bind(messageId, new Date().toISOString())
    .run();
}

async function reconcilePurchases(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT purchase_token_hash, google_subject, product_id, purchase_state,
            purchase_token_ciphertext, purchase_token_iv, acknowledged,
            play_purchase_time, last_verified_at
     FROM purchases WHERE purchase_state = 'PURCHASED'
     ORDER BY last_verified_at ASC LIMIT 100`,
  ).all<PurchaseRow>();

  for (const purchase of results) {
    try {
      const purchaseToken = await decryptSecret(
        purchase.purchase_token_ciphertext,
        purchase.purchase_token_iv,
        `play-purchase-v1:${purchase.purchase_token_hash}`,
        env,
      );
      await recordVerifiedPurchase(purchase.google_subject, purchaseToken, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "play_purchase_reconciliation_failed",
        purchaseTokenHashPrefix: purchase.purchase_token_hash.slice(0, 12),
        error: error instanceof Error ? error.message : "unknown",
      }));
    }
  }
}

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.startsWith("/api/") ? url.pathname.slice(4) : url.pathname;
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins(request, env).has(origin)) {
      throw new HttpError(403, "origin_not_allowed", "This app origin is not authorized.");
    }
    return new Response(null, { status: 204 });
  }
  if (request.method === "GET" && pathname === "/health") {
    return jsonResponse({ ok: true, service: "infinitecanvas-sync" });
  }
  if (request.method === "POST" && pathname === "/v1/auth/google/exchange") {
    return handleGoogleCodeExchange(request, env);
  }
  if (request.method === "POST" && pathname === "/v1/dev/test-session") {
    return handleLocalTestSession(request, env);
  }
  if (request.method === "POST" && pathname === "/v1/webhooks/google-play") {
    return handleGooglePlayNotification(request, env);
  }

  const session = await authenticate(request, env);
  if (request.method === "DELETE" && pathname === "/v1/auth/session") {
    const token = sessionTokenFromRequest(request)!;
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1")
      .bind(await sha256Base64Url(token))
      .run();
    const response = jsonResponse({ signedOut: true });
    response.headers.set("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return response;
  }
  if (request.method === "GET" && pathname === "/v1/account") return handleAccount(request, session, env);
  if (request.method === "POST" && pathname === "/v1/auth/session/renew") {
    const replacement = await createSession(session.google_subject, session.email, session.client_type, env);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256Base64Url(sessionTokenFromRequest(request)!)).run();
    return sessionResponse(request, session.email, replacement, session.client_type);
  }
  if (request.method === "GET" && pathname === "/v1/entitlements/cloud-sync") {
    return handleEntitlement(request, session, env);
  }
  if (request.method === "POST" && pathname === "/v1/billing/google-play/verify") {
    return handlePurchaseVerification(request, session, env);
  }

  if (pathname.startsWith("/v1/sync/")) {
    await requireActiveEntitlement(request, session, env);
    if (request.method === "POST" && pathname === "/v1/sync/migrate") {
      return handleLegacyMigration(session, env);
    }
    if (request.method === "GET" && pathname === "/v1/sync/drawings") {
      return handleDrawingList(session, env);
    }
    const pathMatch = /^\/v1\/sync\/drawings\/([^/]+)$/.exec(pathname);
    if (pathMatch) {
      let drawingId: string;
      try {
        drawingId = decodeURIComponent(pathMatch[1]);
      } catch {
        throw new HttpError(400, "invalid_drawing_id", "The drawing identifier is invalid.");
      }
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(drawingId)) {
        throw new HttpError(400, "invalid_drawing_id", "The drawing identifier is invalid.");
      }
      if (request.method === "GET") return handleDrawingDownload(drawingId, session, env);
      if (request.method === "PUT") return handleDrawingUpload(request, drawingId, session, env);
      if (request.method === "DELETE") return handleDrawingDelete(request, drawingId, session, env);
    }
  }
  throw new HttpError(404, "route_not_found", "The requested Cloud Sync route was not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    let response: Response;
    try {
      response = await routeRequest(request, env);
    } catch (error) {
      response = errorResponse(error);
    }
    return withCors(request, response, env);
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    context.waitUntil(reconcilePurchases(env));
  },
} satisfies ExportedHandler<Env>;
