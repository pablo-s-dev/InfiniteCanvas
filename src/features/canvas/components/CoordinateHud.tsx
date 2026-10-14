import { View, Text } from "react-native";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";

export function CoordinateHud({ coordinates, scale, showCoordinates = false }: {
  coordinates: [number, number]; scale: number; showCoordinates?: boolean;
}) {
 const canvasToolTheme = useCanvasToolTheme();

  const zoomPercent = scale * 100;
  const zoomText = Math.abs(zoomPercent) >= 100000 || Math.abs(zoomPercent) < 0.01
    ? `${zoomPercent.toExponential(2)}%`
    : `${Math.max(0.01, zoomPercent).toFixed(zoomPercent < 10 ? 2 : 0)}%`;
  return <View style={{ pointerEvents: "none", position: "absolute", top: 12, left: 12,
    zIndex: getZIndex("canvas-level-6"), alignItems: "flex-start", gap: 6 }}>
    <View style={{ backgroundColor: canvasToolTheme.bar, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 7 }}>
      <Text style={{ color: canvasToolTheme.text, fontSize: 12, fontWeight: "700" }}>{zoomText}</Text>
    </View>
    {showCoordinates ? <Text style={{ color: canvasToolTheme.muted, fontSize: 11,
      backgroundColor: canvasToolTheme.bar, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
      x: {coordinates[0]} � y: {coordinates[1]}
    </Text> : null}
  </View>;
}
