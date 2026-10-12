import { NativeModules, Platform } from "react-native";

export interface CloudSyncPurchaseStatus {
  productAvailable: boolean;
  formattedPrice?: string;
  currencyCode?: string;
  productError?: string;
  purchases: Array<{
    status: "purchased" | "pending";
    purchaseToken: string;
  }>;
}

export type CloudSyncPurchaseResult = {
  status: "purchased" | "pending" | "canceled";
  purchaseToken?: string;
};

interface NativeCloudSyncBillingModule {
  getCloudSyncStatus(): Promise<CloudSyncPurchaseStatus>;
  purchaseCloudSync(accountBinding: string): Promise<CloudSyncPurchaseResult>;
}

const nativeBillingModule =
  Platform.OS === "android"
    ? (NativeModules.InfiniteCanvasCloudSyncBilling as
        | NativeCloudSyncBillingModule
        | undefined)
    : undefined;

export const cloudSyncBilling = {
  isAvailable: Boolean(nativeBillingModule),

  getStatus(): Promise<CloudSyncPurchaseStatus> {
    if (!nativeBillingModule) {
      return Promise.resolve({ productAvailable: false, purchases: [] });
    }
    return nativeBillingModule.getCloudSyncStatus();
  },

  purchase(accountBinding: string): Promise<CloudSyncPurchaseResult> {
    if (!nativeBillingModule) {
      return Promise.reject(new Error("Google Play purchases are unavailable."));
    }
    return nativeBillingModule.purchaseCloudSync(accountBinding);
  },
};
