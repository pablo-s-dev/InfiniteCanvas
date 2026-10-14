import { useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import Svg, { Image as SvgImage, Path, Rect } from "react-native-svg";
import type { CanvasDocument } from "../canvas/document";
import { boundsForDrawingItems, visibleDrawingItems } from "../canvas/drawingGeometry";
import { drawingRepository, DrawingSummary } from "../documents/drawingRepository";
import { AppTheme } from "../../shared/theme/appPalette";

export function DrawingPreview({
  drawing,
  theme,
  document: providedDocument,
}: {
  drawing: DrawingSummary;
  theme: AppTheme;
  document?: CanvasDocument;
}) {
  const [document, setDocument] = useState<CanvasDocument | null>(null);

  useEffect(() => {
    if (providedDocument) {setDocument(providedDocument); return;}
    let mounted = true;
    setDocument(null);
    void drawingRepository
      .get(drawing.id)
      .then((loaded) => {
        if (mounted) setDocument(loaded);
      })
      .catch(() => {
        if (mounted) setDocument(null);
      });

    return () => {
      mounted = false;
    };
  }, [drawing.id, drawing.updatedAt, providedDocument]);

  const items = useMemo(
    () => (document ? visibleDrawingItems(document) : []),
    [document],
  );
  const bounds = useMemo(() => boundsForDrawingItems(items), [items]);

  return (
    <View
      accessible={false}
      style={[
        styles.container,
        {
          backgroundColor: theme.surfaceSoft,
          borderColor: theme.border,
        },
      ]}
    >
      {drawing.thumbnailUri ? (
        <Image
          source={{ uri: drawing.thumbnailUri }}
          contentFit="contain"
          transition={0}
          style={StyleSheet.absoluteFill}
        />
      ) : bounds ? (
        <Svg
          style={styles.svg}
          viewBox={`${bounds.minX} ${bounds.minY} ${Math.max(
            1,
            bounds.maxX - bounds.minX,
          )} ${Math.max(1, bounds.maxY - bounds.minY)}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Rect
            x={bounds.minX}
            y={bounds.minY}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxY - bounds.minY}
            fill={theme.surfaceSoft}
          />
          {items.map((item) => {
            if (item.type === "path") {
              return (
                <Path
                  key={item.id}
                  d={item.data}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={Math.max(1, item.width)}
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
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    pointerEvents: "none",
    borderRadius: 8,
    borderWidth: 1,
    height: 66,
    overflow: "hidden",
    width: 82,
  },
  svg: {
    height: "100%",
    width: "100%",
  },
});
