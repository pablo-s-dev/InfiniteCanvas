import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
export function CreateTagDialog({ visible, name, onChangeName, onCancel, onSave, labels, }: {
    visible: boolean;
    name: string;
    onChangeName: (value: string) => void;
    onCancel: () => void;
    onSave: () => void;
    labels: {
        title: string;
        name: string;
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
          <TextInput autoFocus value={name} onChangeText={onChangeName} onSubmitEditing={onSave} placeholder={labels.name} placeholderTextColor="#7c7891" returnKeyType="done" style={styles.dialogInput}/>
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" style={styles.dialogButton} onPress={onCancel} {...webTitle(labels.cancel)}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!name.trim()} style={[
            styles.dialogButtonPrimary,
            !name.trim() && styles.dialogButtonDisabled,
        ]} onPress={onSave} {...webTitle(labels.save)}>
              <Text style={styles.dialogButtonPrimaryText}>{labels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
