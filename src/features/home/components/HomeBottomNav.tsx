import type { AppIconName } from "../../../shared/icons/iconData";
import { Pressable, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { AppTheme } from "../../../shared/theme/appPalette";
import { createStyles } from "../../home/homeStyles";
import type { ScreenMode } from "../../home/homeTypes";
export function HomeBottomNav({ mode, setMode, styles, theme, labels, }: {
    mode: ScreenMode;
    setMode: (mode: ScreenMode) => void;
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
    labels: Record<ScreenMode, string>;
}) {
    const items: Array<{
        mode: ScreenMode;
        icon: AppIconName;
    }> = [
        { mode: "library", icon: "mdi:home-outline" },
        { mode: "settings", icon: "mdi:cog-outline" },
    ];
    return (<View style={styles.bottomNav}>
      {items.map((item) => {
            const active = item.mode === mode;
            return (<Pressable key={item.mode} style={[styles.navItem, active && styles.navItemActive]} onPress={() => setMode(item.mode)}>
            <AppIcon icon={item.icon} size={20} color={active ? theme.primaryText : theme.textMuted}/>
            <Text style={[styles.navText, active && styles.navTextActive]}>
              {labels[item.mode]}
            </Text>
          </Pressable>);
        })}
    </View>);
}
