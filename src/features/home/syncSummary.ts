import type { DrawingSummary } from "../documents/drawingRepository";

import type { AppIconName } from "../../shared/icons/iconData";

type SyncSummaryDrawing = Pick<DrawingSummary, "id" | "driveFileId" | "syncStatus" | "syncConflict">;

export function getSyncSummaryState(connected: boolean, confirmed: boolean, unsyncedCount: number) {
  if (!connected) return "local";
  if (unsyncedCount > 0) return "pending";
  return confirmed ? "synced" : "local";
}

export const countUnsyncedDrawings = (
  drawings: readonly SyncSummaryDrawing[],
  foreignDrawingIds: readonly string[],
) => {
  const foreignIds = new Set(foreignDrawingIds);
  return drawings.filter((drawing) =>
    foreignIds.has(drawing.id) ||
    drawing.syncConflict === true ||
    drawing.syncStatus !== "synced" ||
    !drawing.driveFileId,
  ).length;
};

export type CloudSyncStatusInfo = {
  icon: AppIconName;
  iconColor: "accent" | "primary" | "muted" | "danger";
  title: string;
  detail?: string;
  showSpinner?: boolean;
};

export type CloudSyncStatusLabels = {
  cloudCheckingAccount: string;
  openingGoogleSignIn: string;
  syncingDrawings: string;
  cloudReconnectDrive: string;
  googleDriveSignInRequired: string;
  notConnected: string;
  cloudSyncNotConnectedEmpty: string;
  syncSummaryLocalOne: string;
  syncSummaryLocalMany: string;
  cloudSyncLockedStatus: string;
  cloudSyncLockedDetail: string;
  syncConflictDetectedOne: string;
  syncConflictDetectedMany: string;
  syncConflictDetail: string;
  syncSummaryUnsyncedOne: string;
  syncSummaryUnsyncedMany: string;
  syncSummaryPendingDetail: string;
  cloudConnected: string;
  cloudSyncReadyEmpty: string;
  syncSummaryAllSynced: string;
  syncSummaryAllSyncedDetailOne: string;
  syncSummaryAllSyncedDetailMany: string;
};

export function getCloudSyncStatusInfo({
  account,
  accountStatus,
  entitlementStatus,
  busy,
  syncMessage,
  syncError,
  totalDrawingsCount,
  unsyncedCount,
  conflictCount = 0,
  labels,
}: {
  account: { email: string; drive?: string } | null;
  accountStatus: string;
  entitlementStatus: string;
  busy: boolean;
  syncMessage: string | null;
  syncError: string | null;
  syncConfirmed?: boolean;
  totalDrawingsCount: number;
  unsyncedCount: number;
  conflictCount?: number;
  labels: CloudSyncStatusLabels;
}): CloudSyncStatusInfo | null {
  if (accountStatus === "signing-in") {
    return {
      icon: "mdi:cloud-sync-outline",
      iconColor: "primary",
      title: labels.cloudCheckingAccount,
      detail: labels.openingGoogleSignIn,
      showSpinner: true,
    };
  }

  if (!account || accountStatus === "signed-out") {
    return null;
  }

  if (busy || accountStatus === "checking") {
    return {
      icon: "mdi:cloud-sync-outline",
      iconColor: "primary",
      title: syncMessage ?? labels.syncingDrawings,
      showSpinner: true,
    };
  }

  if (syncError) {
    return {
      icon: "mdi:alert-circle-outline",
      iconColor: "danger",
      title: syncError,
    };
  }

  if (account?.drive === "reauthorization-required") {
    return {
      icon: "mdi:alert-circle-outline",
      iconColor: "danger",
      title: labels.cloudReconnectDrive,
      detail: labels.googleDriveSignInRequired,
    };
  }

  if (accountStatus === "expired") {
    return {
      icon: "mdi:alert-circle-outline",
      iconColor: "danger",
      title: labels.googleDriveSignInRequired,
    };
  }

  if (entitlementStatus === "inactive") {
    return {
      icon: "mdi:lock-outline",
      iconColor: "accent",
      title: labels.cloudSyncLockedStatus,
      detail: labels.cloudSyncLockedDetail,
    };
  }

  if (conflictCount > 0) {
    return {
      icon: "mdi:alert-circle-outline",
      iconColor: "danger",
      title: conflictCount === 1
        ? labels.syncConflictDetectedOne
        : labels.syncConflictDetectedMany.replace("{count}", String(conflictCount)),
      detail: labels.syncConflictDetail,
    };
  }

  if (unsyncedCount > 0) {
    return {
      icon: "mdi:cloud-upload-outline",
      iconColor: "primary",
      title: unsyncedCount === 1
        ? labels.syncSummaryUnsyncedOne
        : labels.syncSummaryUnsyncedMany.replace("{count}", String(unsyncedCount)),
      detail: labels.syncSummaryPendingDetail,
    };
  }

  if (totalDrawingsCount === 0) {
    return {
      icon: "mdi:cloud-check-outline",
      iconColor: "accent",
      title: labels.cloudConnected,
      detail: labels.cloudSyncReadyEmpty,
    };
  }

  return {
    icon: "mdi:check-circle-outline",
    iconColor: "accent",
    title: labels.syncSummaryAllSynced,
    detail: totalDrawingsCount === 1
      ? labels.syncSummaryAllSyncedDetailOne
      : labels.syncSummaryAllSyncedDetailMany.replace("{count}", String(totalDrawingsCount)),
  };
}

