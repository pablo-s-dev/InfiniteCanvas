import { Platform } from "react-native";
import { CanvasDocument } from "../canvas/document";

export type GoogleDriveSyncConfig = {
  clientId?: string;
  appFolder?: "appDataFolder";
};

export type SyncState =
  | { status: "signed-out" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; email?: string }
  | { status: "syncing" }
  | { status: "error"; message: string; code?: string };

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleIdentityServicesError = {
  type?: string;
  message?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: "" | "consent" }) => void;
};

type NativeGoogleSignInModule =
  typeof import("@react-native-google-signin/google-signin");

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: GoogleIdentityServicesError) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SCRIPT_ID = "google-identity-services";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

const loadGoogleIdentityServices = () =>
  new Promise<void>((resolve, reject) => {
    if (Platform.OS !== "web") {
      reject(new Error("Google Drive sync currently requires the web runtime."));
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
    script.onerror = () =>
      reject(new Error("Could not load Google Identity Services."));
    document.head.appendChild(script);
  });

export class GoogleDriveSync {
  private accessToken: string | null = null;
  private state: SyncState = { status: "signed-out" };
  private nativeConfigured = false;

  constructor(private readonly config: GoogleDriveSyncConfig = {}) {}

  getState() {
    if (!this.config.clientId) {
      return {
        status: "unavailable",
        reason:
          "Google Drive sign-in is not available in this build.",
      } satisfies SyncState;
    }

    return this.state;
  }

  async signIn(options: { prompt?: "" | "consent" } = {}): Promise<SyncState> {
    const { prompt = "consent" } = options;
    if (!this.config.clientId) {
      this.state = {
        status: "unavailable",
        reason:
          "Google Drive sign-in is not available in this build.",
      };
      return this.state;
    }

    if (Platform.OS !== "web") {
      return this.signInNative({ prompt });
    }

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
            message:
              "Google sign-in was not completed. If the browser blocked the popup, allow popups for this site and try again.",
          });
        }, 45000);

        const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
          client_id: this.config.clientId!,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              const message =
                response.error_description ??
                (response.error === "popup_failed_to_open"
                  ? "The browser blocked the Google sign-in popup. Allow popups for this site and try again."
                  : "Google sign-in was not completed. Try again in a new popup.");

              finish({
                status: "error",
                code: response.error ?? "missing_token",
                message,
              });
              return;
            }

            this.accessToken = response.access_token;
            finish({ status: "ready" });
          },
          error_callback: (error) => {
            const code = error.type ?? "google_sign_in_failed";
            const popupBlocked = code === "popup_failed_to_open";
            const popupClosed = code === "popup_closed";

            finish({
              status: "error",
              code,
              message: popupBlocked
                ? "The browser blocked the Google sign-in popup. Allow popups for this site and try again."
                : popupClosed
                  ? "Google sign-in was closed before it finished."
                  : error.message ?? "Google sign-in was not completed.",
            });
          },
        });

        if (!tokenClient) {
          finish({
            status: "error",
            code: "gis_unavailable",
            message: "Google Identity Services is not available.",
          });
          return;
        }

        try {
          tokenClient.requestAccessToken({ prompt });
        } catch {
          finish({
            status: "error",
            code: "popup_blocked",
            message:
              "The browser blocked the Google sign-in popup. Allow popups for this site and try again.",
          });
        }
      });

      this.state = nextState;
      return this.state;
    } catch (error) {
      this.state = {
        status: "error",
        message: error instanceof Error ? error.message : "Google sign-in failed.",
      };
      return this.state;
    }
  }

  signOut() {
    this.accessToken = null;
    this.state = { status: "signed-out" };
    if (Platform.OS !== "web") {
      void this.loadNativeGoogleSignIn()
        .then(({ GoogleSignin }) => GoogleSignin.signOut())
        .catch(() => undefined);
    }
  }

  isReady() {
    return Boolean(this.accessToken);
  }

  private async loadNativeGoogleSignIn(): Promise<NativeGoogleSignInModule> {
    return import("@react-native-google-signin/google-signin");
  }

  private configureNativeGoogleSignIn({
    GoogleSignin,
  }: NativeGoogleSignInModule) {
    if (this.nativeConfigured) return;

    GoogleSignin.configure({
      webClientId: this.config.clientId!,
      scopes: [DRIVE_SCOPE],
      offlineAccess: false,
    });
    this.nativeConfigured = true;
  }

  private async signInNative({
    prompt,
  }: {
    prompt: "" | "consent";
  }): Promise<SyncState> {
    try {
      const nativeGoogleSignIn = await this.loadNativeGoogleSignIn();
      const {
        GoogleSignin,
        isCancelledResponse,
        isErrorWithCode,
        isNoSavedCredentialFoundResponse,
        isSuccessResponse,
        statusCodes,
      } = nativeGoogleSignIn;

      this.configureNativeGoogleSignIn(nativeGoogleSignIn);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      let response;
      if (prompt === "") {
        if (!GoogleSignin.hasPreviousSignIn()) {
          this.state = { status: "signed-out" };
          return this.state;
        }

        response = await GoogleSignin.signInSilently();
        if (isNoSavedCredentialFoundResponse(response)) {
          this.state = { status: "signed-out" };
          return this.state;
        }
      } else {
        response = await GoogleSignin.signIn();
      }

      if (isCancelledResponse(response)) {
        this.state = {
          status: "error",
          code: "google_sign_in_cancelled",
          message: "Google sign-in was closed before it finished.",
        };
        return this.state;
      }

      if (!isSuccessResponse(response)) {
        this.state = {
          status: "error",
          code: "google_sign_in_failed",
          message: "Google sign-in was not completed.",
        };
        return this.state;
      }

      let user = response.data;
      const email = user.user.email;
      if (!user.scopes.includes(DRIVE_SCOPE)) {
        const scopeResponse = await GoogleSignin.addScopes({
          scopes: [DRIVE_SCOPE],
        });

        if (!scopeResponse) {
          this.state = {
            status: "error",
            code: "missing_drive_scope",
            message: "Google Drive permission was not granted.",
          };
          return this.state;
        }

        if (isCancelledResponse(scopeResponse)) {
          this.state = {
            status: "error",
            code: "google_drive_scope_cancelled",
            message: "Google Drive permission was not granted.",
          };
          return this.state;
        }

        if (!isSuccessResponse(scopeResponse)) {
          this.state = {
            status: "error",
            code: "missing_drive_scope",
            message: "Google Drive permission was not granted.",
          };
          return this.state;
        }

        user = scopeResponse.data;
      }

      if (!user.scopes.includes(DRIVE_SCOPE)) {
        this.state = {
          status: "error",
          code: "missing_drive_scope",
          message: "Google Drive permission was not granted.",
        };
        return this.state;
      }

      const { accessToken } = await GoogleSignin.getTokens();
      this.accessToken = accessToken;
      this.state = { status: "ready", email };
      return this.state;
    } catch (error) {
      const nativeGoogleSignIn = await this.loadNativeGoogleSignIn().catch(
        () => null,
      );
      if (nativeGoogleSignIn?.isErrorWithCode(error)) {
        const { statusCodes } = nativeGoogleSignIn;
        this.state = {
          status: "error",
          code: error.code,
          message:
            error.code === "DEVELOPER_ERROR"
              ? "Google sign-in is misconfigured for this Android build. Check the package name, OAuth client, and SHA-1 fingerprint."
              : error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
                ? "Google Play Services is missing or out of date on this device."
                : error.code === statusCodes.SIGN_IN_CANCELLED
                  ? "Google sign-in was closed before it finished."
                  : error.message,
        };
        return this.state;
      }

      this.state = {
        status: "error",
        message:
          error instanceof Error ? error.message : "Google sign-in failed.",
      };
      return this.state;
    }
  }

  private async refreshNativeAccessToken() {
    if (Platform.OS === "web" || !this.accessToken) return false;

    try {
      const nativeGoogleSignIn = await this.loadNativeGoogleSignIn();
      const { GoogleSignin } = nativeGoogleSignIn;
      this.configureNativeGoogleSignIn(nativeGoogleSignIn);
      await GoogleSignin.clearCachedAccessToken(this.accessToken);
      const { accessToken } = await GoogleSignin.getTokens();
      this.accessToken = accessToken;
      this.state = { status: "ready" };
      return true;
    } catch {
      this.accessToken = null;
      this.state = {
        status: "error",
        code: "token_refresh_failed",
        message: "Google Drive session expired. Sign in again to continue syncing.",
      };
      return false;
    }
  }

  private async fetchWithAuth(
    input: RequestInfo | URL,
    init: RequestInit = {},
    retry = true,
  ): Promise<Response> {
    if (!this.accessToken) {
      throw new Error("Sign in to Google Drive before syncing drawings.");
    }

    const response = await fetch(input, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (response.status === 401 && retry && (await this.refreshNativeAccessToken())) {
      return this.fetchWithAuth(input, init, false);
    }

    return response;
  }

  async uploadDocument(document: CanvasDocument): Promise<CanvasDocument> {
    const metadata = {
      name: `${document.metadata.id}.infinitecanvas.json`,
      mimeType: "application/json",
      parents: ["appDataFolder"],
      appProperties: {
        drawingId: document.metadata.id,
        title: document.metadata.title,
      },
    };

    const body = new FormData();
    body.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    body.append(
      "file",
      new Blob([JSON.stringify(document)], { type: "application/json" }),
    );

    const endpoint = document.metadata.driveFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${document.metadata.driveFileId}?uploadType=multipart&fields=id,headRevisionId`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId";

    const response = await this.fetchWithAuth(endpoint, {
      method: document.metadata.driveFileId ? "PATCH" : "POST",
      body,
    });

    if (!response.ok) {
      throw new Error(`Google Drive upload failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      id: string;
      headRevisionId?: string;
    };

    return {
      ...document,
      metadata: {
        ...document.metadata,
        driveFileId: result.id,
        driveRevisionId: result.headRevisionId,
      },
    };
  }

  async listDocuments(): Promise<
    Array<{
      id: string;
      name: string;
      headRevisionId?: string;
      modifiedTime?: string;
    }>
  > {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      fields: "files(id,name,headRevisionId,modifiedTime)",
      q: "name contains '.infinitecanvas.json' and trashed = false",
    });

    const response = await this.fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(`Google Drive listing failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      files?: Array<{
        id: string;
        name: string;
        headRevisionId?: string;
        modifiedTime?: string;
      }>;
    };

    return result.files ?? [];
  }

  async downloadDocument(fileId: string): Promise<CanvasDocument> {
    const response = await this.fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    );

    if (!response.ok) {
      throw new Error(`Google Drive download failed: ${response.status}`);
    }

    return (await response.json()) as CanvasDocument;
  }

  async deleteDocument(fileId: string): Promise<void> {
    const response = await this.fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      { method: "DELETE" },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Drive delete failed: ${response.status}`);
    }
  }
}

export const googleDriveSync = new GoogleDriveSync({
  clientId:
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
      : undefined,
  appFolder: "appDataFolder",
});
