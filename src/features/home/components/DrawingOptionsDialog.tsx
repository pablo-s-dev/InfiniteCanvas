import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { AppTheme } from "../../../shared/theme/appPalette";
import { DrawingSummary } from "../../documents/drawingRepository";
import { createStyles } from "../../home/homeStyles";
import { webTitle } from "../../../shared/ui/webTitle";
export function DrawingOptionsDialog({ drawing, foreignAccount, theme, styles, labels, syncBusy, onClose, onCopyToAccount, onSync, onResolveConflict, onDuplicate, onDelete, }: {
    drawing: DrawingSummary | null;
    foreignAccount: boolean;
    theme: AppTheme;
    styles: ReturnType<typeof createStyles>;
    labels: {
        title: string;
        close: string;
        sync: string;
        copyToAccount: string;
        resolveConflict: string;
        duplicate: string;
        delete: string;
    };
    syncBusy: boolean;
    onClose: () => void;
    onCopyToAccount: () => void;
    onSync: () => void;
    onResolveConflict: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    if (!drawing)
        return null;
    return (<Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={[styles.dialogBackdrop, styles.optionsBackdrop]}>
        <Pressable accessibilityRole="button" accessibilityLabel={labels.close} style={StyleSheet.absoluteFill} onPress={onClose}/>
        <View style={styles.optionsPanel}>
          <View style={styles.optionsHeader}>
            <View style={styles.optionsHeading}>
              <Text style={styles.optionsTitle}>{labels.title}</Text>
              <Text style={styles.optionsDrawingTitle} numberOfLines={1}>
                {drawing.title}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={labels.close} style={styles.cardMoreButton} onPress={onClose} {...webTitle(labels.close)}>
              <AppIcon icon="mdi:close-circle-outline" size={20} color={theme.textMuted}/>
            </Pressable>
          </View>
          {foreignAccount ? (<Pressable accessibilityRole="button" accessibilityState={{ disabled: syncBusy }} disabled={syncBusy} style={[styles.optionsAction, syncBusy && styles.optionsActionDisabled]} onPress={onCopyToAccount} {...webTitle(labels.copyToAccount)}>
              <AppIcon icon="mdi:content-copy" size={20} color={theme.primary}/>
              <Text style={styles.optionsActionText}>{labels.copyToAccount}</Text>
            </Pressable>) : drawing.syncConflict ? (<Pressable accessibilityRole="button" style={styles.optionsAction} onPress={onResolveConflict} {...webTitle(labels.resolveConflict)}>
              <AppIcon icon="mdi:alert-circle-outline" size={20} color={theme.primary}/>
              <Text style={styles.optionsActionText}>
                {labels.resolveConflict}
              </Text>
            </Pressable>) : (<Pressable accessibilityRole="button" disabled={syncBusy} style={[styles.optionsAction, syncBusy && styles.optionsActionDisabled]} onPress={onSync} {...webTitle(labels.sync)}>
              <AppIcon icon="mdi:cloud-upload-outline" size={20} color={theme.primary}/>
              <Text style={styles.optionsActionText}>{labels.sync}</Text>
            </Pressable>)}
          <Pressable accessibilityRole="button" style={styles.optionsAction} onPress={onDuplicate} {...webTitle(labels.duplicate)}>
            <AppIcon icon="mdi:content-duplicate" size={20} color={theme.textMuted}/>
            <Text style={styles.optionsActionText}>{labels.duplicate}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.optionsAction, styles.optionsActionDanger]} onPress={onDelete} {...webTitle(labels.delete)}>
            <AppIcon icon="mdi:delete-outline" size={20} color={theme.danger}/>
            <Text style={[styles.optionsActionText, styles.optionsActionDangerText]}>
              {labels.delete}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>);
}
