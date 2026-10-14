import React, { useEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import Svg, { Image as SvgImage, Path, Rect } from "react-native-svg";
import type { CanvasDocument } from "../canvas/document";
import {
  boundsForDrawingItems,
  DrawingBounds,
  visibleDrawingItems,
} from "../canvas/drawingGeometry";
import { drawingExportDimensions } from "./drawingImageExport";

export type DrawingRasterRequest = {
  id: number;
  document: CanvasDocument;
  format: "jpeg" | "png";
  backgroundColor?: string;
};

type DrawingRasterizerProps = {
  request: DrawingRasterRequest;
  onComplete: (requestId: number, pngBase64: string) => void;
  onError: (requestId: number, error: unknown) => void;
};

const emptyBounds: DrawingBounds = {
  minX: 0,
  minY: 0,
  maxX: 1024,
  maxY: 1024,
};

export function DrawingRasterizer({
  request,
  onComplete,
  onError,
}: DrawingRasterizerProps) {
  const svgRef = useRef<Svg>(null);
  const didCaptureRef = useRef(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [settledImages, setSettledImages] = useState(0);
  const [imageTimeoutElapsed, setImageTimeoutElapsed] = useState(false);
  const items = useMemo(
    () => visibleDrawingItems(request.document),
    [request.document],
  );
  const bounds = useMemo(
    () => boundsForDrawingItems(items) ?? emptyBounds,
    [items],
  );
  const dimensions = useMemo(
    () => drawingExportDimensions(bounds),
    [bounds],
  );
  const layoutDimensions = useMemo(() => {
    const pixelRatio = PixelRatio.get();
    return {
      width: dimensions.width / pixelRatio,
      height: dimensions.height / pixelRatio,
    };
  }, [dimensions.height, dimensions.width]);
  const imageCount = items.filter(
    (item) => item.type === "image" && item.widthPx && item.heightPx,
  ).length;

  useEffect(() => {
    if (!layoutReady || didCaptureRef.current) return undefined;
    const timeout = setTimeout(() => setImageTimeoutElapsed(true), 1800);
    return () => clearTimeout(timeout);
  }, [layoutReady, request.id]);

  useEffect(() => {
    if (
      !layoutReady ||
      didCaptureRef.current ||
      (settledImages < imageCount && !imageTimeoutElapsed)
    ) {
      return undefined;
    }

    didCaptureRef.current = true;
    const frame = requestAnimationFrame(() => {
      const svg = svgRef.current;
      if (!svg) {
        onError(request.id, new Error("The drawing image could not be rendered."));
        return;
      }

      try {
        svg.toDataURL(
          (base64) => onComplete(request.id, base64),
          { width: dimensions.width, height: dimensions.height },
        );
      } catch (error) {
        onError(request.id, error);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [
    dimensions.height,
    dimensions.width,
    imageCount,
    imageTimeoutElapsed,
    layoutReady,
    onComplete,
    onError,
    request.id,
    settledImages,
  ]);

  return (
    <View
      collapsable={false}
      style={[styles.offscreen, layoutDimensions]}
    >
      <Svg
        ref={svgRef}
        width={layoutDimensions.width}
        height={layoutDimensions.height}
        viewBox={`${bounds.minX} ${bounds.minY} ${Math.max(
          1,
          bounds.maxX - bounds.minX,
        )} ${Math.max(1, bounds.maxY - bounds.minY)}`}
        preserveAspectRatio="xMidYMid meet"
        onLayout={() => setLayoutReady(true)}
      >
        {request.format === "jpeg" && (
          <Rect
            x={bounds.minX}
            y={bounds.minY}
            width={Math.max(1, bounds.maxX - bounds.minX)}
            height={Math.max(1, bounds.maxY - bounds.minY)}
            fill={request.backgroundColor ?? "#ffffff"}
          />
        )}
        {items.map((item) => {
          if (item.type === "path") {
            return (
              <Path
                key={item.id}
                d={item.data}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }

          if (!item.widthPx || !item.heightPx) return null;
          return (
            <SvgImage
              key={item.id}
              href={item.uri}
              x={item.x ?? 0}
              y={item.y ?? 0}
              width={item.widthPx}
              height={item.heightPx}
              preserveAspectRatio="xMidYMid meet"
              onLoad={() =>
                setSettledImages((count) => Math.min(imageCount, count + 1))
              }
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    pointerEvents: "none",
    left: -10000,
    opacity: 0,
    position: "absolute",
    top: -10000,
  },
});
