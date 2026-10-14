import { Modal, Pressable, Text, View } from "react-native";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
import { TagChipPicker } from "../../tags/components/TagChipPicker";

export function DrawingTagsDialog({
  visible,
  drawingTitle,
  tags,
  selectedTags,
  saving,
  onToggleTag,
  onAddTag,
  onCancel,
  onSave,
  labels,
}: {
  visible: boolean;
  drawingTitle: string;
  tags: string[];
  selectedTags: string[];
  saving: boolean;
  onToggleTag: (tag: string) => void;
  onAddTag: () => void;
  onCancel: () => void;
  onSave: () => void;
  labels: {
    title: string;
    noTags: string;
    addTag: string;
    cancel: string;
    save: string;
  };
}) {
  const styles = useDialogStyles();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogBody}>{drawingTitle}</Text>
          <TagChipPicker
            tags={tags}
            selectedTags={selectedTags}
            disabled={saving}
            onToggleTag={onToggleTag}
            onAddTag={onAddTag}
            labels={{ noTags: labels.noTags, addTag: labels.addTag }}
          />
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              style={[styles.dialogButton, saving && styles.dialogButtonDisabled]}
              onPress={onCancel}
              {...webTitle(labels.cancel)}
            >
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              style={[styles.dialogButtonPrimary, saving && styles.dialogButtonDisabled]}
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
