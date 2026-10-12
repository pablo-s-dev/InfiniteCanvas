import React from "react";
import { View, Pressable } from "react-native";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { webTitle } from "../../../shared/ui/webTitle";
export interface PointerModeBtnProps {
    pseudoleftClick: boolean;
    setPseudoLeftClick: React.Dispatch<React.SetStateAction<boolean>>;
}
export function PointerModeBtn({ pseudoleftClick: leftClick, setPseudoLeftClick: setLeftClick, }: PointerModeBtnProps) {
 const canvasToolTheme = useCanvasToolTheme();

    return (<Pressable {...webTitle(leftClick ? "Pointer draw mode" : "Pointer move mode")} onPress={(e) => {
            setLeftClick((value) => !value);
        }}>
      <View style={{
            borderWidth: 2,
            paddingHorizontal: 10,
            marginBottom: 4,
            borderRadius: 4,
            borderColor: canvasToolTheme.border,
            backgroundColor: "transparent",
        }}>
        <AppIcon icon={leftClick ? "mdi:pencil-outline" : "mdi:circle-small"} size={24} color={leftClick ? canvasToolTheme.foreground : canvasToolTheme.accent}/>
      </View>
    </Pressable>);
}
