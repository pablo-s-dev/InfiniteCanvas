import React from "react";
import { View } from "react-native";
import { AppIcon } from "./AppIcon";

type CopyPlusIconProps = {
  size?: number;
  color?: string;
  plusColor?: string;
};

export function CopyPlusIcon({
  size = 20,
  color = "#f4f4f5",
  plusColor = "#bda1ff",
}: CopyPlusIconProps) {
  return (
    <View
      style={{
        height: size,
        position: "relative",
        width: size,
      }}
    >
      <AppIcon icon="mdi:content-copy" size={size} color={color} />
      <AppIcon
        icon="mdi:plus"
        size={Math.max(11, Math.round(size * 0.58))}
        color={plusColor}
        style={
          {
            bottom: -4,
            position: "absolute",
            right: -5,
          } as any
        }
      />
    </View>
  );
}
