import { SyncSummary } from "./components/SyncSummary";
import { errorMessageOf } from "../sync/syncFormatting";
import { useCloudSync } from "../sync/hooks/useCloudSync";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "../../shared/icons/AppIcon";
import { SupportedLanguage, useTranslations } from "../../shared/i18n/i18n";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import { appThemes, AppThemeMode } from "../../shared/theme/appPalette";
import { CompositeTag, CUSTOM_TAGS_STORAGE_KEY } from "../tags/tagModel";
import { drawingRepository, DrawingSummary } from "../documents/drawingRepository";
import { googleDriveSync } from "../sync/googleDriveSync";
import { pickDrawingJson } from "../sharing/drawingImport";
import type { CanvasDocument } from "../canvas/document";
import { useHomeQueryParams } from "./useHomeQueryParams";
import { DrawingPreview } from "./DrawingPreview";
import { createStyles } from "./homeStyles";
import { webTitle } from "../../shared/ui/webTitle";
import { DrawingTagsDialog } from "../documents/components/DrawingTagsDialog";
import type { ScreenMode, LibrarySortMode, ToastState } from "./homeTypes";
import { describeSyncState, importErrorMessage, formatDrawingsDeletedMessage, formatDrawingsImportedMessage, formatSelectedCount, formatUpdatedAt, parseTagsParam, stringifyTagsParam, isLibrarySortMode } from "./homeFormatting";
import { countUnsyncedDrawings } from "./syncSummary";
import { CloudSyncPaywall } from "../sync/components/CloudSyncPaywall";
import { TagChips } from "../home/components/TagChips";
import { HomeBottomNav } from "../home/components/HomeBottomNav";
import { TagDialog } from "../home/components/TagDialog";
import { ConflictDialog } from "../home/components/ConflictDialog";
import { DrawingOptionsDialog } from "../home/components/DrawingOptionsDialog";
import { ToastMessage } from "../home/components/ToastMessage";
type DrawingHomeScreenProps = {
    onOpenCanvas: (drawing?: DrawingSummary, openDetails?: boolean, tagOptions?: string[]) => void;
    onExportSelectedDrawings: (documents: CanvasDocument[]) => void;
    onCreateDrawing: (tags: CompositeTag[], tagOptions: string[]) => void;
    language: SupportedLanguage;
    onLanguageChange: (language: SupportedLanguage) => void;
    themeMode: AppThemeMode;
    onThemeChange: (theme: AppThemeMode) => void;
};
const PAGE_SIZE = 6;
export function DrawingHomeScreen({ onOpenCanvas, onExportSelectedDrawings, onCreateDrawing, language, onLanguageChange, themeMode, onThemeChange, }: DrawingHomeScreenProps) {
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
    const [conflictDrawing, setConflictDrawing] = useState<DrawingSummary | null>(null);
    const [signOutConfirm, setSignOutConfirm] = useState(false);
    const [tagDialogOpen, setTagDialogOpen] = useState(false);
    const [tagEditingDrawing, setTagEditingDrawing] = useState<DrawingSummary | null>(null);
    const [tagEditingSelection, setTagEditingSelection] = useState<string[]>([]);
    const [savingDrawingTags, setSavingDrawingTags] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
    const [optionsDrawing, setOptionsDrawing] = useState<DrawingSummary | null>(null);
    const longPressSelectionRef = useRef<{
        drawingId: string;
        startedAt: number;
    } | null>(null);
    const theme = appThemes[themeMode];
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (mode === "tags")
            setMode("library");
    }, [mode]);
    const hasLoadedDrawingsRef = useRef(false);
    const loadDrawings = async () => {
        if (!hasLoadedDrawingsRef.current) setLoading(true);
        try {
            setDrawings(await drawingRepository.list());
            hasLoadedDrawingsRef.current = true;
        }
        finally {
            setLoading(false);
        }
    };
    const { conflictAction, verifiedConflictIds, foreignDrawingIds, copyToCurrentAccount, account, accountStatus, entitlementStatus, busy, syncError, mainAction, signOut, inspection, inspectConflict, conflictBusy, conflictError, clearConflictError, syncState, syncConfirmed, syncMessage, cloudSyncPurchaseStatus, billingReady, cloudSyncPaywallOpen, setCloudSyncPaywallOpen, billingBusy, billingAction, billingFeedback, hasCloudSyncAccess, openCloudSyncPaywall, connectDrive, syncLocalDrawings, syncDrawing, resolveConflict, buyCloudSync, restoreCloudSyncPurchase } = useCloudSync({ drawings, loading, language, loadDrawings, setToast,
        onConflictResolved: () => setConflictDrawing(null) });
    useEffect(() => {
        loadDrawings();
        jsonStorage.get<string[]>(CUSTOM_TAGS_STORAGE_KEY).then((storedTags) => {
            if (Array.isArray(storedTags))
                setCustomTags(storedTags);
        });
    }, []);
    useEffect(() => {
        setSelectedDrawingIds((currentIds) => currentIds.filter((id) => drawings.some((drawing) => drawing.id === id)));
    }, [drawings]);
    const allTags = useMemo(() => {
        const drawingTags = drawings.flatMap((drawing) => drawing.flatTags);
        return Array.from(new Set([...customTags, ...drawingTags])).sort((a, b) => a.localeCompare(b));
    }, [customTags, drawings]);
    const unsyncedCount = countUnsyncedDrawings(drawings, foreignDrawingIds);
    const filteredDrawings = useMemo(() => {
        const normalizedQuery = queryParams.query.trim().toLowerCase();
        const matches = drawings.filter((drawing) => {
            const matchesQuery = !normalizedQuery ||
                [drawing.title, ...drawing.flatTags]
                    .join(" ")
                    .toLowerCase()
                    .includes(normalizedQuery);
            const matchesTags = selectedTags.length === 0 ||
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
    const pagedDrawings = filteredDrawings.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
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
        setSelectedTags(selectedTags.includes(tag)
            ? selectedTags.filter((selectedTag) => selectedTag !== tag)
            : [...selectedTags, tag]);
    };
    const startNewDrawing = () => {
        const inheritedTags = selectedTags.map((name) => new CompositeTag({ name }));
        onCreateDrawing(inheritedTags, allTags);
    };
    const duplicateDrawing = async (id: string) => {
        await drawingRepository.duplicate(id);
        await loadDrawings();
    };
    const toggleDrawingSelection = (id: string) => {
        setSelectedDrawingIds((currentIds) => currentIds.includes(id)
            ? currentIds.filter((currentId) => currentId !== id)
            : [...currentIds, id]);
    };
    const clearSelection = () => setSelectedDrawingIds([]);
    const handleDrawingLongPress = (id: string) => {
        longPressSelectionRef.current = { drawingId: id, startedAt: Date.now() };
        toggleDrawingSelection(id);
    };
    const handleDrawingPress = (drawing: DrawingSummary) => {
        const longPress = longPressSelectionRef.current;
        longPressSelectionRef.current = null;
        if (longPress?.drawingId === drawing.id &&
            Date.now() - longPress.startedAt < 1200) {
            return;
        }
        if (selectedDrawingIds.length > 0) {
            toggleDrawingSelection(drawing.id);
            return;
        }
        onOpenCanvas(drawing, false, allTags);
    };
    const exportSelectedDrawings = async () => {
        try {
            const documents = (await Promise.all(selectedDrawingIds.map((id) => drawingRepository.get(id)))).filter((document): document is NonNullable<typeof document> => document !== null);
            if (documents.length === 0)
                return;
            onExportSelectedDrawings(documents);
        }
        catch (error) {
            setToast({
                message: errorMessageOf(error, t.exportManyFailed),
                tone: "error",
            });
            setTimeout(() => setToast(null), 7000);
        }
    };
    const deleteSelectedDrawings = async () => {
        const idsToDelete = [...selectedDrawingIds];
        if (idsToDelete.length === 0)
            return;
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
            if (!documents)
                return;
            const importedDocuments = await Promise.all(documents.map((document) => drawingRepository.importDocument(document)));
            await loadDrawings();
            setToast({
                message: formatDrawingsImportedMessage(importedDocuments.length, importedDocuments[0]?.metadata.title, language),
                tone: "success",
            });
            setTimeout(() => setToast(null), 4000);
        }
        catch (error) {
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
        if (!name)
            return;
        const canonicalName = allTags.find((tag) => tag.toLowerCase() === name.toLowerCase()) ?? name;
        const nextTags = Array.from(new Set([...customTags, canonicalName])).sort();
        setCustomTags(nextTags);
        await jsonStorage.set(CUSTOM_TAGS_STORAGE_KEY, nextTags);
        if (tagEditingDrawing) {
            setTagEditingSelection((current) => current.includes(canonicalName) ? current : [...current, canonicalName]);
        }
        else {
            setSelectedTags(Array.from(new Set([...selectedTags, canonicalName])));
        }
        setNewTagName("");
        setTagDialogOpen(false);
    };
    const openDrawingTagEditor = (drawing: DrawingSummary) => {
        setTagEditingDrawing(drawing);
        setTagEditingSelection([...drawing.flatTags]);
    };
    const toggleDrawingTag = (tag: string) => {
        setTagEditingSelection((current) => current.includes(tag)
            ? current.filter((selectedTag) => selectedTag !== tag)
            : [...current, tag]);
    };
    const saveDrawingTags = async () => {
        if (!tagEditingDrawing || savingDrawingTags)
            return;
        setSavingDrawingTags(true);
        try {
            await drawingRepository.updateTags(
                tagEditingDrawing.id,
                tagEditingSelection.map((name) => new CompositeTag({ name })),
            );
            await loadDrawings();
            setTagEditingDrawing(null);
        }
        catch (error) {
            const errorToast: ToastState = {
                message: errorMessageOf(error, t.saveDrawingFailed),
                tone: "error",
            };
            setToast(errorToast);
            setTimeout(() => setToast((current) => current === errorToast ? null : current), 7000);
        }
        finally {
            setSavingDrawingTags(false);
        }
    };
    useEffect(() => { if (conflictDrawing) void inspectConflict(conflictDrawing.id); }, [conflictDrawing?.id, account?.accountBinding, account?.entitlement.active, account?.drive]);
    const syncStatusLabel = syncError ?? (busy ? syncMessage ?? t.cloudCheckingAccount
        : accountStatus === "checking" ? t.cloudCheckingAccount
        : accountStatus === "expired" ? t.googleDriveSignInRequired : !account ? t.notConnected : entitlementStatus === "pending" ? t.cloudSyncPurchasePending
        : entitlementStatus === "inactive" ? t.cloudSyncLockedStatus
        : account.drive === "reauthorization-required" ? t.cloudReconnectDrive : account.drive === "unavailable" ? t.googleDriveSyncFailed : t.cloudConnected);
    const syncButtonLabel = !account || accountStatus === "expired" ? t.cloudConnectAccount
        : entitlementStatus === "inactive" ? t.cloudSyncUnlockButton
        : entitlementStatus === "error" || entitlementStatus === "unknown" ? t.cloudCheckAccess
        : account.drive === "reauthorization-required" ? t.cloudReconnectDrive : account.drive === "unavailable" ? t.cloudCheckAccess : t.syncNow;
    const renderLibrary = () => (<>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t.library}</Text>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            Infinite Canvas
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel={t.createDrawing} style={styles.newButton} onPress={startNewDrawing} {...webTitle(t.createDrawing)}>
            <AppIcon icon="mdi:plus" size={21} color={theme.primaryText}/>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <AppIcon icon="mdi:magnify" size={21} color={theme.textMuted}/>
          <TextInput value={queryParams.query} onChangeText={(value) => {
            queryParams.setQuery(value);
            queryParams.setPage("1");
        }} placeholder={t.search} placeholderTextColor={theme.textMuted} style={styles.searchInput}/>
        </View>
      </View>

      <View style={styles.sortRow}>
        {[
            { mode: "updated_desc" as const, label: t.sortRecent, icon: "mdi:sort-clock-descending-outline" as const },
            { mode: "updated_asc" as const, label: t.sortOldest, icon: "mdi:sort-clock-ascending-outline" as const },
            { mode: "title_asc" as const, label: t.sortName, icon: "mdi:sort-alphabetical-ascending" as const },
        ].map((item) => {
            const active = item.mode === sortMode;
            return (<Pressable key={item.mode} style={[styles.sortButton, active && styles.sortButtonActive]} onPress={() => setSortMode(item.mode)}>
              <AppIcon icon={item.icon} size={16} color={active ? theme.primaryText : theme.textMuted}/>
              <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>
                {item.label}
              </Text>
            </Pressable>);
        })}
      </View>

      <View style={styles.chipPanel}>
        {selectedDrawingIds.length > 0 ? (<View style={styles.selectionFabRow}>
            <Text style={styles.selectionCount}>
              {formatSelectedCount(selectedDrawingIds.length, t.selected)}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t.exportSelectedDrawings} style={styles.selectionFab} onPress={exportSelectedDrawings} {...webTitle(t.exportSelectedDrawings)}>
              <AppIcon icon="mdi:download-outline" size={20} color={theme.text}/>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.deleteSelectedDrawings} style={styles.selectionFab} onPress={deleteSelectedDrawings} {...webTitle(t.deleteSelectedDrawings)}>
              <AppIcon icon="mdi:delete-outline" size={20} color={theme.textMuted}/>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.clearSelection} style={styles.selectionFab} onPress={clearSelection} {...webTitle(t.clearSelection)}>
              <AppIcon icon="mdi:close-circle-outline" size={20} color={theme.textMuted}/>
            </Pressable>
          </View>) : (<TagChips allLabel={t.all} addTagLabel={t.addTag} tags={allTags} selectedTags={selectedTags} onToggleTag={toggleTag} onAddTag={() => setTagDialogOpen(true)} styles={styles} theme={theme}/>)}
      </View>

      {loading ? (<View style={styles.emptyState}>
          <ActivityIndicator color={theme.primary}/>
        </View>) : (<>
          <View style={pagedDrawings.length === 0 ? styles.emptyList : styles.list}>
            {pagedDrawings.length === 0 ? (<View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <AppIcon icon="mdi:folder-open-outline" size={40} color={theme.primary}/>
                </View>
                <Text style={styles.emptyTitle}>{t.noDrawings}</Text>
                <Text style={styles.emptyText}>{t.noDrawingsBody}</Text>
                <Pressable style={styles.emptyButton} onPress={startNewDrawing} {...webTitle(t.createDrawing)}>
                  <AppIcon icon="mdi:plus" size={20} color={theme.primaryText}/>
                  <Text style={styles.emptyButtonText}>{t.createDrawing}</Text>
                </Pressable>
              </View>) : pagedDrawings.map((item) => {
                const selected = selectedDrawingIds.includes(item.id);
                const syncBadgeLabel = foreignDrawingIds.includes(item.id) ? t.cloudOtherAccount : item.syncConflict
                    ? verifiedConflictIds.includes(item.id) ? t.conflictBadge : t.cloudCheckConflict
                    : item.syncStatus === "failed"
                        ? t.failedBadge
                        : item.syncStatus === "pending"
                            ? t.pendingBadge
                            : item.syncStatus === "synced" || item.driveFileId
                                ? t.syncedBadge
                                : null;
                return (<Pressable key={item.id} accessibilityLabel={item.title} accessibilityHint={t.holdToSelect} delayLongPress={450} style={[styles.card, selected && styles.cardSelected]} onPress={() => handleDrawingPress(item)} onLongPress={() => handleDrawingLongPress(item.id)}>
                  {syncBadgeLabel ? (<View style={[
                            { pointerEvents: "none" },
                            styles.syncBadge,
                            styles.cardSyncBadge,
                            (item.syncConflict || item.syncStatus === "failed") &&
                                styles.syncBadgeConflict,
                            item.syncStatus === "synced" && styles.syncBadgeActive,
                        ]}>
                      <Text style={styles.syncBadgeText}>{syncBadgeLabel}</Text>
                    </View>) : null}
                  <View style={styles.cardMainRow}>
                    <DrawingPreview drawing={item} theme={theme}/>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${t.moreOptions}: ${item.title}`} style={styles.cardMoreButton} onPress={(event) => {
                        event.stopPropagation?.();
                        setOptionsDrawing(item);
                    }} {...webTitle(t.moreOptions)}>
                      <AppIcon icon="mdi:dots-horizontal" size={22} color={theme.text}/>
                    </Pressable>
                  </View>
                  <View style={styles.cardDetailsRow}>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {t.updated} {formatUpdatedAt(item.updatedAt)}
                    </Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${t.editDrawingTags}: ${item.title}`} style={styles.cardTagsButton} onPress={(event) => {
                        event.stopPropagation?.();
                        openDrawingTagEditor(item);
                    }} {...webTitle(t.editDrawingTags)}>
                      <AppIcon icon="mdi:tag-multiple-outline" size={15} color={theme.accent}/>
                      <Text style={styles.cardTagsButtonText} numberOfLines={1}>
                        {item.flatTags.length ? item.flatTags.join(", ") : t.noTags}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>);
            })}
          </View>
          {totalPages > 1 && (<View style={styles.pagination}>
              <Pressable disabled={clampedPage <= 1} style={[
                    styles.pageButton,
                    clampedPage <= 1 && styles.pageButtonDisabled,
                ]} onPress={() => setPage(clampedPage - 1)}>
                <Text style={styles.pageButtonText}>{t.previous}</Text>
              </Pressable>
              <Text style={styles.pageCount}>
                {clampedPage} / {totalPages}
              </Text>
              <Pressable disabled={clampedPage >= totalPages} style={[
                    styles.pageButton,
                    clampedPage >= totalPages && styles.pageButtonDisabled,
                ]} onPress={() => setPage(clampedPage + 1)}>
                <Text style={styles.pageButtonText}>{t.next}</Text>
              </Pressable>
            </View>)}
        </>)}
    </>);
    const renderTags = () => (<>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t.tags}</Text>
          <Text style={styles.title}>{t.tags}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.addTag} style={styles.newButton} onPress={() => setTagDialogOpen(true)} {...webTitle(t.addTag)}>
          <AppIcon icon="mdi:plus" size={21} color={theme.primaryText}/>
        </Pressable>
      </View>
      <TagChips allLabel={t.all} addTagLabel={t.addTag} tags={allTags} selectedTags={selectedTags} onToggleTag={toggleTag} onAddTag={() => setTagDialogOpen(true)} styles={styles} theme={theme}/>
    </>);
    const renderSettings = () => (<>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t.settings}</Text>
          <Text style={styles.title}>{t.workspace}</Text>
        </View>
      </View>
      <View style={styles.panel}>
        <View style={styles.panelHeader}><View style={[styles.panelIconPrimary, styles.panelHeaderIcon]}>
          <AppIcon icon="mdi:cloud-sync-outline" size={28} color={theme.primaryText}/>
        </View>
        <Text style={[styles.panelTitle, styles.panelHeaderTitle]}>{t.cloudSync}</Text></View>
        <Text style={styles.panelText}>
          {hasCloudSyncAccess ? t.cloudSyncHelp : t.cloudSyncPaywallDescription}
        </Text>
        <Text style={styles.panelText}>{account?.email ?? ""}</Text>
        <View style={[styles.inlineStatus, { minHeight: 46 }]}>
          {(busy || accountStatus === "checking") && <ActivityIndicator color={theme.primary}/>}
          <Text style={styles.inlineStatusText}>{syncStatusLabel}</Text>
        </View>
        <SyncSummary connected={!!account && accountStatus === "connected"} confirmed={syncConfirmed && !loading} unsyncedCount={unsyncedCount} theme={theme} labels={t} styles={styles} />
        <Pressable accessibilityLabel={syncButtonLabel} disabled={busy || accountStatus === "checking"} style={[
            styles.primaryButtonWide, (busy || accountStatus === "checking") && styles.primaryButtonWideDisabled,
        ]} onPress={mainAction} {...webTitle(syncButtonLabel)}>
          <AppIcon icon="mdi:cloud-sync-outline" size={20} color={theme.primaryText}/>
          <Text style={styles.primaryButtonWideText}>{syncButtonLabel}</Text>
        </Pressable>
        {(account || accountStatus === "signing-in") && <Pressable accessibilityRole="button" style={styles.dialogButton} onPress={() => accountStatus === "signing-in" ? void signOut() : setSignOutConfirm(true)} {...webTitle(accountStatus === "signing-in" ? t.cancel : t.cloudSignOut)}>
          <Text style={styles.dialogButtonText}>{accountStatus === "signing-in" ? t.cancel : t.cloudSignOut}</Text>
        </Pressable>}
      </View>
      <View style={styles.panel}>
        <View style={styles.panelHeader}><View style={[styles.panelIconSoft, styles.panelHeaderIcon]}>
          <AppIcon icon="mdi:cog-outline" size={26} color={theme.primary}/>
        </View>
        <Text style={[styles.panelTitle, styles.panelHeaderTitle]}>{t.appearance}</Text></View>
        <View style={styles.segmentedControl}>
          {(["dark", "light"] as const).map((themeOption) => (<Pressable key={themeOption} style={[
                styles.segmentButton,
                themeMode === themeOption && styles.segmentButtonActive,
            ]} onPress={() => onThemeChange(themeOption)} {...webTitle(themeOption === "dark" ? t.darkTheme : t.lightTheme)}>
              <Text style={[
                styles.segmentText,
                themeMode === themeOption && styles.segmentTextActive,
            ]}>
                {themeOption === "dark" ? t.darkTheme : t.lightTheme}
              </Text>
            </Pressable>))}
        </View>
      </View>
      <View style={styles.panel}>
        <View style={styles.panelHeader}><View style={[styles.panelIconSoft, styles.panelHeaderIcon]}>
          <AppIcon icon="mdi:translate" size={26} color={theme.primary}/>
        </View>
        <Text style={[styles.panelTitle, styles.panelHeaderTitle]}>{t.language}</Text></View>
        <View style={styles.segmentedControl}>
          {[
            { value: "en" as const, label: "English" },
            { value: "pt" as const, label: "Português" },
            { value: "es" as const, label: "Español" },
        ].map((languageOption) => (<Pressable key={languageOption.value} style={[
                styles.segmentButton,
                language === languageOption.value && styles.segmentButtonActive,
            ]} onPress={() => onLanguageChange(languageOption.value)} {...webTitle(languageOption.label)}>
              <Text style={[
                styles.segmentText,
                language === languageOption.value && styles.segmentTextActive,
            ]}>
                {languageOption.label}
              </Text>
            </Pressable>))}
        </View>
      </View>
    </>);
    return (<SafeAreaView style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {mode === "library" && renderLibrary()}
          {mode === "tags" && renderTags()}
          {mode === "settings" && renderSettings()}
        </View>
      </ScrollView>
      <HomeBottomNav mode={mode} setMode={setMode} styles={styles} theme={theme} labels={{ library: t.library, tags: t.tags, settings: t.settings }}/>
      <DrawingTagsDialog
        visible={tagEditingDrawing !== null}
        drawingTitle={tagEditingDrawing?.title ?? ""}
        tags={allTags}
        selectedTags={tagEditingSelection}
        saving={savingDrawingTags}
        onToggleTag={toggleDrawingTag}
        onAddTag={() => setTagDialogOpen(true)}
        onCancel={() => setTagEditingDrawing(null)}
        onSave={() => void saveDrawingTags()}
        labels={{
            title: t.editDrawingTags,
            noTags: t.tagOptionsEmpty,
            addTag: t.addTag,
            cancel: t.cancel,
            save: t.save,
        }}
      />
      <TagDialog visible={tagDialogOpen} value={newTagName} setValue={setNewTagName} onCancel={() => setTagDialogOpen(false)} onSave={createTag} styles={styles} labels={{ title: t.addTag, input: t.tagName, save: t.save, cancel: t.cancel }}/>
      <ConflictDialog theme={theme} inspection={inspection} canResolve={Boolean(inspection?.remote && account?.entitlement.active && account.drive === "ready")} prerequisiteLabel={syncButtonLabel} onPrerequisite={conflictAction} onReview={() => { if (conflictDrawing) void inspectConflict(conflictDrawing.id); }} busy={conflictBusy} error={conflictError} drawing={inspection?.local.metadata ?? conflictDrawing} onCancel={() => { clearConflictError(); setConflictDrawing(null); }} onResolve={resolveConflict} styles={styles} labels={{
            title: t.resolveSyncConflict,
            help: inspection?.kind === "unbased" ? t.cloudUnbasedConflict : t.resolveSyncConflictHelp,
            review: t.cloudReviewAgain,
            localVersion: t.localVersion,
            cloudVersion: t.cloudVersion,
            updated: t.updated,
            revision: t.revision,
            unknown: t.unknown,
            keepLocal: t.keepLocal,
            useCloud: t.useCloud,
            duplicateBoth: t.duplicateBoth,
            cancel: t.cancel,
        }}/>
      <DrawingOptionsDialog drawing={optionsDrawing} foreignAccount={Boolean(optionsDrawing && foreignDrawingIds.includes(optionsDrawing.id))} theme={theme} styles={styles} labels={{
            title: t.moreOptions,
            close: t.cancel,
            sync: t.syncNow,
            copyToAccount: t.cloudCopyToAccount,
            resolveConflict: t.resolveSyncConflict,
            duplicate: t.duplicateDrawing,
            delete: t.deleteDrawing,
        }} syncBusy={syncState.status === "syncing"} onClose={() => setOptionsDrawing(null)} onCopyToAccount={() => {
            if (!optionsDrawing)
                return;
            const drawingId = optionsDrawing.id;
            setOptionsDrawing(null);
            void copyToCurrentAccount(drawingId);
        }} onSync={() => {
            if (!optionsDrawing)
                return;
            const drawing = optionsDrawing;
            setOptionsDrawing(null);
            void syncDrawing(drawing);
        }} onResolveConflict={() => {
            if (!optionsDrawing)
                return;
            setConflictDrawing(optionsDrawing);
            setOptionsDrawing(null);
        }} onDuplicate={() => {
            if (!optionsDrawing)
                return;
            const drawingId = optionsDrawing.id;
            setOptionsDrawing(null);
            void duplicateDrawing(drawingId);
        }} onDelete={() => {
            if (!optionsDrawing)
                return;
            const drawingId = optionsDrawing.id;
            setOptionsDrawing(null);
            void deleteDrawing(drawingId);
        }}/>
      <CloudSyncPaywall visible={cloudSyncPaywallOpen} theme={theme} formattedPrice={cloudSyncPurchaseStatus.formattedPrice} productAvailable={cloudSyncPurchaseStatus.productAvailable} checkingProduct={!billingReady && Platform.OS === "android"} busy={billingBusy} busyLabel={billingAction === "restore" ? t.cloudSyncCheckingPurchase : t.cloudSyncOpeningCheckout} feedback={billingFeedback} onClose={() => setCloudSyncPaywallOpen(false)} onBuy={() => void buyCloudSync()} onRestore={() => void restoreCloudSyncPurchase()} labels={{
            title: t.cloudSyncPaywallTitle,
            body: t.cloudSyncPaywallDescription,
            buy: t.cloudSyncBuy,
            restore: Platform.OS === "web" ? t.cloudCheckAccess : t.cloudSyncRestore,
            webInfo: t.cloudBuyOnAndroid,
            cancel: t.cancel,
            productUnavailable: t.cloudSyncProductUnavailable,
            checking: t.cloudSyncCheckingPurchase,
            priceLine: t.cloudSyncOneTimePrice,
        }}/>
      <Modal transparent visible={signOutConfirm} animationType="fade" onRequestClose={() => setSignOutConfirm(false)}>
        <View style={styles.dialogBackdrop}><View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{t.cloudSignOut}</Text><Text style={styles.dialogHelpText}>{t.cloudConfirmSignOut}</Text>
          <Pressable style={styles.dialogButtonPrimary} {...webTitle(t.cloudSignOut)} onPress={() => {setSignOutConfirm(false); setConflictDrawing(null); void signOut();}}><Text style={styles.dialogButtonPrimaryText}>{t.cloudSignOut}</Text></Pressable>
          <Pressable style={styles.dialogButton} {...webTitle(t.cancel)} onPress={() => setSignOutConfirm(false)}><Text style={styles.dialogButtonText}>{t.cancel}</Text></Pressable>
        </View></View>
      </Modal>
      {toast && <ToastMessage toast={toast} styles={styles} theme={theme} closeLabel={t.close} onDismiss={() => setToast(current => current === toast ? null : current)}/>}
    </SafeAreaView>);
}
