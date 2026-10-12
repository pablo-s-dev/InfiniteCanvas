import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
import { TagChipPicker } from "../../tags/components/TagChipPicker";
export function DrawingDetailsDialog({ visible, title, tags, selectedTags, setTitle, onToggleTag, onAddTag, onCancel, onSave, labels, }: {
    visible: boolean;
    title: string;
    tags: string[];
    selectedTags: string[];
    setTitle: (value: string) => void;
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
    };
}) {
  const styles = useDialogStyles();
    return (<Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogLabel}>{labels.name}</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder={labels.drawingName} placeholderTextColor="#7c7891" style={styles.dialogInput}/>
          <Text style={styles.dialogLabel}>{labels.tags}</Text>
          <TagChipPicker tags={tags} selectedTags={selectedTags} onToggleTag={onToggleTag} onAddTag={onAddTag} labels={{ noTags: labels.noTags, addTag: labels.addTag }}/>
          <View style={styles.dialogActions}>
            <Pressable style={styles.dialogButton} onPress={onCancel} {...webTitle(labels.cancel)}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable style={styles.dialogButtonPrimary} onPress={onSave} {...webTitle(labels.save)}>
              <Text style={styles.dialogButtonPrimaryText}>{labels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
