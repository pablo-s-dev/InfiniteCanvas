import { withDeadline } from "../withDeadline";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { Platform } from "react-native";
import { useTranslations, detectSystemLanguage, type SupportedLanguage } from "../../../shared/i18n/i18n";
import type { ToastState } from "../../../shared/ui/toastTypes";
import { drawingRepository, type DrawingSummary } from "../../documents/drawingRepository";
import type { CanvasDocument } from "../../canvas/document";
import { googleDriveSync, CloudSyncApiError, type CloudSyncAccount, type CloudSyncDiagnostic, type SyncState } from "../googleDriveSync";
import { cloudSyncBilling, type CloudSyncPurchaseStatus } from "../cloudSyncBilling";
import { runCloudSync, assertSyncAccount, withSyncLock, uploadSnapshot, deleteSnapshot, adoptRemote } from "../syncEngine";
import { compareSyncVersions, syncContentHash } from "../syncContent";
import { syncBindings } from "../syncBindings";
import { unverifiedDrawingIds } from "../syncOwnership";

type AccountStatus = "checking" | "signed-out" | "signing-in" | "connected" | "expired";
type EntitlementStatus = "unknown" | "checking" | "active" | "inactive" | "pending" | "error";
type ConflictInspection = {local: CanvasDocument; remote?: CanvasDocument; kind?: "diverged" | "unbased"; accountBinding?: string};

function useCloudSyncController() {
  const [language, setLanguage] = useState<SupportedLanguage>(detectSystemLanguage());
  const {t} = useTranslations(language);
  const [account, setAccount] = useState<CloudSyncAccount | null>(null);
  const accountRef = useRef<CloudSyncAccount | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("checking");
  const [entitlementStatus, setEntitlementStatus] = useState<EntitlementStatus>("unknown");
  const [busy, setBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cloudSyncPaywallOpen, setCloudSyncPaywallOpen] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingAction, setBillingAction] = useState<"buy" | "restore" | null>(null);
  const [billingFeedback, setBillingFeedback] = useState<string | null>(null);
  const [cloudSyncPurchaseStatus, setCloudSyncPurchaseStatus] = useState<CloudSyncPurchaseStatus>({productAvailable: false, purchases: []});
  const [billingReady, setBillingReady] = useState(Platform.OS !== "android");
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [verifiedConflictIds, setVerifiedConflictIds] = useState<string[]>([]);
  const [inspection, setInspection] = useState<ConflictInspection | null>(null);
  const [resolvedVersion, setResolvedVersion] = useState(0);
  const [repositoryVersion, setRepositoryVersion] = useState(0);
  const [foreignDrawingIds, setForeignDrawingIds] = useState<string[]>([]);
  const [unconfirmedDrawingIds, setUnconfirmedDrawingIds] = useState<string[]>([]);
  // A restored session or old local metadata cannot confirm the current cloud state.
  const [confirmedSyncBinding, setConfirmedSyncBinding] = useState<string | null>(null);
  const generation = useRef(0);
  const conflictGeneration = useRef(0);
  const operation = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const localEditsPending = useRef(false);
  const guardFor = (accountBinding?: string) => {
    const expected = generation.current;
    return () => {
      if (!mounted.current || generation.current !== expected || (accountBinding && accountRef.current?.accountBinding !== accountBinding))
        throw new CloudSyncApiError("Account changed.", "account_changed", 409);
    };
  };
  const message = (error: unknown) => {
    if (error instanceof CloudSyncApiError) {
      if (["session_expired", "session_required"].includes(error.code)) return t.googleDriveSignInRequired;
      if (["network_unavailable", "request_timeout"].includes(error.code)) return t.cloudNetworkUnavailable;
      if (error.code === "drive_reauthorization_required") return t.cloudReconnectDrive;
      if (error.code === "cloud_sync_locked") return t.cloudSyncLockedStatus;
      if (error.code === "account_mismatch") return t.cloudAccountMismatch;
      if (error.code === "drawing_conflict") return t.cloudChangedDuringResolution;
      if (["remote_document_invalid", "invalid_document", "invalid_local_document"].includes(error.code)) return t.cloudInvalidDocument;
    }
    return t.googleDriveSyncFailed;
  };
  const applyAccount = (next: CloudSyncAccount) => {
    if (accountRef.current?.accountBinding !== next.accountBinding) setConfirmedSyncBinding(null);
    accountRef.current = next; setAccount(next); setAccountStatus("connected");
    setEntitlementStatus(next.entitlement.active === null ? "error" : next.entitlement.active ? "active" : next.entitlement.status === "pending" ? "pending" : "inactive");
    if (next.entitlement.active) setCloudSyncPaywallOpen(false);
  };
  const handleError = (error: unknown) => {
    if (error instanceof CloudSyncApiError && error.code === "account_changed") return;
    setConfirmedSyncBinding(null);
    if (__DEV__ && Platform.OS === "android") {
      const diagnostic: CloudSyncDiagnostic = error instanceof CloudSyncApiError
        ? error.diagnostic ?? {stage: "cloud_sync", code: error.code, status: error.status}
        : {stage: "cloud_sync", code: error instanceof Error ? error.name : "unknown_error"};
      console.warn("[CloudSync]", diagnostic);
    }
    if (error instanceof CloudSyncApiError && ["session_expired", "session_required"].includes(error.code)) {
      setAccountStatus("expired"); setEntitlementStatus("unknown");
      setVerifiedConflictIds([]);
    } else {
      const settledAccountStatus = accountRef.current ? "connected" : "signed-out";
      setAccountStatus(status => status === "checking" || status === "signing-in" ? settledAccountStatus : status);
      setEntitlementStatus("error");
    }
    setSyncError(message(error));
  };
  async function checkAccount(): Promise<CloudSyncAccount | null> {
    const guard = guardFor(); setEntitlementStatus("checking");
    try {
      const next = await googleDriveSync.restoreAccount(); guard();
      if (!next) {setAccountStatus(accountRef.current ? "expired" : "signed-out"); setEntitlementStatus("unknown"); return null;}
      applyAccount(next); setSyncError(next.entitlement.active === null || next.drive === "unavailable" ? t.googleDriveSyncFailed : null); return next;
    } catch (error) {guard(); handleError(error); throw error;}
  }
  const runOperation = (action: () => Promise<void>): Promise<void> => {
    if (operation.current) return operation.current;
    setBusy(true);
    const expected = generation.current;
    const task = action().catch(error => {if (generation.current === expected && mounted.current) handleError(error);}).finally(() => {
      if (operation.current === task) operation.current = null;
      if (generation.current === expected && mounted.current) {setBusy(false); setSyncMessage(null);
        if (localEditsPending.current && accountRef.current?.entitlement.active) setTimeout(() => {if (mounted.current) void latestSync.current({interactive: false});}, 50);
      }
    });
    operation.current = task; return task;
  };
  async function performSync(onlyDrawingId?: string) {
    setConfirmedSyncBinding(null);
    localEditsPending.current = false;
    const next = await checkAccount(); if (!next) return;
    if (!next.entitlement.active || next.drive !== "ready") return;
    const guard = guardFor(next.accountBinding); setSyncMessage(t.syncingDrawings);
    const result = await runCloudSync(next, guard, onlyDrawingId); guard();
    const documents = await drawingRepository.listIncludingDeleted(); guard();
    const bindings = await syncBindings.list(); guard();
    const unconfirmed = unverifiedDrawingIds(documents, bindings, next.accountBinding);
    setUnconfirmedDrawingIds(unconfirmed);
    setVerifiedConflictIds(documents.filter(drawing => drawing.syncConflict).map(drawing => drawing.id));
    setSyncError(result.failures ? t.cloudSyncPartialFailure : null);
    // A per-drawing sync does not prove that the whole library was checked.
    if (!onlyDrawingId && !result.failures && !unconfirmed.length && !localEditsPending.current) {
      setConfirmedSyncBinding(next.accountBinding);
    }
  }
  const syncLocalDrawings = (options: {interactive?: boolean; silent?: boolean; onlyDrawingId?: string} = {}) => runOperation(() => performSync(options.onlyDrawingId));
  const connectDrive = async (_options: {syncAfterConnect?: boolean; prompt?: "" | "consent"; silent?: boolean; expectedAccountBinding?: string} = {}): Promise<boolean> => {
    // Invoke the popup from the click itself; unrelated asynchronous prechecks can
    // lose browser user activation and cause the popup to be blocked.
    if (operation.current) return false;
    const expectedBinding = _options.expectedAccountBinding ?? accountRef.current?.accountBinding;
    const guard = guardFor(); setAccountStatus("signing-in"); setSyncError(null);
    const login = googleDriveSync.signIn({reauthorize: true, expectedAccountBinding: expectedBinding});
    let connected = false;
    await runOperation(async () => {
      const result = await login; guard();
      if (result.status !== "ready") {setAccountStatus(accountRef.current ? "connected" : "signed-out"); throw new CloudSyncApiError(result.status === "error" ? result.message : "Sign-in failed.", result.status === "error" ? result.code ?? "sign_in_failed" : "sign_in_failed", 400, result.status === "error" ? result.diagnostic : undefined);}
      const next = await googleDriveSync.getAccount(); guard(); applyAccount(next); connected = true;
      if (next.entitlement.active === false) {setCloudSyncPaywallOpen(next.entitlement.status !== "pending"); return;}
      if (next.drive === "ready") await performSync();
    });
    return connected;
  };
  async function signOut() {
    setConfirmedSyncBinding(null);
    generation.current += 1; conflictGeneration.current += 1;
    googleDriveSync.cancelPendingRequests(); operation.current = null;
    accountRef.current = null; setAccount(null); setAccountStatus("signed-out"); setEntitlementStatus("unknown"); setVerifiedConflictIds([]);
    setBusy(false); setBillingBusy(false); setBillingAction(null); setBillingFeedback(null); setSyncError(null); setSyncMessage(null); setCloudSyncPaywallOpen(false); setInspection(null); setConflictError(null); setConflictBusy(false);
    await googleDriveSync.signOut();
  }
  const openCloudSyncPaywall = () => {
    if (accountStatus === "connected" && entitlementStatus === "inactive") {setBillingFeedback(null); setCloudSyncPaywallOpen(true);}
    else if (!accountRef.current) void connectDrive();
    else void runOperation(async () => {const next = await checkAccount(); if (next && next.entitlement.active === false && next.entitlement.status !== "pending") setCloudSyncPaywallOpen(true);});
  };
  async function refreshBilling() {
    if (Platform.OS !== "android" || !cloudSyncBilling.isAvailable) {setBillingReady(true); return null;}
    try {const status = await withDeadline(cloudSyncBilling.getStatus()); setCloudSyncPurchaseStatus(status); return status;}
    finally {setBillingReady(true);}
  }
  async function purchase(restore: boolean) {
    if (billingBusy || operation.current) return;
    setBillingBusy(true); setBillingAction(restore ? "restore" : "buy"); setBillingFeedback(null);
    const billingGeneration = generation.current;
    const guard = guardFor();
    await runOperation(async () => {
      try {
        const next = await checkAccount(); guard(); if (!next) {setBillingFeedback(t.googleDriveSignInRequired); return;}
        if (next.entitlement.active === null) {setBillingFeedback(t.googleDriveSyncFailed); return;}
        if (Platform.OS === "android" && next.entitlement.active === false) {
          if (restore) {
            const status = await refreshBilling(); guard();
            for (const item of status?.purchases ?? []) {await googleDriveSync.verifyPurchase(item.purchaseToken); guard();}
          } else {
            const result = await withDeadline(cloudSyncBilling.purchase(next.accountBinding), 300_000); guard();
            if (result.status === "canceled") return;
            if (result.purchaseToken) {await googleDriveSync.verifyPurchase(result.purchaseToken); guard();}
          }
        }
        const verified = await googleDriveSync.getAccount(); guard(); applyAccount(verified);
        if (verified.entitlement.active) await performSync();
        else setBillingFeedback(verified.entitlement.active === null ? t.googleDriveSyncFailed : verified.entitlement.status === "pending" ? t.cloudSyncPurchasePending : Platform.OS === "web" ? t.cloudBuyOnAndroid : t.cloudSyncRestoreNoPurchase);
      } catch (error) {guard(); setBillingFeedback(message(error));}
      finally {if (mounted.current && generation.current === billingGeneration) {setBillingBusy(false); setBillingAction(null);}}
    });
  }
  async function inspectConflict(drawingId: string) {
    const token = ++conflictGeneration.current; setConflictBusy(true); setConflictError(null); setInspection(null);
    const guardAccount = guardFor();
    const guard = () => {guardAccount(); if (token !== conflictGeneration.current) throw new CloudSyncApiError("View changed.", "account_changed", 409);};
    try {
      const local = await drawingRepository.get(drawingId); guard(); if (!local) return;
      const initialOwner = await syncBindings.get(drawingId); guard();
      setInspection({local, accountBinding: initialOwner?.accountBinding});
      await operation.current; guard();
      const next = await checkAccount(); guard();
      if (!next) {setConflictError(t.googleDriveSignInRequired); return;}
      assertSyncAccount(next);
      const owner = await syncBindings.get(drawingId); guard();
      if (owner && owner.accountBinding !== next.accountBinding) throw new CloudSyncApiError("Other account.", "account_mismatch", 409);
      const remote = await withSyncLock(() => googleDriveSync.downloadDocument(drawingId)); guard();
      const current = await drawingRepository.get(drawingId); guard(); if (!current) return;
      const decision = compareSyncVersions(syncContentHash(current), syncContentHash(remote), owner?.baseHash);
      if (decision === "equal" || decision === "upload" || decision === "download") {
        await runCloudSync(next, guard, drawingId); guard(); setResolvedVersion(value => value + 1); setInspection(null); return;
      }
      setInspection({local: current, remote, kind: decision === "unbased" ? "unbased" : "diverged"});
    } catch (error) {if (token === conflictGeneration.current) setConflictError(message(error));}
    finally {if (token === conflictGeneration.current) setConflictBusy(false);}
  }
  async function resolveConflict(drawing: DrawingSummary, action: "keep-local" | "use-cloud" | "duplicate-both") {
    if (conflictBusy || operation.current || !inspection?.remote) return;
    const token = conflictGeneration.current;
    setConflictBusy(true); setConflictError(null);
    const guardAccount = guardFor();
    const guard = () => {guardAccount(); if (token !== conflictGeneration.current) throw new CloudSyncApiError("View changed.", "account_changed", 409);};
    try {
      const next = await checkAccount(); guard(); if (!next) throw new CloudSyncApiError("Sign in.", "session_required", 401);
      assertSyncAccount(next);
      await withSyncLock(async () => {
        const local = await drawingRepository.get(drawing.id); const remote = await googleDriveSync.downloadDocument(drawing.id); guard();
        if (!local) throw new Error("Missing drawing.");
        // A choice applies only to the two versions that were actually shown.
        if (remote.metadata.driveRevisionId !== inspection.remote?.metadata.driveRevisionId || syncContentHash(local) !== syncContentHash(inspection.local))
          throw new CloudSyncApiError("Versions changed.", "drawing_conflict", 409);
        if (action === "keep-local") {
          if (local.metadata.deletedAt) await deleteSnapshot(next.accountBinding, local, guard, remote.metadata.driveRevisionId);
          else await uploadSnapshot(next.accountBinding, local, guard, remote.metadata.driveRevisionId);
        }
        else {
          if (action === "duplicate-both") {
            const copy = await drawingRepository.duplicate(drawing.id); guard();
            if (copy) {await syncBindings.set({drawingId: copy.metadata.id, accountBinding: next.accountBinding}); await drawingRepository.rename(copy.metadata.id, `${local.metadata.title} (${t.localVersion})`);}
          }
          await adoptRemote(next.accountBinding, local, remote, guard);
        }
      });
      guard(); setInspection(null); setResolvedVersion(value => value + 1);
    } catch (error) {if (token === conflictGeneration.current) setConflictError(message(error));}
    finally {if (token === conflictGeneration.current) setConflictBusy(false);}
  }
  useEffect(() => {
    let canceled = false;
    void Promise.all([syncBindings.list(), drawingRepository.listIncludingDeleted()]).then(([bindings, documents]) => {
      if (canceled) return;
      const foreign = new Set(bindings.filter(binding => account && binding.accountBinding !== account.accountBinding).map(binding => binding.drawingId));
      setForeignDrawingIds([...foreign]);
      setUnconfirmedDrawingIds(unverifiedDrawingIds(documents, bindings, account?.accountBinding));
    });
    return () => {canceled = true;};
  }, [repositoryVersion, account?.accountBinding]);
  const copyToCurrentAccount = (drawingId: string) => runOperation(async () => {
    const next = await checkAccount(); if (!next) return; assertSyncAccount(next);
    const guard = guardFor(next.accountBinding);
    const original = await drawingRepository.get(drawingId); guard(); if (!original) return;
    const copy = await drawingRepository.duplicate(drawingId); guard(); if (!copy) return;
    await syncBindings.set({drawingId: copy.metadata.id, accountBinding: next.accountBinding});
    await drawingRepository.rename(copy.metadata.id, original.metadata.title);
    guard(); await performSync(copy.metadata.id);
  });
  const latestSync = useRef(syncLocalDrawings); latestSync.current = syncLocalDrawings;
  useEffect(() => {
    mounted.current = true; googleDriveSync.prepareWebSignIn();
    void refreshBilling().catch(() => undefined);
    void runOperation(async () => {const next = await checkAccount(); if (next) {await googleDriveSync.renewSession(); if (next.entitlement.active && next.drive === "ready") await performSync();}});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = drawingRepository.subscribe(localEdit => {
      setRepositoryVersion(value => value + 1);
      if (localEdit) {setConfirmedSyncBinding(null); localEditsPending.current = true; clearTimeout(timer); timer = setTimeout(() => {if (accountRef.current?.entitlement.active) void latestSync.current({interactive: false});}, 1200);}
    });
    const interval = setInterval(() => {if (accountRef.current?.entitlement.active) void latestSync.current({interactive: false});}, 60000);
    const online = () => {if (accountRef.current) void latestSync.current({interactive: false});};
    if (Platform.OS === "web") window.addEventListener("online", online);
    return () => {mounted.current = false; generation.current += 1; unsubscribe(); clearTimeout(timer); clearInterval(interval); if (Platform.OS === "web") window.removeEventListener("online", online);};
  }, []);
  const hasCloudSyncAccess = entitlementStatus === "active";
  const syncConfirmed = !!account && confirmedSyncBinding === account.accountBinding &&
    accountStatus === "connected" && hasCloudSyncAccess && account.drive === "ready" && !busy && !syncError;
  const syncState: SyncState = busy ? {status: "syncing"} : accountStatus === "connected" ? {status: "ready", email: account?.email} : {status: "signed-out"};
  const mainAction = () => {
    if (!accountRef.current || accountStatus === "expired") return void connectDrive();
    if (entitlementStatus === "inactive") return openCloudSyncPaywall();
    if (accountRef.current.drive === "reauthorization-required") return void connectDrive();
    void syncLocalDrawings();
  };
  return {conflictAction: () => {if (!googleDriveSync.isReady()) void connectDrive({expectedAccountBinding: inspection?.accountBinding}); else mainAction();}, verifiedConflictIds, foreignDrawingIds, unconfirmedDrawingIds, copyToCurrentAccount, language, setLanguage, account, accountStatus, entitlementStatus, busy, syncError, mainAction, signOut,
    conflictBusy, conflictError, inspection, inspectConflict, resolvedVersion, repositoryVersion,
    clearConflictError: () => {conflictGeneration.current += 1; setConflictError(null); setInspection(null); setConflictBusy(false);},
    syncState, syncConfirmed, syncMessage, cloudSyncPurchaseStatus, billingReady, cloudSyncPaywallOpen, setCloudSyncPaywallOpen,
    billingBusy, billingAction, billingFeedback, hasCloudSyncAccess, openCloudSyncPaywall, connectDrive,
    syncLocalDrawings, syncDrawing: (drawing: DrawingSummary) => syncLocalDrawings({onlyDrawingId: drawing.id}),
    resolveConflict, buyCloudSync: () => purchase(false), restoreCloudSyncPurchase: () => purchase(true)};
}
type Controller = ReturnType<typeof useCloudSyncController>;
const CloudSyncContext = createContext<Controller | null>(null);
export function CloudSyncProvider({children}: {children: ReactNode}) {
  const controller = useCloudSyncController();
  return <CloudSyncContext.Provider value={controller}>{children}</CloudSyncContext.Provider>;
}
export function useCloudSync({language, loadDrawings, onConflictResolved}: {
  drawings: DrawingSummary[]; loading: boolean; language: SupportedLanguage;
  loadDrawings: () => Promise<void>; setToast: Dispatch<SetStateAction<ToastState | null>>; onConflictResolved: () => void;
}) {
  const controller = useContext(CloudSyncContext); if (!controller) throw new Error("CloudSyncProvider is missing.");
  useEffect(() => {controller.setLanguage(language);}, [language]);
  const callback = useRef(onConflictResolved); callback.current = onConflictResolved;
  useEffect(() => {if (controller.resolvedVersion) callback.current();}, [controller.resolvedVersion]);
  const reload = useRef(loadDrawings); reload.current = loadDrawings;
  useEffect(() => {void reload.current();}, [controller.repositoryVersion]);
  return controller;
}
