import { fromBase64, sha256Base64Url, toArrayBuffer, toBase64Url } from "./crypto";
import { HttpError, readBoundedText } from "./http";

const encoder = new TextEncoder();

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readJsonRecord(response: Response, source: string): Promise<JsonRecord> {
  const text = await readBoundedText(response.body, 128 * 1024);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(502, "provider_invalid_response", `${source} returned malformed data.`);
  }
  if (!isRecord(value)) {
    throw new HttpError(502, "provider_invalid_response", `${source} returned an invalid response.`);
  }
  return value;
}

export type OAuthCodeGrant = {
  accessToken: string;
  refreshToken?: string;
};

export async function exchangeGoogleCode(
  code: string,
  clientType: "web" | "android",
  redirectUri: string | undefined,
  env: Env,
): Promise<OAuthCodeGrant> {
  const form = new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: clientType === "web" ? redirectUri ?? "" : "",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const payload = await readJsonRecord(response, "Google OAuth");
  const accessToken = payload.access_token;
  if (!response.ok || typeof accessToken !== "string") {
    throw new HttpError(401, "google_code_rejected", "Google did not accept the sign-in code.");
  }
  return {
    accessToken,
    ...(typeof payload.refresh_token === "string"
      ? { refreshToken: payload.refresh_token }
      : {}),
  };
}

export async function getGoogleProfile(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await readJsonRecord(response, "Google user info");
  if (
    !response.ok ||
    typeof profile.sub !== "string" ||
    typeof profile.email !== "string" ||
    profile.email_verified !== true
  ) {
    throw new HttpError(401, "google_account_unverified", "The Google account could not be verified.");
  }
  return { subject: profile.sub, email: profile.email };
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function serviceAccountFromEnv(env: Env): ServiceAccount {
  if (!env.PLAY_SERVICE_ACCOUNT_JSON) {
    throw new HttpError(503, "play_server_unconfigured", "Google Play verification is not configured on the sync service.");
  }
  let value: unknown;
  try {
    value = JSON.parse(env.PLAY_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new HttpError(503, "play_server_unconfigured", "Google Play verification is not configured.");
  }
  if (
    !isRecord(value) ||
    typeof value.client_email !== "string" ||
    typeof value.private_key !== "string"
  ) {
    throw new HttpError(503, "play_server_unconfigured", "Google Play verification credentials are invalid.");
  }
  return {
    client_email: value.client_email,
    private_key: value.private_key,
    token_uri: typeof value.token_uri === "string" ? value.token_uri : undefined,
  };
}

function decodePemKey(pem: string): Uint8Array {
  const encoded = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  return fromBase64(encoded);
}

export async function getGoogleServiceAccessToken(
  scope: string,
  env: Env,
): Promise<string> {
  const serviceAccount = serviceAccountFromEnv(env);
  const tokenUri = serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsignedToken = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(decodePemKey(serviceAccount.private_key)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(encoder.encode(unsignedToken)),
  );
  const assertion = `${unsignedToken}.${toBase64Url(new Uint8Array(signature))}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenPayload = await readJsonRecord(response, "Google service account");
  if (!response.ok || typeof tokenPayload.access_token !== "string") {
    throw new HttpError(503, "google_service_auth_failed", "Google service authorization failed.");
  }
  return tokenPayload.access_token;
}

export type PlayPurchaseState = "PURCHASED" | "PENDING" | "CANCELED" | "INVALID";

export type VerifiedPlayPurchase = {
  state: PlayPurchaseState;
  acknowledged: boolean;
  purchaseTime?: string;
  obfuscatedAccountId?: string;
};

export async function verifyPlayPurchase(
  purchaseToken: string,
  expectedAccountBinding: string,
  env: Env,
  options: { requireAccountBinding?: boolean } = {},
): Promise<VerifiedPlayPurchase> {
  const accessToken = await getGoogleServiceAccessToken(
    "https://www.googleapis.com/auth/androidpublisher",
    env,
  );
  const endpoint = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.APP_PACKAGE_NAME)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404 || response.status === 410) {
    return { state: "INVALID", acknowledged: false };
  }
  const purchase = await readJsonRecord(response, "Google Play");
  if (!response.ok) {
    throw new HttpError(503, "play_verification_failed", "Google Play could not verify the purchase right now.");
  }

  const lineItems = Array.isArray(purchase.productLineItem) ? purchase.productLineItem : [];
  const hasExpectedProduct = lineItems.some(
    (item) => isRecord(item) && item.productId === env.CLOUD_SYNC_PRODUCT_ID,
  );
  if (!hasExpectedProduct) {
    return { state: "INVALID", acknowledged: false };
  }

  const stateContext = isRecord(purchase.purchaseStateContext)
    ? purchase.purchaseStateContext
    : {};
  const rawState = stateContext.purchaseState;
  const state: PlayPurchaseState =
    rawState === "PURCHASED"
      ? "PURCHASED"
      : rawState === "PENDING"
        ? "PENDING"
        : rawState === "CANCELLED"
          ? "CANCELED"
          : "INVALID";
  const identifiers = isRecord(purchase.externalAccountIdentifiers)
    ? purchase.externalAccountIdentifiers
    : {};
  const obfuscatedAccountId =
    typeof purchase.obfuscatedExternalAccountId === "string"
      ? purchase.obfuscatedExternalAccountId
      : typeof identifiers.obfuscatedExternalAccountId === "string"
        ? identifiers.obfuscatedExternalAccountId
        : undefined;
  if (
    (options.requireAccountBinding && !obfuscatedAccountId) ||
    (obfuscatedAccountId && obfuscatedAccountId !== expectedAccountBinding)
  ) {
    throw new HttpError(409, "purchase_account_mismatch", "This Google Play purchase is linked to another account.");
  }
  return {
    state,
    acknowledged:
      purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    ...(typeof purchase.purchaseCompletionTime === "string"
      ? { purchaseTime: purchase.purchaseCompletionTime }
      : {}),
    ...(obfuscatedAccountId ? { obfuscatedAccountId } : {}),
  };
}

export async function acknowledgePlayPurchase(
  purchaseToken: string,
  env: Env,
): Promise<void> {
  const accessToken = await getGoogleServiceAccessToken(
    "https://www.googleapis.com/auth/androidpublisher",
    env,
  );
  const endpoint = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.APP_PACKAGE_NAME)}/purchases/products/${encodeURIComponent(env.CLOUD_SYNC_PRODUCT_ID)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    throw new HttpError(503, "play_acknowledgement_failed", "Google Play could not acknowledge the purchase.");
  }
}

export async function decodePlayIntegrityToken(
  token: string,
  expectedRequestHash: string,
  env: Env,
): Promise<void> {
  const accessToken = await getGoogleServiceAccessToken(
    "https://www.googleapis.com/auth/playintegrity",
    env,
  );
  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(env.APP_PACKAGE_NAME)}:decodeIntegrityToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ integrityToken: token }),
    },
  );
  const payload = await readJsonRecord(response, "Play Integrity");
  console.log("[PlayIntegrity API status]", response.status, JSON.stringify(payload));
  if (!response.ok || !isRecord(payload.tokenPayloadExternal)) {
    console.error("[PlayIntegrity API failed]", response.status, JSON.stringify(payload));
    throw new HttpError(403, "integrity_token_invalid", "Google Play could not validate this app request.");
  }
  const verdict = payload.tokenPayloadExternal;
  const requestDetails = isRecord(verdict.requestDetails) ? verdict.requestDetails : {};
  const appIntegrity = isRecord(verdict.appIntegrity) ? verdict.appIntegrity : {};
  const deviceIntegrity = isRecord(verdict.deviceIntegrity) ? verdict.deviceIntegrity : {};
  const requestTime = Number(requestDetails.timestampMillis);
  const age = Date.now() - requestTime;
  const deviceVerdicts = Array.isArray(deviceIntegrity.deviceRecognitionVerdict)
    ? deviceIntegrity.deviceRecognitionVerdict
    : [];
  const isStaging = Boolean(
    (env.ALLOWED_WEB_ORIGINS ?? "").includes("staging") ||
    (env.LOCAL_DEV_MODE as string) === "true",
  );
  const deviceMeetsIntegrity =
    deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY") || isStaging;
  const appMeetsIntegrity =
    appIntegrity.appRecognitionVerdict === "PLAY_RECOGNIZED" || isStaging;
  if (
    requestDetails.requestPackageName !== env.APP_PACKAGE_NAME ||
    requestDetails.requestHash !== expectedRequestHash ||
    !Number.isFinite(requestTime) ||
    age < -60_000 ||
    age > 5 * 60_000 ||
    !appMeetsIntegrity ||
    !deviceMeetsIntegrity
  ) {
    console.error("[PlayIntegrity verdict rejected]", JSON.stringify({
      requestPackage: requestDetails.requestPackageName,
      expectedPackage: env.APP_PACKAGE_NAME,
      requestHash: requestDetails.requestHash,
      expectedHash: expectedRequestHash,
      requestTime,
      age,
      appVerdict: appIntegrity.appRecognitionVerdict,
      deviceVerdicts,
      isStaging
    }));
    throw new HttpError(403, "integrity_verdict_rejected", "This request did not pass app integrity checks.");
  }
}

export async function expectedRequestHash(
  method: string,
  pathnameAndSearch: string,
  bodyText: string,
): Promise<string> {
  return sha256Base64Url(`${method.toUpperCase()}\n${pathnameAndSearch}\n${bodyText}`);
}
