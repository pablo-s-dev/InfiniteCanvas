import { useAppTheme } from "../../../shared/theme/ThemeContext";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { StyleSheet } from "react-native";
import { Modal, Pressable, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import type { DrawingImageFormat } from "../drawingImageExport";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
export function ExportFormatDialog({ visible, onCancel, onChoose, labels, }: {
    visible: boolean;
    onCancel: () => void;
    onChoose: (format: DrawingImageFormat) => void;
    labels: {
        title: string;
        jpeg: string;
        png: string;
        svg: string;
        cancel: string;
    };
}) {
  const { theme } = useAppTheme();
    const styles = { ...useDialogStyles(), ...createFormatStyles(theme) };
    const options: Array<{
        format: DrawingImageFormat;
        label: string;
        extension: string;
    }> = [
        { format: "jpeg", label: labels.jpeg, extension: ".jpeg" },
        { format: "png", label: labels.png, extension: ".png" },
        { format: "svg", label: labels.svg, extension: ".svg" },
    ];
    return (<Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <View style={styles.exportFormatOptions}>
            {options.map((option) => (<Pressable key={option.format} accessibilityRole="button" style={styles.exportFormatOption} onPress={() => onChoose(option.format)} {...webTitle(labels[option.format])}>
                <AppIcon icon={option.format === "svg"
                ? "mdi:file-export-outline"
                : "mdi:image-outline"} size={21} color={theme.primary}/>
                <Text style={styles.exportFormatLabel}>{option.label}</Text>
                <Text style={styles.exportFormatExtension}>
                  {option.extension}
                </Text>
              </Pressable>))}
          </View>
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" style={styles.dialogButton} onPress={onCancel} {...webTitle(labels.cancel)}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
const createFormatStyles = (theme: AppTheme) => StyleSheet.create({
        exportFormatOptions: {
            gap: 8,
        },
        exportFormatOption: {
            alignItems: "center",
            backgroundColor: theme.surfaceRaised,
            borderColor: theme.border,
            borderRadius: 10,
            borderWidth: 1,
            flexDirection: "row",
            gap: 12,
            minHeight: 50,
            paddingHorizontal: 14,
        },
        exportFormatLabel: {
            color: theme.text,
            flex: 1,
            fontSize: 14,
            fontWeight: "700",
        },
        exportFormatExtension: {
            color: theme.textMuted,
            fontSize: 12,
            fontWeight: "700",
        }
    });
