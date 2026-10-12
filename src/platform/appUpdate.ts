import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from "react-native";
import { jsonStorage } from "../shared/storage/jsonStorage";

export const UPDATE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_DEFERRAL_KEY = "infinite-canvas:update-deferral";

export type AppUpdateCheckResult =
  | { state: "none" }
  | {
      state: "available" | "in-progress" | "downloaded";
      availableVersionCode: number;
    };

export interface AppUpdateStateEvent {
  state: "downloading" | "downloaded" | "failed" | "canceled";
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
}

export interface UpdateDeferral {
  availableVersionCode: number;
  dismissedAt: number;
}

interface AppUpdateNativeModule {
  checkForUpdate(): Promise<AppUpdateCheckResult>;
  startFlexibleUpdate(): Promise<{ accepted: boolean }>;
  completeUpdate(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const nativeModule =
  Platform.OS === "android"
    ? (NativeModules.InfiniteCanvasAppUpdate as AppUpdateNativeModule | undefined)
    : undefined;
const eventEmitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;

export const AppUpdate = {
  isAvailable: Boolean(nativeModule),
  checkForUpdate(): Promise<AppUpdateCheckResult> {
    return nativeModule?.checkForUpdate() ?? Promise.resolve({ state: "none" });
  },
  startFlexibleUpdate(): Promise<{ accepted: boolean }> {
    if (!nativeModule) {
      return Promise.reject(new Error("Android in-app updates are unavailable."));
    }
    return nativeModule.startFlexibleUpdate();
  },
  completeUpdate(): Promise<void> {
    if (!nativeModule) {
      return Promise.reject(new Error("Android in-app updates are unavailable."));
    }
    return nativeModule.completeUpdate();
  },
  addListener(listener: (event: AppUpdateStateEvent) => void): EmitterSubscription | null {
    return eventEmitter?.addListener("updateStateChanged", listener) ?? null;
  },
};

export function parseUpdateDeferral(value: unknown): UpdateDeferral | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<UpdateDeferral>;
  if (
    !Number.isInteger(parsed.availableVersionCode) ||
    Number(parsed.availableVersionCode) <= 0 ||
    !Number.isFinite(parsed.dismissedAt) ||
    Number(parsed.dismissedAt) <= 0
  ) {
    return null;
  }
  return {
    availableVersionCode: Number(parsed.availableVersionCode),
    dismissedAt: Number(parsed.dismissedAt),
  };
}

export function shouldPromptForUpdate(
  availableVersionCode: number,
  deferral: UpdateDeferral | null,
  now = Date.now(),
) {
  if (!deferral || deferral.availableVersionCode !== availableVersionCode) return true;
  const elapsed = now - deferral.dismissedAt;
  return elapsed < 0 || elapsed >= UPDATE_REMINDER_DELAY_MS;
}

export async function getUpdateDeferral() {
  return parseUpdateDeferral(await jsonStorage.get<unknown>(UPDATE_DEFERRAL_KEY));
}

export function deferUpdate(availableVersionCode: number, dismissedAt = Date.now()) {
  return jsonStorage.set(UPDATE_DEFERRAL_KEY, { availableVersionCode, dismissedAt });
}

export function clearUpdateDeferral() {
  return jsonStorage.remove(UPDATE_DEFERRAL_KEY);
}
