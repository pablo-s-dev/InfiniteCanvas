import { Platform } from "react-native";

/**
 * One scale for the app's stacking contexts. On web, styles use the matching
 * CSS custom property; native platforms receive the same numeric fallback.
 * Levels are compared inside their nearest stacking context, so a child level
 * cannot escape a parent that sits below another context.
 */
const zIndexValues = {
  "canvas-level-1": 1, // Media and content behind the SVG surface.
  "canvas-level-2": 40, // Canvas viewport among the app's main regions.
  "canvas-level-3": 50, // SVG strokes above canvas media.
  "canvas-level-4": 300, // Selection outline and its controls.
  "canvas-level-6": 1200, // Canvas HUD and pointer hints.
  "toolbar-level-1": 100, // Bottom toolbar's stacking context.
  "toolbar-level-2": 105, // Toolbar buttons above its dismiss backdrop.
  "toolbar-level-3": 1000, // Top undo and redo bar.
  "toolbar-level-4": 1300, // Floating pointer mode control.
  "menu-level-1": 90, // Menu dismiss backdrop, below toolbar buttons.
  "menu-level-2": 110, // Menu panel, above its backdrop and toolbar buttons.
  "popup-level-1": 1500, // Popup dismiss backdrop.
  "popup-level-2": 1600, // Popup content.
  "modal-level-1": 50, // Modal backdrop.
  "modal-level-2": 60, // Modal content.
  "tooltip-level-1": 9999, // Web-only hover tooltips.
} as const;

export type ZIndexToken = keyof typeof zIndexValues;

export const getZIndex = (token: ZIndexToken): number => {
  const value = zIndexValues[token];
  return Platform.OS === "web"
    ? (`var(--${token}, ${value})` as unknown as number)
    : value;
};

export const zIndexCssVariables = Object.entries(zIndexValues)
  .map(([token, value]) => `--${token}: ${value};`)
  .join("\n");
