import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { webTitle } from "../../../shared/ui/webTitle";

type Labels = {
  syncSummarySynced: string; syncSummaryPending: string; syncSummaryAttention: string;
  syncDrawingOne: string; syncDrawingMany: string; syncDetails: string;
  drawingsSaved: string; synced: string; pending: string; failed: string; conflicts: string; close: string;
};

export function SyncSummary({ total, synced, pending, failed, conflicts, theme, labels, onAttention, statusLabel }: {
  total: number; synced: number; pending: number; failed: number; conflicts: number;
  theme: AppTheme; labels: Labels; onAttention?: () => void; statusLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const attention = failed > 0 || conflicts > 0;
  const status = statusLabel ?? (attention ? labels.syncSummaryAttention
    : pending > 0 ? labels.syncSummaryPending : labels.syncSummarySynced);
  const count = total === 1 ? labels.syncDrawingOne : labels.syncDrawingMany.replace("{count}", String(total));
  const rows = [
    { label: labels.drawingsSaved, count: total },
    { label: labels.synced, count: synced },
    { label: labels.pending, count: pending },
    { label: labels.failed, count: failed },
    { label: labels.conflicts, count: conflicts },
  ].filter((row, index) => index === 0 || row.count > 0);
  return <>
    <Pressable onPress={() => (attention || pending > 0) && onAttention ? onAttention() : setOpen(true)} accessibilityRole="button" {...webTitle(labels.syncDetails)}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 }}>
      <AppIcon icon={attention ? "mdi:alert-circle-outline" : "mdi:cloud-sync-outline"} size={18} color={theme.primary} />
      <Text style={{ color: theme.textMuted, flex: 1 }}>{count} · {status}</Text>
      <AppIcon icon="mdi:chevron-right" size={18} color={theme.textMuted} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.62)" }}>
        <View style={{ width: "100%", maxWidth: 360, padding: 24, borderRadius: 20, backgroundColor: theme.surface }}>
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 20, marginBottom: 20 }}>{labels.syncDetails}</Text>
          {rows.map(row => <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
            <Text style={{ color: theme.textMuted }}>{row.label.charAt(0).toLocaleUpperCase() + row.label.slice(1)}</Text>
            <Text style={{ color: theme.text, fontWeight: "700" }}>{row.count}</Text>
          </View>)}
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" {...webTitle(labels.close)} style={{ alignSelf: "flex-end", padding: 12, marginTop: 16 }}>
            <Text style={{ color: theme.primary, fontWeight: "700" }}>{labels.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
