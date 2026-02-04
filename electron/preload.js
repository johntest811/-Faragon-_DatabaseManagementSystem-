const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  admin: {
    createUser: (payload) => ipcRenderer.invoke('admin:createUser', payload),
    deleteUserPermanently: (payload) => ipcRenderer.invoke('admin:deleteUserPermanently', payload),
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
    previewExpiring: (payload) => ipcRenderer.invoke('notifications:previewExpiring', payload),
    getExpiringSummary: (payload) => ipcRenderer.invoke('notifications:getExpiringSummary', payload),
    resendLicensureNotice: (payload) => ipcRenderer.invoke('notifications:resendLicensureNotice', payload),
    getLog: (payload) => ipcRenderer.invoke('notifications:getLog', payload),
    sendTestEmail: (payload) => ipcRenderer.invoke('notifications:sendTestEmail', payload),
    runNow: () => ipcRenderer.invoke('notifications:runNow'),
  },

  audit: {
    logEvent: (payload) => ipcRenderer.invoke('audit:logEvent', payload),
    getRecent: (payload) => ipcRenderer.invoke('audit:getRecent', payload),
    getPage: (payload) => ipcRenderer.invoke('audit:getPage', payload),
  },
});