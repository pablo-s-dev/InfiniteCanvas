import { Modal, Pressable, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
export function UnsavedDrawingDialog({ visible, onSave, onDiscard, onClose, labels, }: {
    visible: boolean;
    onSave: () => void;
    onDiscard: () => void;
    onClose: () => void;
    labels: {
        title: string;
        body: string;
        save: string;
        discard: string;
        close: string;
    };
}) {
  const styles = useDialogStyles();
    return (<Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <View style={styles.unsavedDialogHeader}>
            <Text style={[styles.dialogTitle, styles.unsavedDialogTitle]}>
              {labels.title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={labels.close} style={styles.unsavedDialogCloseButton} onPress={onClose} {...webTitle(labels.close)}>
              <AppIcon icon="mdi:close-circle-outline" size={20} color={styles.dialogButtonText.color}/>
            </Pressable>
          </View>
          <Text style={styles.dialogBody}>{labels.body}</Text>
          <View style={[styles.dialogActions, styles.unsavedDialogActions]}>
            <Pressable style={[styles.dialogButtonDanger, styles.unsavedDialogButton]} onPress={onDiscard} {...webTitle(labels.discard)}>
              <Text numberOfLines={1} style={[
            styles.dialogButtonDangerText,
            styles.unsavedDialogButtonText,
        ]}>
                {labels.discard}
              </Text>
            </Pressable>
            <Pressable style={[styles.dialogButtonPrimary, styles.unsavedDialogButton]} onPress={onSave} {...webTitle(labels.save)}>
              <Text numberOfLines={1} style={[
            styles.dialogButtonPrimaryText,
            styles.unsavedDialogButtonText,
        ]}>
                {labels.save}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
