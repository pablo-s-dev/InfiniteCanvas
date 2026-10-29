import { ShapeInsertMenu } from "./ShapeInsertMenu";
import { useTranslations } from "../../../shared/i18n/i18n";
import React, { useState } from "react";
import { View, Text, Pressable, Platform, LayoutChangeEvent } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Slider } from "@miblanchard/react-native-slider";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { webTitle } from "../../../shared/ui/webTitle";
import { PASTEL_SWATCHES } from "../canvasConstants";
import type { CanvasIconName, ShapeTool, CanvasToolMenuId, EraserModeType } from "../canvasTypes";
export interface CanvasToolbarProps {
    onInsertShape: (tool: Exclude<ShapeTool, "freehand">) => void;
    onInsertImage: () => void | Promise<void>;
    buttonsContainerColor: string;
    onlyPanningMode: boolean;
    pointerMode: boolean;
    pointerDrawMode: boolean;
    setPointerDrawMode: React.Dispatch<React.SetStateAction<boolean>>;
    setColorPickerModal: React.Dispatch<React.SetStateAction<boolean>>;
    activateStrokeMode: () => void;
    activatePanMode: () => void;
    activatePointerMode: () => void;
    activateEraserMode: () => void;
    confirmWipeCanvas: () => void;
    shouldCollapse: boolean;
    eraserMode: boolean;
    resetViewportToContent: () => void;
    smoothingEnabled: boolean;
    setSmoothingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    shapeTool: ShapeTool;
    activateShapeTool: (tool: ShapeTool) => void;
    lassoMode: boolean;
    rectangleSelectionMode: boolean;
    activateLassoMode: () => void;
    activateRectangleSelectionMode: () => void;
    selectedCount: number;
    eraserModeType: EraserModeType;
    setEraserModeType: React.Dispatch<React.SetStateAction<EraserModeType>>;
    eraserSize: number;
    setEraserSize: React.Dispatch<React.SetStateAction<number>>;
    strokeWidth: number;
    setStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
    strokeColorValue: string;
    setStrokeColor: (color: string) => void;
}
export type InlineSizeSliderProps = {
    label: string;
    value: number;
    onChange: (value: number) => void;
    color: string;
    minimumValue?: number;
    maximumValue?: number;
};
export function InlineSizeSlider({ label, value, onChange, color, minimumValue = 1, maximumValue = 56, }: InlineSizeSliderProps) {
 const canvasToolTheme = useCanvasToolTheme();

    const previewSize = Math.max(4, Math.min(value, 40));
    return (<View style={{
            gap: 6,
            minWidth: 220,
            maxWidth: 270,
        }}>
      <View style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
        }}>
        <Text style={{
            color: canvasToolTheme.text,
            fontSize: 12,
            fontWeight: "800",
        }}>
          {label}: {Math.round(value)}
        </Text>
        <View style={{
            pointerEvents: "none",
            alignItems: "center",
            height: 42,
            justifyContent: "center",
            width: 42,
        }}>
          <View style={{
            backgroundColor: color,
            borderColor: canvasToolTheme.border,
            borderRadius: previewSize / 2,
            borderWidth: 1,
            height: previewSize,
            width: previewSize,
        }}/>
        </View>
      </View>
      <Slider containerStyle={{
            height: 34,
            width: "100%",
        }} minimumValue={minimumValue} maximumValue={maximumValue} step={1} value={value} onValueChange={(nextValue) => {
            const rawValue = Array.isArray(nextValue) ? nextValue[0] : nextValue;
            onChange(Math.round(Number(rawValue)));
        }} minimumTrackTintColor={canvasToolTheme.accent} maximumTrackTintColor={canvasToolTheme.border} thumbTintColor={color}/>
    </View>);
}
const MenuOption = ({ runFromMenu, menuButtonStyle, activeToolButtonStyle, label, icon, active, onPress, }: {
    runFromMenu: (action: () => void) => void;
    menuButtonStyle: React.ComponentProps<typeof View>["style"];
    activeToolButtonStyle: React.ComponentProps<typeof View>["style"];
    label: string;
    icon: CanvasIconName;
    active?: boolean;
    onPress: () => void;
}) => { const canvasToolTheme = useCanvasToolTheme(); return (<Pressable {...webTitle(label)} onPress={() => runFromMenu(onPress)} style={[menuButtonStyle, active && activeToolButtonStyle]}>
      <AppIcon icon={icon} size={18} color={active ? canvasToolTheme.accent : canvasToolTheme.foreground}/>
      <Text style={{
        color: canvasToolTheme.text,
        fontSize: 12,
        fontWeight: "800",
    }}>
        {label}
      </Text>
    </Pressable>); };
const ColorSwatch = ({ runFromMenu, setColorPickerModal, setStrokeColor, color, label, custom, }: {
    runFromMenu: (action: () => void) => void;
    setColorPickerModal: React.Dispatch<React.SetStateAction<boolean>>;
    setStrokeColor: (color: string) => void;
    color: string;
    label: string;
    custom?: boolean;
}) => (<Pressable {...webTitle(label)} accessibilityLabel={label} onPress={() => custom
        ? runFromMenu(() => setColorPickerModal(true))
        : setStrokeColor(color)} style={{
        alignItems: "center",
        borderColor: "rgba(255,255,255,0.38)",
        borderRadius: 999,
        borderWidth: 1,
        height: 30,
        justifyContent: "center",
        overflow: "hidden",
        width: 30,
        ...(Platform.OS === "web" && custom
            ? ({
                backgroundImage: "conic-gradient(#ff4d6d, #ffd166, #06d6a0, #4cc9f0, #7b2cbf, #ff4d6d)",
            } as any)
            : { backgroundColor: color }),
    }}>
      {custom && Platform.OS !== "web" && (<AppIcon icon="mdi:palette-outline" size={18} color="#ffffff"/>)}
    </Pressable>);
const ToolButton = ({ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle, label, icon, active, onPress, menu, }: {
    menuTriggerProps: (menu: Exclude<CanvasToolMenuId, null>) => Partial<React.ComponentProps<typeof Pressable>>;
    openMenu: (menu: Exclude<CanvasToolMenuId, null>) => void;
    setToolMenu: React.Dispatch<React.SetStateAction<CanvasToolMenuId>>;
    toolButtonStyle: React.ComponentProps<typeof View>["style"];
    activeToolButtonStyle: React.ComponentProps<typeof View>["style"];
    label: string;
    icon: CanvasIconName;
    active?: boolean;
    onPress: () => void;
    menu?: Exclude<CanvasToolMenuId, null>;
}) => { const canvasToolTheme = useCanvasToolTheme(); return (<Pressable {...webTitle(label)} {...(menu ? menuTriggerProps(menu) : {})} onPress={() => {
        if (menu && active) {
            openMenu(menu);
            return;
        }
        setToolMenu(null);
        onPress();
    }} style={[toolButtonStyle, active && activeToolButtonStyle]} android_ripple={{ color: "#1c1c1c" }}>
      <AppIcon icon={icon} size={23} color={active ? canvasToolTheme.accent : canvasToolTheme.foreground}/>
    </Pressable>); };
export function CanvasToolbar({ onInsertShape, onInsertImage, buttonsContainerColor, onlyPanningMode, pointerMode, pointerDrawMode, setPointerDrawMode, setColorPickerModal, activateStrokeMode, activatePanMode, activatePointerMode, activateEraserMode, confirmWipeCanvas, shouldCollapse, eraserMode, resetViewportToContent, smoothingEnabled, setSmoothingEnabled, shapeTool, activateShapeTool, lassoMode, rectangleSelectionMode, activateLassoMode, activateRectangleSelectionMode, selectedCount, eraserModeType, setEraserModeType, eraserSize, setEraserSize, strokeWidth, setStrokeWidth, strokeColorValue, setStrokeColor, }: CanvasToolbarProps) {
    const [insertShapesOpen, setInsertShapesOpen] = useState(false);
    const { t } = useTranslations();
 const canvasToolTheme = useCanvasToolTheme();

    const height = useSharedValue(0);
    const [toolMenu, setToolMenu] = useState<CanvasToolMenuId>(null);
    const getHeight = (e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h) {
            height.value = h;
        }
    };
    const collapseAnim = useAnimatedStyle(() => {
        return {
            marginBottom: withSpring(!shouldCollapse ? 0 : -height.value, {
                duration: 500,
            }),
        };
    }, [shouldCollapse, height]);
    const toolButtonStyle = {
        alignItems: "center" as const,
        backgroundColor: canvasToolTheme.button,
        borderColor: canvasToolTheme.border,
        borderRadius: 8,
        borderWidth: 1,
        height: 48,
        justifyContent: "center" as const,
        width: 48,
    };
    const activeToolButtonStyle = {
        backgroundColor: canvasToolTheme.buttonActive,
    };
    const runFromMenu = (action: () => void) => {
        action();
        setToolMenu(null);
    };
    const shapeOptions: Array<{
        label: string;
        tool: ShapeTool;
        icon: CanvasIconName;
    }> = [
        { label: "Pen", tool: "freehand", icon: "mdi:pencil-outline" },
        { label: "Line", tool: "line", icon: "mdi:vector-line" },
        { label: "Rect", tool: "rectangle", icon: "mdi:rectangle-outline" },
        { label: "Oval", tool: "ellipse", icon: "mdi:ellipse-outline" },
    ];
    const openMenu = (menu: Exclude<CanvasToolMenuId, null>) => {
        setToolMenu((current) => (current === menu ? null : menu));
    };
    const menuTriggerProps = (menu: Exclude<CanvasToolMenuId, null>) => ({
        onLongPress: () => setToolMenu(menu),
        ...(Platform.OS === "web"
            ? {
                onContextMenu: (event: any) => {
                    event.preventDefault?.();
                    event.stopPropagation?.();
                    setToolMenu(menu);
                },
            }
            : {}),
    }) as any;
    const menuButtonStyle = {
        alignItems: "center" as const,
        backgroundColor: canvasToolTheme.button,
        borderColor: canvasToolTheme.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row" as const,
        gap: 7,
        minHeight: 38,
        paddingHorizontal: 10,
    };
    const menuCategoryTitle = (label: string) => (<Text style={{
            color: canvasToolTheme.muted,
            fontSize: 11,
            fontWeight: "900",
            letterSpacing: 0,
            textTransform: "uppercase",
        }}>
      {label}
    </Text>);
    const renderToolMenu = () => {
        if (!toolMenu)
            return null;
        return (<View style={{
                alignSelf: "center",
                position: "relative",
                zIndex: getZIndex("menu-level-2"),
                backgroundColor: canvasToolTheme.bar,
                borderColor: canvasToolTheme.border,
                borderRadius: 8,
                borderWidth: 1,
                gap: 10,
                marginBottom: 8,
                maxWidth: 360,
                padding: 10,
                ...(Platform.OS === "web"
                    ? ({ backdropFilter: "blur(14px)" } as any)
                    : {}),
            }}>
        {toolMenu === "stroke" && (<>
            {menuCategoryTitle("Stroke")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PASTEL_SWATCHES.map((color, index) => (<ColorSwatch {...{ runFromMenu, setColorPickerModal, setStrokeColor }} key={color} color={color} label={`Pastel color ${index + 1}`}/>))}
              <ColorSwatch {...{ runFromMenu, setColorPickerModal, setStrokeColor }} color={strokeColorValue} label="Custom color" custom/>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label={smoothingEnabled ? "Smoothing on" : "Smoothing off"} icon="mdi:chart-bell-curve-cumulative" active={smoothingEnabled} onPress={() => setSmoothingEnabled((enabled) => !enabled)}/>
            </View>
            <InlineSizeSlider label="Stroke size" value={strokeWidth} onChange={setStrokeWidth} color={strokeColorValue} minimumValue={1} maximumValue={50}/>
            {menuCategoryTitle("Shapes")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {shapeOptions.map((option) => (<MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} key={option.tool} label={option.label} icon={option.icon} active={shapeTool === option.tool} onPress={() => activateShapeTool(option.tool)}/>))}
            </View>
          </>)}

        {toolMenu === "selection" && (<>
            {menuCategoryTitle("Selection")}
            <View style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                }}>
              <Text style={{
                    color: canvasToolTheme.text,
                    fontSize: 12,
                    fontWeight: "800",
                }}>
                {selectedCount} selected
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Lasso" icon="mdi:lasso" active={lassoMode} onPress={activateLassoMode}/>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Rectangle select" icon="mdi:selection-drag" active={rectangleSelectionMode} onPress={activateRectangleSelectionMode}/>
            </View>
          </>)}

        {toolMenu === "eraser" && (<>
            {menuCategoryTitle("Eraser")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Erase strokes" icon="mdi:vector-polyline-remove" active={eraserModeType === "stroke"} onPress={() => setEraserModeType("stroke")}/>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Erase points" icon="mdi:eraser" active={eraserModeType === "point"} onPress={() => setEraserModeType("point")}/>
            </View>
            <InlineSizeSlider label="Eraser size" value={eraserSize} onChange={setEraserSize} color="#ffffff" minimumValue={4} maximumValue={72}/>
          </>)}

        {toolMenu === "pointer" && (<>
            {menuCategoryTitle("Offset Pointer")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Draw from pointer" icon="mdi:pencil-outline" active={pointerMode && pointerDrawMode} onPress={() => {
                    if (!pointerMode)
                        activatePointerMode();
                    setPointerDrawMode(true);
                }}/>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Move pointer" icon="mdi:circle-small" active={pointerMode && !pointerDrawMode} onPress={() => {
                    if (!pointerMode)
                        activatePointerMode();
                    setPointerDrawMode(false);
                }}/>
            </View>
          </>)}

        {toolMenu === "canvas" && (<>
            {menuCategoryTitle("Canvas")}
            <MenuOption {...{ runFromMenu: (action: () => void) => action(), menuButtonStyle, activeToolButtonStyle }} label={t.insertShape} icon="mdi:shape-plus-outline" onPress={() => setInsertShapesOpen(open => !open)}/>
            {insertShapesOpen && <ShapeInsertMenu onInsert={tool => runFromMenu(() => { onInsertShape(tool); setInsertShapesOpen(false); })}/>}
            <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label={t.insertImage} icon="mdi:image-plus" onPress={() => { void onInsertImage(); }}/>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Center content" icon="mdi:crosshairs-gps" onPress={resetViewportToContent}/>
              <MenuOption {...{ runFromMenu, menuButtonStyle, activeToolButtonStyle }} label="Clear canvas" icon="mdi:delete-outline" onPress={confirmWipeCanvas}/>
            </View>
          </>)}
      </View>);
    };
    return (<Animated.View onLayout={getHeight} style={[
            {
                alignItems: "center",
                position: "relative",
                width: "100%",
                zIndex: getZIndex("toolbar-level-1"),
                ...Platform.select({ web: { userSelect: "none" } as any }),
            },
            collapseAnim,
        ]}>
      {toolMenu && Platform.OS === "web" && (<Pressable {...webTitle("Close tool menu")} onPress={() => setToolMenu(null)} style={{
                bottom: 0,
                left: 0,
                position: "fixed",
                right: 0,
                top: 0,
                zIndex: getZIndex("menu-level-1"),
            } as any}/>)}
      {renderToolMenu()}
      <View style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            alignSelf: "center",
            maxWidth: 430,
            width: "92%",
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: canvasToolTheme.border,
            backgroundColor: canvasToolTheme.bar,
            zIndex: getZIndex("toolbar-level-2"),
            position: "relative",
            ...(Platform.OS === "web"
                ? ({ backdropFilter: "blur(14px)" } as any)
                : {}),
        }}>
        <ToolButton {...{ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle }} label="Stroke mode" icon={shapeOptions.find((option) => option.tool === shapeTool)?.icon ??
            "mdi:pencil-outline"} active={!onlyPanningMode &&
            !pointerMode &&
            !eraserMode &&
            !lassoMode &&
            !rectangleSelectionMode} onPress={activateStrokeMode} menu="stroke"/>
        <ToolButton {...{ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle }} label={rectangleSelectionMode ? "Rectangle select" : "Lasso select"} icon={rectangleSelectionMode ? "mdi:selection-drag" : "mdi:lasso"} active={lassoMode || rectangleSelectionMode} onPress={activateLassoMode} menu="selection"/>
        <ToolButton {...{ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle }} label="Move canvas" icon="mdi:hand-back-right-outline" active={onlyPanningMode} onPress={activatePanMode}/>
        <ToolButton {...{ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle }} label={eraserModeType === "point" ? "Erase points" : "Erase strokes"} icon={eraserModeType === "point" ? "mdi:eraser" : "mdi:eraser-variant"} active={eraserMode} onPress={activateEraserMode} menu="eraser"/>
        <ToolButton {...{ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle }} label={pointerDrawMode ? "Pointer draw mode" : "Pointer move mode"} icon={pointerDrawMode ? "mdi:pencil-outline" : "mdi:cursor-default-outline"} active={pointerMode} onPress={activatePointerMode} menu="pointer"/>
        <ToolButton {...{ menuTriggerProps, openMenu, setToolMenu, toolButtonStyle, activeToolButtonStyle }} label="Canvas options" icon="mdi:dots-horizontal" active={toolMenu === "canvas"} onPress={() => openMenu("canvas")} menu="canvas"/>
      </View>
    </Animated.View>);
}
