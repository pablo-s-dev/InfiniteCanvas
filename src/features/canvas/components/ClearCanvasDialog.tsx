import { View, Text, Pressable, Modal } from "react-native";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { webTitle } from "../../../shared/ui/webTitle";
export function ClearCanvasDialog({ visible, onCancel, onConfirm, }: {
    visible: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
 const canvasToolTheme = useCanvasToolTheme();

    return (<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.58)",
            padding: 20,
        }}>
        <View style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: canvasToolTheme.border,
            backgroundColor: canvasToolTheme.bar,
            padding: 16,
            gap: 12,
        }}>
          <Text style={{
            color: canvasToolTheme.text,
            fontSize: 16,
            fontWeight: "900",
        }}>
            Clear canvas?
          </Text>
          <Text style={{
            color: canvasToolTheme.muted,
            fontSize: 13,
            lineHeight: 19,
        }}>
            This removes every stroke and image from this drawing.
          </Text>
          <View style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 8,
        }}>
            <Pressable {...webTitle("Cancel")} onPress={onCancel} style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: canvasToolTheme.border,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: canvasToolTheme.button,
        }}>
              <Text style={{ color: canvasToolTheme.text, fontWeight: "800" }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable {...webTitle("Clear canvas")} onPress={onConfirm} style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: canvasToolTheme.danger,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: canvasToolTheme.danger,
        }}>
              <Text style={{ color: canvasToolTheme.primaryText, fontWeight: "900" }}>
                Clear
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
