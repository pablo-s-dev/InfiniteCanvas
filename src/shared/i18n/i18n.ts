import { Platform } from "react-native";



export type SupportedLanguage = "en" | "pt" | "es";



export const detectSystemLanguage = (): SupportedLanguage => {

  const locale =

    Platform.OS === "web" && typeof navigator !== "undefined"

      ? navigator.language

      : Intl.DateTimeFormat().resolvedOptions().locale;

  const language = locale.toLowerCase().split("-")[0];



  if (language === "pt" || language === "es") return language;

  return "en";

};



const dictionary = {

  en: {
    cloudNetworkUnavailable: "Couldn't sync right now. Your drawings are still saved on this device.",
    cloudCheckConflict: "Check sync",
    cloudConnectAccount: "Connect Google account",
    cloudCheckAccess: "Verify access",
    cloudSignOut: "Sign out",
    cloudCheckingAccount: "Checking account\u2026",
    cloudConnected: "Connected",
    cloudReconnectDrive: "Reconnect Google Drive",
    cloudAccountMismatch: "Use the same Google account. Sign out first to switch accounts.",
    cloudChangedDuringResolution: "A version changed. Review the copies again before choosing.",
    cloudInvalidDocument: "This drawing couldn't be synced. Your local copy is safe.",
    cloudSyncPartialFailure: "Some drawings could not be synced. Try again.",
    cloudBuyOnAndroid: "Purchase Cloud Sync in the Android app, then verify access here with the same Google account.",
    cloudUnbasedConflict: "Two different copies of \u201c{title}\u201d were found. Choose which one to keep.",
    cloudReviewAgain: "Review again",
    cloudConfirmSignOut: "Sign out? Your local drawings and Drive files will be kept.",
    cloudCopyToAccount: "Copy to this account",
    cloudOtherAccount: "Linked to another account",
    insertShape: "Insert shape",
    insertImage: "Insert image",
    shapeLine: "Line",
    shapeRectangle: "Rectangle",
    shapeEllipse: "Ellipse",

    library: "Library",

    tags: "Tags",

    settings: "Settings",

    profile: "Profile",

    cloudSyncNotConnectedEmpty: "Connect your account to back up and sync your drawings.",

    syncSummaryLocalOne: "1 drawing saved only on this device",

    syncSummaryLocalMany: "{count} drawings saved only on this device",

    cloudSyncReadyEmpty: "Cloud sync is active. New drawings will sync automatically.",

    syncSummaryAllSyncedDetailOne: "1 drawing is backed up in Google Drive.",

    syncSummaryAllSyncedDetailMany: "All {count} drawings are backed up in Google Drive.",

    syncSummaryPendingDetail: "Tap Sync now to back up to Google Drive.",

    cloudSyncLockedDetail: "Unlock Cloud Sync to back up your drawings to Google Drive.",

    syncSummaryUnsyncedOne: "1 drawing not synced",

    syncSummaryUnsyncedMany: "{count} drawings not synced",

    syncSummaryAllSynced: "Everything is synced",
    syncSummaryLocal: "Drawings saved on this device",

    search: "Search drawings or tags",

    cloudSync: "Cloud sync",

    cloudSyncHelp:

      "Connect Google Drive to keep your drawings synced across your devices.",

    createDrawing: "Create drawing",

    newDrawing: "New drawing",

    saveNewDrawing: "Save drawing",

    unsavedDrawing: "Unsaved drawing",

    unsavedDrawingBody:

      "This drawing has not been saved yet. Save it before leaving?",

    discardDrawing: "Discard drawing",

    close: "Close",

    drawingNameRequired: "Enter a name to save this drawing.",

    saveDrawingFailed: "Could not save this drawing. Try again.",

    drawingName: "Drawing name",

    drawingDetails: "Drawing details",

    name: "Name",

    tagPlaceholder: "ideas, work/project",

    embeddedDrawing: "Embedded drawing",

    editDrawingTags: "Edit drawing tags",

    shareDrawing: "Share drawing",

    exportDrawing: "Export drawing",

    exportFormatTitle: "Choose image format",

    exportPng: "PNG image",

    exportJpeg: "JPEG image",

    exportSvg: "SVG image",

    shareImageTitle: "Share drawing as PNG",

    tagOptionsEmpty: "No tags available yet.",

    saveTagFailed: "Could not save this tag.",

    renameDrawing: "Rename drawing",

    importDrawing: "Import drawing",

    moreOptions: "More options",

    duplicateDrawing: "Duplicate drawing",

    deleteDrawing: "Delete drawing",

    exportSelectedDrawings: "Export selected drawings",

    deleteSelectedDrawings: "Delete selected drawings",

    clearSelection: "Clear selection",

    holdToSelect: "Press and hold to select this drawing",

    sortRecent: "Recent",

    sortOldest: "Oldest",

    sortName: "Name",

    selected: "selected",

    darkTheme: "Dark",

    lightTheme: "Light",

    noDrawings: "No drawings yet",

    noDrawingsBody: "Start with a blank canvas. It will save into this library.",

    previous: "Previous",

    next: "Next",

    all: "All",

    addTag: "Add tag",

    tagName: "Tag name",

    save: "Save",

    saving: "Saving...",

    cancel: "Cancel",

    noTags: "No tags",

    local: "Local",

    syncedBadge: "Synced",

    pendingBadge: "Pending",

    failedBadge: "Failed",

    conflictBadge: "Conflict",

    appearance: "Appearance",

    language: "Language",

    googleDriveSync: "Google Drive sync",

    workspace: "Workspace",

    connectedToGoogleDrive: "Connected to Google Drive",

    workingWithGoogleDrive: "Working with Google Drive",

    notConnected: "Not connected",

    pending: "pending",

    failed: "failed",

    conflicts: "conflicts",

    syncNow: "Sync now",

    connectAndSync: "Connect and sync",

    checkingGoogleDrive: "Checking Google Drive...",

    openingGoogleSignIn: "Opening Google sign-in...",

    syncingDrawings: "Syncing drawings...",

    googleDriveConnected: "Google Drive connected.",

    syncConflictResolved: "Sync conflict resolved.",

    couldNotResolveSyncConflict: "Could not resolve sync conflict.",

    syncConflictDetectedOne: "1 sync conflict",

    syncConflictDetectedMany: "{count} sync conflicts",

    syncConflictDetail: "Local and cloud versions differ. Resolve to continue syncing.",

    resolveConflict: "Resolve conflict",

    resolveSyncConflict: "Resolve sync conflict",

    resolveSyncConflictHelp:

      '"{title}" changed locally and in Google Drive. Pick the version to keep, or duplicate both so nothing is lost.',

    localVersion: "Local version",

    cloudVersion: "Cloud version",

    updated: "Updated",

    revision: "Revision",

    unknown: "Unknown",

    keepLocal: "Keep local",

    useCloud: "Use cloud",

    duplicateBoth: "Duplicate both",

    allDrawingsSynced: "All drawings are already synced.",

    googleDriveSyncFailed: "Google Drive sync failed. Try again.",

    couldNotSyncDrawing: "Could not sync this drawing.",

    importReadFailed: "Could not read the drawing file.",

    importInvalidJson: "This file is not valid JSON.",

    importUnsupportedFile: "This file is not an InfiniteCanvas drawing.",

    importEmptyBundle: "This InfiniteCanvas bundle does not contain valid drawings.",

    importNativeUnavailable:

      "File import is not available on this platform yet. Use the web app or Android share flow when it is enabled.",

    importFailed: "Could not import drawing.",

    exportFailed: "Could not export drawing.",

    downloadsPermissionDenied:

      "Storage access is required to save drawings in Downloads on this Android version.",

    exportManyFailed: "Could not export drawings.",

    shareFailed: "Could not share drawing.",

    nativeShareUnavailable: "Native sharing is not available on this device.",

    updateAvailableTitle: "Update available",

    updateAvailableDescription:

      "A new version of Infinite Canvas is ready. Update to get the latest improvements and fixes.",

    updateNow: "Update now",

    updateStarting: "Opening update…",

    updateLater: "Later",

    updateDownloadingTitle: "Updating Infinite Canvas",

    updateDownloadingDescription:

      "The update is downloading. Keep this window open until it finishes.",

    updateDownloading: "Downloading update…",

    updateReadyTitle: "Update ready",

    updateReadyDescription:

      "The new version has been downloaded. Restart the app to finish installing it.",

    updateRestartNow: "Restart now",

    updateRestarting: "Restarting…",

    updateStartError:

      "We couldn't start the update. Check your connection and try again.",

    updateCompleteError: "We couldn't finish the update right now. Try again.",

    cloudSyncPaywallTitle: "Unlock Cloud Sync",

    cloudSyncPaywallDescription:

      "Back up your drawings and keep them available on your other devices.",

    cloudSyncUnlockButton: "Unlock Cloud Sync",

    cloudSyncBuy: "Buy once",

    cloudSyncRestore: "Restore purchase",

    cloudSyncOpeningCheckout: "Opening Google Play…",

    cloudSyncCheckingPurchase: "Checking purchase…",

    cloudSyncOneTimePrice: "One-time purchase: {price}. Payment is handled by Google Play.",

    cloudSyncLockedStatus: "Cloud Sync isn't available for this account.",

    cloudSyncProductUnavailable: "Cloud Sync can't be purchased right now.",

    cloudSyncPurchasePending:

      "Payment is pending. Cloud Sync will unlock after Google Play confirms it.",

    cloudSyncUnlockedMessage: "Cloud Sync unlocked.",

    cloudSyncPurchaseError: "We couldn't complete the purchase. Try again.",

    cloudSyncRestoreNoPurchase:

      "No Cloud Sync purchase was found for this Google Play account.",

    googleDriveSignInRequired: "Sign in to your Google account to check Cloud Sync access.",

    cloudSyncMigrationSkipped:

      "{count} older Drive file(s) were skipped because their data was invalid. The original files and local drawings were kept.",

  

    cloudSyncSignInPromptTitle: "Google Account Required",

    cloudSyncSignInToBuy:
      "Connect your Google account first to purchase and activate Cloud Sync.",
  },

  pt: {
    cloudNetworkUnavailable: "N\u00e3o foi poss\u00edvel sincronizar agora. Seus desenhos continuam salvos neste dispositivo.",
    cloudCheckConflict: "Conferir sync",
    cloudConnectAccount: "Conectar conta Google",
    cloudCheckAccess: "Verificar acesso",
    cloudSignOut: "Sair da conta",
    cloudCheckingAccount: "Verificando conta\u2026",
    cloudConnected: "Conectado",
    cloudReconnectDrive: "Reconectar Google Drive",
    cloudAccountMismatch: "Use a mesma conta Google. Saia primeiro para trocar de conta.",
    cloudChangedDuringResolution: "Uma vers\u00e3o mudou. Confira as c\u00f3pias novamente antes de escolher.",
    cloudInvalidDocument: "N\u00e3o foi poss\u00edvel sincronizar este desenho. Sua c\u00f3pia local foi preservada.",
    cloudSyncPartialFailure: "Alguns desenhos n\u00e3o foram sincronizados. Tente novamente.",
    cloudBuyOnAndroid: "Compre o Cloud Sync no app Android e depois verifique o acesso aqui com a mesma conta Google.",
    cloudUnbasedConflict: "Encontramos duas vers\u00f5es diferentes de \u201c{title}\u201d. Escolha qual manter.",
    cloudReviewAgain: "Conferir novamente",
    cloudConfirmSignOut: "Sair da conta? Os desenhos locais e os arquivos no Drive ser\u00e3o mantidos.",
    cloudCopyToAccount: "Copiar para esta conta",
    cloudOtherAccount: "Vinculado a outra conta",
    insertShape: "Inserir forma",
    insertImage: "Inserir imagem",
    shapeLine: "Linha",
    shapeRectangle: "Retângulo",
    shapeEllipse: "Elipse",

    library: "Biblioteca",

    tags: "Tags",

    settings: "Ajustes",

    profile: "Perfil",

    cloudSyncNotConnectedEmpty: "Conecte sua conta para fazer backup e sincronizar seus desenhos.",

    syncSummaryLocalOne: "1 desenho salvo apenas neste dispositivo",

    syncSummaryLocalMany: "{count} desenhos salvos apenas neste dispositivo",

    cloudSyncReadyEmpty: "Sincronização ativa. Novos desenhos serão sincronizados automaticamente.",

    syncSummaryAllSyncedDetailOne: "1 desenho está salvo no Google Drive.",

    syncSummaryAllSyncedDetailMany: "Todos os {count} desenhos estão salvos no Google Drive.",

    syncSummaryPendingDetail: "Toque em Sincronizar agora para enviar ao Google Drive.",

    cloudSyncLockedDetail: "Desbloqueie o Cloud Sync para fazer backup dos seus desenhos no Google Drive.",

    syncSummaryUnsyncedOne: "1 desenho não sincronizado",

    syncSummaryUnsyncedMany: "{count} desenhos não sincronizados",

    syncSummaryAllSynced: "Tudo sincronizado",
    syncSummaryLocal: "Desenhos salvos neste dispositivo",

    search: "Buscar desenhos ou tags",

    cloudSync: "Sincronização na nuvem",

    cloudSyncHelp:

      "Conecte o Google Drive para manter seus desenhos sincronizados entre dispositivos.",

    createDrawing: "Criar desenho",

    newDrawing: "Novo desenho",

    saveNewDrawing: "Salvar desenho",

    unsavedDrawing: "Desenho não salvo",

    unsavedDrawingBody:

      "Este desenho ainda não foi salvo. Deseja salvá-lo antes de sair?",

    discardDrawing: "Descartar desenho",

    close: "Fechar",

    drawingNameRequired: "Informe um nome para salvar o desenho.",

    saveDrawingFailed: "Não foi possível salvar este desenho. Tente novamente.",

    drawingName: "Nome do desenho",

    drawingDetails: "Detalhes do desenho",

    name: "Nome",

    tagPlaceholder: "ideias, trabalho/projeto",

    embeddedDrawing: "Desenho incorporado",

    editDrawingTags: "Editar tags do desenho",

    shareDrawing: "Compartilhar desenho",

    exportDrawing: "Exportar desenho",

    exportFormatTitle: "Escolha o formato da imagem",

    exportPng: "Imagem PNG",

    exportJpeg: "Imagem JPEG",

    exportSvg: "Imagem SVG",

    shareImageTitle: "Compartilhar desenho como PNG",

    tagOptionsEmpty: "Ainda não há tags disponíveis.",

    saveTagFailed: "Não foi possível salvar esta tag.",

    renameDrawing: "Renomear desenho",

    importDrawing: "Importar desenho",

    moreOptions: "Mais opções",

    duplicateDrawing: "Duplicar desenho",

    deleteDrawing: "Excluir desenho",

    exportSelectedDrawings: "Exportar desenhos selecionados",

    deleteSelectedDrawings: "Excluir desenhos selecionados",

    clearSelection: "Limpar seleção",

    holdToSelect: "Toque e segure para selecionar este desenho",

    sortRecent: "Recentes",

    sortOldest: "Mais antigos",

    sortName: "Nome",

    selected: "selecionados",

    darkTheme: "Escuro",

    lightTheme: "Claro",

    noDrawings: "Nenhum desenho ainda",

    noDrawingsBody: "Comece com uma tela vazia. Ela será salva nesta biblioteca.",

    previous: "Anterior",

    next: "Próxima",

    all: "Todas",

    addTag: "Adicionar tag",

    tagName: "Nome da tag",

    save: "Salvar",

    saving: "Salvando...",

    cancel: "Cancelar",

    noTags: "Sem tags",

    local: "Local",

    syncedBadge: "Sincronizado",

    pendingBadge: "Pendente",

    failedBadge: "Falhou",

    conflictBadge: "Conflito",

    appearance: "Aparência",

    language: "Idioma",

    googleDriveSync: "Sincronização Google Drive",

    workspace: "Workspace",

    connectedToGoogleDrive: "Conectado ao Google Drive",

    workingWithGoogleDrive: "Trabalhando com o Google Drive",

    notConnected: "Não conectado",

    pending: "pendentes",

    failed: "falharam",

    conflicts: "conflitos",

    syncNow: "Sincronizar agora",

    connectAndSync: "Conectar e sincronizar",

    checkingGoogleDrive: "Verificando Google Drive...",

    openingGoogleSignIn: "Abrindo login do Google...",

    syncingDrawings: "Sincronizando desenhos...",

    googleDriveConnected: "Google Drive conectado.",

    syncConflictResolved: "Conflito de sincronização resolvido.",

    couldNotResolveSyncConflict:

      "Não foi possível resolver o conflito de sincronização.",

    syncConflictDetectedOne: "1 conflito de sincronização",

    syncConflictDetectedMany: "{count} conflitos de sincronização",

    syncConflictDetail: "As versões local e da nuvem diferem. Resolva para continuar sincronizando.",

    resolveConflict: "Resolver conflito",

    resolveSyncConflict: "Resolver conflito de sincronização",

    resolveSyncConflictHelp:

      '"{title}" mudou localmente e no Google Drive. Escolha qual versão manter ou duplique as duas para não perder nada.',

    localVersion: "Versão local",

    cloudVersion: "Versão na nuvem",

    updated: "Atualizado",

    revision: "Revisão",

    unknown: "Desconhecido",

    keepLocal: "Manter local",

    useCloud: "Usar nuvem",

    duplicateBoth: "Duplicar as duas",

    allDrawingsSynced: "Todos os desenhos já estão sincronizados.",

    googleDriveSyncFailed: "A sincronização com o Google Drive falhou. Tente novamente.",

    couldNotSyncDrawing: "Não foi possível sincronizar este desenho.",

    importReadFailed: "Não foi possível ler o arquivo de desenho.",

    importInvalidJson: "Este arquivo não é um JSON válido.",

    importUnsupportedFile: "Este arquivo não é um desenho do InfiniteCanvas.",

    importEmptyBundle: "Este pacote do InfiniteCanvas não contém desenhos válidos.",

    importNativeUnavailable:

      "Importar arquivos ainda não está disponível nesta plataforma. Use o app web ou o fluxo de compartilhamento do Android quando ele for habilitado.",

    importFailed: "Não foi possível importar o desenho.",

    exportFailed: "Não foi possível exportar o desenho.",

    downloadsPermissionDenied:

      "É necessário permitir acesso ao armazenamento para salvar desenhos em Downloads nesta versão do Android.",

    exportManyFailed: "Não foi possível exportar os desenhos.",

    shareFailed: "Não foi possível compartilhar o desenho.",

    nativeShareUnavailable:

      "O compartilhamento nativo não está disponível neste dispositivo.",

    updateAvailableTitle: "Atualização disponível",

    updateAvailableDescription:

      "Uma nova versão do Infinite Canvas está pronta. Atualize para receber as melhorias e correções mais recentes.",

    updateNow: "Atualizar agora",

    updateStarting: "Abrindo atualização…",

    updateLater: "Depois",

    updateDownloadingTitle: "Atualizando o Infinite Canvas",

    updateDownloadingDescription:

      "A atualização está sendo baixada. Mantenha esta janela aberta até o download terminar.",

    updateDownloading: "Baixando atualização…",

    updateReadyTitle: "Atualização pronta",

    updateReadyDescription:

      "A nova versão foi baixada. Reinicie o app para concluir a instalação.",

    updateRestartNow: "Reiniciar agora",

    updateRestarting: "Reiniciando…",

    updateStartError:

      "Não foi possível iniciar a atualização agora. Verifique sua conexão e tente novamente.",

    updateCompleteError:

      "Não foi possível concluir a atualização agora. Tente novamente.",

    cloudSyncPaywallTitle: "Desbloquear sincronização na nuvem",

    cloudSyncPaywallDescription:

      "Faça backup dos desenhos e mantenha-os disponíveis nos seus outros dispositivos.",

    cloudSyncUnlockButton: "Desbloquear sincronização",

    cloudSyncBuy: "Comprar uma vez",

    cloudSyncRestore: "Restaurar compra",

    cloudSyncOpeningCheckout: "Abrindo Google Play…",

    cloudSyncCheckingPurchase: "Verificando compra…",

    cloudSyncOneTimePrice: "Compra única: {price}. O pagamento é feito pela Google Play.",

    cloudSyncLockedStatus: "A sincronização na nuvem não está disponível para esta conta.",

    cloudSyncProductUnavailable:

      "Não é possível comprar a sincronização na nuvem no momento.",

    cloudSyncPurchasePending:

      "O pagamento está pendente. A sincronização será liberada quando a Google Play confirmar a compra.",

    cloudSyncUnlockedMessage: "Sincronização na nuvem desbloqueada.",

    cloudSyncPurchaseError: "Não foi possível concluir a compra. Tente novamente.",

    cloudSyncRestoreNoPurchase:

      "Nenhuma compra de sincronização foi encontrada nesta conta da Google Play.",

    googleDriveSignInRequired: "Entre na sua conta Google para verificar o acesso à sincronização.",

    cloudSyncMigrationSkipped:

      "{count} arquivo(s) antigo(s) do Drive foram ignorados porque os dados são inválidos. Os originais e os desenhos locais foram preservados.",

  

    cloudSyncSignInPromptTitle: "Conta Google necessária",

    cloudSyncSignInToBuy:
      "Conecte sua conta Google primeiro para comprar e ativar a sincronização na nuvem.",
  },

  es: {
    cloudNetworkUnavailable: "No se pudo sincronizar ahora. Tus dibujos siguen guardados en este dispositivo.",
    cloudCheckConflict: "Revisar sync",
    cloudConnectAccount: "Conectar cuenta de Google",
    cloudCheckAccess: "Verificar acceso",
    cloudSignOut: "Cerrar sesi\u00f3n",
    cloudCheckingAccount: "Verificando cuenta\u2026",
    cloudConnected: "Conectado",
    cloudReconnectDrive: "Reconectar Google Drive",
    cloudAccountMismatch: "Usa la misma cuenta de Google. Cierra sesi\u00f3n primero para cambiar de cuenta.",
    cloudChangedDuringResolution: "Una versi\u00f3n cambi\u00f3. Revisa las copias antes de elegir.",
    cloudInvalidDocument: "No se pudo sincronizar este dibujo. Se conservó tu copia local.",
    cloudSyncPartialFailure: "Algunos dibujos no se sincronizaron. Inténtalo de nuevo.",
    cloudBuyOnAndroid: "Compra Cloud Sync en la aplicaci\u00f3n Android y verifica el acceso aqu\u00ed con la misma cuenta de Google.",
    cloudUnbasedConflict: "Encontramos dos versiones diferentes de \u00ab{title}\u00bb. Elige cu\u00e1l conservar.",
    cloudReviewAgain: "Revisar de nuevo",
    cloudConfirmSignOut: "\u00bfCerrar sesi\u00f3n? Se conservar\u00e1n los dibujos locales y los archivos en Drive.",
    cloudCopyToAccount: "Copiar a esta cuenta",
    cloudOtherAccount: "Vinculado a otra cuenta",
    insertShape: "Insertar forma",
    insertImage: "Insertar imagen",
    shapeLine: "Línea",
    shapeRectangle: "Rectángulo",
    shapeEllipse: "Elipse",

    library: "Biblioteca",

    tags: "Etiquetas",

    settings: "Ajustes",

    profile: "Perfil",

    cloudSyncNotConnectedEmpty: "Conecta tu cuenta para hacer copias de seguridad y sincronizar tus dibujos.",

    syncSummaryLocalOne: "1 dibujo guardado solo en este dispositivo",

    syncSummaryLocalMany: "{count} dibujos guardados solo en este dispositivo",

    cloudSyncReadyEmpty: "Sincronización activa. Los nuevos dibujos se sincronizarán automáticamente.",

    syncSummaryAllSyncedDetailOne: "1 dibujo respaldado en Google Drive.",

    syncSummaryAllSyncedDetailMany: "Los {count} dibujos están respaldados en Google Drive.",

    syncSummaryPendingDetail: "Toca Sincronizar ahora para enviar a Google Drive.",

    cloudSyncLockedDetail: "Desbloquea Cloud Sync para respaldar tus dibujos en Google Drive.",

    syncSummaryUnsyncedOne: "1 dibujo sin sincronizar",

    syncSummaryUnsyncedMany: "{count} dibujos sin sincronizar",

    syncSummaryAllSynced: "Todo sincronizado",
    syncSummaryLocal: "Dibujos guardados en este dispositivo",

    search: "Buscar dibujos o etiquetas",

    cloudSync: "Sincronización en la nube",

    cloudSyncHelp:

      "Conecta Google Drive para mantener los dibujos sincronizados en tus dispositivos.",

    createDrawing: "Crear dibujo",

    newDrawing: "Nuevo dibujo",

    saveNewDrawing: "Guardar dibujo",

    unsavedDrawing: "Dibujo sin guardar",

    unsavedDrawingBody:

      "Este dibujo aún no se ha guardado. ¿Quieres guardarlo antes de salir?",

    discardDrawing: "Descartar dibujo",

    close: "Cerrar",

    drawingNameRequired: "Escribe un nombre para guardar el dibujo.",

    saveDrawingFailed: "No se pudo guardar el dibujo. Inténtalo de nuevo.",

    drawingName: "Nombre del dibujo",

    drawingDetails: "Detalles del dibujo",

    name: "Nombre",

    tagPlaceholder: "ideas, trabajo/proyecto",

    embeddedDrawing: "Dibujo incrustado",

    editDrawingTags: "Editar etiquetas del dibujo",

    shareDrawing: "Compartir dibujo",

    exportDrawing: "Exportar dibujo",

    exportFormatTitle: "Elige el formato de imagen",

    exportPng: "Imagen PNG",

    exportJpeg: "Imagen JPEG",

    exportSvg: "Imagen SVG",

    shareImageTitle: "Compartir dibujo como PNG",

    tagOptionsEmpty: "Aún no hay etiquetas disponibles.",

    saveTagFailed: "No se pudo guardar esta etiqueta.",

    renameDrawing: "Renombrar dibujo",

    importDrawing: "Importar dibujo",

    moreOptions: "Más opciones",

    duplicateDrawing: "Duplicar dibujo",

    deleteDrawing: "Eliminar dibujo",

    exportSelectedDrawings: "Exportar dibujos seleccionados",

    deleteSelectedDrawings: "Eliminar dibujos seleccionados",

    clearSelection: "Quitar selección",

    holdToSelect: "Mantén pulsado para seleccionar este dibujo",

    sortRecent: "Recientes",

    sortOldest: "Más antiguos",

    sortName: "Nombre",

    selected: "seleccionados",

    darkTheme: "Oscuro",

    lightTheme: "Claro",

    noDrawings: "Sin dibujos todavía",

    noDrawingsBody: "Empieza con un lienzo vacío. Se guardará en esta biblioteca.",

    previous: "Anterior",

    next: "Siguiente",

    all: "Todas",

    addTag: "Añadir etiqueta",

    tagName: "Nombre de etiqueta",

    save: "Guardar",

    saving: "Guardando...",

    cancel: "Cancelar",

    noTags: "Sin etiquetas",

    local: "Local",

    syncedBadge: "Sincronizado",

    pendingBadge: "Pendiente",

    failedBadge: "Falló",

    conflictBadge: "Conflicto",

    appearance: "Apariencia",

    language: "Idioma",

    googleDriveSync: "Sincronización Google Drive",

    workspace: "Workspace",

    connectedToGoogleDrive: "Conectado a Google Drive",

    workingWithGoogleDrive: "Trabajando con Google Drive",

    notConnected: "No conectado",

    pending: "pendientes",

    failed: "fallaron",

    conflicts: "conflictos",

    syncNow: "Sincronizar ahora",

    connectAndSync: "Conectar y sincronizar",

    checkingGoogleDrive: "Verificando Google Drive...",

    openingGoogleSignIn: "Abriendo inicio de sesión de Google...",

    syncingDrawings: "Sincronizando dibujos...",

    googleDriveConnected: "Google Drive conectado.",

    syncConflictResolved: "Conflicto de sincronización resuelto.",

    couldNotResolveSyncConflict:

      "No se pudo resolver el conflicto de sincronización.",

    syncConflictDetectedOne: "1 conflicto de sincronización",

    syncConflictDetectedMany: "{count} conflictos de sincronización",

    syncConflictDetail: "Las versiones local y en la nube difieren. Resuélvelo para continuar sincronizando.",

    resolveConflict: "Resolver conflicto",

    resolveSyncConflict: "Resolver conflicto de sincronización",

    resolveSyncConflictHelp:

      '"{title}" cambió localmente y en Google Drive. Elige qué versión conservar o duplica ambas para no perder nada.',

    localVersion: "Versión local",

    cloudVersion: "Versión en la nube",

    updated: "Actualizado",

    revision: "Revisión",

    unknown: "Desconocido",

    keepLocal: "Mantener local",

    useCloud: "Usar nube",

    duplicateBoth: "Duplicar ambas",

    allDrawingsSynced: "Todos los dibujos ya están sincronizados.",

    googleDriveSyncFailed: "La sincronización con Google Drive falló. Inténtalo de nuevo.",

    couldNotSyncDrawing: "No se pudo sincronizar este dibujo.",

    importReadFailed: "No se pudo leer el archivo de dibujo.",

    importInvalidJson: "Este archivo no es un JSON válido.",

    importUnsupportedFile: "Este archivo no es un dibujo de InfiniteCanvas.",

    importEmptyBundle: "Este paquete de InfiniteCanvas no contiene dibujos válidos.",

    importNativeUnavailable:

      "La importación de archivos todavía no está disponible en esta plataforma. Usa la app web o el flujo de compartir de Android cuando esté habilitado.",

    importFailed: "No se pudo importar el dibujo.",

    exportFailed: "No se pudo exportar el dibujo.",

    downloadsPermissionDenied:

      "Se necesita permiso de almacenamiento para guardar dibujos en Descargas en esta versión de Android.",

    exportManyFailed: "No se pudieron exportar los dibujos.",

    shareFailed: "No se pudo compartir el dibujo.",

    nativeShareUnavailable:

      "El uso compartido nativo no está disponible en este dispositivo.",

    updateAvailableTitle: "Actualización disponible",

    updateAvailableDescription:

      "Hay una nueva versión de Infinite Canvas. Actualiza para recibir las mejoras y correcciones más recientes.",

    updateNow: "Actualizar ahora",

    updateStarting: "Abriendo actualización…",

    updateLater: "Más tarde",

    updateDownloadingTitle: "Actualizando Infinite Canvas",

    updateDownloadingDescription:

      "La actualización se está descargando. Mantén esta ventana abierta hasta que termine.",

    updateDownloading: "Descargando actualización…",

    updateReadyTitle: "Actualización lista",

    updateReadyDescription:

      "La nueva versión se descargó. Reinicia la app para completar la instalación.",

    updateRestartNow: "Reiniciar ahora",

    updateRestarting: "Reiniciando…",

    updateStartError:

      "No se pudo iniciar la actualización. Comprueba tu conexión e inténtalo de nuevo.",

    updateCompleteError:

      "No se pudo completar la actualización ahora. Inténtalo de nuevo.",

    cloudSyncPaywallTitle: "Desbloquear sincronización en la nube",

    cloudSyncPaywallDescription:

      "Haz una copia de seguridad de tus dibujos y accede a ellos desde tus otros dispositivos.",

    cloudSyncUnlockButton: "Desbloquear sincronización",

    cloudSyncBuy: "Comprar una vez",

    cloudSyncRestore: "Restaurar compra",

    cloudSyncOpeningCheckout: "Abriendo Google Play…",

    cloudSyncCheckingPurchase: "Comprobando compra…",

    cloudSyncOneTimePrice: "Compra única: {price}. El pago se realiza en Google Play.",

    cloudSyncLockedStatus: "La sincronización en la nube no está disponible para esta cuenta.",

    cloudSyncProductUnavailable:

      "No se puede comprar la sincronización en la nube ahora.",

    cloudSyncPurchasePending:

      "El pago está pendiente. La sincronización se desbloqueará cuando Google Play lo confirme.",

    cloudSyncUnlockedMessage: "Sincronización en la nube desbloqueada.",

    cloudSyncPurchaseError: "No se pudo completar la compra. Inténtalo de nuevo.",

    cloudSyncRestoreNoPurchase:

      "No se encontró ninguna compra de sincronización en esta cuenta de Google Play.",

    googleDriveSignInRequired: "Inicia sesión en Google para comprobar el acceso a la sincronización.",

    cloudSyncMigrationSkipped:

      "Se omitieron {count} archivo(s) antiguo(s) de Drive por tener datos no válidos. Se conservaron los originales y los dibujos locales.",

  

    cloudSyncSignInPromptTitle: "Cuenta de Google requerida",

    cloudSyncSignInToBuy:
      "Conecta tu cuenta de Google primero para comprar y activar la sincronización en la nube.",
  },

} as const;



export const useTranslations = (language = detectSystemLanguage()) => {

  const strings = dictionary[language];

  return { language, t: strings };

};
