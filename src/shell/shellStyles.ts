import { useAppTheme } from "../shared/theme/ThemeContext";
import { Platform, StyleSheet } from "react-native";
export function useShellStyles() {
 const { theme } = useAppTheme();
 return StyleSheet.create({
    canvasShell: {
        backgroundColor: theme.background,
        flex: 1,
    },
    topBar: {
        alignItems: "center",
        backgroundColor: theme.surface,
        borderBottomColor: theme.border,
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
        backgroundColor: theme.surfaceRaised,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    backButtonText: {
        color: theme.text,
        fontWeight: "700",
    },
    activeDrawingText: {
        color: theme.textMuted,
        flex: 1,
        flexShrink: 1,
        fontSize: 13,
        fontWeight: "700",
        minWidth: 0,
    },
    detailsButton: {
        alignItems: "center",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        borderRadius: 8,
        borderWidth: 1,
        height: 36,
        justifyContent: "center",
        width: 36,
    },
    saveButton: {
        alignItems: "center",
        backgroundColor: theme.primary,
        borderRadius: 8,
        flexDirection: "row",
        gap: 6,
        height: 36,
        justifyContent: "center",
        paddingHorizontal: 10,
    },
    saveButtonText: {
        color: theme.primaryText,
        fontSize: 13,
        fontWeight: "800",
    },
    iconButton: {
        alignItems: "center",
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        borderRadius: 8,
        borderWidth: 1,
        height: 36,
        justifyContent: "center",
        width: 36,
    },
    canvasArea: {
        flex: 1,
    }
});

}
