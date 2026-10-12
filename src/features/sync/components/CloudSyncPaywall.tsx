import { ActivityIndicator, Platform, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { AppTheme } from "../../../shared/theme/appPalette";
import { webTitle } from "../../../shared/ui/webTitle";
export function CloudSyncPaywall({ visible, theme, formattedPrice, productAvailable, checkingProduct, busy, busyLabel, feedback, onClose, onBuy, onRestore, labels, }: {
    visible: boolean;
    theme: AppTheme;
    formattedPrice?: string;
    productAvailable: boolean;
    checkingProduct: boolean;
    busy: boolean;
    busyLabel: string;
    feedback: string | null;
    onClose: () => void;
    onBuy: () => void;
    onRestore: () => void;
    labels: {
        title: string;
        body: string;
        webInfo: string;
        buy: string;
        restore: string;
        cancel: string;
        productUnavailable: string;
        checking: string;
        priceLine: string;
    };
}) {
    // One status slot: the latest action feedback takes precedence over availability.
    const statusCopy = feedback
        ?? (Platform.OS === "web" ? labels.webInfo : checkingProduct
            ? labels.checking
            : !productAvailable
                ? labels.productUnavailable
                : formattedPrice
                    ? labels.priceLine.replace("{price}", formattedPrice)
                    : null);
    return (<Modal animationType="fade" transparent visible={visible} onRequestClose={() => {
            if (!busy)
                onClose();
        }}>
      <View style={paywallStyles.backdrop}>
        <View accessibilityViewIsModal accessibilityRole="alert" style={[
            paywallStyles.dialog,
            { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
          <View style={[paywallStyles.icon, { backgroundColor: theme.surfaceRaised }]}>
            <AppIcon icon="mdi:cloud-sync-outline" size={27} color={theme.primary}/>
          </View>
          <Text style={[paywallStyles.title, { color: theme.text }]}>
            {labels.title}
          </Text>
          <Text style={[paywallStyles.description, { color: theme.textMuted }]}>
            {labels.body}
          </Text>
          {statusCopy ? (<Text style={[paywallStyles.price, { color: feedback ? theme.danger : theme.textMuted }]}>
              {statusCopy}
            </Text>) : null}
          {Platform.OS === "android" && <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !productAvailable, busy }} disabled={busy || checkingProduct || !productAvailable} onPress={onBuy} style={({ pressed }) => [
            paywallStyles.buyButton,
            {
                backgroundColor: theme.primary,
                opacity: busy || checkingProduct || !productAvailable ? 0.55 : pressed ? 0.78 : 1,
            },
        ]} {...webTitle(labels.buy)}>
            {busy ? <ActivityIndicator size="small" color={theme.primaryText}/> : null}
            <Text style={[paywallStyles.buyText, { color: theme.primaryText }]}>
              {busy ? busyLabel : labels.buy}
            </Text>
          </Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={onRestore} style={({ pressed }) => [
            paywallStyles.secondaryButton,
            { opacity: busy ? 0.55 : pressed ? 0.72 : 1 },
        ]} {...webTitle(labels.restore)}>
            <Text style={[paywallStyles.secondaryText, { color: theme.primary }]}>
              {labels.restore}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={({ pressed }) => [
            paywallStyles.secondaryButton,
            { opacity: busy ? 0.55 : pressed ? 0.72 : 1 },
        ]} {...webTitle(labels.cancel)}>
            <Text style={[paywallStyles.secondaryText, { color: theme.textMuted }]}>
              {labels.cancel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>);
}
const paywallStyles = StyleSheet.create({
    backdrop: {
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.62)",
        flex: 1,
        justifyContent: "center",
        padding: 24,
    },
    dialog: {
        alignItems: "stretch",
        borderRadius: 20,
        borderWidth: 1,
        elevation: 18,
        maxWidth: 430,
        padding: 24,
        width: "100%",
    },
    icon: {
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 14,
        height: 48,
        justifyContent: "center",
        marginBottom: 18,
        width: 48,
    },
    title: {
        fontSize: 21,
        fontWeight: "800",
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        marginTop: 9,
    },
    price: {
        fontSize: 14,
        lineHeight: 20,
        marginTop: 17,
    },
    feedback: {
        fontSize: 13,
        lineHeight: 19,
        marginTop: 12,
    },
    buyButton: {
        alignItems: "center",
        borderRadius: 12,
        flexDirection: "row",
        gap: 9,
        justifyContent: "center",
        marginTop: 22,
        minHeight: 48,
        paddingHorizontal: 18,
    },
    buyText: {
        fontSize: 14,
        fontWeight: "800",
    },
    secondaryButton: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 9,
        minHeight: 40,
        paddingHorizontal: 14,
    },
    secondaryText: {
        fontSize: 14,
        fontWeight: "700",
    },
});
