import React, { useRef } from "react";
import { View, PanResponder } from "react-native";
import { Image } from "expo-image";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";
import { webTitle } from "../../../shared/ui/webTitle";
import type { CanvasImageItem } from "../document";
export interface DraggableCanvasImageProps {
 uri: string; x: number; y: number; width: number; height: number; scale: number;
 offset: [number, number]; selected: boolean; interactive: boolean; onSelect: () => void;
 onChange: (changes: Partial<CanvasImageItem>) => void;
 setBlockDrawing: React.Dispatch<React.SetStateAction<boolean>>;
}
export function DraggableCanvasImage(props: DraggableCanvasImageProps) {
 const theme = useCanvasToolTheme();
 const latest = useRef(props); latest.current = props;
 const start = useRef({x: 0, y: 0, width: 0, height: 0});
 const createGesture = (resize: boolean) => PanResponder.create({
  onStartShouldSetPanResponder: event => event.nativeEvent.touches.length === 1,
  onPanResponderTerminationRequest: event => event.nativeEvent.touches.length > 1,
  onPanResponderGrant: () => {
   const p = latest.current; p.setBlockDrawing(true); p.onSelect();
   start.current = {x: p.x, y: p.y, width: p.width, height: p.height};
  },
  onPanResponderMove: (_, gesture) => {
   if (gesture.numberActiveTouches > 1) return;
   const p = latest.current, base = start.current;
   if (resize) {
    const factor = Math.max(24 / Math.min(base.width * p.scale, base.height * p.scale), 1 + Math.max(gesture.dx, gesture.dy) / (Math.max(base.width, base.height) * p.scale));
    p.onChange({widthPx: base.width * factor, heightPx: base.height * factor});
   } else p.onChange({x: base.x + gesture.dx / p.scale, y: base.y + gesture.dy / p.scale});
  },
  onPanResponderRelease: () => latest.current.setBlockDrawing(false),
  onPanResponderTerminate: () => latest.current.setBlockDrawing(false),
 });
 const drag = useRef(createGesture(false)).current;
 const resize = useRef(createGesture(true)).current;
 return <View onTouchStart={event => { if (event.nativeEvent.touches.length === 1) event.stopPropagation(); }} onTouchMove={event => { if (event.nativeEvent.touches.length === 1) event.stopPropagation(); }} onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} {...drag.panHandlers} style={{pointerEvents: props.interactive ? "auto" : "none", position: "absolute", left: props.offset[0] + props.x * props.scale, top: props.offset[1] + props.y * props.scale,
 width: props.width * props.scale, height: props.height * props.scale, zIndex: getZIndex("canvas-level-2"),
 borderWidth: props.selected ? 2 : 0, borderColor: theme.accent} as any}>
 <Image source={{uri: props.uri}} contentFit="contain" draggable={false} pointerEvents="none" style={{width: "100%", height: "100%"}}/>
 {props.selected && <View {...webTitle("Resize image")} {...resize.panHandlers} style={{position: "absolute", right: -8, bottom: -8, width: 20, height: 20, borderRadius: 5, backgroundColor: theme.accent, borderWidth: 2, borderColor: theme.bar}}/>}
 </View>;
}
