const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  app: {
    readBundledTextFile: (fileName) => ipcRenderer.invoke('app:readBundledTextFile', { fileName }),
    onWindowShown: (callback) => {
      const subscription = () => callback();
      ipcRenderer.on('app:windowShown', subscription);
      return () => ipcRenderer.off('app:windowShown', subscription);
    },
    onUpdateProgress: (callback) => {
      const subscription = (_event, value) => callback(value);
      ipcRenderer.on('app:updateDownloadProgress', subscription);
      return () => ipcRenderer.off('app:updateDownloadProgress', subscription);
    },
    onUpdateDownloaded: (callback) => {
      const subscription = (_event, value) => callback(value);
      ipcRenderer.on('app:updateDownloaded', subscription);
      return () => ipcRenderer.off('app:updateDownloaded', subscription);
    },
    onUpdateError: (callback) => {
      const subscription = (_event, value) => callback(value);
      ipcRenderer.on('app:updateError', subscription);
      return () => ipcRenderer.off('app:updateError', subscription);
    },
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    cancelDownload: () => ipcRenderer.invoke('app:cancelDownload'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
});
