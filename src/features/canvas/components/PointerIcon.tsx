import { View } from "react-native";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";
export interface PointerIconProps {
    pseudoPointerMode: boolean;
    screenPosition: [
        number,
        number
    ];
}
export function PointerIcon({ pseudoPointerMode: pointerMode, screenPosition, }: PointerIconProps) {
 const canvasToolTheme = useCanvasToolTheme();

    return (<View style={{
            position: "absolute",
            left: screenPosition[0] - 5,
            top: screenPosition[1] - 5,
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: canvasToolTheme.accent,
            backgroundColor: "#ffffff",
            zIndex: getZIndex("toolbar-level-4"),
            display: pointerMode ? "flex" : "none",
            padding: 0,
            margin: 0,
        }}/>);
}
