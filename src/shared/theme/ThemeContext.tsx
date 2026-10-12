import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { appThemes, canvasToolTheme, type AppThemeMode } from "./appPalette";
const ThemeContext = createContext({ theme: appThemes.dark, themeMode: "dark" as AppThemeMode,
  setThemeMode: (() => {}) as Dispatch<SetStateAction<AppThemeMode>> });
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<AppThemeMode>("dark");
  const value = useMemo(() => ({ theme: appThemes[themeMode], themeMode, setThemeMode }), [themeMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export const useAppTheme = () => useContext(ThemeContext);
export const useCanvasToolTheme = () => {
  const { theme } = useAppTheme();
  return useMemo(() => ({ ...canvasToolTheme, bar: theme.surface, border: theme.border,
    button: theme.surfaceRaised, buttonActive: theme.surfaceSoft, foreground: theme.primary,
    foregroundStrong: theme.primaryStrong, accent: theme.accent, text: theme.text,
    muted: theme.textMuted, danger: theme.danger, primaryText: theme.primaryText }), [theme]);
};
