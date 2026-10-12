import React from "react";
import { TextStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { appIconData, type AppIconName } from "./iconData";

type AppIconProps = {
  icon: AppIconName;
  size?: number;
  color?: string;
  style?: TextStyle;
};

export function AppIcon({
  icon,
  size = 22,
  color = "#f4f4f5",
  style,
}: AppIconProps) {
  const iconData =
    appIconData[icon];
  const body = iconData.body.replace(/currentColor/g, color);

  return (
    <SvgXml
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`}
      width={size}
      height={size}
      style={style as any}
    />
  );
}
