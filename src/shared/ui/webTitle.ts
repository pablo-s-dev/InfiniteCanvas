import { Platform } from "react-native";
export const webTitle = (label: string) => Platform.OS === "web"
    ? ({
        title: label,
        accessibilityLabel: label,
    } as any)
    : {};
