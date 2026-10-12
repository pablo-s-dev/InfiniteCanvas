import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import React from "react";
import { View, Pressable, Platform } from "react-native";
import { getZIndex } from "../../../shared/theme/zIndex";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { webTitle } from "../../../shared/ui/webTitle";
export interface CanvasHistoryControlsProps {
    buttonsContainerColor: string;
    curIdx: number;
    itemsAmount: number;
    setCurIdx: React.Dispatch<React.SetStateAction<number>>;
}
export function CanvasHistoryControls({ buttonsContainerColor, curIdx, itemsAmount, setCurIdx: setCurIdx, }: CanvasHistoryControlsProps) {
    const canvasToolTheme = useCanvasToolTheme();
    const canUndo = curIdx >= 0;
    const canRedo = curIdx < itemsAmount - 1;
    const activeColor = canvasToolTheme.text;
    const disabledColor = canvasToolTheme.muted;
    const topButtonStyle = {
        alignItems: "center" as const,
        justifyContent: "center" as const,
        width: 34,
        height: 34,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: canvasToolTheme.border,
        backgroundColor: canvasToolTheme.button,
        zIndex: getZIndex("toolbar-level-3"),
    };
    return (<View style={{
            position: "absolute",
            top: 0,
            width: "100%",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: getZIndex("toolbar-level-3"),
            // backgroundColor: buttonsContainerColor,
        }}>
      <View></View>

      <View style={{
            flexDirection: "row",
            paddingHorizontal: 8,
            paddingVertical: 6,
            gap: 8,
            borderColor: canvasToolTheme.border,
            borderBottomWidth: 1,
            backgroundColor: canvasToolTheme.bar,
            zIndex: getZIndex("toolbar-level-3"),
            ...(Platform.OS === "web"
                ? ({ backdropFilter: "blur(16px)" } as any)
                : {}),
        }}>
        <Pressable {...webTitle("Undo")} style={topButtonStyle} onPress={() => {
            // const lastPath = savedPaths.pop();
            // setPaths(savedPaths);
            if (canUndo) {
                // setPaths([...savedPaths.slice(0, curIdx - 1)]);
                // setCurPath('');
                setCurIdx(curIdx - 1);
            }
        }}>
          <AppIcon icon="mdi:undo" size={24} color={canUndo ? activeColor : disabledColor}/>
        </Pressable>

        <Pressable {...webTitle("Redo")} style={topButtonStyle} onPress={() => {
            if (canRedo) {
                // setPaths([...savedPaths, nextPath]);
                // setCurPath('');
                setCurIdx(curIdx + 1);
            }
        }}>
          <AppIcon icon="mdi:redo" size={24} color={canRedo ? activeColor : disabledColor}/>
        </Pressable>
      </View>
    </View>);
}
