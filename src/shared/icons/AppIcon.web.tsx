import React from "react";
import { Icon } from "@iconify/react";
import { appIconData, type AppIconName } from "./iconData";

type AppIconProps = {
  icon: AppIconName;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
};

const icons = appIconData;

export function AppIcon({
  icon,
  size = 22,
  color = "#f4f4f5",
  style,
}: AppIconProps) {
  return (
    <Icon
      ssr
      icon={icons[icon]}
      width={size}
      height={size}
      color={color}
      style={style}
    />
  );
}

