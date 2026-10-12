import type { SupportedLanguage } from "../../shared/i18n/i18n";
export const errorMessageOf = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
export const formatSyncFailureMessage = (count: number, language: SupportedLanguage) => {
    if (language === "pt") {
        return `${count} desenho${count === 1 ? "" : "s"} não sincronizou. Vamos tentar novamente depois.`;
    }
    if (language === "es") {
        return `${count} dibujo${count === 1 ? "" : "s"} no se pudo sincronizar. Se intentará de nuevo después.`;
    }
    return `${count} drawing${count === 1 ? "" : "s"} could not sync. Will retry later.`;
};
export const formatSyncConflictMessage = (count: number, language: SupportedLanguage) => {
    if (language === "pt") {
        return `${count} conflito${count === 1 ? "" : "s"} de sincronização precisa${count === 1 ? "" : "m"} de revisão.`;
    }
    if (language === "es") {
        return `${count} conflicto${count === 1 ? "" : "s"} de sincronización necesita${count === 1 ? "" : "n"} revisión.`;
    }
    return `${count} sync conflict${count === 1 ? "" : "s"} need review.`;
};
export const formatSyncSummaryMessage = (uploaded: number, downloaded: number, deleted: number, language: SupportedLanguage) => {
    if (language === "pt") {
        return `${uploaded} enviados, ${downloaded} baixados, ${deleted} removidos.`;
    }
    if (language === "es") {
        return `${uploaded} subidos, ${downloaded} descargados, ${deleted} eliminados.`;
    }
    return `${uploaded} uploaded, ${downloaded} downloaded, ${deleted} deleted.`;
};
