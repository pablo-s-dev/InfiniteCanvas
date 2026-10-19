import { describe, expect, it } from "vitest";
import { countUnsyncedDrawings, getCloudSyncStatusInfo, getSyncSummaryState, type CloudSyncStatusLabels } from "./syncSummary";

describe("getSyncSummaryState", () => {
  it("never claims cloud sync while disconnected, even with stale confirmation", () => {
    expect(getSyncSummaryState(false, false, 0)).toBe("local");
    expect(getSyncSummaryState(false, true, 0)).toBe("local");
    expect(getSyncSummaryState(false, true, 4)).toBe("local");
  });
  it("requires a successful confirmation and no pending drawings", () => {
    expect(getSyncSummaryState(true, false, 0)).toBe("local");
    expect(getSyncSummaryState(true, true, 0)).toBe("synced");
    expect(getSyncSummaryState(true, false, 1)).toBe("pending");
    expect(getSyncSummaryState(true, true, 3)).toBe("pending");
  });
});

describe("countUnsyncedDrawings", () => {
  it("counts local, pending, failed, conflicted, and other-account drawings once each", () => {
    const drawings = [
      { id: "synced", driveFileId: "drive-synced", syncStatus: "synced" as const, syncConflict: false },
      { id: "local", syncStatus: "synced" as const, syncConflict: false },
      { id: "pending", driveFileId: "drive-pending", syncStatus: "pending" as const, syncConflict: false },
      { id: "failed", driveFileId: "drive-failed", syncStatus: "failed" as const, syncConflict: false },
      { id: "conflict", driveFileId: "drive-conflict", syncStatus: "synced" as const, syncConflict: true },
      { id: "foreign", driveFileId: "drive-foreign", syncStatus: "synced" as const, syncConflict: false },
      { id: "failed-conflict", driveFileId: "drive-failed-conflict", syncStatus: "failed" as const, syncConflict: true },
    ];

    expect(countUnsyncedDrawings(drawings, ["foreign"])).toBe(6);
  });

  it("returns zero when every drawing has a synced Drive copy", () => {
    expect(countUnsyncedDrawings([
      { id: "synced", driveFileId: "drive-synced", syncStatus: "synced" as const, syncConflict: false },
    ], [])).toBe(0);
    expect(countUnsyncedDrawings([], [])).toBe(0);
  });

  it("treats missing sync metadata as unconfirmed even if a Drive id exists", () => {
    expect(countUnsyncedDrawings([{ id: "unknown", driveFileId: "drive-unknown" }], [])).toBe(1);
  });
});

describe("getCloudSyncStatusInfo", () => {
  const dummyLabels: CloudSyncStatusLabels = {
    cloudCheckingAccount: "Checking account…",
    openingGoogleSignIn: "Opening Google sign-in…",
    syncingDrawings: "Syncing drawings…",
    cloudReconnectDrive: "Reconnect Google Drive",
    googleDriveSignInRequired: "Sign in required",
    notConnected: "Not connected",
    cloudSyncNotConnectedEmpty: "Connect your account to back up and sync your drawings.",
    syncSummaryLocalOne: "1 drawing saved only on this device",
    syncSummaryLocalMany: "{count} drawings saved only on this device",
    cloudSyncLockedStatus: "Cloud Sync isn't available for this account.",
    cloudSyncLockedDetail: "Unlock Cloud Sync to back up your drawings.",
    syncConflictDetectedOne: "1 sync conflict",
    syncConflictDetectedMany: "{count} sync conflicts",
    syncConflictDetail: "Local and cloud versions differ. Resolve to continue syncing.",
    syncSummaryUnsyncedOne: "1 drawing not synced",
    syncSummaryUnsyncedMany: "{count} drawings not synced",
    syncSummaryPendingDetail: "Tap Sync now to back up to Google Drive.",
    cloudConnected: "Connected",
    cloudSyncReadyEmpty: "Cloud sync is active. New drawings will sync automatically.",
    syncSummaryAllSynced: "Everything is synced",
    syncSummaryAllSyncedDetailOne: "1 drawing is backed up in Google Drive.",
    syncSummaryAllSyncedDetailMany: "All {count} drawings are backed up in Google Drive.",
  };

  it("returns null when no account is connected (both with 0 and >0 drawings)", () => {
    const infoEmpty = getCloudSyncStatusInfo({
      account: null,
      accountStatus: "signed-out",
      entitlementStatus: "unknown",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 0,
      unsyncedCount: 0,
      labels: dummyLabels,
    });
    expect(infoEmpty).toBeNull();

    const infoWithDrawings = getCloudSyncStatusInfo({
      account: null,
      accountStatus: "signed-out",
      entitlementStatus: "unknown",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 3,
      unsyncedCount: 3,
      labels: dummyLabels,
    });
    expect(infoWithDrawings).toBeNull();
  });

  it("shows spinner and checking status during sign-in", () => {
    const info = getCloudSyncStatusInfo({
      account: null,
      accountStatus: "signing-in",
      entitlementStatus: "unknown",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 0,
      unsyncedCount: 0,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.showSpinner).toBe(true);
    expect(info!.title).toBe("Checking account…");
    expect(info!.detail).toBe("Opening Google sign-in…");
  });

  it("shows error status when syncError is present", () => {
    const info = getCloudSyncStatusInfo({
      account: { email: "test@example.com" },
      accountStatus: "connected",
      entitlementStatus: "active",
      busy: false,
      syncMessage: null,
      syncError: "Network failure",
      totalDrawingsCount: 2,
      unsyncedCount: 1,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.iconColor).toBe("danger");
    expect(info!.title).toBe("Network failure");
  });

  it("shows locked status when entitlement is inactive", () => {
    const info = getCloudSyncStatusInfo({
      account: { email: "test@example.com" },
      accountStatus: "connected",
      entitlementStatus: "inactive",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 2,
      unsyncedCount: 2,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.icon).toBe("mdi:lock-outline");
    expect(info!.title).toBe("Cloud Sync isn't available for this account.");
  });

  it("shows pending upload status when unsyncedCount > 0", () => {
    const info = getCloudSyncStatusInfo({
      account: { email: "test@example.com" },
      accountStatus: "connected",
      entitlementStatus: "active",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 4,
      unsyncedCount: 2,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.icon).toBe("mdi:cloud-upload-outline");
    expect(info!.title).toBe("2 drawings not synced");
    expect(info!.detail).toBe("Tap Sync now to back up to Google Drive.");
  });

  it("shows ready status when all synced and totalDrawingsCount is 0", () => {
    const info = getCloudSyncStatusInfo({
      account: { email: "test@example.com" },
      accountStatus: "connected",
      entitlementStatus: "active",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 0,
      unsyncedCount: 0,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.icon).toBe("mdi:cloud-check-outline");
    expect(info!.title).toBe("Connected");
    expect(info!.detail).toBe("Cloud sync is active. New drawings will sync automatically.");
  });

  it("shows all synced status when all synced and drawings exist", () => {
    const info = getCloudSyncStatusInfo({
      account: { email: "test@example.com" },
      accountStatus: "connected",
      entitlementStatus: "active",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 5,
      unsyncedCount: 0,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.icon).toBe("mdi:check-circle-outline");
    expect(info!.title).toBe("Everything is synced");
    expect(info!.detail).toBe("All 5 drawings are backed up in Google Drive.");
  });

  it("shows conflict status in red when conflictCount > 0", () => {
    const info = getCloudSyncStatusInfo({
      account: { email: "test@example.com" },
      accountStatus: "connected",
      entitlementStatus: "active",
      busy: false,
      syncMessage: null,
      syncError: null,
      totalDrawingsCount: 2,
      unsyncedCount: 1,
      conflictCount: 1,
      labels: dummyLabels,
    });

    expect(info).not.toBeNull();
    expect(info!.icon).toBe("mdi:alert-circle-outline");
    expect(info!.iconColor).toBe("danger");
    expect(info!.title).toBe("1 sync conflict");
    expect(info!.detail).toBe("Local and cloud versions differ. Resolve to continue syncing.");
  });
});
