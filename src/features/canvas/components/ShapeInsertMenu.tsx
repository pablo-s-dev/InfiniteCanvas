import { View, Pressable, Text } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { useTranslations } from "../../../shared/i18n/i18n";
import { webTitle } from "../../../shared/ui/webTitle";
import type { ShapeTool, CanvasIconName } from "../canvasTypes";
export function ShapeInsertMenu({ onInsert }: { onInsert: (tool: Exclude<ShapeTool, "freehand">) => void }) {
 const theme = useCanvasToolTheme(); const { t } = useTranslations();
 const options: [Exclude<ShapeTool, "freehand">, string, CanvasIconName][] = [
  ["line", t.shapeLine, "mdi:vector-line"], ["rectangle", t.shapeRectangle, "mdi:rectangle-outline"], ["ellipse", t.shapeEllipse, "mdi:ellipse-outline"]
 ];
 return <View style={{ paddingLeft: 12, gap: 4, borderLeftWidth: 2, borderLeftColor: theme.accent }}>
 {options.map(([tool, label, icon]) => <Pressable key={tool} {...webTitle(label)} accessibilityLabel={label} onPress={() => onInsert(tool)} style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 10 }}>
 <AppIcon icon={icon} size={18} color={theme.foreground}/><Text style={{color: theme.text}}>{label}</Text>
 </Pressable>)}
 </View>;
}
