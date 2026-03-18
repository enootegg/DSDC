const { contextBridge, ipcRenderer } = require('electron');

// Експонуємо безпечні API для renderer процесу
contextBridge.exposeInMainWorld('electronAPI', {
    detectGamePath: (gameVersion) => ipcRenderer.invoke('detect-game-path', gameVersion),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    installLocalization: (options) => ipcRenderer.invoke('install-localization', options),
    checkBackup: (gameDir) => ipcRenderer.invoke('check-backup', gameDir),
    uninstallLocalization: (gameDir) => ipcRenderer.invoke('uninstall-localization', gameDir)
});
