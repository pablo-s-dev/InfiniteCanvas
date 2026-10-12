import { useState } from "react";
import type { ShapeTool } from "../canvasTypes";
import { ShapeInsertMenu } from "./ShapeInsertMenu";
import { useTranslations } from "../../../shared/i18n/i18n";
import { View, Text, Pressable, Platform } from "react-native";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { webTitle } from "../../../shared/ui/webTitle";
import type { CanvasIconName, CanvasContextMenuState } from "../canvasTypes";
export function CanvasContextMenu({ menu, canPaste, onPaste, onInsertImage, onInsertShape, onClose, }: {
    menu: NonNullable<CanvasContextMenuState>;
    canPaste: boolean;
    onPaste: () => void | Promise<void>;
    onInsertImage: () => void | Promise<void>;
    onInsertShape: (tool: Exclude<ShapeTool, "freehand">) => void;
    onClose: () => void;
}) {
 const [shapesOpen, setShapesOpen] = useState(false);
 const { t } = useTranslations();
 const canvasToolTheme = useCanvasToolTheme();

    const items: Array<{
        label: string;
        icon: CanvasIconName;
        action: () => void | Promise<void>;
        disabled: boolean;
    }> = [
        {
            label: "Paste here",
            icon: "mdi:content-paste",
            action: onPaste,
            disabled: !canPaste,
        },
        {
            label: t.insertImage,
            icon: "mdi:image-plus",
            action: onInsertImage,
            disabled: false,
        },
        {
            label: t.insertShape,
            icon: "mdi:shape-plus-outline",
            action: () => setShapesOpen(open => !open),
            disabled: false,
        },
    ];
    return (<View style={{
            position: "absolute",
            left: menu.screenX,
            top: menu.screenY,
            zIndex: getZIndex("popup-level-2"),
        }}>
      <Pressable {...webTitle("Close canvas menu")} onPointerDown={(event) => event.stopPropagation()} onPress={onClose} style={Platform.OS === "web"
            ? ({
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                zIndex: getZIndex("popup-level-1"),
            } as any)
            : undefined}/>
      <View onPointerDown={(event) => event.stopPropagation()} style={{
            position: "relative",
            zIndex: getZIndex("popup-level-2"),
            backgroundColor: canvasToolTheme.bar,
            borderColor: canvasToolTheme.border,
            borderRadius: 8,
            borderWidth: 1,
            minWidth: 190,
            padding: 6,
            shadowColor: "#000",
            shadowOpacity: 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
        }}>
        {items.map((item) => (<Pressable key={item.label} {...webTitle(item.label)} accessibilityLabel={item.label} disabled={item.disabled} onPress={item.action} style={{
                alignItems: "center",
                borderRadius: 6,
                flexDirection: "row",
                gap: 8,
                minHeight: 36,
                opacity: item.disabled ? 0.45 : 1,
                paddingHorizontal: 10,
            }}>
            <AppIcon icon={item.icon} size={18} color={canvasToolTheme.foreground}/>
            <Text style={{
                color: canvasToolTheme.text,
                fontSize: 12,
                fontWeight: "800",
            }}>
              {item.label}
            </Text>
          </Pressable>))}
        {shapesOpen && <ShapeInsertMenu onInsert={onInsertShape}/>}
      </View>
    </View>);
}
