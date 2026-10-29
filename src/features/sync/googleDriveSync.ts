import { withDeadline } from "./withDeadline";
import * as SecureStore from "expo-secure-store";
import type { SignInSuccessResponse } from "@react-native-google-signin/google-signin";
import { NativeModules, Platform } from "react-native";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import {
  CanvasDocument,
  isCanvasDocument,
} from "../canvas/document";

export type GoogleDriveSyncConfig = {
  clientId?: string;
  apiUrl?: string;
};

export type SyncState =
  | { status: "signed-out" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; email?: string }
  | { status: "syncing" }
  | { status: "error"; message: string; code?: string; diagnostic?: CloudSyncDiagnostic };

export type CloudSyncDiagnostic = {
  stage: string;
  code: string;
  status?: number;
};

export type SyncFile = {
  id: string;
  documentId: string;
  name: string;
  headRevisionId?: string;
  modifiedTime?: string;
  migrated: boolean;
};

export type CloudSyncEntitlement = {
  active: boolean | null;
  status: string;
  accountBinding: string;
};

export type CloudSyncAccount = { email: string; accountBinding: string; entitlement: CloudSyncEntitlement; drive: "ready" | "reauthorization-required" | "unavailable" };
type GoogleCodeResponse = {
  code?: string;
  error?: string;
  error_description?: string;
};

type GoogleIdentityServicesError = {
  type?: string;
  message?: string;
};

type GoogleCodeClient = {
  requestCode: () => void;
};

type NativeGoogleSignInModule =
  typeof import("@react-native-google-signin/google-signin");
type NativeGoogleSignInSuccess = SignInSuccessResponse;

type NativeIntegrityModule = {
  requestIntegrityToken: (
    canonicalRequest: string,
    cloudProjectNumber: string,
  ) => Promise<string>;
};

type ServiceSession = {
  token: string;
  expiresAt: string;
  email: string;
  accountBinding: string;
  entitlement?: {
    active: boolean | null;
    status: string;
  };
};

type ApiErrorPayload = {
  error?: { code?: string; message?: string };
};

// Keep diagnostics useful without logging authorization codes, tokens, headers,
// request bodies, or server response bodies.
function debugErrorDetails(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: typeof error, message: "A non-Error value was thrown." };
}

function logCloudSyncDiagnostic(diagnostic: CloudSyncDiagnostic, error?: unknown): CloudSyncDiagnostic {
  console.warn("[CloudSync]", {
    ...diagnostic,
    ...(error === undefined ? {} : { originalError: debugErrorDetails(error) }),
  });
  return diagnostic;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initCodeClient: (options: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            callback: (response: GoogleCodeResponse) => void;
            error_callback?: (error: GoogleIdentityServicesError) => void;
          }) => GoogleCodeClient;
        };
      };
    };
  }
}

const SESSION_STORAGE_KEY = "infinite_canvas_cloud_sync_session_v1";
const ENTITLEMENT_CACHE_PREFIX = "infinite-canvas:entitlement:";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const LEGACY_APP_DATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GOOGLE_IDENTITY_SCOPE = "openid email profile";
const GOOGLE_SCOPES = `${GOOGLE_IDENTITY_SCOPE} ${DRIVE_FILE_SCOPE} ${LEGACY_APP_DATA_SCOPE}`;
const GIS_SCRIPT_ID = "google-identity-services";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export class CloudSyncApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly diagnostic?: CloudSyncDiagnostic,
  ) {
    super(message);
    this.name = "CloudSyncApiError";
  }
}

const loadGoogleIdentityServices = () =>
  new Promise<void>((resolve, reject) => {
    if (Platform.OS !== "web") {
      reject(new Error("Google sign-in is not available in this runtime."));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existingScript = document.getElementById(GIS_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Could not load Google Identity Services.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Identity Services."));
    document.head.appendChild(script);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class GoogleDriveSync {
  private session: ServiceSession | null = null;
  private state: SyncState = { status: "signed-out" };
  private nativeConfigured = false;
  private verifiedDriveReady = false;
  private sessionGeneration = 0;
  private activeRequests = new Set<AbortController>();
  private expectedAccountBinding?: string;

  constructor(private readonly config: GoogleDriveSyncConfig = {}) {}

  getState(): SyncState {
    if (!this.config.apiUrl || !this.config.clientId) {
      return {
        status: "unavailable",
        reason: "Cloud Sync is not configured in this build.",
      };
    }
    return this.state;
  }

  isReady(): boolean {
    return Boolean(this.session);
  }

  isDriveReady(): boolean {
    return this.isReady() && this.verifiedDriveReady;
  }

  prepareWebSignIn(): void {
    if (Platform.OS === "web" && this.config.clientId) {
      void loadGoogleIdentityServices().catch(() => undefined);
    }
  }

  async signIn(options: { prompt?: "" | "consent"; reauthorize?: boolean; expectedAccountBinding?: string } = {}): Promise<SyncState> {
    this.expectedAccountBinding = options.expectedAccountBinding;
    const prompt = options.prompt ?? "consent";
    if (!this.config.apiUrl || !this.config.clientId) {
      this.state = {
        status: "unavailable",
        reason: "Cloud Sync is not configured in this build.",
      };
      return this.state;
    }

    if (!options.reauthorize && await this.restoreSession()) {
      try {
        await this.getEntitlement();
        this.state = { status: "ready", email: this.session?.email };
        return this.state;
      } catch (error) {
        if (!(error instanceof CloudSyncApiError) || error.status !== 401) {
          this.state = {
            status: "error",
            code: error instanceof CloudSyncApiError ? error.code : undefined,
            message: error instanceof Error ? error.message : "Cloud Sync sign-in failed.",
          };
          return this.state;
        }
        await this.clearLocalSession();
      }
    }

    if (prompt === "" && Platform.OS === "web") {
      this.state = { status: "signed-out" };
      return this.state;
    }
    return Platform.OS === "web"
      ? this.signInWeb()
      : withDeadline(this.signInNative({ silent: prompt === "" }), 300_000);
  }

  async signOut(): Promise<void> {
    if (Platform.OS === "web") window.localStorage.setItem("infinite-canvas:signed-out", "true");
    this.sessionGeneration += 1;
    for (const controller of this.activeRequests) controller.abort();
    const session = this.session;
    if (session) {
      await this.requestJson("DELETE", "/v1/auth/session", undefined, {
        authenticated: true,
        tolerateUnauthorized: true,
      }).catch(() => undefined);
    }
    await this.clearLocalSession();
    this.state = { status: "signed-out" };
  }

  cancelPendingRequests(): void { this.sessionGeneration += 1; for (const controller of this.activeRequests) controller.abort(); }
  async getCachedEntitlement(accountBinding: string): Promise<CloudSyncEntitlement | null> {
    try {
      return await jsonStorage.get<CloudSyncEntitlement>(`${ENTITLEMENT_CACHE_PREFIX}${accountBinding}`);
    } catch {
      return null;
    }
  }

  async setCachedEntitlement(accountBinding: string, entitlement: CloudSyncEntitlement): Promise<void> {
    try {
      await jsonStorage.set(`${ENTITLEMENT_CACHE_PREFIX}${accountBinding}`, entitlement);
    } catch {
      // Ignore cache storage errors
    }
  }

  async restoreAccount(): Promise<CloudSyncAccount | null> {
    if (!await this.restoreSession()) return null;
    try {
      return await this.getAccount();
    } catch (error) {
      if (this.session && !(error instanceof CloudSyncApiError && (error.code === "session_expired" || error.code === "session_required" || error.status === 401))) {
        const cached = await this.getCachedEntitlement(this.session.accountBinding);
        const active = cached?.active ?? this.session.entitlement?.active ?? null;
        const status = cached?.status ?? this.session.entitlement?.status ?? "unknown";
        return {
          email: this.session.email,
          accountBinding: this.session.accountBinding,
          entitlement: {
            active,
            status,
            accountBinding: this.session.accountBinding,
          },
          drive: this.verifiedDriveReady ? "ready" : "unavailable",
        };
      }
      throw error;
    }
  }
  getAccountBindingIfKnown(): string | undefined { return this.session?.accountBinding; }
  async getAccount(): Promise<CloudSyncAccount> {
    const result = await this.requestJson("GET", "/v1/account");
    if (!isRecord(result) || typeof result.email !== "string" || typeof result.accountBinding !== "string" ||
        !isRecord(result.entitlement) || (typeof result.entitlement.active !== "boolean" && result.entitlement.active !== null) || typeof result.entitlement.status !== "string" ||
        !["ready", "reauthorization-required", "unavailable"].includes(String(result.drive))) throw new Error("Invalid account response.");
    const active = result.entitlement.active;
    const status = result.entitlement.status;
    const entitlement: CloudSyncEntitlement = {
      active,
      status,
      accountBinding: result.accountBinding,
    };
    if (typeof active === "boolean") {
      await this.setCachedEntitlement(result.accountBinding, entitlement);
    }
    this.session = {
      token: this.session?.token ?? "cookie",
      expiresAt: this.session?.expiresAt ?? new Date(Date.now() + 86400000).toISOString(),
      email: result.email,
      accountBinding: result.accountBinding,
      entitlement: { active, status },
    };
    this.verifiedDriveReady = result.drive === "ready";
    this.state = {status: "ready", email: result.email};
    await this.persistSession();
    return {
      email: result.email,
      accountBinding: result.accountBinding,
      entitlement,
      drive: result.drive as CloudSyncAccount["drive"],
    };
  }
  async renewSession(): Promise<void> {
    const result = await this.requestJson("POST", "/v1/auth/session/renew", {});
    if (!isRecord(result) || typeof result.email !== "string" || typeof result.accountBinding !== "string" || typeof result.expiresAt !== "string" ||
      (Platform.OS !== "web" && typeof result.sessionToken !== "string")) throw new Error("Invalid session response.");
    this.session = {token: Platform.OS === "web" ? "cookie" : result.sessionToken as string, email: result.email, accountBinding: result.accountBinding, expiresAt: result.expiresAt};
    await this.persistSession();
  }
  async getEntitlement(): Promise<CloudSyncEntitlement> {
    const result = await this.requestJson("GET", "/v1/entitlements/cloud-sync");
    if (
      !isRecord(result) ||
      typeof result.active !== "boolean" ||
      typeof result.status !== "string" ||
      typeof result.accountBinding !== "string"
    ) {
      throw new Error("Cloud Sync returned an invalid entitlement response.");
    }
    const entitlement: CloudSyncEntitlement = {
      active: result.active,
      status: result.status,
      accountBinding: result.accountBinding,
    };
    if (typeof result.active === "boolean") {
      await this.setCachedEntitlement(result.accountBinding, entitlement);
    }
    if (this.session) {
      this.session = {
        ...this.session,
        accountBinding: result.accountBinding,
        entitlement: { active: result.active, status: result.status },
      };
      await this.persistSession();
    }
    return entitlement;
  }

  async verifyPurchase(purchaseToken: string): Promise<CloudSyncEntitlement> {
    const result = await this.requestJson("POST", "/v1/billing/google-play/verify", {
      purchaseToken,
    });
    if (
      !isRecord(result) ||
      typeof result.active !== "boolean" ||
      typeof result.status !== "string" ||
      typeof result.accountBinding !== "string"
    ) {
      throw new Error("Cloud Sync returned an invalid purchase response.");
    }
    const entitlement: CloudSyncEntitlement = {
      active: result.active,
      status: result.status,
      accountBinding: result.accountBinding,
    };
    if (typeof result.active === "boolean") {
      await this.setCachedEntitlement(result.accountBinding, entitlement);
    }
    if (this.session) {
      this.session = {
        ...this.session,
        accountBinding: result.accountBinding,
        entitlement: { active: result.active, status: result.status },
      };
      await this.persistSession();
    }
    return entitlement;
  }

  async getAccountBinding(): Promise<string> {
    return (await this.getEntitlement()).accountBinding;
  }

  async migrateLegacyDocuments(): Promise<{
    completed: boolean;
    copied: number;
    rejected: number;
    files: SyncFile[];
  }> {
    const result = await this.requestJson("POST", "/v1/sync/migrate", {});
    if (
      !isRecord(result) ||
      typeof result.completed !== "boolean" ||
      typeof result.copied !== "number" ||
      typeof result.rejected !== "number" ||
      !Array.isArray(result.files)
    ) {
      throw new Error("Cloud Sync returned an invalid migration response.");
    }
    return {
      completed: result.completed,
      copied: result.copied,
      rejected: result.rejected,
      files: result.files.filter(isSyncFile),
    };
  }

  async listDocuments(): Promise<SyncFile[]> {
    const result = await this.requestJson("GET", "/v1/sync/drawings");
    if (!isRecord(result) || !Array.isArray(result.files)) {
      throw new Error("Cloud Sync returned an invalid drawing list.");
    }
    return result.files.filter(isSyncFile);
  }

  async uploadDocument(
    document: CanvasDocument,
    options: { force?: boolean; observedRevision?: string } = {},
  ): Promise<CanvasDocument> {
    const cloudDocument = withoutLocalTransportMetadata(document);
    if (!isCanvasDocument(cloudDocument, { allowLocalImageUris: false })) {
      throw new CloudSyncApiError(
        "This drawing has data that cannot be safely synced. Remove local-only images and try again.",
        "invalid_local_document",
        422,
      );
    }
    const result = await this.requestJson(
      "PUT",
      `/v1/sync/drawings/${encodeURIComponent(document.metadata.id)}`,
      {
        document: cloudDocument,
        baseRevisionId: document.metadata.driveRevisionId,
        ...(options.force ? { force: true, observedRevision: options.observedRevision } : {}),
      },
    );
    if (!isRecord(result) || !isCanvasDocument(result.document, { allowLocalImageUris: false })) {
      throw new Error("Cloud Sync returned an invalid saved drawing.");
    }
    return result.document;
  }

  async downloadDocument(drawingId: string): Promise<CanvasDocument> {
    const result = await this.requestJson(
      "GET",
      `/v1/sync/drawings/${encodeURIComponent(drawingId)}`,
    );
    if (!isRecord(result) || !isCanvasDocument(result.document, { allowLocalImageUris: false })) {
      throw new CloudSyncApiError(
        "The Drive drawing is invalid. The local copy was left unchanged.",
        "remote_document_invalid",
        422,
      );
    }
    return result.document;
  }

  async deleteDocument(drawingId: string, baseRevisionId?: string): Promise<void> {
    await this.requestJson(
      "DELETE",
      `/v1/sync/drawings/${encodeURIComponent(drawingId)}`,
      { baseRevisionId },
    );
  }

  private async signInWeb(): Promise<SyncState> {
    const loginGeneration = this.sessionGeneration;
    try {
      await loadGoogleIdentityServices();
      const nextState = await new Promise<SyncState>((resolve) => {
        let settled = false;
        const finish = (state: SyncState) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(state);
        };
        const timeoutId = window.setTimeout(() => {
          finish({
            status: "error",
            code: "popup_closed",
            message: "Google sign-in was not completed. Allow popups for this site and try again.",
          });
        }, 300_000);
        const codeClient = window.google?.accounts?.oauth2?.initCodeClient({
          client_id: this.config.clientId!,
          scope: GOOGLE_SCOPES,
          ux_mode: "popup",
          ...(this.session?.email ? { hint: this.session.email, select_account: false } : {}),
          callback: (response) => {
            if (settled) return;
            if (response.error || !response.code) {
              finish({
                status: "error",
                code: response.error ?? "missing_code",
                message: response.error_description ?? "Google sign-in was not completed.",
              });
              return;
            }
            void this.exchangeAuthorizationCode(response.code, "web", loginGeneration)
              .then((session) => finish({ status: "ready", email: session.email }))
              .catch((error: unknown) =>
                finish({
                  status: "error",
                  code: error instanceof CloudSyncApiError ? error.code : undefined,
                  message: error instanceof Error ? error.message : "Google sign-in failed.",
                }),
              );
          },
          error_callback: (error) =>
            finish({
              status: "error",
              code: error.type ?? "google_sign_in_failed",
              message: error.message ?? "Google sign-in was not completed.",
            }),
        });

        if (!codeClient) {
          finish({
            status: "error",
            code: "gis_unavailable",
            message: "Google Identity Services is not available.",
          });
          return;
        }
        try {
          codeClient.requestCode();
        } catch {
          finish({
            status: "error",
            code: "popup_blocked",
            message: "The browser blocked the Google sign-in popup. Allow popups and try again.",
          });
        }
      });
      this.state = nextState;
      return nextState;
    } catch (error) {
      this.state = {
        status: "error",
        message: error instanceof Error ? error.message : "Google sign-in failed.",
      };
      return this.state;
    }
  }

  private async signInNative({ silent }: { silent: boolean }): Promise<SyncState> {
    const loginGeneration = this.sessionGeneration;
    let stage = "load_native_module";
    try {
      const native = await this.loadNativeGoogleSignIn();
      const {
        GoogleSignin,
      } = native;
      this.configureNativeGoogleSignIn(GoogleSignin);
      stage = "check_play_services";
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      if (silent && !GoogleSignin.hasPreviousSignIn()) {
        this.state = { status: "signed-out" };
        return this.state;
      }
      let response: NativeGoogleSignInSuccess;
      if (silent) {
        stage = "google_sign_in_silent";
        const silentResponse = await GoogleSignin.signInSilently();
        if (silentResponse.type === "noSavedCredentialFound") {
          this.state = { status: "signed-out" };
          return this.state;
        }
        if (silentResponse.type !== "success" || !silentResponse.data) {
          this.state = { status: "signed-out" };
          return this.state;
        }
        response = silentResponse;
      } else {
        stage = "google_sign_in";
        const signInResponse = await GoogleSignin.signIn();
        if (signInResponse.type === "cancelled") {
          const diagnostic = logCloudSyncDiagnostic({ stage, code: "google_sign_in_cancelled" });
          this.state = {
            status: "error",
            code: "google_sign_in_cancelled",
            message: "Google sign-in was closed before it finished.",
            diagnostic,
          };
          return this.state;
        }
        if (signInResponse.type !== "success" || !signInResponse.data) {
          this.state = {
            status: "error",
            code: "google_sign_in_failed",
            message: "Google sign-in was not completed.",
          };
          return this.state;
        }
        response = signInResponse;
      }
      if (!response.data) {
        this.state = {
          status: "error",
          code: "google_sign_in_failed",
          message: "Google sign-in was not completed.",
        };
        return this.state;
      }

      const driveScopes = [DRIVE_FILE_SCOPE, LEGACY_APP_DATA_SCOPE];
      if (!driveScopes.every((scope) => response.data.scopes.includes(scope))) {
        stage = "request_drive_scopes";
        const scopeResponse = await GoogleSignin.addScopes({
          scopes: driveScopes,
        });
        if (!scopeResponse || scopeResponse.type !== "success" || !scopeResponse.data) {
          const diagnostic = logCloudSyncDiagnostic({ stage, code: "missing_drive_scope" });
          this.state = {
            status: "error",
            code: "missing_drive_scope",
            message: "Google Drive permission was not granted.",
            diagnostic,
          };
          return this.state;
        }
        response = scopeResponse;
      }
      const serverAuthCode = response.data.serverAuthCode;
      if (!serverAuthCode) {
        const diagnostic = logCloudSyncDiagnostic({ stage: "read_server_auth_code", code: "missing_server_auth_code" });
        this.state = {
          status: "error",
          code: "missing_server_auth_code",
          message: "Google did not return a secure sign-in code. Reconnect and try again.",
          diagnostic,
        };
        return this.state;
      }
      stage = "exchange_authorization_code";
      const session = await this.exchangeAuthorizationCode(serverAuthCode, "android", loginGeneration);
      this.state = { status: "ready", email: session.email };
      return this.state;
    } catch (error) {
      const native = await this.loadNativeGoogleSignIn().catch(() => null);
      if (native?.isErrorWithCode(error)) {
        const { statusCodes } = native;
        const diagnostic = logCloudSyncDiagnostic({ stage, code: error.code }, error);
        this.state = {
          status: "error",
          code: error.code,
          diagnostic,
          message:
            error.code === "DEVELOPER_ERROR"
              ? "Google sign-in is misconfigured for this Android build. Check OAuth IDs, package name, and signing fingerprints."
              : error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
                ? "Google Play Services is missing or out of date on this device."
                : error.code === statusCodes.SIGN_IN_CANCELLED
                  ? "Google sign-in was closed before it finished."
                  : error.message,
        };
        return this.state;
      }
      const diagnostic = logCloudSyncDiagnostic({
        stage,
        code: error instanceof CloudSyncApiError
          ? error.code
          : error instanceof Error
            ? error.name
            : "unknown_error",
        ...(error instanceof CloudSyncApiError ? { status: error.status } : {}),
      }, error);
      this.state = {
        status: "error",
        code: error instanceof CloudSyncApiError ? error.code : undefined,
        message: error instanceof Error ? error.message : "Google sign-in failed.",
        diagnostic,
      };
      return this.state;
    }
  }

  private async exchangeAuthorizationCode(
    code: string,
    clientType: "web" | "android",
    loginGeneration = this.sessionGeneration,
  ): Promise<ServiceSession> {
    if (loginGeneration !== this.sessionGeneration) throw new CloudSyncApiError("Sign-in canceled.", "account_changed", 409);
    const redirectUri = clientType === "web" ? window.location.origin : undefined;
    const result = await this.requestJson(
      "POST",
      "/v1/auth/google/exchange",
      {
        code,
        clientType,
        ...(redirectUri ? { redirectUri } : {}),
        ...(this.expectedAccountBinding ? { expectedAccountBinding: this.expectedAccountBinding } : {}),
      },
      {
        authenticated: false,
        requestedWith: clientType === "web",
        clientType,
      },
    );
    if (
      !isRecord(result) ||
      (Platform.OS !== "web" && typeof result.sessionToken !== "string") ||
      typeof result.expiresAt !== "string" ||
      typeof result.email !== "string" ||
      typeof result.accountBinding !== "string"
    ) {
      throw new Error("Cloud Sync returned an invalid sign-in session.");
    }
    const session: ServiceSession = {
      token: Platform.OS === "web" ? "cookie" : result.sessionToken as string,
      expiresAt: result.expiresAt,
      email: result.email,
      accountBinding: result.accountBinding,
    };
    this.session = session;
    if (Platform.OS === "web") window.localStorage.removeItem("infinite-canvas:signed-out");
    await this.persistSession();
    return session;
  }

  private async restoreSession(): Promise<boolean> {
    if (Platform.OS === "web" && window.localStorage.getItem("infinite-canvas:signed-out") === "true") return false;
    if (this.session) return true;
    if (Platform.OS === "web") {
      try { await this.getAccount(); return true; }
      catch (error) {
        if (error instanceof CloudSyncApiError && error.status === 401) return false;
        throw error;
      }
    }
    try {
      const stored = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
      if (!stored) return false;
      const parsed: unknown = JSON.parse(stored);
      if (
        !isRecord(parsed) ||
        typeof parsed.token !== "string" ||
        typeof parsed.expiresAt !== "string" ||
        typeof parsed.email !== "string" ||
        typeof parsed.accountBinding !== "string" ||
        !Number.isFinite(Date.parse(parsed.expiresAt)) ||
        Date.parse(parsed.expiresAt) <= Date.now()
      ) {
        await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
        return false;
      }
      this.session = {
        token: parsed.token,
        expiresAt: parsed.expiresAt,
        email: parsed.email,
        accountBinding: parsed.accountBinding,
        entitlement: isRecord(parsed.entitlement) && typeof parsed.entitlement.status === "string"
          ? {
              active: typeof parsed.entitlement.active === "boolean" ? parsed.entitlement.active : null,
              status: parsed.entitlement.status,
            }
          : undefined,
      };
      this.state = { status: "ready", email: parsed.email };
      return true;
    } catch {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY).catch(() => undefined);
      return false;
    }
  }

  private async persistSession(): Promise<void> {
    if (!this.session) return;
    if (Platform.OS === "web") return;
    else await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(this.session));
  }

  private async clearLocalSession(): Promise<void> {
    this.session = null;
    this.verifiedDriveReady = false;
    if (Platform.OS === "web") window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    else await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY).catch(() => undefined);
  }

  private async loadNativeGoogleSignIn(): Promise<NativeGoogleSignInModule> {
    // Keep native dependencies in Metro's main bundle, but only evaluate them
    // when native sign-in is requested (never while starting the web app).
    return require("@react-native-google-signin/google-signin") as NativeGoogleSignInModule;
  }

  private configureNativeGoogleSignIn(
    GoogleSignin: NativeGoogleSignInModule["GoogleSignin"],
  ) {
    if (this.nativeConfigured) return;
    GoogleSignin.configure({
      webClientId: this.config.clientId,
      scopes: [DRIVE_FILE_SCOPE, LEGACY_APP_DATA_SCOPE],
      offlineAccess: true,
    });
    this.nativeConfigured = true;
  }

  private async requestJson(
    method: string,
    path: string,
    body?: unknown,
    options: {
      authenticated?: boolean;
      tolerateUnauthorized?: boolean;
      requestedWith?: boolean;
      clientType?: "web" | "android";
    } = {},
  ): Promise<unknown> {
    const generation = this.sessionGeneration;
    const apiUrl = this.config.apiUrl;
    if (!apiUrl) throw new Error("Cloud Sync is not configured in this build.");
    const url = new URL(`${apiUrl.replace(/\/$/, "")}${path}`);
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options.authenticated !== false) {
      if (Platform.OS !== "web" && !this.session?.token && !(await this.restoreSession())) {
        throw new CloudSyncApiError("Sign in to Google Drive before syncing drawings.", "session_required", 401);
      }
      if (this.session && Platform.OS !== "web") headers.Authorization = `Bearer ${this.session.token}`;
    }
    if (Platform.OS === "web") {
      headers["X-Requested-With"] = "XmlHttpRequest";
    } else {
      const clientType = options.clientType ?? "android";
      headers["X-Client-Platform"] = clientType;
      if (!(__DEV__ && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))) {
        const integrityModule = NativeModules.InfiniteCanvasPlayIntegrity as
          | NativeIntegrityModule
          | undefined;
        const cloudProjectNumber = process.env.EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
        if (!integrityModule || !cloudProjectNumber) {
          throw new CloudSyncApiError(
            "Play Integrity is not configured in this Android build.",
            "integrity_not_configured",
            503,
          );
        }
        const canonicalRequest = `${method.toUpperCase()}\n${url.pathname}${url.search}\n${bodyText}`;
        headers["X-Play-Integrity-Token"] = await withDeadline(integrityModule.requestIntegrityToken(
          canonicalRequest,
          cloudProjectNumber,
        ));
      }
    }
    if (generation !== this.sessionGeneration) throw new CloudSyncApiError("The account changed.", "account_changed", 409);
    const controller = new AbortController();
    this.activeRequests.add(controller);
    const requestStartedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    let responseText: string;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        credentials: Platform.OS === "web" ? "include" : "omit",
        method,
        headers,
        ...(body === undefined ? {} : { body: bodyText }),
      });
      responseText = await response.text();
    } catch (error) {
      if (generation !== this.sessionGeneration) {
        throw new CloudSyncApiError("The account changed.", "account_changed", 409);
      }
      if (__DEV__) {
        console.error("[CloudSync HTTP] Transport failure", {
          method,
          url: `${url.origin}${url.pathname}`,
          elapsedMs: Date.now() - requestStartedAt,
          timedOut: controller.signal.aborted,
          originalError: debugErrorDetails(error),
        });
      }
      const wrappedError = new CloudSyncApiError(
        "The sync service could not be reached.",
        controller.signal.aborted ? "request_timeout" : "network_unavailable",
        503,
      );
      // Preserve the original error for callers that can inspect its cause.
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    } finally {
      clearTimeout(timeout);
      this.activeRequests.delete(controller);
    }
    if (generation !== this.sessionGeneration) throw new CloudSyncApiError("The account changed during this request.", "account_changed", 409);
    let payload: unknown = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch (error) {
        if (__DEV__) {
          console.error("[CloudSync HTTP] Invalid JSON response", {
            method,
            url: `${url.origin}${url.pathname}`,
            status: response.status,
            elapsedMs: Date.now() - requestStartedAt,
            originalError: debugErrorDetails(error),
          });
        }
        throw new Error("Cloud Sync returned an invalid response.");
      }
    }
    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error)
        ? (payload as ApiErrorPayload).error
        : undefined;
      const code = typeof error?.code === "string" ? error.code : "request_failed";
      const message = typeof error?.message === "string"
        ? error.message
        : "Cloud Sync could not complete the request.";
      if (__DEV__) {
        const expectedSignedOut = response.status === 401 &&
          ["session_required", "session_expired"].includes(code);
        const diagnostic = {
          method,
          url: `${url.origin}${url.pathname}`,
          status: response.status,
          code,
          elapsedMs: Date.now() - requestStartedAt,
        };
        if (expectedSignedOut) console.info("[CloudSync HTTP] Authentication required", diagnostic);
        else console.warn("[CloudSync HTTP] API rejected request", diagnostic);
      }
      if (response.status === 401 && ["session_required", "session_expired"].includes(code) && !options.tolerateUnauthorized) {
        await this.clearLocalSession();
        this.state = { status: "signed-out" };
      }
      throw new CloudSyncApiError(message, code, response.status);
    }
    return payload;
  }
}

function isSyncFile(value: unknown): value is SyncFile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    typeof value.name === "string" &&
    typeof value.migrated === "boolean" &&
    (value.headRevisionId === undefined || typeof value.headRevisionId === "string") &&
    (value.modifiedTime === undefined || typeof value.modifiedTime === "string")
  );
}

function withoutLocalTransportMetadata(document: CanvasDocument): CanvasDocument {
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

const sortJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonKeys(value[key])]),
  );
};

export function cloudDocumentsMatch(localDocument: CanvasDocument, cloudDocument: CanvasDocument): boolean {
  const content = (document: CanvasDocument) => {
    const normalized = withoutLocalTransportMetadata(document);
    // Viewport is a device-local viewing preference, not drawing content.
    return { ...normalized, viewport: undefined, metadata: { ...normalized.metadata, updatedAt: undefined } };
  };
  return JSON.stringify(sortJsonKeys(content(localDocument))) === JSON.stringify(sortJsonKeys(content(cloudDocument)));
}

export const googleDriveSync = new GoogleDriveSync({
  clientId:
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
      : undefined,
  apiUrl:
    typeof process !== "undefined"
      ? Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/api`
        : process.env.EXPO_PUBLIC_CLOUD_SYNC_API_URL
      : undefined,

});
