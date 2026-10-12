import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
// Metro does not resolve nuqs package subpath exports reliably in Expo web.
// The public export maps to this file in nuqs 2.x.
import { NuqsAdapter } from "nuqs/adapters/react";
import LegacyInfiniteCanvas from "../../App";
import { DrawingHomeScreen } from "../features/home/DrawingHomeScreen";
import {
  drawingRepository,
  DrawingSummary,
} from "../features/documents/drawingRepository";
import {
  CANVAS_DOCUMENT_VERSION,
  CanvasDrawingData,
} from "../features/canvas/document";
import { AppIcon } from "../shared/icons/AppIcon";
import { CompositeTag } from "../features/tags/tagModel";
import {
  detectSystemLanguage,
  SupportedLanguage,
  useTranslations,
} from "../shared/i18n/i18n";
import { AppThemeMode, appThemes } from "../shared/theme/appPalette";
import { jsonStorage } from "../shared/storage/jsonStorage";
import {
  DrawingShareError,
  exportDrawingJson,
  shareDrawingJson,
} from "../features/sharing/drawingSharing";

const webTitle = (label: string) =>
  Platform.OS === "web" ? ({ title: label } as Record<string, string>) : {};

const THEME_KEY = "infinite-canvas:theme-mode";
const LANGUAGE_KEY = "infinite-canvas:language";

const isThemeMode = (value: unknown): value is AppThemeMode =>
  value === "dark" || value === "light";

const isSupportedLanguage = (value: unknown): value is SupportedLanguage =>
  value === "en" || value === "pt" || value === "es";

const emptyCanvasData = (): CanvasDrawingData => ({
  version: CANVAS_DOCUMENT_VERSION,
  items: [],
  historyCursor: -1,
  viewport: { x: 0, y: 0, scale: 1 },
});

const actionErrorMessage = (
  error: unknown,
  fallback: string,
  nativeShareUnavailable: string,
) => {
  if (
    error instanceof DrawingShareError &&
    error.code === "native_share_unavailable"
  ) {
    return nativeShareUnavailable;
  }

  return error instanceof Error ? error.message : fallback;
};

const isEmbeddedInHost = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;

  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

function InfiniteCanvasAppContent() {
  const embedded = useMemo(() => isEmbeddedInHost(), []);
  const [themeMode, setThemeMode] = useState<AppThemeMode>("dark");
  const [language, setLanguage] = useState<SupportedLanguage>(
    detectSystemLanguage(),
  );
  const { t } = useTranslations(language);
  const [activeDrawing, setActiveDrawing] = useState<DrawingSummary | null>(null);
  const [newDrawingTags, setNewDrawingTags] = useState<CompositeTag[] | null>(
    null,
  );
  const [draftCanvasData, setDraftCanvasData] =
    useState<CanvasDrawingData>(emptyCanvasData);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const [newDraftTitle, setNewDraftTitle] = useState("");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      jsonStorage.get<unknown>(THEME_KEY),
      jsonStorage.get<unknown>(LANGUAGE_KEY),
    ])
      .then(([storedTheme, storedLanguage]) => {
        if (!mounted) return;
        if (isThemeMode(storedTheme)) setThemeMode(storedTheme);
        if (isSupportedLanguage(storedLanguage)) setLanguage(storedLanguage);
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

  const startNewDrawing = (tags: CompositeTag[]) => {
    setActiveDrawing(null);
    setNewDrawingTags(tags);
    setDraftCanvasData(emptyCanvasData());
    setNewDraftTitle("");
    setDraftSaveError(null);
    setSaveDraftOpen(false);
    setExitPromptOpen(false);
  };

  const discardNewDrawing = () => {
    setNewDrawingTags(null);
    setDraftCanvasData(emptyCanvasData());
    setNewDraftTitle("");
    setDraftSaveError(null);
    setSaveDraftOpen(false);
    setExitPromptOpen(false);
    setActiveDrawing(null);
  };

  const requestCloseCanvas = useCallback(() => {
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
  }, [detailsOpen, exitPromptOpen, newDrawingTags, saveDraftOpen]);

  const saveNewDrawing = async () => {
    const title = newDraftTitle.trim();
    if (!title) {
      setDraftSaveError(t.drawingNameRequired);
      return;
    }

    setSavingDraft(true);
    setDraftSaveError(null);
    try {
      const saved = await drawingRepository.create(
        title,
        newDrawingTags ?? [],
        draftCanvasData,
      );
      setActiveDrawing(saved.metadata);
      setNewDrawingTags(null);
      setSaveDraftOpen(false);
      setExitPromptOpen(false);
      setNewDraftTitle("");
      setDraftCanvasData(emptyCanvasData());
    } catch (error) {
      console.warn("Could not save new drawing", error);
      setDraftSaveError(t.saveDrawingFailed);
    } finally {
      setSavingDraft(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== "android" || embedded) return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!activeDrawing && newDrawingTags === null) return false;
        requestCloseCanvas();
        return true;
      },
    );

    return () => subscription.remove();
  }, [activeDrawing, embedded, newDrawingTags, requestCloseCanvas]);

  useEffect(() => {
    if (Platform.OS !== "web" || newDrawingTags === null) return;

    const preventLeavingUnsavedDrawing = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeavingUnsavedDrawing);
    return () =>
      window.removeEventListener("beforeunload", preventLeavingUnsavedDrawing);
  }, [newDrawingTags]);

  const theme = appThemes[themeMode];

  const openDrawingDetails = () => {
    if (!activeDrawing) return;
    setDraftTitle(activeDrawing.title);
    setDraftTags(activeDrawing.flatTags.join(", "));
    setDetailsOpen(true);
  };

  const saveDrawingDetails = async () => {
    if (!activeDrawing) return;

    const title = draftTitle.trim() || activeDrawing.title;
    const tags = draftTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((name) => new CompositeTag({ name }));

    const renamed =
      title === activeDrawing.title
        ? await drawingRepository.get(activeDrawing.id)
        : await drawingRepository.rename(activeDrawing.id, title);
    const updated = await drawingRepository.updateTags(activeDrawing.id, tags);

    setActiveDrawing(updated?.metadata ?? renamed?.metadata ?? activeDrawing);
    setDetailsOpen(false);
  };

  const getActiveDocument = async () => {
    if (!activeDrawing) return null;
    return drawingRepository.get(activeDrawing.id);
  };

  const showActionError = (message: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(message);
      return;
    }

    console.warn(message);
  };

  const exportActiveDrawing = async () => {
    try {
      const document = await getActiveDocument();
      if (!document) return;
      await exportDrawingJson(document);
    } catch (error) {
      showActionError(
        actionErrorMessage(error, t.exportFailed, t.nativeShareUnavailable),
      );
    }
  };

  const shareActiveDrawing = async () => {
    try {
      const document = await getActiveDocument();
      if (!document) return;
      await shareDrawingJson(document);
    } catch (error) {
      showActionError(
        actionErrorMessage(error, t.shareFailed, t.nativeShareUnavailable),
      );
    }
  };

  const openSaveDraftDialog = () => {
    setDraftSaveError(null);
    setSaveDraftOpen(true);
  };

  if (embedded || activeDrawing || newDrawingTags !== null) {
    return (
      <SafeAreaView
        style={[styles.canvasShell, { backgroundColor: theme.background }]}
        edges={embedded ? [] : ["top", "bottom"]}
      >
        <NavigationBar style={themeMode === "dark" ? "dark" : "light"} />
        {!embedded && (
          <View style={styles.topBar}>
            <Pressable
              style={styles.backButton}
              onPress={requestCloseCanvas}
              {...webTitle(t.library)}
            >
              <Text style={styles.backButtonText}>{t.library}</Text>
            </Pressable>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={styles.activeDrawingText}
            >
              {activeDrawing?.title ??
                (newDrawingTags !== null ? t.newDrawing : t.embeddedDrawing)}
            </Text>
            {activeDrawing && (
              <Pressable
                accessibilityLabel={t.editDrawingTags}
                style={styles.tagButton}
                onPress={openDrawingDetails}
                {...webTitle(t.editDrawingTags)}
              >
                <Text style={styles.tagButtonText}>
                  {activeDrawing.flatTags.length
                    ? activeDrawing.flatTags.slice(0, 2).join(", ")
                    : t.tags}
                </Text>
              </Pressable>
            )}
            {activeDrawing && (
              <>
                <Pressable
                  accessibilityLabel={t.shareDrawing}
                  style={styles.iconButton}
                  onPress={shareActiveDrawing}
                  {...webTitle(t.shareDrawing)}
                >
                  <AppIcon icon="mdi:share-variant-outline" size={18} color="#f7f3ff" />
                </Pressable>
                <Pressable
                  accessibilityLabel={t.exportDrawing}
                  style={styles.iconButton}
                  onPress={exportActiveDrawing}
                  {...webTitle(t.exportDrawing)}
                >
                  <AppIcon icon="mdi:download-outline" size={18} color="#f7f3ff" />
                </Pressable>
              </>
            )}
            {activeDrawing && (
              <Pressable
                accessibilityLabel={t.renameDrawing}
                style={styles.renameButton}
                onPress={openDrawingDetails}
                {...webTitle(t.renameDrawing)}
              >
                <AppIcon icon="mdi:pencil-outline" size={18} color="#f7f3ff" />
              </Pressable>
            )}
            {newDrawingTags !== null && (
              <Pressable
                accessibilityLabel={t.saveNewDrawing}
                style={styles.saveButton}
                onPress={openSaveDraftDialog}
                {...webTitle(t.saveNewDrawing)}
              >
                <AppIcon
                  icon="mdi:content-save-outline"
                  size={18}
                  color="#181025"
                />
                <Text style={styles.saveButtonText}>{t.save}</Text>
              </Pressable>
            )}
          </View>
        )}
        {!embedded && activeDrawing && (
          <DrawingDetailsDialog
            visible={detailsOpen}
            title={draftTitle}
            tags={draftTags}
            setTitle={setDraftTitle}
            setTags={setDraftTags}
            onCancel={() => setDetailsOpen(false)}
            onSave={saveDrawingDetails}
            labels={{
              title: t.drawingDetails,
              name: t.name,
              drawingName: t.drawingName,
              tags: t.tags,
              tagPlaceholder: t.tagPlaceholder,
              cancel: t.cancel,
              save: t.save,
            }}
          />
        )}
        {!embedded && newDrawingTags !== null && (
          <>
            <SaveNewDrawingDialog
              visible={saveDraftOpen}
              title={newDraftTitle}
              error={draftSaveError}
              saving={savingDraft}
              onChangeTitle={(value) => {
                setNewDraftTitle(value);
                if (draftSaveError) setDraftSaveError(null);
              }}
              onCancel={() => {
                setSaveDraftOpen(false);
                setDraftSaveError(null);
              }}
              onSave={saveNewDrawing}
              labels={{
                title: t.saveNewDrawing,
                name: t.name,
                drawingName: t.drawingName,
                cancel: t.cancel,
                save: t.save,
                saving: t.saving,
              }}
            />
            <UnsavedDrawingDialog
              visible={exitPromptOpen}
              onSave={() => {
                setExitPromptOpen(false);
                openSaveDraftDialog();
              }}
              onDiscard={discardNewDrawing}
              onKeepEditing={() => setExitPromptOpen(false)}
              labels={{
                title: t.unsavedDrawing,
                body: t.unsavedDrawingBody,
                save: t.save,
                discard: t.discardDrawing,
                keepEditing: t.keepEditing,
              }}
            />
          </>
        )}
        <View style={styles.canvasArea}>
          <LegacyInfiniteCanvas
            localDrawingId={activeDrawing?.id}
            onCanvasDataChange={
              newDrawingTags !== null ? setDraftCanvasData : undefined
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <NavigationBar style={themeMode === "dark" ? "dark" : "light"} />
      <DrawingHomeScreen
        onOpenCanvas={(drawing) => {
          setNewDrawingTags(null);
          setActiveDrawing(drawing ?? null);
        }}
        onCreateDrawing={startNewDrawing}
        language={language}
        onLanguageChange={changeLanguage}
        themeMode={themeMode}
        onThemeChange={changeTheme}
      />
    </>
  );
}

function DrawingDetailsDialog({
  visible,
  title,
  tags,
  setTitle,
  setTags,
  onCancel,
  onSave,
  labels,
}: {
  visible: boolean;
  title: string;
  tags: string;
  setTitle: (value: string) => void;
  setTags: (value: string) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  labels: {
    title: string;
    name: string;
    drawingName: string;
    tags: string;
    tagPlaceholder: string;
    cancel: string;
    save: string;
  };
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogLabel}>{labels.name}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={labels.drawingName}
            placeholderTextColor="#7c7891"
            style={styles.dialogInput}
          />
          <Text style={styles.dialogLabel}>{labels.tags}</Text>
          <TextInput
            value={tags}
            onChangeText={setTags}
            placeholder={labels.tagPlaceholder}
            placeholderTextColor="#7c7891"
            style={[styles.dialogInput, styles.dialogInputTall]}
            multiline
          />
          <View style={styles.dialogActions}>
            <Pressable
              style={styles.dialogButton}
              onPress={onCancel}
              {...webTitle(labels.cancel)}
            >
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable
              style={styles.dialogButtonPrimary}
              onPress={onSave}
              {...webTitle(labels.save)}
            >
              <Text style={styles.dialogButtonPrimaryText}>{labels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SaveNewDrawingDialog({
  visible,
  title,
  error,
  saving,
  onChangeTitle,
  onCancel,
  onSave,
  labels,
}: {
  visible: boolean;
  title: string;
  error: string | null;
  saving: boolean;
  onChangeTitle: (value: string) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  labels: {
    title: string;
    name: string;
    drawingName: string;
    cancel: string;
    save: string;
    saving: string;
  };
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogLabel}>{labels.name}</Text>
          <TextInput
            autoFocus
            editable={!saving}
            value={title}
            onChangeText={onChangeTitle}
            onSubmitEditing={() => void onSave()}
            placeholder={labels.drawingName}
            placeholderTextColor="#7c7891"
            returnKeyType="done"
            style={styles.dialogInput}
          />
          {error ? <Text style={styles.dialogError}>{error}</Text> : null}
          <View style={styles.dialogActions}>
            <Pressable
              disabled={saving}
              style={styles.dialogButton}
              onPress={onCancel}
              {...webTitle(labels.cancel)}
            >
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={labels.save}
              disabled={saving}
              style={[
                styles.dialogButtonPrimary,
                saving && styles.dialogButtonDisabled,
              ]}
              onPress={onSave}
              {...webTitle(labels.save)}
            >
              <Text style={styles.dialogButtonPrimaryText}>
                {saving ? labels.saving : labels.save}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UnsavedDrawingDialog({
  visible,
  onSave,
  onDiscard,
  onKeepEditing,
  labels,
}: {
  visible: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
  labels: {
    title: string;
    body: string;
    save: string;
    discard: string;
    keepEditing: string;
  };
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onKeepEditing}
    >
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogBody}>{labels.body}</Text>
          <View style={styles.dialogActions}>
            <Pressable
              style={styles.dialogButton}
              onPress={onKeepEditing}
              {...webTitle(labels.keepEditing)}
            >
              <Text style={styles.dialogButtonText}>{labels.keepEditing}</Text>
            </Pressable>
            <Pressable
              style={styles.dialogButtonDanger}
              onPress={onDiscard}
              {...webTitle(labels.discard)}
            >
              <Text style={styles.dialogButtonDangerText}>{labels.discard}</Text>
            </Pressable>
            <Pressable
              style={styles.dialogButtonPrimary}
              onPress={onSave}
              {...webTitle(labels.save)}
            >
              <Text style={styles.dialogButtonPrimaryText}>{labels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function InfiniteCanvasApp() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

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
    return (
      <SafeAreaProvider>
        <InfiniteCanvasAppContent />
      </SafeAreaProvider>
    );
  }

  return (
    <NuqsAdapter>
      <SafeAreaProvider>
        <InfiniteCanvasAppContent />
      </SafeAreaProvider>
    </NuqsAdapter>
  );
}

const styles = StyleSheet.create({
  canvasShell: {
    backgroundColor: "#000000",
    flex: 1,
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.78)",
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "web" ? 0 : 8,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(16px)",
        } as any)
      : {}),
  },
  backButton: {
    backgroundColor: "#e4e4e7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backButtonText: {
    color: "#18181b",
    fontWeight: "700",
  },
  activeDrawingText: {
    color: "#a1a1aa",
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    minWidth: 0,
  },
  renameButton: {
    alignItems: "center",
    backgroundColor: "rgba(18,18,22,0.82)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#bda1ff",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  saveButtonText: {
    color: "#181025",
    fontSize: 13,
    fontWeight: "800",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(18,18,22,0.82)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  tagButton: {
    backgroundColor: "rgba(18,18,22,0.82)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagButtonText: {
    color: "#c4a7ff",
    fontSize: 12,
    fontWeight: "800",
  },
  canvasArea: {
    flex: 1,
  },
  dialogBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  dialog: {
    backgroundColor: "#151322",
    borderColor: "#39345b",
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 430,
    padding: 18,
    width: "100%",
  },
  dialogTitle: {
    color: "#f7f3ff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
  },
  dialogLabel: {
    color: "#afa7cb",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 10,
  },
  dialogBody: {
    color: "#c6c0d8",
    fontSize: 14,
    lineHeight: 20,
  },
  dialogError: {
    color: "#ff9ca8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 9,
  },
  dialogInput: {
    backgroundColor: "#211d35",
    borderColor: "#39345b",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f7f3ff",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dialogInputTall: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 18,
  },
  dialogButton: {
    backgroundColor: "#211d35",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dialogButtonText: {
    color: "#f7f3ff",
    fontWeight: "800",
  },
  dialogButtonPrimary: {
    backgroundColor: "#bda1ff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dialogButtonPrimaryText: {
    color: "#181025",
    fontWeight: "800",
  },
  dialogButtonDanger: {
    backgroundColor: "rgba(255,120,140,0.12)",
    borderColor: "rgba(255,120,140,0.35)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dialogButtonDangerText: {
    color: "#ff9ca8",
    fontWeight: "800",
  },
  dialogButtonDisabled: {
    opacity: 0.5,
  },
});

