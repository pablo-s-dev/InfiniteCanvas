import { CloudSyncProvider } from "../features/sync/hooks/useCloudSync";
import { AppThemeProvider, useAppTheme } from "../shared/theme/ThemeContext";
import { useShellStyles } from "./shellStyles";
import { webTitle } from "../shared/ui/webTitle";
import { DrawingDetailsDialog } from "../features/documents/components/DrawingDetailsDialog";
import { SaveNewDrawingDialog } from "../features/documents/components/SaveNewDrawingDialog";
import { ExportFormatDialog } from "../features/sharing/components/ExportFormatDialog";
import { CreateTagDialog } from "../features/tags/components/CreateTagDialog";
import { UnsavedDrawingDialog } from "../features/documents/components/UnsavedDrawingDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Platform, Pressable, Text, View } from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
// Metro does not resolve nuqs package subpath exports reliably in Expo web.
// The public export maps to this file in nuqs 2.x.
import { NuqsAdapter } from "nuqs/adapters/react";
import CanvasEditor from "../features/canvas/CanvasEditor";
import { DrawingHomeScreen } from "../features/home/DrawingHomeScreen";
import { drawingRepository } from "../features/documents/drawingRepository";
import { CANVAS_DOCUMENT_VERSION } from "../features/canvas/document";
import type { CanvasDocument, CanvasDrawingData } from "../features/canvas/document";
import type { DrawingSummary } from "../features/documents/drawingRepository";
import { AppIcon } from "../shared/icons/AppIcon";
import { CompositeTag, CUSTOM_TAGS_STORAGE_KEY, flattenCompositeTags } from "../features/tags/tagModel";
import { detectSystemLanguage, SupportedLanguage, useTranslations } from "../shared/i18n/i18n";
import { AppThemeMode, appThemes } from "../shared/theme/appPalette";
import { jsonStorage } from "../shared/storage/jsonStorage";
import { NativeUpdatePrompt } from "../platform/NativeUpdatePrompt";
import { downloadDrawingOnWeb, encodeDrawingRaster, renderDrawingSvg, saveDrawingImageOnNative, shareDrawingPngOnNative, shareDrawingPngOnWeb } from "../features/sharing/drawingImageExport";
import type { DrawingImageFormat } from "../features/sharing/drawingImageExport";
import { DrawingRasterizer } from "../features/sharing/DrawingRasterizer";
import type { DrawingRasterRequest } from "../features/sharing/DrawingRasterizer";
import { registerCloudSyncBackgroundTask } from "../features/sync/cloudSyncBackgroundTask";
const THEME_KEY = "infinite-canvas:theme-mode";
const LANGUAGE_KEY = "infinite-canvas:language";
type RasterExportAction = "download" | "share" | "download-selected";
type SelectedRasterExportQueue = {
    documents: CanvasDocument[];
    format: "jpeg" | "png";
    index: number;
};
const isThemeMode = (value: unknown): value is AppThemeMode => value === "dark" || value === "light";
const isSupportedLanguage = (value: unknown): value is SupportedLanguage => value === "en" || value === "pt" || value === "es";
const emptyCanvasData = (): CanvasDrawingData => ({
    version: CANVAS_DOCUMENT_VERSION,
    items: [],
    historyCursor: -1,
    viewport: { x: 0, y: 0, scale: 1 },
});
const isEmbeddedInHost = () => {
    if (Platform.OS !== "web" || typeof window === "undefined")
        return false;
    try {
        return window.self !== window.top;
    }
    catch {
        return true;
    }
};
function InfiniteCanvasAppContent() {
    const styles = useShellStyles();
    const embedded = useMemo(() => isEmbeddedInHost(), []);
    const { themeMode, setThemeMode } = useAppTheme();
    const canvasBackgroundColor = appThemes[themeMode].canvasBackground;
    const [language, setLanguage] = useState<SupportedLanguage>(detectSystemLanguage());
    const { t } = useTranslations(language);
    const [activeDrawing, setActiveDrawing] = useState<DrawingSummary | null>(null);
    const [newDrawingTags, setNewDrawingTags] = useState<CompositeTag[] | null>(null);
    const [draftCanvasData, setDraftCanvasData] = useState<CanvasDrawingData>(emptyCanvasData);
    const [saveDraftOpen, setSaveDraftOpen] = useState(false);
    const [exitPromptOpen, setExitPromptOpen] = useState(false);
    const [newDraftTitle, setNewDraftTitle] = useState("");
    const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
    const [savingDraft, setSavingDraft] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftTags, setDraftTags] = useState<string[]>([]);
    const [tagOptions, setTagOptions] = useState<string[]>([]);
    const [tagCreationOpen, setTagCreationOpen] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [exportFormatDialogOpen, setExportFormatDialogOpen] = useState(false);
    const [selectedExportDocuments, setSelectedExportDocuments] = useState<CanvasDocument[] | null>(null);
    const [rasterExportRequest, setRasterExportRequest] = useState<(DrawingRasterRequest & {
        action: RasterExportAction;
    }) | null>(null);
    const rasterExportSequenceRef = useRef(0);
    const selectedRasterExportQueueRef = useRef<SelectedRasterExportQueue | null>(null);
    useEffect(() => {
        let mounted = true;
        void Promise.all([
            jsonStorage.get<unknown>(THEME_KEY),
            jsonStorage.get<unknown>(LANGUAGE_KEY),
        ])
            .then(([storedTheme, storedLanguage]) => {
            if (!mounted)
                return;
            if (isThemeMode(storedTheme))
                setThemeMode(storedTheme);
            if (isSupportedLanguage(storedLanguage))
                setLanguage(storedLanguage);
        })
            .catch((error) => {
            console.warn("Could not load app preferences", error);
        });
        return () => {
            mounted = false;
        };
    }, []);
    const changeTheme = (nextTheme: AppThemeMode) => {
        setThemeMode(nextTheme);
        void jsonStorage.set(THEME_KEY, nextTheme).catch((error) => {
            console.warn("Could not save app theme", error);
        });
    };
    const changeLanguage = (nextLanguage: SupportedLanguage) => {
        setLanguage(nextLanguage);
        void jsonStorage.set(LANGUAGE_KEY, nextLanguage).catch((error) => {
            console.warn("Could not save app language", error);
        });
    };
    const startNewDrawing = (tags: CompositeTag[], availableTags: string[]) => {
        setActiveDrawing(null);
        setNewDrawingTags(tags);
        setTagOptions(Array.from(new Set([...availableTags, ...flattenCompositeTags(tags)])));
        setDraftTags(flattenCompositeTags(tags));
        setDraftCanvasData(emptyCanvasData());
        setNewDraftTitle("");
        setDraftSaveError(null);
        setSaveDraftOpen(false);
        setExitPromptOpen(false);
    };
    const discardNewDrawing = () => {
        setNewDrawingTags(null);
        setDraftTags([]);
        setDraftCanvasData(emptyCanvasData());
        setNewDraftTitle("");
        setDraftSaveError(null);
        setSaveDraftOpen(false);
        setExitPromptOpen(false);
        setActiveDrawing(null);
    };
    const requestCloseCanvas = useCallback(() => {
        if (tagCreationOpen) {
            setTagCreationOpen(false);
            return;
        }
        if (exportFormatDialogOpen) {
            setExportFormatDialogOpen(false);
            setSelectedExportDocuments(null);
            return;
        }
        if (detailsOpen) {
            setDetailsOpen(false);
            return;
        }
        if (saveDraftOpen) {
            setSaveDraftOpen(false);
            setDraftSaveError(null);
            return;
        }
        if (exitPromptOpen) {
            setExitPromptOpen(false);
            return;
        }
        if (newDrawingTags !== null) {
            setExitPromptOpen(true);
            return;
        }
        setActiveDrawing(null);
    }, [
        detailsOpen,
        exitPromptOpen,
        exportFormatDialogOpen,
        newDrawingTags,
        saveDraftOpen,
        tagCreationOpen,
    ]);
    const toggleDraftTag = (tag: string) => {
        setDraftTags((selected) => selected.includes(tag)
            ? selected.filter((current) => current !== tag)
            : [...selected, tag]);
    };
    const saveNewDrawing = async () => {
        const title = newDraftTitle.trim();
        if (!title) {
            setDraftSaveError(t.drawingNameRequired);
            return;
        }
        setSavingDraft(true);
        setDraftSaveError(null);
        try {
            const saved = await drawingRepository.create(title, draftTags.map((name) => new CompositeTag({ name })), draftCanvasData);
            setActiveDrawing(saved.metadata);
            setNewDrawingTags(null);
            setTagOptions((current) => Array.from(new Set([...current, ...draftTags])).sort((a, b) => a.localeCompare(b)));
            setSaveDraftOpen(false);
            setExitPromptOpen(false);
            setNewDraftTitle("");
            setDraftCanvasData(emptyCanvasData());
        }
        catch (error) {
            console.warn("Could not save new drawing", error);
            setDraftSaveError(t.saveDrawingFailed);
        }
        finally {
            setSavingDraft(false);
        }
    };
    useEffect(() => {
        if (Platform.OS !== "android" || embedded)
            return;
        const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
            if (!activeDrawing && newDrawingTags === null)
                return false;
            requestCloseCanvas();
            return true;
        });
        return () => subscription.remove();
    }, [activeDrawing, embedded, newDrawingTags, requestCloseCanvas]);
    useEffect(() => {
        if (Platform.OS !== "web" || newDrawingTags === null)
            return;
        const preventLeavingUnsavedDrawing = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", preventLeavingUnsavedDrawing);
        return () => window.removeEventListener("beforeunload", preventLeavingUnsavedDrawing);
    }, [newDrawingTags]);
    const theme = appThemes[themeMode];
    const openDrawingDetails = () => {
        if (!activeDrawing)
            return;
        setDraftTitle(activeDrawing.title);
        setDraftTags([...activeDrawing.flatTags]);
        setDetailsOpen(true);
    };
    const saveDrawingDetails = async () => {
        if (!activeDrawing)
            return;
        const title = draftTitle.trim() || activeDrawing.title;
        const tags = draftTags.map((name) => new CompositeTag({ name }));
        const renamed = title === activeDrawing.title
            ? await drawingRepository.get(activeDrawing.id)
            : await drawingRepository.rename(activeDrawing.id, title);
        const updated = await drawingRepository.updateTags(activeDrawing.id, tags);
        setActiveDrawing(updated?.metadata ?? renamed?.metadata ?? activeDrawing);
        setTagOptions((current) => Array.from(new Set([...current, ...draftTags])).sort((a, b) => a.localeCompare(b)));
        setDetailsOpen(false);
    };
    const getActiveDocument = async () => {
        if (!activeDrawing)
            return null;
        return drawingRepository.get(activeDrawing.id);
    };
    const showActionError = (message: string) => {
        if (Platform.OS === "web" && typeof window !== "undefined") {
            window.alert(message);
            return;
        }
        Alert.alert(message);
    };
    const openTagCreation = () => {
        setNewTagName("");
        setTagCreationOpen(true);
    };
    const saveCanvasTag = async () => {
        const name = newTagName.trim();
        if (!name)
            return;
        const canonicalName = tagOptions.find((tag) => tag.toLowerCase() === name.toLowerCase()) ?? name;
        try {
            const storedTags = (await jsonStorage.get<string[]>(CUSTOM_TAGS_STORAGE_KEY)) ?? [];
            const nextTags = storedTags.some((tag) => tag.toLowerCase() === canonicalName.toLowerCase())
                ? storedTags
                : [...storedTags, canonicalName];
            await jsonStorage.set(CUSTOM_TAGS_STORAGE_KEY, nextTags);
            setTagOptions((current) => Array.from(new Set([...current, canonicalName])).sort((a, b) => a.localeCompare(b)));
            setDraftTags((current) => current.includes(canonicalName) ? current : [...current, canonicalName]);
            setTagCreationOpen(false);
            setNewTagName("");
        }
        catch (error) {
            console.warn("Could not save drawing tag", error);
            showActionError(t.saveTagFailed);
        }
    };
    const startRasterExport = (document: CanvasDocument, format: "jpeg" | "png", action: RasterExportAction) => {
        rasterExportSequenceRef.current += 1;
        setRasterExportRequest({
            id: rasterExportSequenceRef.current,
            document,
            format,
            action,
            backgroundColor: canvasBackgroundColor,
        });
    };
    const handleRasterExport = async (requestId: number, pngBase64: string) => {
        const request = rasterExportRequest;
        if (!request || request.id !== requestId)
            return;
        setRasterExportRequest(null);
        if (request.action === "download-selected") {
            const queue = selectedRasterExportQueueRef.current;
            const document = queue?.documents[queue.index];
            if (!queue || !document)
                return;
            try {
                const encodedImage = await encodeDrawingRaster(pngBase64, queue.format);
                await saveDrawingImageOnNative(document, queue.format, encodedImage, t.downloadsPermissionDenied);
                const nextIndex = queue.index + 1;
                if (nextIndex < queue.documents.length) {
                    queue.index = nextIndex;
                    startRasterExport(queue.documents[nextIndex], queue.format, "download-selected");
                }
                else {
                    selectedRasterExportQueueRef.current = null;
                }
            }
            catch (error) {
                selectedRasterExportQueueRef.current = null;
                console.warn("Could not export selected drawing images", error);
                showActionError(error instanceof Error ? error.message : t.exportManyFailed);
            }
            return;
        }
        try {
            const encodedImage = await encodeDrawingRaster(pngBase64, request.format);
            if (request.action === "share") {
                await shareDrawingPngOnNative(request.document.metadata.title, encodedImage, t.shareImageTitle);
                return;
            }
            await saveDrawingImageOnNative(request.document, request.format, encodedImage, t.downloadsPermissionDenied);
        }
        catch (error) {
            console.warn("Could not export drawing image", error);
            showActionError(error instanceof Error ? error.message : t.exportFailed);
        }
    };
    const handleRasterExportError = (requestId: number, error: unknown) => {
        if (rasterExportRequest?.id !== requestId)
            return;
        const action = rasterExportRequest.action;
        setRasterExportRequest(null);
        if (action === "download-selected") {
            selectedRasterExportQueueRef.current = null;
        }
        console.warn("Could not render drawing image", error);
        showActionError(action === "share"
            ? t.shareFailed
            : action === "download-selected"
                ? t.exportManyFailed
                : t.exportFailed);
    };
    const exportSelectedDocuments = async (format: DrawingImageFormat) => {
        const documents = selectedExportDocuments;
        setExportFormatDialogOpen(false);
        setSelectedExportDocuments(null);
        if (!documents?.length)
            return;
        try {
            if (Platform.OS === "web") {
                for (const document of documents) {
                    await downloadDrawingOnWeb(document, format, canvasBackgroundColor);
                }
                return;
            }
            if (format === "svg") {
                for (const document of documents) {
                    await saveDrawingImageOnNative(document, format, renderDrawingSvg(document), t.downloadsPermissionDenied);
                }
                return;
            }
            selectedRasterExportQueueRef.current = {
                documents,
                format,
                index: 0,
            };
            startRasterExport(documents[0], format, "download-selected");
        }
        catch (error) {
            selectedRasterExportQueueRef.current = null;
            console.warn("Could not export selected drawing images", error);
            showActionError(error instanceof Error ? error.message : t.exportManyFailed);
        }
    };
    const exportActiveDrawing = async (format: DrawingImageFormat) => {
        setExportFormatDialogOpen(false);
        try {
            const document = await getActiveDocument();
            if (!document)
                return;
            if (Platform.OS === "web") {
                await downloadDrawingOnWeb(document, format, canvasBackgroundColor);
                return;
            }
            if (format === "svg") {
                await saveDrawingImageOnNative(document, format, renderDrawingSvg(document), t.downloadsPermissionDenied);
                return;
            }
            startRasterExport(document, format, "download");
        }
        catch (error) {
            console.warn("Could not export drawing", error);
            showActionError(error instanceof Error ? error.message : t.exportFailed);
        }
    };
    const chooseExportFormat = (format: DrawingImageFormat) => {
        if (selectedExportDocuments) {
            void exportSelectedDocuments(format);
            return;
        }
        void exportActiveDrawing(format);
    };
    const closeExportFormatDialog = () => {
        setExportFormatDialogOpen(false);
        setSelectedExportDocuments(null);
    };
    const shareActiveDrawing = async () => {
        try {
            const document = await getActiveDocument();
            if (!document)
                return;
            if (Platform.OS === "web") {
                await shareDrawingPngOnWeb(document);
                return;
            }
            startRasterExport(document, "png", "share");
        }
        catch (error) {
            if (error instanceof Error &&
                "name" in error &&
                error.name === "AbortError") {
                return;
            }
            console.warn("Could not share drawing image", error);
            showActionError(error instanceof Error ? error.message : t.shareFailed);
        }
    };
    const openSaveDraftDialog = () => {
        setDraftSaveError(null);
        setSaveDraftOpen(true);
    };
    if (embedded || activeDrawing || newDrawingTags !== null) {
        return (<SafeAreaView style={[styles.canvasShell, { backgroundColor: theme.background }]} edges={embedded ? [] : ["top", "bottom"]}>
        <NavigationBar style={themeMode === "light" ? "dark" : "light"}/>
        {!embedded && (<View style={styles.topBar}>
            <Pressable style={styles.backButton} onPress={requestCloseCanvas} {...webTitle(t.library)}>
              <Text style={styles.backButtonText}>{t.library}</Text>
            </Pressable>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.activeDrawingText}>
              {activeDrawing?.title ??
                    (newDrawingTags !== null ? t.newDrawing : t.embeddedDrawing)}
            </Text>
            {activeDrawing && (<>
                <Pressable accessibilityLabel={t.shareDrawing} accessibilityRole="button" disabled={rasterExportRequest !== null} style={styles.iconButton} onPress={shareActiveDrawing} {...webTitle(t.shareDrawing)}>
                  <AppIcon icon="mdi:share-variant-outline" size={18} color={theme.text}/>
                </Pressable>
                <Pressable accessibilityLabel={t.exportDrawing} accessibilityRole="button" style={styles.iconButton} onPress={() => setExportFormatDialogOpen(true)} {...webTitle(t.exportDrawing)}>
                  <AppIcon icon="mdi:download-outline" size={18} color={theme.text}/>
                </Pressable>
              </>)}
            {activeDrawing && (<Pressable accessibilityLabel={t.drawingDetails} accessibilityRole="button" style={styles.detailsButton} onPress={openDrawingDetails} {...webTitle(t.drawingDetails)}>
                <AppIcon icon="mdi:cog-outline" size={18} color={theme.text}/>
              </Pressable>)}
            {newDrawingTags !== null && (<Pressable accessibilityLabel={t.saveNewDrawing} style={styles.saveButton} onPress={openSaveDraftDialog} {...webTitle(t.saveNewDrawing)}>
                <AppIcon icon="mdi:content-save-outline" size={18} color={theme.primaryText}/>
                <Text style={styles.saveButtonText}>{t.save}</Text>
              </Pressable>)}
          </View>)}
        {!embedded && activeDrawing && (<DrawingDetailsDialog visible={detailsOpen} title={draftTitle} tags={tagOptions} selectedTags={draftTags} setTitle={setDraftTitle} onToggleTag={toggleDraftTag} onAddTag={openTagCreation} onCancel={() => setDetailsOpen(false)} onSave={saveDrawingDetails} labels={{
                    title: t.drawingDetails,
                    name: t.name,
                    drawingName: t.drawingName,
                    tags: t.tags,
                    noTags: t.tagOptionsEmpty,
                    addTag: t.addTag,
                    cancel: t.cancel,
                    save: t.save,
                }}/>)}
        {!embedded && activeDrawing && (<ExportFormatDialog visible={exportFormatDialogOpen} onCancel={closeExportFormatDialog} onChoose={chooseExportFormat} labels={{
                    title: t.exportFormatTitle,
                    jpeg: t.exportJpeg,
                    png: t.exportPng,
                    svg: t.exportSvg,
                    cancel: t.cancel,
                }}/>)}
        {!embedded && newDrawingTags !== null && (<>
            <SaveNewDrawingDialog visible={saveDraftOpen} title={newDraftTitle} tags={tagOptions} selectedTags={draftTags} error={draftSaveError} saving={savingDraft} onChangeTitle={(value) => {
                    setNewDraftTitle(value);
                    if (draftSaveError)
                        setDraftSaveError(null);
                }} onToggleTag={toggleDraftTag} onAddTag={openTagCreation} onCancel={() => {
                    setSaveDraftOpen(false);
                    setDraftSaveError(null);
                }} onSave={saveNewDrawing} labels={{
                    title: t.saveNewDrawing,
                    name: t.name,
                    drawingName: t.drawingName,
                    tags: t.tags,
                    noTags: t.tagOptionsEmpty,
                    addTag: t.addTag,
                    cancel: t.cancel,
                    save: t.save,
                    saving: t.saving,
                }}/>
            <UnsavedDrawingDialog visible={exitPromptOpen} onSave={() => {
                    setExitPromptOpen(false);
                    openSaveDraftDialog();
                }} onDiscard={discardNewDrawing} onClose={() => setExitPromptOpen(false)} labels={{
                    title: t.unsavedDrawing,
                    body: t.unsavedDrawingBody,
                    save: t.save,
                    discard: t.discardDrawing,
                    close: t.close,
                }}/>
          </>)}
        {!embedded && (<CreateTagDialog visible={tagCreationOpen} name={newTagName} onChangeName={setNewTagName} onCancel={() => setTagCreationOpen(false)} onSave={() => void saveCanvasTag()} labels={{
                    title: t.addTag,
                    name: t.tagName,
                    cancel: t.cancel,
                    save: t.save,
                }}/>)}
        <View style={styles.canvasArea}>
          <CanvasEditor localDrawingId={activeDrawing?.id} canvasBackgroundColor={canvasBackgroundColor} onCanvasDataChange={newDrawingTags !== null ? setDraftCanvasData : undefined}/>
        </View>
        {!embedded && rasterExportRequest && (<DrawingRasterizer key={rasterExportRequest.id} request={rasterExportRequest} onComplete={handleRasterExport} onError={handleRasterExportError}/>)}
        <NativeUpdatePrompt language={language} themeMode={themeMode}/>
      </SafeAreaView>);
    }
    return (<>
      <NavigationBar style={themeMode === "light" ? "dark" : "light"}/>
      <DrawingHomeScreen onOpenCanvas={(drawing, openDetails, availableTags) => {
            setNewDrawingTags(null);
            setActiveDrawing(drawing ?? null);
            setTagOptions(availableTags ?? drawing?.flatTags ?? []);
            if (drawing && openDetails) {
                setDraftTitle(drawing.title);
                setDraftTags([...drawing.flatTags]);
                setDetailsOpen(true);
            }
            else {
                setDetailsOpen(false);
            }
        }} onExportSelectedDrawings={(documents) => {
            setSelectedExportDocuments(documents);
            setExportFormatDialogOpen(true);
        }} onCreateDrawing={startNewDrawing} language={language} onLanguageChange={changeLanguage} themeMode={themeMode} onThemeChange={changeTheme}/>
      <ExportFormatDialog visible={exportFormatDialogOpen} onCancel={closeExportFormatDialog} onChoose={chooseExportFormat} labels={{
            title: t.exportFormatTitle,
            jpeg: t.exportJpeg,
            png: t.exportPng,
            svg: t.exportSvg,
            cancel: t.cancel,
        }}/>
      {rasterExportRequest && (<DrawingRasterizer key={rasterExportRequest.id} request={rasterExportRequest} onComplete={handleRasterExport} onError={handleRasterExportError}/>)}
      <NativeUpdatePrompt language={language} themeMode={themeMode}/>
    </>);
}
export default function InfiniteCanvasApp() {
    useEffect(() => {
        void registerCloudSyncBackgroundTask().catch((error: unknown) => {
            console.warn("Could not register background Cloud Sync", error);
        });
    }, []);
    useEffect(() => {
        if (Platform.OS !== "web" || typeof document === "undefined")
            return;
        const style = document.createElement("style");
        style.setAttribute("data-infinite-canvas-user-select", "off");
        style.textContent = `
      body, #root, [data-testid], div, span, button {
        -webkit-user-select: none;
        user-select: none;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text;
        user-select: text;
      }
    `;
        document.head.appendChild(style);
        return () => {
            style.remove();
        };
    }, []);
    if (Platform.OS !== "web") {
        return (<SafeAreaProvider>
        <AppThemeProvider><CloudSyncProvider><InfiniteCanvasAppContent /></CloudSyncProvider></AppThemeProvider>
      </SafeAreaProvider>);
    }
    return (<NuqsAdapter>
      <SafeAreaProvider>
        <AppThemeProvider><CloudSyncProvider><InfiniteCanvasAppContent /></CloudSyncProvider></AppThemeProvider>
      </SafeAreaProvider>
    </NuqsAdapter>);
}
