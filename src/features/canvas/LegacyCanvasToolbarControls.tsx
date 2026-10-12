import React from "react";
import { Pressable } from "react-native";
import { AppIcon } from "../../shared/icons/AppIcon";
import { canvasToolTheme } from "../../shared/theme/appPalette";
import { getZIndex } from "../../shared/theme/zIndex";

export interface CollapseBtnProps {
  shouldCollapse: boolean;
  setShouldCollapse: React.Dispatch<React.SetStateAction<boolean>>;
}

export const CollapseBtn = ({
  shouldCollapse,
  setShouldCollapse,
}: CollapseBtnProps) => {
  return (
    <Pressable
      onPress={() => {
        setShouldCollapse((prev) => !prev);
      }}
      style={{
        bottom: -5,
        right: 0,
        position: "absolute",
        padding: 10,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        backgroundColor: canvasToolTheme.button,
        zIndex: getZIndex("toolbar-level-2"),
      }}
    >
      <AppIcon
        icon={shouldCollapse ? "mdi:chevron-down" : "mdi:chevron-up"}
        size={24}
        color={canvasToolTheme.foreground}
      />
    </Pressable>
  );
};
