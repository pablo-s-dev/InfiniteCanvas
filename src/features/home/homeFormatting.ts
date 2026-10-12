import { errorMessageOf } from "../sync/syncFormatting";
import { SupportedLanguage } from "../../shared/i18n/i18n";
import { SyncState } from "../sync/googleDriveSync";
import { DrawingImportError } from "../sharing/drawingImport";
import type { LibrarySortMode } from "./homeTypes";
export const describeSyncState = (state: SyncState, labels: {
    connectedToGoogleDrive: string;
    workingWithGoogleDrive: string;
    notConnected: string;
}) => {
    if (state.status === "ready")
        return labels.connectedToGoogleDrive;
    if (state.status === "syncing")
        return labels.workingWithGoogleDrive;
    if (state.status === "signed-out")
        return labels.notConnected;
    if (state.status === "error")
        return state.message;
    return state.reason;
};
export const importErrorMessage = (error: unknown, labels: {
    importReadFailed: string;
    importInvalidJson: string;
    importUnsupportedFile: string;
    importEmptyBundle: string;
    importNativeUnavailable: string;
    importFailed: string;
}) => {
    if (!(error instanceof DrawingImportError)) {
        return errorMessageOf(error, labels.importFailed);
    }
    if (error.code === "read_failed")
        return labels.importReadFailed;
    if (error.code === "invalid_json")
        return labels.importInvalidJson;
    if (error.code === "empty_bundle")
        return labels.importEmptyBundle;
    if (error.code === "native_picker_unavailable") {
        return labels.importNativeUnavailable;
    }
    return labels.importUnsupportedFile;
};
export const formatDrawingsDeletedMessage = (count: number, language: SupportedLanguage) => {
    if (language === "pt") {
        return `${count} desenho${count === 1 ? "" : "s"} removido${count === 1 ? "" : "s"}.`;
    }
    if (language === "es") {
        return `${count} dibujo${count === 1 ? "" : "s"} eliminado${count === 1 ? "" : "s"}.`;
    }
    return `${count} drawing${count === 1 ? "" : "s"} deleted.`;
};
export const formatDrawingsImportedMessage = (count: number, title: string | undefined, language: SupportedLanguage) => {
    if (language === "pt") {
        return count === 1
            ? `"${title}" importado.`
            : `${count} desenhos importados.`;
    }
    if (language === "es") {
        return count === 1
            ? `"${title}" importado.`
            : `${count} dibujos importados.`;
    }
    return count === 1
        ? `"${title}" imported.`
        : `${count} drawings imported.`;
};
export const formatSelectedCount = (count: number, selectedLabel: string) => `${count} ${selectedLabel}`;
export const formatUpdatedAt = (date: string) => new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
}).format(new Date(date));
export const shortRevision = (revisionId?: string, fallback = "Unknown") => revisionId ? revisionId.slice(0, 10) : fallback;
export const parseTagsParam = (value: string) => value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
export const stringifyTagsParam = (tags: string[]) => tags.join(",");
export const isLibrarySortMode = (value: string): value is LibrarySortMode => value === "updated_desc" || value === "updated_asc" || value === "title_asc";
