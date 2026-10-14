import { Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { createStyles } from "../homeStyles";

type Labels = {
  syncSummaryUnsyncedOne: string;
  syncSummaryUnsyncedMany: string;
  syncSummaryAllSynced: string;
};

export function SyncSummary({ unsyncedCount, theme, labels, styles }: {
  unsyncedCount: number;
  theme: AppTheme;
  labels: Labels;
  styles: ReturnType<typeof createStyles>;
}) {
  const label = unsyncedCount === 0
    ? labels.syncSummaryAllSynced
    : unsyncedCount === 1
      ? labels.syncSummaryUnsyncedOne
      : labels.syncSummaryUnsyncedMany.replace("{count}", String(unsyncedCount));
  const synced = unsyncedCount === 0;

  return (
    <View style={styles.syncSummaryRow}>
      <AppIcon
        icon={synced ? "mdi:check-circle-outline" : "mdi:cloud-sync-outline"}
        size={18}
        color={synced ? theme.accent : theme.primary}
      />
      <Text style={styles.syncSummaryText}>{label}</Text>
    </View>
  );
}
