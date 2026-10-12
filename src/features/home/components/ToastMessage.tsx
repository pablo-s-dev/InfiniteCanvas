import { useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, Text } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { webTitle } from "../../../shared/ui/webTitle";
import { createStyles } from "../homeStyles";
import type { ToastState } from "../homeTypes";

const TOAST_DISMISS_DISTANCE_PX = 64;

export function ToastMessage({ toast, styles, theme, onDismiss, closeLabel }: {
  toast: ToastState;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  onDismiss: () => void;
  closeLabel: string;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    offset.stopAnimation();
    offset.setValue(0);
    return () => offset.stopAnimation();
  }, [toast, offset]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => offset.stopAnimation(),
    onPanResponderMove: (_, gesture) => offset.setValue(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) >= TOAST_DISMISS_DISTANCE_PX ||
          (Math.abs(gesture.dx) > 16 && Math.abs(gesture.vx) > 0.8)) {
        Animated.timing(offset, {
          toValue: gesture.dx < 0 ? -300 : 300, duration: 160, useNativeDriver: false,
        }).start(({ finished }) => { if (finished) dismissRef.current(); });
      } else {
        Animated.spring(offset, { toValue: 0, useNativeDriver: false }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(offset, { toValue: 0, useNativeDriver: false }).start();
    },
  }), [offset]);

  const icon = toast.tone === "success" ? "mdi:check-circle-outline"
    : toast.tone === "warning" ? "mdi:alert-circle-outline" : "mdi:close-circle-outline";
  const color = toast.tone === "success" ? theme.accent
    : toast.tone === "warning" ? theme.primary : theme.danger;
  return <Animated.View {...pan.panHandlers} style={[styles.toast, {
    transform: [{ translateX: offset }],
    opacity: offset.interpolate({ inputRange: [-150, 0, 150], outputRange: [0, 1, 0], extrapolate: "clamp" }),
  }]}>
    <AppIcon icon={icon} size={22} color={color} />
    <Text style={styles.toastText}>{toast.message}</Text>
    <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={closeLabel}
      hitSlop={8} {...webTitle(closeLabel)} style={{ padding: 6 }}>
      <AppIcon icon="mdi:close" size={18} color={theme.textMuted} />
    </Pressable>
  </Animated.View>;
}
