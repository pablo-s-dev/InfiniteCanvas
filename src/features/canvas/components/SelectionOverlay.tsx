import { View, Pressable, Platform } from "react-native";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { CopyPlusIcon } from "../../../shared/icons/CopyPlusIcon";
import { webTitle } from "../../../shared/ui/webTitle";
import type { CanvasIconName } from "../canvasTypes";
export function SelectionOverlay({ bounds, isDragging, isResizing, onPointerDown, onPointerMove, onPointerUp, onResizePointerDown, onResizePointerMove, onResizePointerUp, onDuplicate, onDelete, }: {
    bounds: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    isDragging: boolean;
    isResizing: boolean;
    onPointerDown: (event: any) => void;
    onPointerMove: (event: any) => void;
    onPointerUp: (event: any) => void;
    onResizePointerDown: (event: any) => void;
    onResizePointerMove: (event: any) => void;
    onResizePointerUp: (event: any) => void;
    onDuplicate: () => void | Promise<void>;
    onDelete: () => void;
}) {
 const canvasToolTheme = useCanvasToolTheme();

    const actions: Array<{
        label: string;
        icon: CanvasIconName | "copy-plus";
        action: () => void | Promise<void>;
    }> = [
        { label: "Duplicate", icon: "copy-plus", action: onDuplicate },
        { label: "Delete", icon: "mdi:delete-outline", action: onDelete },
    ];
    return (<View pointerEvents="box-none" style={{
            position: "absolute",
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            zIndex: getZIndex("canvas-level-4"),
        }}>
      <View {...webTitle("Drag selected strokes")} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{
            position: "absolute",
            top: -8,
            right: -8,
            bottom: -8,
            left: -8,
            borderColor: canvasToolTheme.accent,
            borderRadius: 6,
            borderStyle: "dashed",
            borderWidth: 1.5,
            cursor: (Platform.OS === "web" ? (isDragging ? "grabbing" : "grab") : undefined) as any,
        }}/>
      <View style={{
            position: "absolute",
            top: -48,
            left: 0,
            flexDirection: "row",
            gap: 6,
            padding: 5,
            borderRadius: 8,
            borderColor: canvasToolTheme.border,
            borderWidth: 1,
            backgroundColor: canvasToolTheme.bar,
            zIndex: getZIndex("canvas-level-4"),
            shadowColor: "#000",
            shadowOpacity: 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
        }}>
        {actions.map((actionItem) => {
            return (<Pressable key={actionItem.label} {...webTitle(actionItem.label)} accessibilityLabel={actionItem.label} onPointerDown={(event) => event.stopPropagation()} onPress={(event) => {
                    event.stopPropagation();
                    actionItem.action();
                }} style={{
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    backgroundColor: canvasToolTheme.button,
                }}>
              {actionItem.icon === "copy-plus" ? (<CopyPlusIcon size={19} color={canvasToolTheme.foreground} plusColor={canvasToolTheme.accent}/>) : (<AppIcon icon={actionItem.icon} size={19} color={actionItem.label === "Delete"
                        ? "#ff8d9b"
                        : canvasToolTheme.foreground}/>)}
            </Pressable>);
        })}
      </View>
      <Pressable nativeID="canvas-selection-resize-handle" {...webTitle("Resize selection")} onPointerDown={(event) => {
            event.stopPropagation?.();
            onResizePointerDown(event);
        }} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} onPointerCancel={onResizePointerUp} style={{
            alignItems: "center",
            justifyContent: "center",
            position: "absolute",
            right: -13,
            bottom: -13,
            width: 26,
            height: 26,
            borderRadius: 6,
            borderWidth: 1,
            zIndex: getZIndex("canvas-level-6"),
            borderColor: canvasToolTheme.border,
            backgroundColor: isResizing
                ? canvasToolTheme.buttonActive
                : canvasToolTheme.button,
            cursor: (Platform.OS === "web" ? "nwse-resize" : undefined) as any,
        }}>
        <AppIcon icon="mdi:resize-bottom-right" size={16} color={canvasToolTheme.accent}/>
      </Pressable>
    </View>);
}
