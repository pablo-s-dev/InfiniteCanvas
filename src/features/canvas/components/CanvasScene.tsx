import { useAppTheme } from "../../../shared/theme/ThemeContext";
import React from "react";
import { View, StatusBar, Text, Platform } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { getZIndex } from "../../../shared/theme/zIndex";
import { CoordinateHud } from "./CoordinateHud";
import { SelectionOverlay } from "./SelectionOverlay";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { ClearCanvasDialog } from "./ClearCanvasDialog";
import { PointerIcon } from "./PointerIcon";
import { PointerModeBtn } from "./PointerModeBtn";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasColorPicker } from "./CanvasColorPicker";
import { DraggableCanvasImage } from "./DraggableCanvasImage";
import { CanvasHistoryControls } from "./CanvasHistoryControls";
import type { useCanvasController } from "../hooks/useCanvasController";
export function CanvasScene({ selectedImageId, selectCanvasImage, updateCanvasImage, insertShapeAtCenter, insertImageAtCenter, canvasBackgroundColor, buttonsContainerColor, curIdx, canvasItems, setCurIdx, windowHeight, canvasCursor, canvasRef, nativeTouchActiveRef, onTouchMoveSvg, onTouchStartSvg, onTouchEndSvg, cancelScribbleFreeze, nativeTwoFingerGestureActiveRef, prevFingersPos, prevTwoFingerDist, setShouldBlockDrawing, eraserMode, cancelEraserGesture, lassoMode, rectangleSelectionMode, finalizeLassoSelection, prepareForNextDrawing, isSelectionResizePointerEvent, selectedPathIndexes, clearSelection, startWebEraserPointer, handleConfiguredPointerStart, handlePointerMoveSvg, handleConfiguredPointerMove, finishWebEraserPointer, handleConfiguredPointerEnd, eraserPointerIdRef, getWebPointerPosition, queueEraserTrailPoint, webCanvasEventProps, onCanvasLayout, svgRef, x, y, scale, svgItems, pendingEraseItemIds, selectedBounds, lassoPath, eraserPreviewPath, eraserPreviewOpacity, strokeColorPreview, curPath, strokeWidth, imgItems, selectionScreenBounds, isSelectionDragging, isSelectionResizing, startSelectionDrag, moveSelectionDrag, endSelectionDrag, startSelectionResize, moveSelectionResize, endSelectionResize, duplicateSelectedPaths, deleteSelectedPaths, canvasContextMenu, pasteSelectionAtContextMenu, insertImageAtContextMenu, insertShapeAtContextMenu, setCanvasContextMenu, pseudoPointerMode, pointerHintVisible, pseudoLeftClick, canvasPointToScreenPoint, pseudoPointerPos, cursorCoordinates, setPseudoLeftClick, onlyPanningMode, setColorPickerModal, activateStrokeMode, activatePanMode, activatePointerMode, activateEraserMode, confirmWipeCanvas, resetViewportToContent, smoothingEnabled, setSmoothingEnabled, shapeTool, activateShapeTool, activateLassoMode, activateRectangleSelectionMode, eraserModeType, setEraserModeType, eraserSize, setEraserSize, setStrokeWidth, setStrokeColor, clearCanvasDialogOpen, setClearCanvasDialogOpen, wipeCanvas, customSwatches, onColorSelect, showColorPickerModal }: ReturnType<typeof useCanvasController>) {
 const canvasToolTheme = useCanvasToolTheme();
 const { theme } = useAppTheme();

    return (<View 
    // disable scroling through the canvas
    style={{
            flex: 1,
            backgroundColor: canvasBackgroundColor,
            alignItems: "center",
            justifyContent: "flex-start",
            width: "100%",
            height: "100%",
        }}>
      <StatusBar backgroundColor={canvasBackgroundColor} barStyle={theme.mode === "light"
            ? "dark-content"
            : "light-content"}/>

      <CanvasHistoryControls buttonsContainerColor={buttonsContainerColor} curIdx={curIdx} itemsAmount={canvasItems.length} setCurIdx={setCurIdx}/>

      <View style={{
            width: "100%",
            flexGrow: 1,
            zIndex: getZIndex("canvas-level-2"),
            padding: 0,
            margin: 5,
            borderWidth: 0,
            position: "relative",
            maxHeight: windowHeight,
            cursor: canvasCursor as any,
        }} ref={canvasRef} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => !nativeTouchActiveRef.current} onResponderMove={onTouchMoveSvg} onResponderStart={onTouchStartSvg} onResponderEnd={onTouchEndSvg} onResponderTerminate={(event) => {
            cancelScribbleFreeze();
            nativeTouchActiveRef.current = false;
            if (nativeTwoFingerGestureActiveRef.current) {
                nativeTwoFingerGestureActiveRef.current = false;
                prevFingersPos.current = [];
                prevTwoFingerDist.current = 0;
                setShouldBlockDrawing(false);
                return;
            }
            if (Platform.OS !== "web" && eraserMode) {
                cancelEraserGesture();
                return;
            }
            if (Platform.OS !== "web") {
                if (lassoMode || rectangleSelectionMode) {
                    finalizeLassoSelection();
                    setShouldBlockDrawing(false);
                }
                else {
                    prepareForNextDrawing();
                }
                return;
            }
            onTouchEndSvg(event);
        }} 
    // onResponderRelease={onTouchEndSvg}
    onPointerDown={(event) => {
            if (selectedImageId) clearSelection();
            if (isSelectionResizePointerEvent(event))
                return;
            if (Platform.OS === "web" && eraserMode) {
                if (selectedPathIndexes.length > 0)
                    clearSelection();
                startWebEraserPointer(event);
            }
            else {
                handleConfiguredPointerStart(event);
            }
        }} onPointerMove={(e) => {
            handlePointerMoveSvg(e);
            handleConfiguredPointerMove(e);
        }} onPointerUp={(event) => {
            if (Platform.OS === "web" && eraserMode) {
                finishWebEraserPointer(event);
            }
            else {
                handleConfiguredPointerEnd(event);
            }
        }} onPointerCancel={(event) => {
            if (Platform.OS === "web" && eraserMode) {
                finishWebEraserPointer(event, true);
            }
            else {
                handleConfiguredPointerEnd(event);
            }
        }} onPointerLeave={(event) => {
            const nativeEvent = event.nativeEvent ?? event;
            if (Platform.OS === "web" &&
                eraserMode &&
                eraserPointerIdRef.current === nativeEvent.pointerId) {
                return;
            }
            if (Platform.OS === "web" && eraserMode) {
                const position = getWebPointerPosition(event);
                queueEraserTrailPoint(position[0], position[1], false);
            }
        }} {...webCanvasEventProps} onLayout={onCanvasLayout}>
        <Svg ref={svgRef} style={{
            // backgroundColor: "#000000ff",
            position: "absolute", // Ensures it overlays images
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            padding: 0,
            margin: 0,
            borderWidth: 0,
            zIndex: getZIndex("canvas-level-3"),
            pointerEvents: "none",
        }}>
          <G translateX={x} translateY={y} scaleX={scale} scaleY={scale}>
            {svgItems.map((item, i) => {
            // if (item.type != "path") return;
            if (item.type != "path") {
                return <></>;
                // const handleImgDrag = (e: GestureResponderEvent) => {
                //   const touches = e.nativeEvent.touches;
                //   if (touches.length === 1) {
                //     // lets you drag the image
                //     //
                //     const { locationX, locationY } = touches[0];
                //   }
                // };
                // return <DraggableCanvasImage key={i} uri={item.data} />;
            }
            // const translateX =
            //   panningOffset[0] + recenterScalingX + focusOffset[0];
            // const translateY =
            //   panningOffset[1] + recenterScalingY + focusOffset[1];
            const isSelected = selectedPathIndexes.includes(i);
            const isPendingErase = pendingEraseItemIds.includes(item.id);
            return (<React.Fragment key={i}>
                  {isSelected && (<Path stroke={canvasToolTheme.accent} d={item.data} fill={"none"} fillOpacity={0} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.65} strokeWidth={(item.width + 10) / scale}/>)}
                  <Path stroke={item.color} d={item.data} fill={"none"} fillOpacity={0} opacity={eraserMode && eraserModeType === "stroke" && isPendingErase ? 0.2 : 1} strokeLinecap="round" strokeLinejoin="round" strokeWidth={item.width / scale}/>
                </React.Fragment>);
        })}
            {selectedBounds && (<Rect x={selectedBounds.minX} y={selectedBounds.minY} width={Math.max(selectedBounds.maxX - selectedBounds.minX, 1)} height={Math.max(selectedBounds.maxY - selectedBounds.minY, 1)} fill="none" stroke={canvasToolTheme.accent} strokeWidth={1.5 / scale} strokeDasharray="10 6" rx={3 / scale}/>)}
          </G>
          <Path stroke={canvasToolTheme.accent} d={lassoPath} fill={"none"} strokeWidth={1.5 / scale} strokeOpacity={0.9} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" translateX={x} translateY={y} scaleX={scale} scaleY={scale}/>
          {eraserPreviewPath !== "" && (<Path d={eraserPreviewPath} fill="#ffffff" fillOpacity={eraserPreviewOpacity}/>)}
          <Path stroke={strokeColorPreview} key={curIdx} d={curPath} fill={"none"} strokeWidth={strokeWidth / scale} fillOpacity={0} strokeLinecap="round" strokeLinejoin="round" 
    // scale={scale}
    translateX={x} translateY={y} scaleX={scale} scaleY={scale}/>
        </Svg>
        {imgItems.map((item, i) => {
            const imgUri = item.uri;
            return (<DraggableCanvasImage key={item.id} uri={imgUri} x={item.x ?? 0} y={item.y ?? 0} interactive={lassoMode || rectangleSelectionMode} width={item.widthPx ?? 100} height={item.heightPx ?? 100} selected={selectedImageId === item.id} onSelect={() => selectCanvasImage(item.id)} onChange={changes => updateCanvasImage(item.id, changes)} setBlockDrawing={setShouldBlockDrawing} scale={scale} offset={[x, y]}/>);
        })}
        {selectionScreenBounds && (<SelectionOverlay bounds={selectionScreenBounds} isDragging={isSelectionDragging} isResizing={isSelectionResizing} onPointerDown={startSelectionDrag} onPointerMove={moveSelectionDrag} onPointerUp={endSelectionDrag} onResizePointerDown={startSelectionResize} onResizePointerMove={moveSelectionResize} onResizePointerUp={endSelectionResize} onDuplicate={duplicateSelectedPaths} onDelete={deleteSelectedPaths}/>)}
        {canvasContextMenu && (<CanvasContextMenu menu={canvasContextMenu} canPaste={true} onPaste={pasteSelectionAtContextMenu} onInsertImage={insertImageAtContextMenu} onInsertShape={insertShapeAtContextMenu} onClose={() => setCanvasContextMenu(null)}/>)}
      </View>

      {pseudoPointerMode && pointerHintVisible && (<View pointerEvents="none" style={{
                position: "absolute",
                top: 54,
                right: 16,
                maxWidth: 360,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: canvasToolTheme.accent,
                backgroundColor: canvasToolTheme.bar,
                zIndex: getZIndex("canvas-level-6"),
            }}>
          <Text style={{
                color: canvasToolTheme.text,
                fontWeight: "700",
                marginBottom: 4,
            }}>
            Offset cursor
          </Text>
          <Text style={{
                color: canvasToolTheme.muted,
                lineHeight: 18,
            }}>
            {pseudoLeftClick
                ? "Drawing from the offset pointer."
                : "Moving the offset pointer."}
          </Text>
        </View>)}

      <PointerIcon pseudoPointerMode={pseudoPointerMode} screenPosition={canvasPointToScreenPoint(pseudoPointerPos)}/>

      <CoordinateHud showCoordinates={onlyPanningMode || pseudoPointerMode} coordinates={cursorCoordinates} scale={scale}/>

      {
        // Todo: Make btn more easier to click
        // onTouchStart={(e) => { setLeftClick(!leftClick) }
        pseudoPointerMode && (<PointerModeBtn pseudoleftClick={pseudoLeftClick} setPseudoLeftClick={setPseudoLeftClick}/>)}

      <CanvasToolbar onInsertShape={insertShapeAtCenter} onInsertImage={insertImageAtCenter} buttonsContainerColor={buttonsContainerColor} onlyPanningMode={onlyPanningMode} pointerMode={pseudoPointerMode} pointerDrawMode={pseudoLeftClick} setPointerDrawMode={setPseudoLeftClick} setColorPickerModal={setColorPickerModal} activateStrokeMode={activateStrokeMode} activatePanMode={activatePanMode} activatePointerMode={activatePointerMode} activateEraserMode={activateEraserMode} confirmWipeCanvas={confirmWipeCanvas} shouldCollapse={false} eraserMode={eraserMode} resetViewportToContent={resetViewportToContent} smoothingEnabled={smoothingEnabled} setSmoothingEnabled={setSmoothingEnabled} shapeTool={shapeTool} activateShapeTool={activateShapeTool} lassoMode={lassoMode} rectangleSelectionMode={rectangleSelectionMode} activateLassoMode={activateLassoMode} activateRectangleSelectionMode={activateRectangleSelectionMode} selectedCount={selectedPathIndexes.length} eraserModeType={eraserModeType} setEraserModeType={setEraserModeType} eraserSize={eraserSize} setEraserSize={setEraserSize} strokeWidth={strokeWidth} setStrokeWidth={setStrokeWidth} strokeColorValue={strokeColorPreview} setStrokeColor={setStrokeColor}/>

      <ClearCanvasDialog visible={clearCanvasDialogOpen} onCancel={() => setClearCanvasDialogOpen(false)} onConfirm={() => {
            setClearCanvasDialogOpen(false);
            wipeCanvas();
        }}/>

      <CanvasColorPicker customSwatches={customSwatches} onColorSelect={onColorSelect} setColorPickerModal={setColorPickerModal} showColorPickerModal={showColorPickerModal} color={strokeColorPreview}/>
    </View>);
}
