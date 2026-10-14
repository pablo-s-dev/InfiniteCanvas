import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AppUpdate,
  clearUpdateDeferral,
  deferUpdate,
  getUpdateDeferral,
  shouldPromptForUpdate,
  type AppUpdateCheckResult,
} from "./appUpdate";
import { SupportedLanguage, useTranslations } from "../shared/i18n/i18n";
import { AppThemeMode, appThemes } from "../shared/theme/appPalette";

type PromptPhase = "available" | "starting" | "downloading" | "downloaded";
type TerminalState = "downloaded" | "failed" | "canceled" | null;

export function NativeUpdatePrompt({
  language,
  themeMode,
}: {
  language: SupportedLanguage;
  themeMode: AppThemeMode;
}) {
  const { t } = useTranslations(language);
  const theme = appThemes[themeMode];
  const [phase, setPhaseState] = useState<PromptPhase | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const phaseRef = useRef<PromptPhase | null>(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const checkingRef = useRef(false);
  const revisionRef = useRef(0);
  const versionRef = useRef<number | null>(null);
  const updateStartedRef = useRef(false);
  const terminalStateRef = useRef<TerminalState>(null);

  const setPhase = useCallback((next: PromptPhase | null) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (
      Platform.OS !== "android" ||
      !AppUpdate.isAvailable ||
      checkingRef.current ||
      busyRef.current
    ) {
      return;
    }

    checkingRef.current = true;
    const revision = revisionRef.current;
    try {
      const result: AppUpdateCheckResult = await AppUpdate.checkForUpdate();
      if (result.state !== "none") {
        versionRef.current = result.availableVersionCode;
      }
      if (
        !mountedRef.current ||
        revision !== revisionRef.current ||
        result.state === "none"
      ) {
        return;
      }

      if (result.state === "in-progress") {
        updateStartedRef.current = true;
        busyRef.current = true;
        setProgress(null);
        setPhase("downloading");
        return;
      }

      const deferral = await getUpdateDeferral().catch(() => null);
      if (
        !mountedRef.current ||
        revision !== revisionRef.current ||
        busyRef.current ||
        !shouldPromptForUpdate(result.availableVersionCode, deferral)
      ) {
        return;
      }

      if (result.state === "downloaded") {
        updateStartedRef.current = true;
        terminalStateRef.current = "downloaded";
        setPhase("downloaded");
      } else {
        setPhase("available");
      }
      setHasError(false);
    } catch {
      // A passive check should not interrupt someone using the canvas.
    } finally {
      checkingRef.current = false;
    }
  }, [setPhase]);

  useEffect(() => {
    if (Platform.OS !== "android" || !AppUpdate.isAvailable) return undefined;
    mountedRef.current = true;

    const updateSubscription = AppUpdate.addListener((event) => {
      if (!mountedRef.current) return;

      if (event.state === "downloading") {
        if (terminalStateRef.current === "downloaded") return;
        revisionRef.current += 1;
        updateStartedRef.current = true;
        busyRef.current = true;
        const total = event.totalBytesToDownload ?? 0;
        const downloaded = event.bytesDownloaded ?? 0;
        setProgress(total > 0 ? Math.max(0, Math.min(1, downloaded / total)) : null);
        setPhase("downloading");
      } else if (event.state === "downloaded") {
        revisionRef.current += 1;
        updateStartedRef.current = true;
        terminalStateRef.current = "downloaded";
        busyRef.current = false;
        setProgress(1);
        setPhase("downloaded");
        setHasError(false);
      } else if (event.state === "failed" && updateStartedRef.current) {
        revisionRef.current += 1;
        updateStartedRef.current = false;
        terminalStateRef.current = "failed";
        busyRef.current = false;
        setProgress(null);
        setPhase("available");
        setHasError(true);
      } else if (event.state === "canceled" && updateStartedRef.current) {
        revisionRef.current += 1;
        updateStartedRef.current = false;
        terminalStateRef.current = "canceled";
        busyRef.current = false;
        setProgress(null);
        setPhase(null);
        if (versionRef.current != null) {
          void deferUpdate(versionRef.current).catch(() => undefined);
        }
      }
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkForUpdate();
    });

    void checkForUpdate();
    return () => {
      mountedRef.current = false;
      revisionRef.current += 1;
      updateSubscription?.remove();
      appStateSubscription.remove();
    };
  }, [checkForUpdate, setPhase]);

  const dismiss = async () => {
    if (busyRef.current) return;
    const version = versionRef.current;
    revisionRef.current += 1;
    updateStartedRef.current = false;
    terminalStateRef.current = null;
    setPhase(null);
    setHasError(false);
    if (version != null) await deferUpdate(version).catch(() => undefined);
  };

  const startUpdate = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    revisionRef.current += 1;
    updateStartedRef.current = true;
    terminalStateRef.current = null;
    setProgress(null);
    setHasError(false);
    setPhase("starting");

    try {
      const result = await AppUpdate.startFlexibleUpdate();
      if (!mountedRef.current) return;
      if (!result.accepted || terminalStateRef.current === "canceled") {
        busyRef.current = false;
        updateStartedRef.current = false;
        setPhase(null);
        if (versionRef.current != null) {
          await deferUpdate(versionRef.current).catch(() => undefined);
        }
        return;
      }

      await clearUpdateDeferral().catch(() => undefined);
      if (terminalStateRef.current === "downloaded") {
        busyRef.current = false;
        setPhase("downloaded");
      } else if (terminalStateRef.current === "failed") {
        busyRef.current = false;
        setPhase("available");
        setHasError(true);
      } else {
        // Keep the dialog mounted after Play accepts; it closes only at a terminal update state.
        busyRef.current = true;
        setPhase("downloading");
      }
    } catch {
      if (!mountedRef.current) return;
      if (terminalStateRef.current === "downloaded") {
        busyRef.current = false;
        setPhase("downloaded");
      } else if (phaseRef.current === "downloading") {
        busyRef.current = true;
      } else {
        busyRef.current = false;
        updateStartedRef.current = false;
        setPhase("available");
        setHasError(true);
      }
    }
  };

  const completeUpdate = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setHasError(false);
    setIsRestarting(true);
    try {
      await AppUpdate.completeUpdate();
    } catch {
      busyRef.current = false;
      setIsRestarting(false);
      setHasError(true);
    }
  };

  if (Platform.OS !== "android" || !phase) return null;

  const isBusy = busyRef.current;
  const isReady = phase === "downloaded";
  const isDownloading = phase === "downloading";
  const title = isReady
    ? t.updateReadyTitle
    : isDownloading
      ? t.updateDownloadingTitle
      : t.updateAvailableTitle;
  const description = isReady
    ? t.updateReadyDescription
    : isDownloading
      ? t.updateDownloadingDescription
      : t.updateAvailableDescription;
  const percent = progress == null ? null : Math.round(progress * 100);

  return (
    <Modal
      animationType="fade"
      statusBarTranslucent
      transparent
      visible
      onRequestClose={() => {
        if (!isBusy) void dismiss();
      }}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.dialog,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.description, { color: theme.textMuted }]}>
            {description}
          </Text>

          {isDownloading ? (
            <View style={styles.progressSection}>
              {percent == null ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: percent }}
                    style={[styles.progressTrack, { backgroundColor: theme.surfaceRaised }]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: theme.primary, width: `${percent}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressLabel, { color: theme.textMuted }]}>
                    {percent}%
                  </Text>
                </>
              )}
            </View>
          ) : null}

          {hasError ? (
            <Text style={[styles.error, { color: theme.danger }]}>
              {isReady ? t.updateCompleteError : t.updateStartError}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {isBusy ? (
              <View
                accessibilityRole="button"
                accessibilityState={{ disabled: true, busy: true }}
                style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: 0.85 }]}
              >
                <ActivityIndicator color={theme.primaryText} size="small" />
                <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>
                  {isRestarting
                    ? t.updateRestarting
                    : isDownloading
                      ? t.updateDownloading
                      : t.updateStarting}
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void dismiss()}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { backgroundColor: theme.surfaceRaised, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                    {t.updateLater}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void (isReady ? completeUpdate() : startUpdate())}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: theme.primary, opacity: pressed ? 0.78 : 1 },
                  ]}
                >
                  <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>
                    {isReady ? t.updateRestartNow : t.updateNow}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    borderRadius: 20,
    borderWidth: 1,
    elevation: 16,
    maxWidth: 440,
    padding: 24,
    ...(Platform.OS !== "web" && {
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.22,
      shadowRadius: 28,
    }),
    width: "100%",
  },
  title: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.25,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
  },
  progressSection: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    minHeight: 18,
  },
  progressTrack: {
    borderRadius: 999,
    flex: 1,
    height: 7,
    overflow: "hidden",
  },
  progressFill: {
    borderRadius: 999,
    height: "100%",
  },
  progressLabel: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    minWidth: 38,
    textAlign: "right",
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 24,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
});
