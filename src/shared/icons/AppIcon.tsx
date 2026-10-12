import React from "react";
import { TextStyle } from "react-native";
import MaterialCommunityIcon from "@expo/vector-icons/MaterialCommunityIcons";

type AppIconProps = {
  icon: string;
  size?: number;
  color?: string;
  style?: TextStyle;
};

type NativeIconName = React.ComponentProps<typeof MaterialCommunityIcon>["name"];

const nativeIconMap: Record<string, NativeIconName> = {
  "mdi:plus": "plus",
  "mdi:magnify": "magnify",
  "mdi:cog-outline": "cog-outline",
  "mdi:delete-outline": "delete-outline",
  "mdi:arrow-left": "arrow-left",
  "mdi:pencil-outline": "pencil-outline",
  "mdi:home-outline": "home-outline",
  "mdi:alert-circle-outline": "alert-circle-outline",
  "mdi:check-circle-outline": "check-circle-outline",
  "mdi:close-circle-outline": "close-circle-outline",
  "mdi:folder-open-outline": "folder-open-outline",
  "mdi:cloud-sync-outline": "cloud-sync-outline",
  "mdi:cloud-upload-outline": "cloud-upload-outline",
  "mdi:tag-multiple-outline": "tag-multiple-outline",
  "mdi:content-copy": "content-copy",
  "mdi:content-save-outline": "content-save-outline",
  "mdi:content-duplicate": "content-duplicate",
  "mdi:content-duplicate-plus": "content-duplicate",
  "mdi:content-cut": "content-cut",
  "mdi:share-variant-outline": "share-variant-outline",
  "mdi:download-outline": "download-outline",
  "mdi:file-export-outline": "file-export-outline",
  "mdi:file-import-outline": "file-import-outline",
  "mdi:checkbox-blank-circle-outline": "checkbox-blank-circle-outline",
  "mdi:checkbox-marked-circle-outline": "checkbox-marked-circle-outline",
  "mdi:checkbox-multiple-marked-outline": "checkbox-multiple-marked-outline",
  "mdi:sort-clock-descending-outline": "sort-clock-descending-outline",
  "mdi:sort-clock-ascending-outline": "sort-clock-ascending-outline",
  "mdi:sort-alphabetical-ascending": "sort-alphabetical-ascending",
  "mdi:translate": "translate",
};

export function AppIcon({
  icon,
  size = 22,
  color = "#f4f4f5",
  style,
}: AppIconProps) {
  const mappedIcon = nativeIconMap[icon];

  if (!mappedIcon) {
    return (
      <MaterialCommunityIcon
        name="help-circle-outline"
        size={size}
        color={color}
        style={style}
      />
    );
  }

  return (
    <MaterialCommunityIcon
      name={mappedIcon}
      size={size}
      color={color}
      style={style}
    />
  );
}

