import { useAppTheme } from "../../../shared/theme/ThemeContext";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { StyleSheet } from "react-native";
import { getZIndex } from "../../../shared/theme/zIndex";
import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import ColorPicker, { Panel1, Swatches, PreviewText, HueCircular } from "reanimated-color-picker";
import type { ColorFormatsObject } from "reanimated-color-picker";
import Animated from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { webTitle } from "../../../shared/ui/webTitle";
export interface CanvasColorPickerProps {
    customSwatches: string[];
    onColorSelect: (color: ColorFormatsObject) => void;
    setColorPickerModal: React.Dispatch<React.SetStateAction<boolean>>;
    showColorPickerModal: boolean;
    color: string;
}
export function CanvasColorPicker({ customSwatches, onColorSelect, setColorPickerModal, showColorPickerModal, color, }: CanvasColorPickerProps) {
    const { theme } = useAppTheme();
    const styles = createStyles(theme);
    return (<Modal onRequestClose={() => setColorPickerModal(false)} visible={showColorPickerModal} animationType="fade" transparent={true}>
      <BlurView intensity={20} style={{
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
        }}>
        <Animated.View style={[styles.container]} onPointerUp={() => setColorPickerModal(false)}>
          <View style={styles.pickerContainer} onPointerUp={(e) => e.stopPropagation()}>
            <ColorPicker value={color} sliderThickness={20} thumbSize={24} onChange={onColorSelect} boundedThumb>
              <HueCircular containerStyle={styles.hueContainer} thumbShape="pill">
                <Panel1 style={styles.panelStyle}/>
              </HueCircular>
              <Swatches style={styles.swatchesContainer} swatchStyle={styles.swatchStyle} colors={customSwatches}/>
              <View style={styles.previewTxtContainer}>
                <PreviewText style={{ color: theme.textMuted }} colorFormat="hsl"/>
              </View>
            </ColorPicker>
          </View>

          <Pressable {...webTitle("Close color picker")} style={styles.closeButton} onPress={() => setColorPickerModal(false)}>
            <Text style={{ color: theme.textMuted, fontWeight: "bold" }}>Close</Text>
          </Pressable>
        </Animated.View>
      </BlurView>
    </Modal>);
}
const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignContent: "center",
        height: "100%",
        width: "100%",
        zIndex: getZIndex("modal-level-1"),
        backgroundColor: "#42465e97",
    },
    pickerContainer: {
        alignSelf: "center",
        width: "90%",
        maxWidth: 360,
        backgroundColor: theme.surface,
        padding: 20,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 5,
        },
        shadowOpacity: 0.34,
        shadowRadius: 6.27,
        elevation: 10,
    },
    hueContainer: {
        justifyContent: "center",
    },
    panelStyle: {
        width: "70%",
        height: "70%",
        alignSelf: "center",
        borderRadius: 16,
        zIndex: getZIndex("modal-level-2"),
    },
    previewTxtContainer: {
        paddingTop: 20,
        marginTop: 20,
        borderTopWidth: 1,
        borderColor: theme.border,
    },
    swatchesContainer: {
        paddingTop: 20,
        marginTop: 20,
        borderTopWidth: 1,
        borderColor: theme.border,
        alignItems: "center",
        flexWrap: "nowrap",
        gap: 10,
    },
    swatchStyle: {
        borderRadius: 20,
        height: 30,
        width: 30,
        margin: 0,
        marginBottom: 0,
        marginHorizontal: 0,
        marginVertical: 0,
    },
    closeButton: {
        borderRadius: 8,
        marginTop: 12,
        paddingHorizontal: 40,
        paddingVertical: 10,
        alignSelf: "center",
        backgroundColor: theme.surface,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
});
