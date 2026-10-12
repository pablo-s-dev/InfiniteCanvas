import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "../../shared/icons/AppIcon";
import { CopyPlusIcon } from "../../shared/icons/CopyPlusIcon";
import {
  SupportedLanguage,
  useTranslations,
} from "../../shared/i18n/i18n";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import { appThemes, AppTheme, AppThemeMode } from "../../shared/theme/appPalette";
import { CompositeTag } from "../tags/tagModel";
import {
  drawingRepository,
  DrawingSummary,
} from "../documents/drawingRepository";
import { googleDriveSync, SyncState } from "../sync/googleDriveSync";
import { drawingSyncQueue } from "../sync/syncQueue";
import { DrawingImportError, pickDrawingJson } from "../sharing/drawingImport";
import {
  DrawingShareError,
  exportDrawingBundleJson,
} from "../sharing/drawingSharing";
import { useHomeQueryParams } from "./useHomeQueryParams";

type DrawingHomeScreenProps = {
  onOpenCanvas: (drawing?: DrawingSummary) => void;
  onCreateDrawing: (tags: CompositeTag[]) => void;
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  themeMode: AppThemeMode;
  onThemeChange: (theme: AppThemeMode) => void;
};

type ScreenMode = "library" | "tags" | "settings";
type LibrarySortMode = "updated_desc" | "updated_asc" | "title_asc";
type ToastState = {
  message: string;
  tone: "success" | "warning" | "error";
};

type ConnectDriveOptions = {
  syncAfterConnect?: boolean;
  prompt?: "" | "consent";
  silent?: boolean;
};

type SyncLocalDrawingsOptions = {
  interactive?: boolean;
  silent?: boolean;
  onlyDrawingId?: string;
};

const CUSTOM_TAGS_KEY = "infinite-canvas:custom-tags";
const DRIVE_AUTO_CONNECT_KEY = "infinite-canvas:drive-was-connected";
const PAGE_SIZE = 6;

const webTitle = (label: string) =>
  Platform.OS === "web" ? ({ title: label } as Record<string, string>) : {};

const describeSyncState = (
  state: SyncState,
  labels: {
    connectedToGoogleDrive: string;
    workingWithGoogleDrive: string;
    notConnected: string;
  },
) => {
  if (state.status === "ready") return labels.connectedToGoogleDrive;
  if (state.status === "syncing") return labels.workingWithGoogleDrive;
  if (state.status === "signed-out") return labels.notConnected;
  if (state.status === "error") return state.message;
  return state.reason;
};

const errorMessageOf = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatSyncFailureMessage = (
  count: number,
  language: SupportedLanguage,
) => {
  if (language === "pt") {
    return `${count} desenho${count === 1 ? "" : "s"} não sincronizou. Vamos tentar novamente depois.`;
  }
  if (language === "es") {
    return `${count} dibujo${count === 1 ? "" : "s"} no se pudo sincronizar. Se intentará de nuevo después.`;
  }
  return `${count} drawing${count === 1 ? "" : "s"} could not sync. Will retry later.`;
};

const formatSyncConflictMessage = (
  count: number,
  language: SupportedLanguage,
) => {
  if (language === "pt") {
    return `${count} conflito${count === 1 ? "" : "s"} de sincronização precisa${count === 1 ? "" : "m"} de revisão.`;
  }
  if (language === "es") {
    return `${count} conflicto${count === 1 ? "" : "s"} de sincronización necesita${count === 1 ? "" : "n"} revisión.`;
  }
  return `${count} sync conflict${count === 1 ? "" : "s"} need review.`;
};

const formatSyncSummaryMessage = (
  uploaded: number,
  downloaded: number,
  deleted: number,
  language: SupportedLanguage,
) => {
  if (language === "pt") {
    return `${uploaded} enviados, ${downloaded} baixados, ${deleted} removidos.`;
  }
  if (language === "es") {
    return `${uploaded} subidos, ${downloaded} descargados, ${deleted} eliminados.`;
  }
  return `${uploaded} uploaded, ${downloaded} downloaded, ${deleted} deleted.`;
};

const importErrorMessage = (
  error: unknown,
  labels: {
    importReadFailed: string;
    importInvalidJson: string;
    importUnsupportedFile: string;
    importEmptyBundle: string;
    importNativeUnavailable: string;
    importFailed: string;
  },
) => {
  if (!(error instanceof DrawingImportError)) {
    return errorMessageOf(error, labels.importFailed);
  }

  if (error.code === "read_failed") return labels.importReadFailed;
  if (error.code === "invalid_json") return labels.importInvalidJson;
  if (error.code === "empty_bundle") return labels.importEmptyBundle;
  if (error.code === "native_picker_unavailable") {
    return labels.importNativeUnavailable;
  }
  return labels.importUnsupportedFile;
};

const shareErrorMessage = (
  error: unknown,
  labels: {
    nativeShareUnavailable: string;
    exportManyFailed: string;
  },
) => {
  if (
    error instanceof DrawingShareError &&
    error.code === "native_share_unavailable"
  ) {
    return labels.nativeShareUnavailable;
  }

  return errorMessageOf(error, labels.exportManyFailed);
};

const formatDrawingsExportedMessage = (
  count: number,
  filename: string,
  language: SupportedLanguage,
) => {
  if (language === "pt") {
    return `${count} desenho${count === 1 ? "" : "s"} exportado${count === 1 ? "" : "s"} para ${filename}.`;
  }
  if (language === "es") {
    return `${count} dibujo${count === 1 ? "" : "s"} exportado${count === 1 ? "" : "s"} a ${filename}.`;
  }
  return `${count} drawing${count === 1 ? "" : "s"} exported to ${filename}.`;
};

const formatDrawingsDeletedMessage = (
  count: number,
  language: SupportedLanguage,
) => {
  if (language === "pt") {
    return `${count} desenho${count === 1 ? "" : "s"} removido${count === 1 ? "" : "s"}.`;
  }
  if (language === "es") {
    return `${count} dibujo${count === 1 ? "" : "s"} eliminado${count === 1 ? "" : "s"}.`;
  }
  return `${count} drawing${count === 1 ? "" : "s"} deleted.`;
};

const formatDrawingsImportedMessage = (
  count: number,
  title: string | undefined,
  language: SupportedLanguage,
) => {
  if (language === "pt") {
    return count === 1
      ? `"${title}" importado.`
      : `${count} desenhos importados.`;
  }
  if (language === "es") {
    return count === 1
      ? `"${title}" importado.`
      : `${count} dibujos importados.`;
  }
  return count === 1
    ? `"${title}" imported.`
    : `${count} drawings imported.`;
};

const formatSelectedCount = (
  count: number,
  selectedLabel: string,
) => `${count} ${selectedLabel}`;

const formatUpdatedAt = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

const shortRevision = (revisionId?: string, fallback = "Unknown") =>
  revisionId ? revisionId.slice(0, 10) : fallback;

const parseTagsParam = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const stringifyTagsParam = (tags: string[]) => tags.join(",");

const isLibrarySortMode = (value: string): value is LibrarySortMode =>
  value === "updated_desc" || value === "updated_asc" || value === "title_asc";

export function DrawingHomeScreen({
  onOpenCanvas,
  onCreateDrawing,
  language,
  onLanguageChange,
  themeMode,
  onThemeChange,
}: DrawingHomeScreenProps) {
  const { t } = useTranslations(language);
  const queryParams = useHomeQueryParams();
  const selectedTags = parseTagsParam(queryParams.tags);
  const page = Math.max(1, Number.parseInt(queryParams.page, 10) || 1);
  const sortMode: LibrarySortMode = isLibrarySortMode(queryParams.sort)
    ? queryParams.sort
    : "updated_desc";

  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [mode, setMode] = useState<ScreenMode>("library");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [conflictDrawing, setConflictDrawing] = useState<DrawingSummary | null>(
    null,
  );
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const theme = appThemes[themeMode];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [syncState, setSyncState] = useState<SyncState>(
    googleDriveSync.getState(),
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncInFlightRef = useRef(false);
  const lastAutoSyncSignatureRef = useRef("");
  const [loading, setLoading] = useState(true);

  const loadDrawings = async () => {
    setLoading(true);
    try {
      setDrawings(await drawingRepository.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrawings();
    jsonStorage.get<string[]>(CUSTOM_TAGS_KEY).then((storedTags) => {
      if (Array.isArray(storedTags)) setCustomTags(storedTags);
    });
    jsonStorage.get<boolean>(DRIVE_AUTO_CONNECT_KEY).then((wasConnected) => {
      if (wasConnected) {
        void connectDrive({
          prompt: "",
          silent: true,
          syncAfterConnect: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    setSelectedDrawingIds((currentIds) =>
      currentIds.filter((id) => drawings.some((drawing) => drawing.id === id)),
    );
  }, [drawings]);

  const allTags = useMemo(() => {
    const drawingTags = drawings.flatMap((drawing) => drawing.flatTags);
    return Array.from(new Set([...customTags, ...drawingTags])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [customTags, drawings]);

  const syncedCount = drawings.filter(
    (drawing) =>
      !drawing.syncConflict &&
      drawing.syncStatus !== "pending" &&
      drawing.syncStatus !== "failed" &&
      Boolean(drawing.driveFileId),
  ).length;
  const pendingCount = drawings.filter(
    (drawing) => drawing.syncStatus === "pending",
  ).length;
  const failedCount = drawings.filter(
    (drawing) => drawing.syncStatus === "failed",
  ).length;
  const conflictCount = drawings.filter((drawing) => drawing.syncConflict).length;

  const filteredDrawings = useMemo(() => {
    const normalizedQuery = queryParams.query.trim().toLowerCase();

    const matches = drawings.filter((drawing) => {
      const matchesQuery =
        !normalizedQuery ||
        [drawing.title, ...drawing.flatTags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => drawing.flatTags.includes(tag));

      return matchesQuery && matchesTags;
    });

    return matches.sort((a, b) => {
      if (sortMode === "title_asc") {
        return a.title.localeCompare(b.title);
      }

      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return sortMode === "updated_asc" ? aTime - bTime : bTime - aTime;
    });
  }, [drawings, queryParams.query, selectedTags, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredDrawings.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pagedDrawings = filteredDrawings.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  const setPage = (nextPage: number) => {
    queryParams.setPage(String(Math.max(1, Math.min(totalPages, nextPage))));
  };

  const setSelectedTags = (tags: string[]) => {
    queryParams.setTags(stringifyTagsParam(tags));
    queryParams.setPage("1");
  };

  const setSortMode = (nextSortMode: LibrarySortMode) => {
    queryParams.setSort(nextSortMode);
    queryParams.setPage("1");
  };

  const toggleTag = (tag: string) => {
    if (tag === "all") {
      setSelectedTags([]);
      return;
    }

    setSelectedTags(
      selectedTags.includes(tag)
        ? selectedTags.filter((selectedTag) => selectedTag !== tag)
        : [...selectedTags, tag],
    );
  };

  const startNewDrawing = () => {
    const inheritedTags = selectedTags.map((name) => new CompositeTag({ name }));
    onCreateDrawing(inheritedTags);
  };

  const duplicateDrawing = async (id: string) => {
    await drawingRepository.duplicate(id);
    await loadDrawings();
  };

  const toggleDrawingSelection = (id: string) => {
    setSelectedDrawingIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    );
  };

  const selectCurrentPage = () => {
    setSelectedDrawingIds((currentIds) =>
      Array.from(new Set([...currentIds, ...pagedDrawings.map((drawing) => drawing.id)])),
    );
  };

  const clearSelection = () => setSelectedDrawingIds([]);

  const exportSelectedDrawings = async () => {
    try {
      const documents = (
        await Promise.all(
          selectedDrawingIds.map((id) => drawingRepository.get(id)),
        )
      ).filter((document): document is NonNullable<typeof document> => document !== null);

      if (documents.length === 0) return;

      const result = await exportDrawingBundleJson(documents);
      setToast({
        message: formatDrawingsExportedMessage(
          documents.length,
          result.filename,
          language,
        ),
        tone: "success",
      });
      setTimeout(() => setToast(null), 5000);
    } catch (error) {
      setToast({
        message: shareErrorMessage(error, t),
        tone: "error",
      });
      setTimeout(() => setToast(null), 7000);
    }
  };

  const deleteSelectedDrawings = async () => {
    const idsToDelete = [...selectedDrawingIds];
    if (idsToDelete.length === 0) return;

    await Promise.all(idsToDelete.map((id) => drawingRepository.delete(id)));
    clearSelection();
    await loadDrawings();
    setToast({
      message: formatDrawingsDeletedMessage(idsToDelete.length, language),
      tone: "success",
    });
    setTimeout(() => setToast(null), 4000);
  };

  const importDrawing = async () => {
    try {
      const documents = await pickDrawingJson();
      if (!documents) return;

      const importedDocuments = await Promise.all(
        documents.map((document) => drawingRepository.importDocument(document)),
      );
      await loadDrawings();
      setToast({
        message: formatDrawingsImportedMessage(
          importedDocuments.length,
          importedDocuments[0]?.metadata.title,
          language,
        ),
        tone: "success",
      });
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      setToast({
        message: importErrorMessage(error, t),
        tone: "error",
      });
      setTimeout(() => setToast(null), 7000);
    }
  };

  const deleteDrawing = async (id: string) => {
    await drawingRepository.delete(id);
    await loadDrawings();
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return;

    const nextTags = Array.from(new Set([...customTags, name])).sort();
    setCustomTags(nextTags);
    await jsonStorage.set(CUSTOM_TAGS_KEY, nextTags);
    setSelectedTags(Array.from(new Set([...selectedTags, name])));
    setNewTagName("");
    setTagDialogOpen(false);
  };

  const connectDrive = async (
    options: ConnectDriveOptions = {},
  ): Promise<boolean> => {
    const { prompt = "consent", silent = false, syncAfterConnect = true } = options;
    if (syncInFlightRef.current) return googleDriveSync.isReady();

    syncInFlightRef.current = true;
    setSyncMessage(silent ? t.checkingGoogleDrive : t.openingGoogleSignIn);
    setSyncState({ status: "syncing" });
    try {
      const nextState = await googleDriveSync.signIn({ prompt });
      if (nextState.status === "error") {
        if (!silent) {
          setToast({
            message: nextState.message,
            tone: nextState.code === "popup_failed_to_open" ? "warning" : "error",
          });
        }
        googleDriveSync.signOut();
        setSyncState(googleDriveSync.getState());
        if (!silent) setTimeout(() => setToast(null), 7000);
        return false;
      }

      setSyncState(nextState);
      if (nextState.status === "ready") {
        await jsonStorage.set(DRIVE_AUTO_CONNECT_KEY, true);
        if (syncAfterConnect) {
          syncInFlightRef.current = false;
          await syncLocalDrawings({ interactive: false });
          return true;
        }

        if (!silent) {
          setToast({ message: t.googleDriveConnected, tone: "success" });
          setTimeout(() => setToast(null), 4000);
        }
        return true;
      }

      return false;
    } finally {
      if (syncInFlightRef.current) {
        syncInFlightRef.current = false;
        setSyncMessage(null);
      }
    }
  };

  const syncLocalDrawings = async (
    options: SyncLocalDrawingsOptions = {},
  ) => {
    const { interactive = true, silent = false, onlyDrawingId } = options;
    if (syncInFlightRef.current) return;

    if (!googleDriveSync.isReady()) {
      if (!interactive) return;
      await connectDrive({ syncAfterConnect: false });
      if (!googleDriveSync.isReady()) return;
    }

    syncInFlightRef.current = true;
    setSyncMessage(t.syncingDrawings);
    setSyncState({ status: "syncing" });
    try {
      const latestDrawings = await drawingRepository.list();
      const queuedItems = await drawingSyncQueue.list();
      const queuedIds = new Set(queuedItems.map((item) => item.drawingId));

      for (const drawing of latestDrawings) {
        if (onlyDrawingId && drawing.id !== onlyDrawingId) continue;
        if (drawing.syncConflict) continue;
        if (!queuedIds.has(drawing.id) && !drawing.driveFileId) {
          await drawingSyncQueue.enqueue(drawing.id, "upload");
        }
      }

      const readyQueue = (await drawingSyncQueue.listReady()).filter((item) =>
        onlyDrawingId ? item.drawingId === onlyDrawingId : true,
      );
      let uploadedCount = 0;
      let deletedCount = 0;
      let failedCount = 0;

      for (const item of readyQueue) {
        await drawingSyncQueue.recordAttempt(item.drawingId);

        try {
          const document = await drawingRepository.get(item.drawingId);
          if (!document) {
            await drawingSyncQueue.markSynced(item.drawingId);
            continue;
          }

          if (item.operation === "delete" || document.metadata.deletedAt) {
            if (document.metadata.driveFileId) {
              await googleDriveSync.deleteDocument(document.metadata.driveFileId);
              deletedCount += 1;
            }

            await drawingRepository.save(
              {
                ...document,
                metadata: {
                  ...document.metadata,
                  syncStatus: "synced",
                  syncError: undefined,
                },
              },
              { sync: "synced" },
            );
            continue;
          }

          const syncedDocument = await googleDriveSync.uploadDocument({
            ...document,
            metadata: {
              ...document.metadata,
              syncConflict: false,
              syncError: undefined,
            },
          });
          await drawingRepository.save(syncedDocument, { sync: "synced" });
          uploadedCount += 1;
        } catch (error) {
          failedCount += 1;
          const message = errorMessageOf(
            error,
            t.googleDriveSyncFailed,
          );
          await drawingSyncQueue.markFailed(item.drawingId, message);
          await drawingRepository.markSyncFailed(item.drawingId, message);
        }
      }

      const remoteFiles = await googleDriveSync.listDocuments();
      const latestLocalDrawings = await drawingRepository.list();
      const localByDriveId = new Map(
        latestLocalDrawings
          .filter((drawing) => drawing.driveFileId)
          .map((drawing) => [drawing.driveFileId, drawing]),
      );
      let downloadedCount = 0;
      let conflictCount = 0;

      for (const file of remoteFiles) {
        const localDrawing = localByDriveId.get(file.id);
        if (localDrawing) {
          if (
            file.headRevisionId &&
            localDrawing.driveRevisionId &&
            file.headRevisionId !== localDrawing.driveRevisionId
          ) {
            const localDocument = await drawingRepository.get(localDrawing.id);
            if (localDocument) {
              await drawingRepository.save(
                {
                  ...localDocument,
                  metadata: {
                    ...localDocument.metadata,
                    syncConflict: true,
                    syncConflictRemoteRevisionId: file.headRevisionId,
                    syncConflictRemoteUpdatedAt: file.modifiedTime,
                  },
                },
                { sync: "preserve" },
              );
              conflictCount += 1;
            }
          }
          continue;
        }

        const remoteDocument = await googleDriveSync.downloadDocument(file.id);
        await drawingRepository.save(
          {
            ...remoteDocument,
            metadata: {
              ...remoteDocument.metadata,
              driveFileId: file.id,
              driveRevisionId: file.headRevisionId,
            },
          },
          { sync: "remote" },
        );
        downloadedCount += 1;
      }

      await loadDrawings();
      setSyncState(googleDriveSync.getState());
      if (!silent || conflictCount > 0 || failedCount > 0) {
        setToast({
          message:
            failedCount > 0
              ? formatSyncFailureMessage(failedCount, language)
              : conflictCount > 0
              ? formatSyncConflictMessage(conflictCount, language)
              : uploadedCount === 0 && deletedCount === 0 && downloadedCount === 0
              ? t.allDrawingsSynced
              : formatSyncSummaryMessage(
                  uploadedCount,
                  downloadedCount,
                  deletedCount,
                  language,
                ),
          tone: failedCount > 0 || conflictCount > 0 ? "warning" : "success",
        });
        setTimeout(() => setToast(null), 5000);
      }
    } catch (error) {
      setSyncState(googleDriveSync.getState());
      if (!silent) {
        setToast({
          message: errorMessageOf(error, t.googleDriveSyncFailed),
          tone: "error",
        });
        setTimeout(() => setToast(null), 7000);
      }
    } finally {
      syncInFlightRef.current = false;
      setSyncMessage(null);
    }
  };

  useEffect(() => {
    if (loading || !googleDriveSync.isReady() || drawings.length === 0) return;

    const signature = drawings
      .map(
        (drawing) =>
          `${drawing.id}:${drawing.updatedAt}:${drawing.driveFileId ?? "local"}:${drawing.driveRevisionId ?? "none"}:${drawing.syncStatus ?? "unknown"}:${drawing.syncConflict ? "conflict" : "clean"}`,
      )
      .join("|");

    if (signature === lastAutoSyncSignatureRef.current) return;
    lastAutoSyncSignatureRef.current = signature;
    void syncLocalDrawings({ interactive: false, silent: true });
  }, [drawings, loading]);

  useEffect(() => {
    if (!googleDriveSync.isReady()) return;

    const retryQueuedSync = () => {
      void syncLocalDrawings({ interactive: false, silent: true });
    };
    const intervalId = setInterval(retryQueuedSync, 60_000);

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", retryQueuedSync);
      return () => {
        clearInterval(intervalId);
        window.removeEventListener("online", retryQueuedSync);
      };
    }

    return () => clearInterval(intervalId);
  }, [syncState.status]);

  const syncStatusLabel =
    syncState.status === "syncing"
      ? syncMessage ?? t.syncingDrawings
      : describeSyncState(syncState, t);
  const syncStatsLabel = `${drawings.length} ${t.drawingsSaved} / ${syncedCount} ${t.synced} / ${pendingCount} ${t.pending} / ${failedCount} ${t.failed} / ${conflictCount} ${t.conflicts}`;
  const syncButtonLabel = googleDriveSync.isReady()
    ? t.syncNow
    : t.connectAndSync;

  const syncDrawing = async (drawing: DrawingSummary) => {
    if (syncInFlightRef.current) return;

    try {
      const document = await drawingRepository.get(drawing.id);
      if (!document) return;

      await drawingRepository.save({
        ...document,
        metadata: {
          ...document.metadata,
          syncConflict: false,
          syncError: undefined,
        },
      });
      await loadDrawings();
      await syncLocalDrawings({ interactive: true, onlyDrawingId: drawing.id });
    } catch (error) {
      setSyncState(googleDriveSync.getState());
      setToast({
        message: errorMessageOf(error, t.couldNotSyncDrawing),
        tone: "error",
      });
      setTimeout(() => setToast(null), 7000);
    }
  };

  const useCloudVersion = async (drawing: DrawingSummary) => {
    if (!drawing.driveFileId) return;

    if (!googleDriveSync.isReady()) {
      await connectDrive({ syncAfterConnect: false });
      if (!googleDriveSync.isReady()) return;
    }

    const remoteFiles = await googleDriveSync.listDocuments();
    const remoteFile = remoteFiles.find((file) => file.id === drawing.driveFileId);
    const remoteDocument = await googleDriveSync.downloadDocument(drawing.driveFileId);

    await drawingRepository.save({
      ...remoteDocument,
      metadata: {
        ...remoteDocument.metadata,
        driveFileId: drawing.driveFileId,
        driveRevisionId: remoteFile?.headRevisionId,
        syncConflict: false,
      },
    }, { sync: "remote" });
  };

  const keepLocalVersion = async (drawing: DrawingSummary) => {
    if (!googleDriveSync.isReady()) {
      await connectDrive({ syncAfterConnect: false });
      if (!googleDriveSync.isReady()) return;
    }

    const localDocument = await drawingRepository.get(drawing.id);
    if (!localDocument) return;

    const syncedDocument = await googleDriveSync.uploadDocument({
      ...localDocument,
      metadata: {
        ...localDocument.metadata,
        syncConflict: false,
      },
    });
    await drawingRepository.save({
      ...syncedDocument,
      metadata: {
        ...syncedDocument.metadata,
        syncConflict: false,
      },
    }, { sync: "synced" });
  };

  const resolveConflict = async (
    drawing: DrawingSummary,
    action: "keep-local" | "use-cloud" | "duplicate-both",
  ) => {
    try {
      setSyncState({ status: "syncing" });

      if (action === "duplicate-both") {
        const duplicate = await drawingRepository.duplicate(drawing.id);
        if (duplicate) {
          await drawingRepository.rename(
            duplicate.metadata.id,
            `${drawing.title} local copy`,
          );
        }
        await useCloudVersion(drawing);
      }

      if (action === "keep-local") {
        await keepLocalVersion(drawing);
      }

      if (action === "use-cloud") {
        await useCloudVersion(drawing);
      }

      setConflictDrawing(null);
      await loadDrawings();
      setSyncState(googleDriveSync.getState());
      setToast({ message: t.syncConflictResolved, tone: "success" });
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      setSyncState(googleDriveSync.getState());
      setToast({
        message:
          error instanceof Error
            ? error.message
            : t.couldNotResolveSyncConflict,
        tone: "error",
      });
      setTimeout(() => setToast(null), 7000);
    }
  };

  const renderLibrary = () => (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t.library}</Text>
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            Infinite Canvas
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={t.importDrawing}
            style={styles.secondaryIconButton}
            onPress={importDrawing}
            {...webTitle(t.importDrawing)}
          >
            <AppIcon icon="mdi:file-import-outline" size={21} color={theme.text} />
          </Pressable>
          <Pressable
            accessibilityLabel={t.createDrawing}
            style={styles.newButton}
            onPress={startNewDrawing}
            {...webTitle(t.createDrawing)}
          >
            <AppIcon icon="mdi:plus" size={21} color={theme.primaryText} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <AppIcon icon="mdi:magnify" size={21} color={theme.textMuted} />
          <TextInput
            value={queryParams.query}
            onChangeText={(value) => {
              queryParams.setQuery(value);
              queryParams.setPage("1");
            }}
            placeholder={t.search}
            placeholderTextColor={theme.textMuted}
            style={styles.searchInput}
          />
        </View>
      </View>

      <View style={styles.sortRow}>
        {[
          { mode: "updated_desc" as const, label: t.sortRecent, icon: "mdi:sort-clock-descending-outline" },
          { mode: "updated_asc" as const, label: t.sortOldest, icon: "mdi:sort-clock-ascending-outline" },
          { mode: "title_asc" as const, label: t.sortName, icon: "mdi:sort-alphabetical-ascending" },
        ].map((item) => {
          const active = item.mode === sortMode;
          return (
            <Pressable
              key={item.mode}
              style={[styles.sortButton, active && styles.sortButtonActive]}
              onPress={() => setSortMode(item.mode)}
            >
              <AppIcon
                icon={item.icon}
                size={16}
                color={active ? theme.primaryText : theme.textMuted}
              />
              <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TagChips
        allLabel={t.all}
        tags={allTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onAddTag={() => setTagDialogOpen(true)}
        styles={styles}
        theme={theme}
      />

      {filteredDrawings.length > 0 && (
        <View style={styles.bulkBar}>
          <Pressable style={styles.bulkButton} onPress={selectCurrentPage}>
            <AppIcon icon="mdi:checkbox-multiple-marked-outline" size={18} color={theme.text} />
            <Text style={styles.bulkButtonText}>{t.selectAll}</Text>
          </Pressable>
          {selectedDrawingIds.length > 0 && (
            <>
              <Text style={styles.bulkCount}>
                {formatSelectedCount(selectedDrawingIds.length, t.selected)}
              </Text>
              <Pressable style={styles.bulkIconButton} onPress={exportSelectedDrawings}>
                <AppIcon icon="mdi:download-outline" size={18} color={theme.text} />
              </Pressable>
              <Pressable style={styles.bulkIconButton} onPress={deleteSelectedDrawings}>
                <AppIcon icon="mdi:delete-outline" size={18} color={theme.danger} />
              </Pressable>
              <Pressable style={styles.bulkIconButton} onPress={clearSelection}>
                <AppIcon icon="mdi:close-circle-outline" size={18} color={theme.textMuted} />
              </Pressable>
            </>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <>
          <FlatList
            data={pagedDrawings}
            keyExtractor={(drawing) => drawing.id}
            contentContainerStyle={
              pagedDrawings.length === 0 ? styles.emptyList : styles.list
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <AppIcon
                    icon="mdi:folder-open-outline"
                    size={40}
                    color={theme.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>{t.noDrawings}</Text>
                <Text style={styles.emptyText}>{t.noDrawingsBody}</Text>
                <Pressable
                  style={styles.emptyButton}
                  onPress={startNewDrawing}
                  {...webTitle(t.createDrawing)}
                >
                  <AppIcon icon="mdi:plus" size={20} color={theme.primaryText} />
                  <Text style={styles.emptyButtonText}>{t.createDrawing}</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.card,
                  selectedDrawingIds.includes(item.id) && styles.cardSelected,
                ]}
                onPress={() =>
                  selectedDrawingIds.length > 0
                    ? toggleDrawingSelection(item.id)
                    : onOpenCanvas(item)
                }
                onLongPress={() => toggleDrawingSelection(item.id)}
              >
                <Pressable
                  accessibilityLabel={`Select ${item.title}`}
                  style={styles.selectionButton}
                  onPress={() => toggleDrawingSelection(item.id)}
                >
                  <AppIcon
                    icon={
                      selectedDrawingIds.includes(item.id)
                        ? "mdi:checkbox-marked-circle-outline"
                        : "mdi:checkbox-blank-circle-outline"
                    }
                    size={21}
                    color={
                      selectedDrawingIds.includes(item.id)
                        ? theme.primary
                        : theme.textMuted
                    }
                  />
                </Pressable>
                <View style={styles.thumbnail}>
                  <AppIcon
                    icon="mdi:folder-open-outline"
                    size={28}
                    color={theme.primaryStrong}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {t.updated} {formatUpdatedAt(item.updatedAt)}
                  </Text>
                  <Text style={styles.tags} numberOfLines={1}>
                    {item.flatTags.length ? item.flatTags.join(", ") : t.noTags}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  {item.syncConflict ? (
                    <Pressable
                      style={[styles.syncBadge, styles.syncBadgeConflict]}
                      onPress={() => setConflictDrawing(item)}
                    >
                      <Text style={styles.syncBadgeText}>{t.conflictBadge}</Text>
                    </Pressable>
                  ) : item.syncStatus === "failed" ? (
                    <Pressable
                      accessibilityLabel={`Retry sync ${item.title}`}
                      style={[styles.syncBadge, styles.syncBadgeConflict]}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        void syncDrawing(item);
                      }}
                    >
                      <Text style={styles.syncBadgeText}>{t.failedBadge}</Text>
                    </Pressable>
                  ) : item.syncStatus === "pending" ? (
                    <Pressable
                      accessibilityLabel={`Sync pending ${item.title}`}
                      disabled={syncState.status === "syncing"}
                      style={[
                        styles.syncBadge,
                        syncState.status === "syncing" && styles.syncIconButtonDisabled,
                      ]}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        void syncDrawing(item);
                      }}
                    >
                      <Text style={styles.syncBadgeText}>{t.pendingBadge}</Text>
                    </Pressable>
                  ) : item.syncStatus === "synced" || item.driveFileId ? (
                    <View style={[styles.syncBadge, styles.syncBadgeActive]}>
                      <Text style={styles.syncBadgeText}>{t.syncedBadge}</Text>
                    </View>
                  ) : !item.driveFileId ? (
                    <Pressable
                      accessibilityLabel={`Sync ${item.title}`}
                      disabled={syncState.status === "syncing"}
                      style={[
                        styles.syncIconButton,
                        syncState.status === "syncing" && styles.syncIconButtonDisabled,
                      ]}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        void syncDrawing(item);
                      }}
                    >
                      <AppIcon
                        icon="mdi:cloud-upload-outline"
                        size={19}
                        color={theme.accent}
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={`Duplicate ${item.title}`}
                    style={styles.cardIconButton}
                    onPress={() => duplicateDrawing(item.id)}
                  >
                    <CopyPlusIcon size={19} color={theme.text} plusColor={theme.accent} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Delete ${item.title}`}
                    style={styles.cardIconButton}
                    onPress={() => deleteDrawing(item.id)}
                  >
                    <AppIcon
                      icon="mdi:delete-outline"
                      size={20}
                      color={theme.danger}
                    />
                  </Pressable>
                </View>
              </Pressable>
            )}
          />
          {filteredDrawings.length > 0 && (
            <View style={styles.pagination}>
              <Pressable
                disabled={clampedPage <= 1}
                style={[
                  styles.pageButton,
                  clampedPage <= 1 && styles.pageButtonDisabled,
                ]}
                onPress={() => setPage(clampedPage - 1)}
              >
                <Text style={styles.pageButtonText}>{t.previous}</Text>
              </Pressable>
              <Text style={styles.pageCount}>
                {clampedPage} / {totalPages}
              </Text>
              <Pressable
                disabled={clampedPage >= totalPages}
                style={[
                  styles.pageButton,
                  clampedPage >= totalPages && styles.pageButtonDisabled,
                ]}
                onPress={() => setPage(clampedPage + 1)}
              >
                <Text style={styles.pageButtonText}>{t.next}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </>
  );

  const renderTags = () => (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t.tags}</Text>
          <Text style={styles.title}>{t.tags}</Text>
        </View>
        <Pressable style={styles.newButton} onPress={() => setTagDialogOpen(true)}>
          <AppIcon icon="mdi:plus" size={21} color={theme.primaryText} />
        </Pressable>
      </View>
      <TagChips
        allLabel={t.all}
        tags={allTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onAddTag={() => setTagDialogOpen(true)}
        styles={styles}
        theme={theme}
      />
    </>
  );

  const renderSettings = () => (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t.settings}</Text>
          <Text style={styles.title}>{t.workspace}</Text>
        </View>
      </View>
      <View style={styles.panel}>
        <View style={styles.panelIconPrimary}>
          <AppIcon
            icon="mdi:cloud-sync-outline"
            size={28}
            color={theme.primaryText}
          />
        </View>
        <Text style={styles.panelTitle}>{t.cloudSync}</Text>
        <Text style={styles.panelText}>{t.cloudSyncHelp}</Text>
        {syncState.status === "syncing" ? (
          <View style={styles.inlineStatus}>
            <ActivityIndicator color={theme.primary} />
            <Text style={styles.inlineStatusText}>{syncStatusLabel}</Text>
          </View>
        ) : (
          <Text style={styles.statusLabel}>{syncStatusLabel}</Text>
        )}
        <Text style={styles.syncStats}>{syncStatsLabel}</Text>
        <Pressable
          accessibilityLabel={syncButtonLabel}
          disabled={syncState.status === "syncing"}
          style={[
            styles.primaryButtonWide,
            syncState.status === "syncing" && styles.primaryButtonWideDisabled,
          ]}
          onPress={() =>
            googleDriveSync.isReady()
              ? syncLocalDrawings()
              : connectDrive({ syncAfterConnect: true })
          }
          {...webTitle(syncButtonLabel)}
        >
          <AppIcon
            icon="mdi:cloud-sync-outline"
            size={20}
            color={theme.primaryText}
          />
          <Text style={styles.primaryButtonWideText}>{syncButtonLabel}</Text>
        </Pressable>
      </View>
      <View style={styles.panel}>
        <View style={styles.panelIconSoft}>
          <AppIcon icon="mdi:cog-outline" size={26} color={theme.primary} />
        </View>
        <Text style={styles.panelTitle}>{t.appearance}</Text>
        <View style={styles.segmentedControl}>
          {(["dark", "light"] as const).map((themeOption) => (
            <Pressable
              key={themeOption}
              style={[
                styles.segmentButton,
                themeMode === themeOption && styles.segmentButtonActive,
              ]}
              onPress={() => onThemeChange(themeOption)}
            >
              <Text
                style={[
                  styles.segmentText,
                  themeMode === themeOption && styles.segmentTextActive,
                ]}
              >
                {themeOption === "dark" ? t.darkTheme : t.lightTheme}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.panel}>
        <View style={styles.panelIconSoft}>
          <AppIcon icon="mdi:translate" size={26} color={theme.primary} />
        </View>
        <Text style={styles.panelTitle}>{t.language}</Text>
        <View style={styles.segmentedControl}>
          {[
            { value: "en" as const, label: "English" },
            { value: "pt" as const, label: "Português" },
            { value: "es" as const, label: "Español" },
          ].map((languageOption) => (
            <Pressable
              key={languageOption.value}
              style={[
                styles.segmentButton,
                language === languageOption.value && styles.segmentButtonActive,
              ]}
              onPress={() => onLanguageChange(languageOption.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  language === languageOption.value && styles.segmentTextActive,
                ]}
              >
                {languageOption.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {mode === "library" && renderLibrary()}
          {mode === "tags" && renderTags()}
          {mode === "settings" && renderSettings()}
        </View>
      </ScrollView>
      <HomeBottomNav
        mode={mode}
        setMode={setMode}
        styles={styles}
        theme={theme}
        labels={{ library: t.library, tags: t.tags, settings: t.settings }}
      />
      <TagDialog
        visible={tagDialogOpen}
        value={newTagName}
        setValue={setNewTagName}
        onCancel={() => setTagDialogOpen(false)}
        onSave={createTag}
        styles={styles}
        labels={{ title: t.addTag, input: t.tagName, save: t.save, cancel: t.cancel }}
      />
      <ConflictDialog
        drawing={conflictDrawing}
        onCancel={() => setConflictDrawing(null)}
        onResolve={resolveConflict}
        styles={styles}
        labels={{
          title: t.resolveSyncConflict,
          help: t.resolveSyncConflictHelp,
          localVersion: t.localVersion,
          cloudVersion: t.cloudVersion,
          updated: t.updated,
          revision: t.revision,
          unknown: t.unknown,
          keepLocal: t.keepLocal,
          useCloud: t.useCloud,
          duplicateBoth: t.duplicateBoth,
          cancel: t.cancel,
        }}
      />
      {toast && <ToastMessage toast={toast} styles={styles} theme={theme} />}
    </SafeAreaView>
  );
}

function TagChips({
  allLabel,
  tags,
  selectedTags,
  onToggleTag,
  onAddTag,
  styles,
  theme,
}: {
  allLabel: string;
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onAddTag: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  return (
    <View style={styles.chipPanel}>
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.chipWrap}
        style={styles.chipScroll}
      >
        <Pressable
          style={[styles.chip, selectedTags.length === 0 && styles.chipActive]}
          onPress={() => onToggleTag("all")}
        >
          <Text
            style={[
              styles.chipText,
              selectedTags.length === 0 && styles.chipTextActive,
            ]}
          >
            {allLabel}
          </Text>
        </Pressable>
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => onToggleTag(tag)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {tag}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.addChip} onPress={onAddTag}>
          <AppIcon icon="mdi:plus" size={16} color={theme.primaryText} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function HomeBottomNav({
  mode,
  setMode,
  styles,
  theme,
  labels,
}: {
  mode: ScreenMode;
  setMode: (mode: ScreenMode) => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  labels: Record<ScreenMode, string>;
}) {
  const items: Array<{ mode: ScreenMode; icon: string }> = [
    { mode: "library", icon: "mdi:home-outline" },
    { mode: "tags", icon: "mdi:tag-multiple-outline" },
    { mode: "settings", icon: "mdi:cog-outline" },
  ];

  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const active = item.mode === mode;
        return (
          <Pressable
            key={item.mode}
            style={[styles.navItem, active && styles.navItemActive]}
            onPress={() => setMode(item.mode)}
          >
            <AppIcon
              icon={item.icon}
              size={20}
              color={active ? theme.primaryText : theme.textMuted}
            />
            <Text style={[styles.navText, active && styles.navTextActive]}>
              {labels[item.mode]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TagDialog({
  visible,
  value,
  setValue,
  onCancel,
  onSave,
  styles,
  labels,
}: {
  visible: boolean;
  value: string;
  setValue: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  styles: ReturnType<typeof createStyles>;
  labels: { title: string; input: string; save: string; cancel: string };
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={labels.input}
            style={styles.dialogInput}
          />
          <View style={styles.dialogActions}>
            <Pressable style={styles.dialogButton} onPress={onCancel}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable style={styles.dialogButtonPrimary} onPress={onSave}>
              <Text style={styles.dialogButtonPrimaryText}>{labels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConflictDialog({
  drawing,
  onCancel,
  onResolve,
  styles,
  labels,
}: {
  drawing: DrawingSummary | null;
  onCancel: () => void;
  onResolve: (
    drawing: DrawingSummary,
    action: "keep-local" | "use-cloud" | "duplicate-both",
  ) => void | Promise<void>;
  styles: ReturnType<typeof createStyles>;
  labels: {
    title: string;
    help: string;
    localVersion: string;
    cloudVersion: string;
    updated: string;
    revision: string;
    unknown: string;
    keepLocal: string;
    useCloud: string;
    duplicateBoth: string;
    cancel: string;
  };
}) {
  if (!drawing) {
    return null;
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogHelpText}>
            {labels.help.replace("{title}", drawing.title)}
          </Text>
          <View style={styles.conflictCompareRow}>
            <View style={styles.conflictVersionCard}>
              <Text style={styles.conflictVersionTitle}>{labels.localVersion}</Text>
              <Text style={styles.conflictMetaLabel}>{labels.updated}</Text>
              <Text style={styles.conflictMetaValue}>
                {formatUpdatedAt(drawing.updatedAt)}
              </Text>
              <Text style={styles.conflictMetaLabel}>{labels.revision}</Text>
              <Text style={styles.conflictMetaValue}>
                {shortRevision(drawing.driveRevisionId, labels.unknown)}
              </Text>
            </View>
            <View style={styles.conflictVersionCard}>
              <Text style={styles.conflictVersionTitle}>{labels.cloudVersion}</Text>
              <Text style={styles.conflictMetaLabel}>{labels.updated}</Text>
              <Text style={styles.conflictMetaValue}>
                {drawing.syncConflictRemoteUpdatedAt
                  ? formatUpdatedAt(drawing.syncConflictRemoteUpdatedAt)
                  : labels.unknown}
              </Text>
              <Text style={styles.conflictMetaLabel}>{labels.revision}</Text>
              <Text style={styles.conflictMetaValue}>
                {shortRevision(
                  drawing.syncConflictRemoteRevisionId,
                  labels.unknown,
                )}
              </Text>
            </View>
          </View>
          <View style={styles.conflictActions}>
            <Pressable
              style={styles.dialogButtonPrimary}
              onPress={() => onResolve(drawing, "keep-local")}
            >
              <Text style={styles.dialogButtonPrimaryText}>{labels.keepLocal}</Text>
            </Pressable>
            <Pressable
              style={styles.dialogButton}
              onPress={() => onResolve(drawing, "use-cloud")}
            >
              <Text style={styles.dialogButtonText}>{labels.useCloud}</Text>
            </Pressable>
            <Pressable
              style={styles.dialogButton}
              onPress={() => onResolve(drawing, "duplicate-both")}
            >
              <Text style={styles.dialogButtonText}>{labels.duplicateBoth}</Text>
            </Pressable>
            <Pressable style={styles.dialogButton} onPress={onCancel}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ToastMessage({
  toast,
  styles,
  theme,
}: {
  toast: ToastState;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  const icon =
    toast.tone === "success"
      ? "mdi:check-circle-outline"
      : toast.tone === "warning"
        ? "mdi:alert-circle-outline"
        : "mdi:close-circle-outline";
  const color =
    toast.tone === "success"
      ? theme.accent
      : toast.tone === "warning"
        ? theme.primary
        : theme.danger;

  return (
    <View style={styles.toast}>
      <AppIcon icon={icon} size={22} color={color} />
      <Text style={styles.toastText}>{toast.message}</Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 24,
    },
    scroll: {
      flex: 1,
      width: "100%",
    },
    scrollContent: {
      alignItems: "center",
      paddingBottom: 20,
      width: "100%",
    },
    content: {
      flex: 1,
      maxWidth: 720,
      width: "100%",
    },
    headerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
      justifyContent: "space-between",
      marginBottom: 22,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    title: {
      color: theme.text,
      flexShrink: 1,
      fontSize: 32,
      fontWeight: "800",
      marginTop: 4,
      minWidth: 0,
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 5,
    },
    headerActions: {
      flexDirection: "row",
      gap: 10,
    },
    newButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    secondaryIconButton: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    searchRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    searchBox: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 48,
      paddingHorizontal: 13,
    },
    searchInput: {
      color: theme.text,
      flex: 1,
      fontSize: 15,
      minWidth: 0,
      paddingVertical: 10,
    },
    sortRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    sortButton: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 8,
    },
    sortButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    sortButtonText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: "800",
    },
    sortButtonTextActive: {
      color: theme.primaryText,
    },
    chipPanel: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 14,
      padding: 10,
    },
    chipScroll: {
      maxHeight: 104,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    chipText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "800",
    },
    chipTextActive: {
      color: theme.primaryText,
    },
    addChip: {
      alignItems: "center",
      backgroundColor: theme.primaryStrong,
      borderRadius: 999,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    syncStats: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 6,
      lineHeight: 18,
    },
    bulkBar: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
      padding: 8,
    },
    bulkButton: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderRadius: 7,
      flexDirection: "row",
      gap: 7,
      minHeight: 36,
      paddingHorizontal: 10,
    },
    bulkButtonText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "800",
    },
    bulkCount: {
      color: theme.textMuted,
      flex: 1,
      fontSize: 12,
      fontWeight: "800",
      minWidth: 0,
    },
    bulkIconButton: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderRadius: 7,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    list: {
      gap: 12,
      paddingBottom: 18,
    },
    emptyList: {
      flexGrow: 1,
    },
    emptyState: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 22,
    },
    emptyIcon: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderRadius: 8,
      height: 72,
      justifyContent: "center",
      width: 72,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "800",
      marginTop: 18,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 7,
      textAlign: "center",
    },
    emptyButton: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      flexDirection: "row",
      gap: 7,
      marginTop: 20,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    emptyButtonText: {
      color: theme.primaryText,
      fontSize: 14,
      fontWeight: "800",
    },
    card: {
      alignItems: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 12,
    },
    cardSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.surfaceSoft,
    },
    selectionButton: {
      alignItems: "center",
      height: 36,
      justifyContent: "center",
      width: 28,
    },
    thumbnail: {
      alignItems: "center",
      aspectRatio: 1,
      backgroundColor: theme.surfaceSoft,
      borderRadius: 7,
      justifyContent: "center",
      width: 58,
    },
    cardBody: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "800",
    },
    cardMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    tags: {
      color: theme.accent,
      fontSize: 12,
      marginTop: 6,
    },
    cardActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    cardIconButton: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderRadius: 7,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    syncBadge: {
      backgroundColor: theme.surfaceRaised,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    syncBadgeActive: {
      backgroundColor: theme.accentSoft,
    },
    syncBadgeConflict: {
      backgroundColor: theme.surfaceSoft,
      borderColor: theme.primary,
      borderWidth: 1,
    },
    syncBadgeText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: "800",
    },
    syncIconButton: {
      alignItems: "center",
      backgroundColor: theme.accentSoft,
      borderColor: theme.mode === "light" ? "#bfddff" : theme.border,
      borderRadius: 7,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    syncIconButtonDisabled: {
      opacity: 0.48,
    },
    pagination: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      marginBottom: 12,
    },
    pageButton: {
      backgroundColor: theme.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    pageButtonDisabled: {
      opacity: 0.35,
    },
    pageButtonText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "800",
    },
    pageCount: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "800",
      minWidth: 48,
      textAlign: "center",
    },
    panel: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 14,
      padding: 18,
    },
    panelIconPrimary: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      height: 54,
      justifyContent: "center",
      marginBottom: 16,
      width: 54,
    },
    panelIconSoft: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderRadius: 8,
      height: 54,
      justifyContent: "center",
      marginBottom: 16,
      width: 54,
    },
    panelTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "800",
    },
    panelText: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
    },
    statusLabel: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 14,
    },
    inlineStatus: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    inlineStatusText: {
      color: theme.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
    },
    primaryButtonWide: {
      alignItems: "center",
      backgroundColor: theme.primary,
      borderRadius: 8,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 16,
      minHeight: 46,
    },
    primaryButtonWideDisabled: {
      opacity: 0.55,
    },
    primaryButtonWideText: {
      color: theme.primaryText,
      fontSize: 15,
      fontWeight: "800",
    },
    secondaryButtonWide: {
      alignItems: "center",
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 10,
      minHeight: 46,
    },
    secondaryButtonWideText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "800",
    },
    segmentedControl: {
      backgroundColor: theme.surfaceRaised,
      borderRadius: 8,
      flexDirection: "row",
      gap: 6,
      marginTop: 16,
      padding: 5,
    },
    segmentButton: {
      alignItems: "center",
      borderRadius: 7,
      flex: 1,
      minHeight: 38,
      justifyContent: "center",
    },
    segmentButtonActive: {
      backgroundColor: theme.primary,
    },
    segmentText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: "800",
    },
    segmentTextActive: {
      color: theme.primaryText,
    },
    bottomNav: {
      alignSelf: "center",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      maxWidth: 520,
      marginBottom: 14,
      marginTop: 10,
      padding: 6,
      width: "92%",
    },
    navItem: {
      alignItems: "center",
      borderRadius: 7,
      flex: 1,
      gap: 3,
      minHeight: 48,
      justifyContent: "center",
    },
    navItemActive: {
      backgroundColor: theme.primary,
    },
    navText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "800",
    },
    navTextActive: {
      color: theme.primaryText,
    },
    dialogBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.48)",
      flex: 1,
      justifyContent: "center",
      padding: 22,
    },
    dialog: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      maxWidth: 420,
      padding: 18,
      width: "100%",
    },
    dialogTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: "800",
      marginBottom: 14,
    },
    dialogHelpText: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 4,
    },
    conflictCompareRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    conflictVersionCard: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minWidth: 0,
      padding: 12,
    },
    conflictVersionTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "800",
      marginBottom: 8,
    },
    conflictMetaLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 6,
      textTransform: "uppercase",
    },
    conflictMetaValue: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 2,
    },
    dialogInput: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    dialogActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
      marginTop: 16,
    },
    conflictActions: {
      gap: 10,
      marginTop: 16,
    },
    dialogButton: {
      backgroundColor: theme.surfaceRaised,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    dialogButtonText: {
      color: theme.text,
      fontWeight: "800",
    },
    dialogButtonPrimary: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    dialogButtonPrimaryText: {
      color: theme.primaryText,
      fontWeight: "800",
    },
    toast: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      bottom: 90,
      flexDirection: "row",
      gap: 10,
      maxWidth: 680,
      paddingHorizontal: 14,
      paddingVertical: 12,
      position: "absolute",
      width: "92%",
    },
    toastText: {
      color: theme.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 19,
    },
  });
