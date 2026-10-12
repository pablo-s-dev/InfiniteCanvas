import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
import { TagChipPicker } from "../../tags/components/TagChipPicker";
export function SaveNewDrawingDialog({ visible, title, tags, selectedTags, error, saving, onChangeTitle, onToggleTag, onAddTag, onCancel, onSave, labels, }: {
    visible: boolean;
    title: string;
    tags: string[];
    selectedTags: string[];
    error: string | null;
    saving: boolean;
    onChangeTitle: (value: string) => void;
    onToggleTag: (tag: string) => void;
    onAddTag: () => void;
    onCancel: () => void;
    onSave: () => void | Promise<void>;
    labels: {
        title: string;
        name: string;
        drawingName: string;
        tags: string;
        noTags: string;
        addTag: string;
        cancel: string;
        save: string;
        saving: string;
    };
}) {
  const styles = useDialogStyles();
    return (<Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogLabel}>{labels.name}</Text>
          <TextInput editable={!saving} value={title} onChangeText={onChangeTitle} placeholder={labels.drawingName} placeholderTextColor="#7c7891" returnKeyType="done" style={styles.dialogInput}/>
          <Text style={styles.dialogLabel}>{labels.tags}</Text>
          <TagChipPicker tags={tags} selectedTags={selectedTags} onToggleTag={onToggleTag} onAddTag={onAddTag} labels={{ noTags: labels.noTags, addTag: labels.addTag }} disabled={saving}/>
          {error ? <Text style={styles.dialogError}>{error}</Text> : null}
          <View style={styles.dialogActions}>
            <Pressable disabled={saving} style={styles.dialogButton} onPress={onCancel} {...webTitle(labels.cancel)}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable accessibilityLabel={labels.save} disabled={saving} style={[
            styles.dialogButtonPrimary,
            saving && styles.dialogButtonDisabled,
        ]} onPress={onSave} {...webTitle(labels.save)}>
              <Text style={styles.dialogButtonPrimaryText}>
                {saving ? labels.saving : labels.save}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
