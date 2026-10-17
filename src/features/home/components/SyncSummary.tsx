import { Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { createStyles } from "../homeStyles";
import { getSyncSummaryState } from "../syncSummary";

type Labels = {
  syncSummaryUnsyncedOne: string;
  syncSummaryUnsyncedMany: string;
  syncSummaryAllSynced: string;
  syncSummaryLocal: string;
};

export function SyncSummary({ connected, confirmed, unsyncedCount, theme, labels, styles }: {
  connected: boolean;
  confirmed: boolean;
  unsyncedCount: number;
  theme: AppTheme;
  labels: Labels;
  styles: ReturnType<typeof createStyles>;
}) {
  const state = getSyncSummaryState(connected, confirmed, unsyncedCount);
  const label = state === "local" ? labels.syncSummaryLocal : state === "synced"
    ? labels.syncSummaryAllSynced
    : unsyncedCount === 1
      ? labels.syncSummaryUnsyncedOne
      : labels.syncSummaryUnsyncedMany.replace("{count}", String(unsyncedCount));
  const synced = state === "synced";

  return (
    <View style={styles.syncSummaryRow}>
      <AppIcon
        icon={synced ? "mdi:check-circle-outline" : state === "local" ? "mdi:content-save-outline" : "mdi:cloud-sync-outline"}
        size={18}
        color={synced ? theme.accent : theme.primary}
      />
      <Text style={styles.syncSummaryText}>{label}</Text>
    </View>
  );
}
