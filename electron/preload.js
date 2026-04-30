const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  app: {
    readBundledTextFile: (fileName) => ipcRenderer.invoke('app:readBundledTextFile', { fileName }),
  },

  admin: {
    createUser: (payload) => ipcRenderer.invoke('admin:createUser', payload),
    deleteUserPermanently: (payload) => ipcRenderer.invoke('admin:deleteUserPermanently', payload),
    exportDatabaseExcel: () => ipcRenderer.invoke('admin:exportDatabaseExcel'),
    recordLoginHistory: (payload) => ipcRenderer.invoke('admin:recordLoginHistory', payload),
    getLoginHistory: (payload) => ipcRenderer.invoke('admin:getLoginHistory', payload),
  },

  settings: {
    loadNotificationConfig: () => ipcRenderer.invoke('settings:loadNotificationConfig'),
    saveNotificationConfig: (payload) => ipcRenderer.invoke('settings:saveNotificationConfig', payload),
    saveLocalNotificationPrefs: (payload) => ipcRenderer.invoke('settings:saveLocalNotificationPrefs', payload),
    getStoredGmailAppPassword: () => ipcRenderer.invoke('settings:getStoredGmailAppPassword'),
    clearStoredGmailAppPassword: () => ipcRenderer.invoke('settings:clearStoredGmailAppPassword'),
    removeGmailSender: () => ipcRenderer.invoke('settings:removeGmailSender'),
  },

  notifications: {
    getExpiringSummary: (payload) => ipcRenderer.invoke('notifications:getExpiringSummary', payload),
    resendLicensureNotice: (payload) => ipcRenderer.invoke('notifications:resendLicensureNotice', payload),
    resendAllExpiring: (payload) => ipcRenderer.invoke('notifications:resendAllExpiring', payload),
    getLog: (payload) => ipcRenderer.invoke('notifications:getLog', payload),
    loadLogRetentionConfig: () => ipcRenderer.invoke('notifications:loadLogRetentionConfig'),
    saveLogRetentionConfig: (payload) => ipcRenderer.invoke('notifications:saveLogRetentionConfig', payload),
    clearLog: () => ipcRenderer.invoke('notifications:clearLog'),
    sendTestEmail: (payload) => ipcRenderer.invoke('notifications:sendTestEmail', payload),
    runNow: () => ipcRenderer.invoke('notifications:runNow'),
  },

  audit: {
    logEvent: (payload) => ipcRenderer.invoke('audit:logEvent', payload),
    getRecent: (payload) => ipcRenderer.invoke('audit:getRecent', payload),
    getPage: (payload) => ipcRenderer.invoke('audit:getPage', payload),
    loadRetentionConfig: () => ipcRenderer.invoke('audit:loadRetentionConfig'),
    saveRetentionConfig: (payload) => ipcRenderer.invoke('audit:saveRetentionConfig', payload),
  },
});
