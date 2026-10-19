import { ActivityIndicator, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { createStyles } from "../homeStyles";
import { getCloudSyncStatusInfo, type CloudSyncStatusLabels } from "../syncSummary";

export function SyncSummary({
  account,
  accountStatus,
  entitlementStatus,
  busy,
  syncMessage,
  syncError,
  syncConfirmed,
  totalDrawingsCount,
  unsyncedCount,
  conflictCount,
  theme,
  labels,
  styles,
}: {
  account: { email: string; drive?: string } | null;
  accountStatus: string;
  entitlementStatus: string;
  busy: boolean;
  syncMessage: string | null;
  syncError: string | null;
  syncConfirmed?: boolean;
  totalDrawingsCount: number;
  unsyncedCount: number;
  conflictCount?: number;
  theme: AppTheme;
  labels: CloudSyncStatusLabels;
  styles: ReturnType<typeof createStyles>;
}) {
  const statusInfo = getCloudSyncStatusInfo({
    account,
    accountStatus,
    entitlementStatus,
    busy,
    syncMessage,
    syncError,
    syncConfirmed,
    totalDrawingsCount,
    unsyncedCount,
    conflictCount,
    labels,
  });

  if (!statusInfo) {
    return null;
  }

  const colorMap = {
    accent: theme.accent,
    primary: theme.primary,
    muted: theme.textMuted,
    danger: theme.danger,
  };

  return (
    <View style={styles.cloudStatusCard}>
      {statusInfo.showSpinner ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : (
        <AppIcon
          icon={statusInfo.icon}
          size={22}
          color={colorMap[statusInfo.iconColor]}
        />
      )}
      <View style={styles.cloudStatusCardContent}>
        <Text style={styles.cloudStatusCardTitle}>{statusInfo.title}</Text>
        {statusInfo.detail ? (
          <Text style={styles.cloudStatusCardDetail}>{statusInfo.detail}</Text>
        ) : null}
      </View>
    </View>
  );
}
