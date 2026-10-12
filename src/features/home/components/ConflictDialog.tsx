import type { CanvasDocument } from "../../canvas/document";
import type { AppTheme } from "../../../shared/theme/appPalette";
import { DrawingPreview } from "../DrawingPreview";
import { webTitle } from "../../../shared/ui/webTitle";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { DrawingSummary } from "../../documents/drawingRepository";
import { createStyles } from "../../home/homeStyles";
import { formatUpdatedAt, shortRevision } from "../../home/homeFormatting";
export function ConflictDialog({ theme, inspection, canResolve, prerequisiteLabel, onPrerequisite, onReview, busy, error, drawing, onCancel, onResolve, styles, labels, }: {
    theme: AppTheme;
    inspection: {local: CanvasDocument; remote?: CanvasDocument} | null;
    canResolve: boolean;
    prerequisiteLabel: string;
    onPrerequisite: () => void;
    onReview: () => void;
    busy: boolean;
    error: string | null;
    drawing: DrawingSummary | null;
    onCancel: () => void;
    onResolve: (drawing: DrawingSummary, action: "keep-local" | "use-cloud" | "duplicate-both") => void | Promise<void>;
    styles: ReturnType<typeof createStyles>;
    labels: {
        title: string;
        help: string;
        review: string;
        localVersion: string;
        cloudVersion: string;
        updated: string;
        revision: string;
        unknown: string;
        keepLocal: string;
        useCloud: string;
        duplicateBoth: string;
        cancel: string;
    };
}) {
    if (!drawing) {
        return null;
    }
    return (<Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{labels.title}</Text>
          <Text style={styles.dialogHelpText}>
            {labels.help.replace("{title}", drawing.title)}
          </Text>
          {inspection?.remote && <View style={styles.conflictCompareRow}>
            <View style={styles.conflictVersionCard}>
              <Text style={styles.conflictVersionTitle}>{labels.localVersion}</Text>
              {inspection && <DrawingPreview drawing={inspection.local.metadata} document={inspection.local} theme={theme}/>}
              <Text style={styles.conflictMetaLabel}>{labels.updated}</Text>
              <Text style={styles.conflictMetaValue}>
                {formatUpdatedAt(drawing.updatedAt)}
              </Text>
              <Text style={styles.conflictMetaLabel}>{labels.revision}</Text>
              <Text style={styles.conflictMetaValue}>
                {shortRevision(drawing.driveRevisionId, labels.unknown)}
              </Text>
            </View>
            <View style={styles.conflictVersionCard}>
              <Text style={styles.conflictVersionTitle}>{labels.cloudVersion}</Text>
              {inspection?.remote && <DrawingPreview drawing={inspection.remote.metadata} document={inspection.remote} theme={theme}/>}
              <Text style={styles.conflictMetaLabel}>{labels.updated}</Text>
              <Text style={styles.conflictMetaValue}>
                {drawing.syncConflictRemoteUpdatedAt
            ? formatUpdatedAt(drawing.syncConflictRemoteUpdatedAt)
            : labels.unknown}
              </Text>
              <Text style={styles.conflictMetaLabel}>{labels.revision}</Text>
              <Text style={styles.conflictMetaValue}>
                {shortRevision(drawing.syncConflictRemoteRevisionId, labels.unknown)}
              </Text>
            </View>
          </View>}
          {busy && <ActivityIndicator accessibilityLabel={labels.keepLocal}/>}
          {error && <Text accessibilityRole="alert" style={[styles.dialogHelpText, { color: theme.danger }]}>{error}</Text>}
          <View style={styles.conflictActions}>
            {!canResolve && !busy && <Pressable {...webTitle(prerequisiteLabel)} style={styles.dialogButtonPrimary} onPress={onPrerequisite}><Text style={styles.dialogButtonPrimaryText}>{prerequisiteLabel}</Text></Pressable>}
            {error && !busy && <Pressable {...webTitle(labels.review)} style={styles.dialogButton} onPress={onReview}><Text style={styles.dialogButtonText}>{labels.review}</Text></Pressable>}
            {canResolve && <>
            <Pressable disabled={busy} {...webTitle(labels.keepLocal)} style={[styles.dialogButtonPrimary, busy && { opacity: 0.5 }]} onPress={() => onResolve(drawing, "keep-local")}>
              <Text style={styles.dialogButtonPrimaryText}>{labels.keepLocal}</Text>
            </Pressable>
            <Pressable disabled={busy} {...webTitle(labels.useCloud)} style={[styles.dialogButton, busy && { opacity: 0.5 }]} onPress={() => onResolve(drawing, "use-cloud")}>
              <Text style={styles.dialogButtonText}>{labels.useCloud}</Text>
            </Pressable>
            <Pressable disabled={busy} {...webTitle(labels.duplicateBoth)} style={[styles.dialogButton, busy && { opacity: 0.5 }]} onPress={() => onResolve(drawing, "duplicate-both")}>
              <Text style={styles.dialogButtonText}>{labels.duplicateBoth}</Text>
            </Pressable>
            </>}
            <Pressable {...webTitle(labels.cancel)} style={[styles.dialogButton, busy && { opacity: 0.5 }]} onPress={onCancel}>
              <Text style={styles.dialogButtonText}>{labels.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>);
}
