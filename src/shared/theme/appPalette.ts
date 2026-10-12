export type AppThemeMode = "dark" | "light";

export type AppTheme = {
  mode: AppThemeMode;
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSoft: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryStrong: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  danger: string;
  shadow: string;
};

export const appThemes: Record<AppThemeMode, AppTheme> = {
  dark: {
    mode: "dark",
    background: "#101018",
    surface: "#181827",
    surfaceRaised: "#222238",
    surfaceSoft: "#2d2947",
    border: "#34324d",
    text: "#f7f3ff",
    textMuted: "#b9b4cb",
    primary: "#c4a7ff",
    primaryStrong: "#9f7aea",
    primaryText: "#171022",
    accent: "#8ecbff",
    accentSoft: "#20364f",
    danger: "#ff9ca8",
    shadow: "rgba(0,0,0,0.35)",
  },
  light: {
    mode: "light",
    background: "#fbfaff",
    surface: "#ffffff",
    surfaceRaised: "#f2efff",
    surfaceSoft: "#ebe7ff",
    border: "#ddd6fb",
    text: "#211b31",
    textMuted: "#6d6680",
    primary: "#8b5cf6",
    primaryStrong: "#6d4be8",
    primaryText: "#ffffff",
    accent: "#2f9df4",
    accentSoft: "#dff1ff",
    danger: "#cf3f5c",
    shadow: "rgba(63,48,115,0.16)",
  },
};

export const canvasToolTheme = {
  bar: "#151324",
  border: "#39345b",
  button: "#211d35",
  buttonActive: "#34285f",
  foreground: "#c4a7ff",
  foregroundStrong: "#9f7aea",
  accent: "#8ecbff",
  text: "#f7f3ff",
  muted: "#a9a1c9",
};
