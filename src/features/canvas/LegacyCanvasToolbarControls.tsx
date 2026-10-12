import React from "react";
import { Pressable } from "react-native";
import Icon from "@expo/vector-icons/MaterialIcons";
import { canvasToolTheme } from "../../shared/theme/appPalette";

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
        zIndex: 100,
      }}
    >
      {shouldCollapse ? (
        <Icon name="expand-more" size={24} color={canvasToolTheme.foreground} />
      ) : (
        <Icon name="expand-less" size={24} color={canvasToolTheme.foreground} />
      )}
    </Pressable>
  );
};
