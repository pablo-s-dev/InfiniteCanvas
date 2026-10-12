import { useAppTheme } from "../theme/ThemeContext";
import { StyleSheet } from "react-native";
export function useDialogStyles() {
 const { theme } = useAppTheme();
 return StyleSheet.create({
    dialogBackdrop: {
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.58)",
        flex: 1,
        justifyContent: "center",
        padding: 22,
    },
    dialog: {
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderRadius: 10,
        borderWidth: 1,
        maxWidth: 430,
        padding: 18,
        width: "100%",
    },
    dialogTitle: {
        color: theme.text,
        fontSize: 20,
        fontWeight: "800",
        marginBottom: 16,
    },
    dialogLabel: {
        color: theme.textMuted,
        fontSize: 12,
        fontWeight: "800",
        marginBottom: 8,
        marginTop: 10,
    },
    dialogBody: {
        color: theme.textMuted,
        fontSize: 14,
        lineHeight: 20,
    },
    dialogError: {
        color: theme.danger,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 9,
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
    dialogChipPanel: {
        backgroundColor: theme.surfaceRaised,
        borderColor: theme.border,
        borderRadius: 8,
        borderWidth: 1,
        minHeight: 42,
        padding: 8,
    },
    dialogChipScroll: {
        maxHeight: 112,
        width: "100%",
    },
    dialogChipList: {
        alignItems: "flex-start",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        width: "100%",
    },
    dialogChip: {
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    dialogChipSelected: {
        backgroundColor: theme.primary,
        borderColor: theme.primary,
    },
    dialogChipText: {
        color: theme.text,
        fontSize: 13,
        fontWeight: "800",
    },
    dialogChipTextSelected: {
        color: theme.primaryText,
    },
    dialogNoTags: {
        color: theme.textMuted,
        fontSize: 12,
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    dialogAddChip: {
        alignItems: "center",
        backgroundColor: theme.primary,
        borderRadius: 999,
        height: 32,
        justifyContent: "center",
        width: 32,
    },
    dialogActions: {
        flexDirection: "row",
        gap: 10,
        justifyContent: "flex-end",
        marginTop: 18,
    },
    unsavedDialogHeader: {
        alignItems: "center",
        flexDirection: "row",
        marginBottom: 12,
    },
    unsavedDialogTitle: {
        flex: 1,
        fontSize: 18,
        marginBottom: 0,
    },
    unsavedDialogCloseButton: {
        alignItems: "center",
        backgroundColor: theme.surfaceRaised,
        borderRadius: 8,
        height: 34,
        justifyContent: "center",
        marginLeft: 8,
        width: 34,
    },
    unsavedDialogActions: {
        gap: 8,
    },
    unsavedDialogButton: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
    },
    unsavedDialogButtonText: {
        fontSize: 13,
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
    dialogButtonDanger: {
        backgroundColor: "rgba(255,120,140,0.12)",
        borderColor: "rgba(255,120,140,0.35)",
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    dialogButtonDangerText: {
        color: theme.danger,
        fontWeight: "800",
    },
    dialogButtonDisabled: {
        opacity: 0.5,
    }
});

}
