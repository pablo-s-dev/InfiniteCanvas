import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { createStyles } from "../../home/homeStyles";
export function TagDialog({ visible, value, setValue, onCancel, onSave, styles, labels, }: {
    visible: boolean;
    value: string;
    setValue: (value: string) => void;
    onCancel: () => void;
    onSave: () => void;
    styles: ReturnType<typeof createStyles>;
    labels: {
        title: string;
        input: string;
        save: string;
        cancel: string;
    };
}) {
    return (<Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <TextInput value={value} onChangeText={setValue} placeholder={labels.input} style={styles.dialogInput}/>
          <View style={styles.dialogActions}>
            <Pressable style={styles.dialogButton} onPress={onCancel}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
            <Pressable style={styles.dialogButtonPrimary} onPress={onSave}>
              <Text style={styles.dialogButtonPrimaryText}>{labels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
